/**
 * MGB Faturamento API — Apps Script anexado à planilha "MGB Faturamento - Clientes".
 * Alimenta o Faturamento do dia 5 no hub (index.html).
 *
 * GET ?action=listar[&mesRef=YYYY-MM]
 *   -> { rows: [ {linha,id,modulo,cliente,cnpj,email,logradouro,numero,complemento,bairro,
 *                 cidade,uf,cep,valor,issRetido,aliquotaIssPlanilha,descricao,ctribnac,cnbs,boleto,
 *                 ultimoMesFaturado,nfNumero,valorBoleto,statusEnvio,dataEnvio,paymentId,
 *                 statusPagamento,statusPagamentoEm,inicioCobranca,mesesContrato,origem} ] }
 *   Linhas com status=ativo. Com mesRef, a linha que tem "inicio_cobranca" só entra nos meses do
 *   contrato (de inicio_cobranca até inicio_cobranca + meses_contrato − 1). Linhas antigas, sem
 *   inicio_cobranca, entram sempre (como antes).
 *
 * GET ?action=incluir&id=hub-...&modulo=...&cliente=...&valor=...&inicio=YYYY-MM&meses=N[&cnpj&email&logradouro
 *      &numero&complemento&bairro&cidade&uf&cep&descricao&ctribnac&cnbs&boleto=sim|nao&issRetido=sim|nao]
 *   -> { ok:true, linha, novo:true|false }
 *   Provisionamento (12/10/2026): o hub grava aqui cada contrato lançado no Novo cliente, com o mês em
 *   que o cliente começa a pagar e os meses do contrato. Idempotente: o mesmo id atualiza a linha.
 *   Só aceita ids que começam com "hub-" (nunca mexe nas linhas digitadas à mão).
 *
 * GET ?action=marcar-emitido&id=...&mesRef=YYYY-MM&nfNumero=...&nfChave=...&valorBoleto=...&boletoLinha=...&paymentId=...
 *   -> { ok:true } ou { ok:false, erro }
 *
 * GET ?action=atualizar-status-pagamento&paymentId=...&status=...&token=...
 *   -> { ok:true } ou { ok:false, erro }
 *   Chamado pelo webhook da Asaas (bot/api/asaas-webhook.js). "token" tem que bater com WEBHOOK_TOKEN
 *   (mesmo valor de ASAAS_WEBHOOK_TOKEN no Vercel).
 */

// Mesmo valor tem que estar na env var ASAAS_WEBHOOK_TOKEN do Vercel (bot/api/asaas-webhook.js).
// ⚠️ AO COLAR: mantenha aqui o token que JÁ ESTÁ no seu script (não fica gravado no repositório).
const WEBHOOK_TOKEN = 'COLE_AQUI_O_TOKEN_QUE_JA_ESTA_NO_SCRIPT';

const COLS = {
  id: 0, modulo: 1, cliente: 2, cnpj: 3, email: 4, logradouro: 5, numero: 6,
  complemento: 7, bairro: 8, cidade: 9, cidade_ibge: 10, uf: 11, cep: 12,
  valor: 13, iss_retido: 14, aliquota_iss: 15, descricao: 16, ctribnac: 17,
  cnbs: 18, dia_faturamento: 19, prazo_dias: 20, status: 21, boleto: 22,
  ultimo_mes_faturado: 23, nf_numero: 24, nf_chave: 25, valor_boleto: 26,
  boleto_linha_digitavel: 27, status_envio: 28, data_envio: 29,
  payment_id: 30, status_pagamento: 31, status_pagamento_em: 32,
  // novas (12/10/2026) — o título é criado sozinho na linha 1 na 1ª inclusão
  inicio_cobranca: 33, meses_contrato: 34, origem: 35,
};
const NOVAS_COLUNAS = ['inicio_cobranca', 'meses_contrato', 'origem'];

function getSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = (e.parameter.action || '').toString();
    if (action === 'listar') return json_(listar_(e.parameter));
    if (action === 'incluir') return json_(incluir_(e.parameter));
    if (action === 'marcar-emitido') return json_(marcarEmitido_(e.parameter));
    if (action === 'atualizar-status-pagamento') return json_(atualizarStatusPagamento_(e.parameter));
    return json_({ ok: false, erro: "Ação desconhecida: '" + action + "'. Use listar | incluir | marcar-emitido | atualizar-status-pagamento." });
  } catch (err) {
    return json_({ ok: false, erro: String(err) });
  }
}

// Garante os títulos das colunas novas na linha 1 (não mexe se já existirem).
function garantirColunas_(sheet) {
  const ini = COLS.inicio_cobranca + 1;
  const atual = sheet.getRange(1, ini, 1, NOVAS_COLUNAS.length).getValues()[0];
  if (atual.some(function (v, i) { return String(v || '') !== NOVAS_COLUNAS[i]; })) {
    sheet.getRange(1, ini, 1, NOVAS_COLUNAS.length).setValues([NOVAS_COLUNAS]);
  }
}

// 'YYYY-MM' a partir de texto ou de data (a planilha às vezes converte '2026-11' em data)
function mesTexto_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  const m = /^'?(\d{4})-(\d{2})/.exec(String(v).trim());
  return m ? m[1] + '-' + m[2] : '';
}
function mesIndice_(ym) { const p = ym.split('-'); return Number(p[0]) * 12 + Number(p[1]) - 1; }

function noContrato_(r, mesRef) {
  const ini = mesTexto_(r[COLS.inicio_cobranca]);
  if (!mesRef || !ini) return true;                 // linha antiga ou sem filtro: entra como antes
  const meses = Number(r[COLS.meses_contrato]) || 12;
  const k = mesIndice_(mesRef) - mesIndice_(ini);
  return k >= 0 && k < meses;
}

function listar_(p) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const mesRef = mesTexto_((p && p.mesRef) || '');
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[COLS.id]) continue;
    if (String(r[COLS.status] || '').toLowerCase() !== 'ativo') continue;
    if (!noContrato_(r, mesRef)) continue;
    rows.push({
      linha: i + 1, // 1-based, pra localizar na hora de atualizar
      id: r[COLS.id],
      modulo: r[COLS.modulo],
      cliente: r[COLS.cliente],
      cnpj: r[COLS.cnpj],
      email: r[COLS.email],
      logradouro: r[COLS.logradouro],
      numero: r[COLS.numero],
      complemento: r[COLS.complemento],
      bairro: r[COLS.bairro],
      cidade: r[COLS.cidade],
      uf: r[COLS.uf],
      cep: r[COLS.cep],
      valor: Number(r[COLS.valor]) || 0,
      issRetido: String(r[COLS.iss_retido] || '').toLowerCase() === 'sim',
      aliquotaIssPlanilha: r[COLS.aliquota_iss],
      descricao: r[COLS.descricao],
      ctribnac: r[COLS.ctribnac],
      cnbs: r[COLS.cnbs],
      boleto: String(r[COLS.boleto] || '').toLowerCase() !== 'nao',
      ultimoMesFaturado: r[COLS.ultimo_mes_faturado],
      nfNumero: r[COLS.nf_numero],
      valorBoleto: r[COLS.valor_boleto],
      statusEnvio: r[COLS.status_envio],
      dataEnvio: r[COLS.data_envio],
      paymentId: r[COLS.payment_id] || null,
      statusPagamento: r[COLS.status_pagamento] || null,
      statusPagamentoEm: r[COLS.status_pagamento_em] || null,
      inicioCobranca: mesTexto_(r[COLS.inicio_cobranca]) || null,
      mesesContrato: Number(r[COLS.meses_contrato]) || null,
      origem: r[COLS.origem] || null,
    });
  }
  return { rows };
}

function incluir_(p) {
  const id = String(p.id || '').trim();
  if (!/^hub-[a-z0-9_-]{2,80}$/i.test(id)) return { ok: false, erro: 'id inválido (precisa começar com "hub-").' };
  const cliente = String(p.cliente || '').trim();
  const valor = Number(String(p.valor || '').replace(',', '.'));
  const inicio = mesTexto_(p.inicio);
  const meses = parseInt(p.meses, 10);
  if (!cliente) return { ok: false, erro: 'Falta o cliente.' };
  if (!(valor > 0) || valor > 1000000) return { ok: false, erro: 'Valor inválido.' };
  if (!inicio) return { ok: false, erro: 'Falta o mês em que começa a pagar (YYYY-MM).' };
  if (!(meses >= 1 && meses <= 120)) return { ok: false, erro: 'Meses do contrato inválido (1 a 120).' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet_();
    garantirColunas_(sheet);
    const values = sheet.getDataRange().getValues();
    let linha = 0;
    for (let i = 1; i < values.length; i++) { if (values[i][COLS.id] === id) { linha = i + 1; break; } }
    const novo = !linha;
    const largura = Math.max(sheet.getLastColumn(), COLS.origem + 1);
    const atual = novo ? new Array(largura).fill('') : sheet.getRange(linha, 1, 1, largura).getValues()[0];
    const txt = function (k) { return p[k] == null ? '' : String(p[k]).trim(); };
    atual[COLS.id] = id;
    atual[COLS.modulo] = txt('modulo');
    atual[COLS.cliente] = cliente;
    ['cnpj', 'email', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'descricao', 'ctribnac', 'cnbs']
      .forEach(function (k) { if (txt(k)) atual[COLS[k]] = txt(k); });
    atual[COLS.valor] = valor;
    if (novo || txt('issRetido')) atual[COLS.iss_retido] = txt('issRetido').toLowerCase() === 'sim' ? 'sim' : 'nao';
    if (novo) { atual[COLS.dia_faturamento] = 5; atual[COLS.status] = 'ativo'; }
    if (novo || txt('boleto')) atual[COLS.boleto] = txt('boleto').toLowerCase() === 'nao' ? 'nao' : 'sim';
    atual[COLS.inicio_cobranca] = "'" + inicio;      // apóstrofo: a planilha não converte em data
    atual[COLS.meses_contrato] = meses;
    atual[COLS.origem] = 'hub · ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    if (novo) { sheet.appendRow(atual); linha = sheet.getLastRow(); }
    else sheet.getRange(linha, 1, 1, largura).setValues([atual]);
    return { ok: true, linha: linha, novo: novo };
  } finally {
    lock.releaseLock();
  }
}

function marcarEmitido_(p) {
  const id = p.id;
  if (!id) return { ok: false, erro: 'Falta id.' };
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][COLS.id] === id) {
      const linha = i + 1;
      if (p.nfNumero) sheet.getRange(linha, COLS.nf_numero + 1).setValue(p.nfNumero);
      if (p.nfChave) sheet.getRange(linha, COLS.nf_chave + 1).setValue(p.nfChave);
      if (p.valorBoleto) sheet.getRange(linha, COLS.valor_boleto + 1).setValue(p.valorBoleto);
      if (p.boletoLinha) sheet.getRange(linha, COLS.boleto_linha_digitavel + 1).setValue(p.boletoLinha);
      sheet.getRange(linha, COLS.status_envio + 1).setValue('enviado');
      sheet.getRange(linha, COLS.data_envio + 1).setValue(new Date());
      if (p.mesRef) sheet.getRange(linha, COLS.ultimo_mes_faturado + 1).setValue(p.mesRef);
      if (p.paymentId) {
        sheet.getRange(linha, COLS.payment_id + 1).setValue(p.paymentId);
        // nova cobrança emitida → reseta o status de pagamento anterior (era de um boleto antigo)
        sheet.getRange(linha, COLS.status_pagamento + 1).setValue('pendente');
        sheet.getRange(linha, COLS.status_pagamento_em + 1).setValue(new Date());
      }
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Linha não encontrada pra id=' + id };
}

function atualizarStatusPagamento_(p) {
  if (p.token !== WEBHOOK_TOKEN) return { ok: false, erro: 'Token inválido.' };
  const paymentId = p.paymentId;
  const status = p.status;
  if (!paymentId || !status) return { ok: false, erro: 'Faltam paymentId e/ou status.' };
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][COLS.payment_id] === paymentId) {
      const linha = i + 1;
      sheet.getRange(linha, COLS.status_pagamento + 1).setValue(status);
      sheet.getRange(linha, COLS.status_pagamento_em + 1).setValue(new Date());
      return { ok: true, linha: linha, cliente: values[i][COLS.cliente] };
    }
  }
  // Não é erro fatal — pode ser um paymentId de nota avulsa (aba Nota Fiscal/Léo), que não
  // vive nesta planilha. O webhook já loga isso do lado do Vercel.
  return { ok: false, erro: 'Nenhuma linha com payment_id=' + paymentId };
}
