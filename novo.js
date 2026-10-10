/* Hub MGB — botão "Novo": ponto de partida da Karen para lançar um cliente.
 *
 * Decisão de 10/10/2026 (desenho aprovado no canvas "Áreas de Trabalho do Hub MGB"):
 *  - no topo, os leads que o Eder fechou no CRM e que ainda não foram cadastrados;
 *  - abaixo, os produtos. Esta primeira entrega faz o "Novo condomínio" de ponta a ponta;
 *    os demais levam ao fluxo que já existe no hub ou aparecem como "em breve".
 *
 * Novo condomínio (parceria): condomínio paga R$ 0; custo de R$ 70 por torre ao mês.
 * Ao criar: tela no módulo Elevadores + despesa recorrente + lead marcado como cadastrado
 * + contrato de parceria enviado pelo Assinafy + aviso ao Cleiton pelo WhatsApp.
 *
 * Reaproveita o que o hub já tem (index.html): mgbCriarUnidadeModulo, applyToFin, db,
 * leads, scheduleSave, parcGerar. Não altera nenhum cálculo existente.
 */
(function (global) {
  'use strict';

  var CUSTO_POR_TORRE = 70;
  var ASSINAFY_API_URL = 'https://script.google.com/macros/s/AKfycbwG-31A0O10zru2-klj4EbtiD5rg22R-kNG2TLE4Gkd_ZBStE-QNqsbkq-vwSf6vgf3/exec';

  // ── Regras puras (testadas em bot/test/novo.test.js) ───────────────────
  function custoCondominio(torres) {
    var t = parseInt(torres, 10);
    return t > 0 ? t * CUSTO_POR_TORRE : 0;
  }

  function leadsPendentes(lista) {
    return (lista || []).filter(function (l) { return l && l.estagio === 'fechado' && !l.itemCriado; });
  }

  function normalizar(s) {
    return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  }

  function jaExiste(nome, existentes) {
    var n = normalizar(nome);
    return (existentes || []).some(function (x) { return normalizar(x) === n; });
  }

  function validarCondominio(d, existentes) {
    var erros = [];
    if (!String(d.nome || '').trim()) erros.push('Informe o nome do condomínio.');
    else if (jaExiste(d.nome, existentes)) erros.push('Já existe um condomínio com esse nome no módulo Elevadores.');
    if (!(parseInt(d.torres, 10) > 0)) erros.push('Informe o número de torres.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio || '')) erros.push('Informe a data de início.');
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) erros.push('O e-mail do síndico parece incompleto.');
    return erros;
  }

  // Lançamento no mesmo formato do addItem do hub (recorrente, mês a mês).
  function despesaLicenca(torres, inicio, meses) {
    var t = parseInt(torres, 10) || 0;
    return {
      t: 'Recorrente', tipo: 'Licença',
      d: 'Licença das telas · ' + t + (t === 1 ? ' torre' : ' torres') + ' × R$ ' + CUSTO_POR_TORRE,
      f: '4YouSee', q: t, u: CUSTO_POR_TORRE, cc: '', venc: '', pago: false, dataPago: '',
      mesesRec: parseInt(meses, 10) || 36, dataInicio: String(inicio || '').slice(0, 7)
    };
  }

  // ── Rádio interna (decisão de 10/10: uma unidade por vez, custo R$ 70/mês) ──
  var CUSTO_RADIO = 70;

  function numero(v) {
    if (typeof v === 'number') return v;
    var s = String(v || '').trim().replace(/[R$\s]/g, '');
    if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
    return parseFloat(s) || 0;
  }

  function sobraRadio(valor) { return Math.round((numero(valor) - CUSTO_RADIO) * 100) / 100; }

  function validarRadio(d, existentes) {
    var erros = [];
    if (!String(d.nome || '').trim()) erros.push('Informe o nome da unidade.');
    else if (jaExiste(d.nome, existentes)) erros.push('Já existe uma unidade com esse nome no módulo Rádio Interna.');
    if (!(numero(d.valor) > 0)) erros.push('Informe o valor mensal do contrato.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio || '')) erros.push('Informe a data de início.');
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) erros.push('O e-mail do cliente parece incompleto.');
    return erros;
  }

  function despesaRadio(inicio, meses) {
    return {
      t: 'Recorrente', tipo: 'Licença', d: 'Licença da rádio interna', f: '', q: 1, u: CUSTO_RADIO,
      cc: '', venc: '', pago: false, dataPago: '',
      mesesRec: parseInt(meses, 10) || 12, dataInicio: String(inicio || '').slice(0, 7)
    };
  }

  // 'AAAA-MM-DD' + n meses → 'DD/MM/AAAA' (sem fuso horário no meio).
  function dataMais(iso, meses) {
    var p = String(iso || '').split('-').map(Number);
    if (p.length !== 3 || !p[0]) return '';
    var dt = new Date(Date.UTC(p[0], p[1] - 1 + (meses || 0), p[2]));
    return String(dt.getUTCDate()).padStart(2, '0') + '/' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '/' + dt.getUTCFullYear();
  }

  var EXT_MESES = { 6: 'seis', 12: 'doze', 24: 'vinte e quatro', 36: 'trinta e seis' };

  // Modelo padrão de contrato de rádio interna (não existia; criado em 10/10/2026).
  // Rascunho para revisão do Eder antes do primeiro envio a um cliente real.
  function contratoRadioInterna(d, opts) {
    opts = opts || {};
    var e = function (t) {
      return String(t == null || t === '' ? '' : t).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
    var L = function (v, n) { return v ? e(v) : '_'.repeat(n || 26); };
    var meses = parseInt(d.meses, 10) || 12;
    var valor = numero(d.valor);
    var valorFmt = 'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var extenso = typeof opts.extenso === 'function' ? ' (' + opts.extenso(valor) + ')' : '';
    var ini = dataMais(d.inicio, 0) || '____/____/______';
    var fim = dataMais(d.inicio, meses) || '____/____/______';
    var hoje = opts.hoje || '';
    var num = opts.numero || '';
    var comNota = d.nf !== 'boleto';
    var R = function (l, v) {
      return '<div style="display:flex;margin-bottom:5px;font-size:12.5px;line-height:1.5"><span style="font-weight:600;color:#2A1760;min-width:130px;flex-shrink:0">' + l +
        '</span><span style="color:#333;border-bottom:1px solid #e0d8f0;flex:1">' + v + '</span></div>';
    };
    var T = function (t) { return '<div style="font-family:Syne,sans-serif;font-size:11.5px;font-weight:700;color:#2A1760;margin:14px 0 4px;letter-spacing:.3px">' + t + '</div><div style="height:1px;background:#EAD9FF;margin:4px 0 10px"></div>'; };
    var C = function (t, corpo) { return '<div style="font-weight:700;color:#2A1760;font-size:12px;margin-bottom:3px">' + t + '</div><div style="color:#444;line-height:1.55;font-size:11.5px;margin-bottom:8px">' + corpo + '</div>'; };
    var mesesTxt = meses + ' (' + (EXT_MESES[meses] || meses) + ') meses';
    return '' +
      '<div style="padding:22px 28px 18px;border-bottom:3px solid #E879B0"><div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:8px">' +
      '<div><div style="font-family:Syne,sans-serif;font-size:18px;font-weight:800;color:#2A1760">MGB <span style="color:#E879B0">Mídia</span></div><div style="font-size:10px;color:#999;font-style:italic;margin-top:2px">Elevando a sua comunicação</div></div>' +
      '<div style="text-align:right"><div style="font-family:Syne,sans-serif;font-size:13px;font-weight:700;color:#2A1760;letter-spacing:.5px">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</div>' +
      '<div style="font-size:11px;color:#5B2D8E;font-weight:600">Rádio Interna</div><div style="font-size:10px;color:#999;margin-top:2px">' + (num ? 'Nº ' + e(num) + ' · ' : '') + e(hoje) + '</div></div></div></div>' +
      '<div style="padding:22px 28px">' +
      T('1. DADOS DAS PARTES') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px">' +
      '<div style="border:1px solid #DDD0F0;border-radius:8px;padding:12px 14px"><div style="font-size:10px;font-weight:700;color:#5B2D8E;letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px">Contratante</div>' +
      R('Razão social', L(d.razao || d.nome)) + R('CNPJ/CPF', L(d.cnpj, 18)) + R('Unidade', L(d.nome)) + R('Endereço', L(d.end)) +
      R('Responsável', L(d.responsavel)) + R('E-mail', L(d.email)) + R('WhatsApp', L(d.wpp, 18)) + '</div>' +
      '<div style="border:1px solid #DDD0F0;border-radius:8px;padding:12px 14px"><div style="font-size:10px;font-weight:700;color:#5B2D8E;letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px">Contratada</div>' +
      R('Razão social', 'MGB Comunicação e Marketing Ltda.') + R('CNPJ', '23.770.170/0001-50') + R('Endereço', 'Londrina – PR') +
      R('Representante', 'Eder Balbino') + R('E-mail', 'comercial@agenciamgb.com.br') + R('WhatsApp', '(43) 99696-0078') + '</div></div>' +
      T('2. RESUMO') +
      '<table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:12px"><thead><tr style="background:#2A1760;color:#fff">' +
      '<th style="padding:6px 8px;text-align:left">Unidade</th><th style="padding:6px 8px">Mensalidade</th><th style="padding:6px 8px">Vigência</th><th style="padding:6px 8px">Início</th><th style="padding:6px 8px">Término</th></tr></thead>' +
      '<tbody><tr style="background:#F7F4FB"><td style="padding:5px 8px;color:#333;font-weight:500">' + L(d.nome) + '</td><td style="padding:5px 8px;text-align:center;color:#333">' + valorFmt +
      '</td><td style="padding:5px 8px;text-align:center;color:#333">' + meses + ' meses</td><td style="padding:5px 8px;text-align:center;color:#333">' + ini +
      '</td><td style="padding:5px 8px;text-align:center;color:#333">' + fim + '</td></tr></tbody></table>' +
      T('3. CLÁUSULAS E CONDIÇÕES') +
      C('CLÁUSULA 1ª — DO OBJETO', '1.1. Prestação, pela CONTRATADA, do serviço de rádio interna na unidade do CONTRATANTE identificada acima: programação musical ambiente, vinhetas e veiculação de spots institucionais e de ofertas do CONTRATANTE, operada e atualizada remotamente pela CONTRATADA.<br>1.2. O contrato vale para uma única unidade. Cada nova unidade do CONTRATANTE será objeto de contrato próprio.') +
      C('CLÁUSULA 2ª — DO VALOR E DO PAGAMENTO', '2.1. Pelo serviço, o CONTRATANTE pagará à CONTRATADA o valor mensal de <strong>' + valorFmt + extenso + '</strong>.<br>2.2. A cobrança é emitida no dia 5 (cinco) de cada mês, por boleto bancário' + (comNota ? ', acompanhada da nota fiscal de serviço' : '') + ', com o vencimento indicado no boleto. A primeira cobrança refere-se ao mês de início do serviço.<br>2.3. O atraso no pagamento sujeita o CONTRATANTE a multa de 2% (dois por cento) e juros de 1% (um por cento) ao mês sobre o valor devido. Atraso superior a 30 (trinta) dias permite à CONTRATADA suspender o serviço até a regularização.<br>2.4. O valor será reajustado a cada 12 (doze) meses pela variação acumulada do IPCA/IBGE no período. Caso essa variação seja negativa ou igual a zero, será aplicada a variação acumulada do IGP-M/FGV no mesmo período.') +
      C('CLÁUSULA 3ª — DAS OBRIGAÇÕES DA CONTRATADA', '3.1. Manter a rádio em funcionamento durante o horário de atendimento da unidade, com programação adequada ao perfil do estabelecimento.<br>3.2. Produzir e veicular os spots do CONTRATANTE a partir do material ou das informações enviadas por ele, no prazo de até 3 (três) dias úteis após a aprovação do texto.<br>3.3. Corrigir falhas na programação em até 48 (quarenta e oito) horas úteis após o aviso do CONTRATANTE.<br>3.4. Recusar conteúdo ilícito, ofensivo, político-partidário ou fora dos padrões técnicos, informando o motivo ao CONTRATANTE.') +
      C('CLÁUSULA 4ª — DAS OBRIGAÇÕES DO CONTRATANTE', '4.1. Manter na unidade o sistema de som (caixas, amplificador) e a conexão de internet necessários à reprodução da rádio.<br>4.2. Enviar com antecedência o material das campanhas e ofertas, sendo responsável pelo conteúdo e pela veracidade das informações divulgadas.<br>4.3. Comunicar à CONTRATADA qualquer falha na reprodução pelos canais (43) 99696-0078 | comercial@agenciamgb.com.br.<br>4.4. Efetuar os pagamentos nas datas de vencimento.') +
      C('CLÁUSULA 5ª — DOS DIREITOS AUTORAIS', '5.1. Os spots, vinhetas e locuções produzidos pela CONTRATADA são licenciados ao CONTRATANTE exclusivamente para veiculação na rádio interna da unidade contratada durante a vigência deste contrato.<br>5.2. Eventuais obrigações de recolhimento de direitos autorais de execução pública musical (ECAD) relativas ao estabelecimento seguem a legislação aplicável.') +
      C('CLÁUSULA 6ª — DO PRAZO E DA VIGÊNCIA', '6.1. Este contrato vigora por <strong>' + mesesTxt + '</strong>, de ' + ini + ' a ' + fim + '.<br>6.2. Findo o prazo, renova-se automaticamente por períodos iguais e sucessivos, salvo manifestação contrária de qualquer das partes, por escrito, com antecedência mínima de 30 (trinta) dias do término.') +
      C('CLÁUSULA 7ª — DA RESCISÃO', '7.1. Qualquer das partes pode rescindir este contrato mediante aviso prévio por escrito de 30 (trinta) dias, ficando devidos os valores do período de aviso.<br>7.2. O descumprimento de obrigação essencial, não sanado em 15 (quinze) dias após notificação, permite a rescisão imediata pela parte prejudicada.') +
      C('CLÁUSULA 8ª — DA PROTEÇÃO DE DADOS (LGPD)', '8.1. As partes tratarão os dados pessoais a que tiverem acesso em razão deste contrato conforme a Lei nº 13.709/2018, somente para a execução deste instrumento.') +
      C('CLÁUSULA 9ª — DO FORO', '9.1. Fica eleito o foro da Comarca de <strong>Londrina, Estado do Paraná</strong>, para dirimir quaisquer controvérsias decorrentes deste contrato.') +
      '<div style="color:#444;line-height:1.55;font-size:11.5px;margin:10px 0 18px;text-align:justify">E, por estarem de acordo, as partes assinam eletronicamente o presente instrumento.</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:28px;font-size:11.5px;color:#333;text-align:center">' +
      '<div style="border-top:1px solid #2A1760;padding-top:6px">' + L(d.razao || d.nome) + '<br><span style="color:#888">CONTRATANTE</span></div>' +
      '<div style="border-top:1px solid #2A1760;padding-top:6px">MGB Comunicação e Marketing Ltda.<br><span style="color:#888">CONTRATADA</span></div></div>' +
      '</div>';
  }

  var api = {
    CUSTO_POR_TORRE: CUSTO_POR_TORRE,
    CUSTO_RADIO: CUSTO_RADIO,
    custoCondominio: custoCondominio,
    leadsPendentes: leadsPendentes,
    jaExiste: jaExiste,
    validarCondominio: validarCondominio,
    despesaLicenca: despesaLicenca,
    sobraRadio: sobraRadio,
    validarRadio: validarRadio,
    despesaRadio: despesaRadio,
    dataMais: dataMais,
    contratoRadioInterna: contratoRadioInterna
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (!global.document) return;

  // ── Tela ───────────────────────────────────────────────────────────────
  var doc = global.document;
  var leadAtual = null;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function brl(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function listaLeads() { try { return leads; } catch (e) { return []; } }          // eslint-disable-line no-undef
  function modulos() { try { return MODULES; } catch (e) { return []; } }            // eslint-disable-line no-undef
  function modulo(id) { return modulos().filter(function (m) { return m.id === id; })[0]; }
  function condominiosExistentes() { var m = modulo('elev'); return m ? m.items : []; }

  function injetarEstilos() {
    if (doc.getElementById('mgb-novo-css')) return;
    var st = doc.createElement('style');
    st.id = 'mgb-novo-css';
    st.textContent =
      'body.mgb-sem-novo #mgb-novo-btn{display:none!important}' +
      '#mgb-novo-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;max-width:640px;margin:0 auto 16px;min-height:52px;border:0;border-radius:14px;background:#4E38B2;color:#fff;font:700 16px "DM Sans",system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(78,56,178,.25)}' +
      '#mgb-novo-btn:focus-visible{outline:3px solid #b9a9f5;outline-offset:2px}' +
      '#mgb-novo{position:fixed;inset:0;z-index:9600;background:rgba(36,26,56,.45);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 16px;font-family:"DM Sans",system-ui,sans-serif;color:#241a38}' +
      '#mgb-novo .box{width:100%;max-width:1040px;background:#f6f4fb;border-radius:18px;box-shadow:0 20px 60px rgba(36,26,56,.3);overflow:hidden}' +
      '#mgb-novo .top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 22px;background:#fff;border-bottom:1px solid #e4def2}' +
      '#mgb-novo .top h2{margin:0;font-size:20px}#mgb-novo .x{border:0;background:#efeaf8;border-radius:9px;height:38px;padding:0 14px;font-weight:600;font-size:14px;font-family:inherit;cursor:pointer;color:#3a2a5e}' +
      '#mgb-novo .corpo{padding:22px;display:flex;flex-direction:column;gap:18px}' +
      '#mgb-novo .card{background:#fff;border:1px solid #e4def2;border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;gap:12px;min-width:0}' +
      '#mgb-novo .card.crm{background:#f1faf7;border-color:#a7dccf}' +
      '#mgb-novo h3{margin:0;font-size:16px}#mgb-novo p.sub{margin:0;font-size:13px;color:#6b6380}' +
      '#mgb-novo .lin{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid #ece7f5;font-size:14px}' +
      '#mgb-novo .lin .acoes{display:flex;gap:8px;flex-wrap:wrap}' +
      '#mgb-novo .grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}' +
      '#mgb-novo .prod{display:flex;flex-direction:column;gap:6px;text-align:left;padding:14px;border:1px solid #e4def2;border-radius:12px;background:#fff;cursor:pointer;font:inherit;color:inherit;min-height:92px}' +
      '#mgb-novo .prod:hover{border-color:#4E38B2}#mgb-novo .prod b{font-size:15px}#mgb-novo .prod span{font-size:13px;color:#6b6380}' +
      '#mgb-novo .prod[disabled]{cursor:not-allowed;background:#f6f4fb;opacity:.75}' +
      '#mgb-novo .tag{font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;background:#efeaf8;color:#4E38B2;align-self:flex-start}' +
      '#mgb-novo .b{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-radius:10px;border:1px solid #d9d1ea;background:#fff;font-weight:600;font-size:14px;font-family:inherit;color:#241a38;cursor:pointer}' +
      '#mgb-novo .b.p{background:#4E38B2;border-color:#4E38B2;color:#fff}#mgb-novo .b[disabled]{opacity:.6;cursor:wait}' +
      '#mgb-novo .duas{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}#mgb-novo .duas>main{flex:999 1 520px;min-width:0;display:flex;flex-direction:column;gap:14px}#mgb-novo .duas>aside{flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:14px}' +
      '#mgb-novo .campos{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}' +
      '#mgb-novo label.f{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:#3a3446}' +
      '#mgb-novo label.f input,#mgb-novo label.f select{height:42px;border:1px solid #cfc6e0;border-radius:9px;padding:0 11px;font-size:14px;font-family:inherit;background:#fff;color:#241a38}' +
      '#mgb-novo label.f input.crm{background:#f1faf7;border-color:#a7dccf}' +
      '#mgb-novo .sec{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b6380}' +
      '#mgb-novo .conta{display:flex;justify-content:space-between;font-size:14px}' +
      '#mgb-novo .passo{display:flex;gap:10px;align-items:flex-start;font-size:14px}#mgb-novo .passo i{flex:none;width:22px;height:22px;border-radius:50%;background:#efeaf8;color:#4E38B2;font-style:normal;font-size:12px;font-weight:700;display:grid;place-items:center}' +
      '#mgb-novo .passo.ok i{background:#dcefe4;color:#14583a}#mgb-novo .passo.erro i{background:#fde3dc;color:#a33a1a}#mgb-novo .passo.vai i{background:#4E38B2;color:#fff}' +
      '#mgb-novo .erros{color:#a33a1a;font-size:13px;display:flex;flex-direction:column;gap:4px}';
    doc.head.appendChild(st);
  }

  function inserirBotaoHome() {
    if (doc.getElementById('mgb-novo-btn')) return;
    var hubs = doc.querySelector('.home-hubs');
    if (!hubs) return;
    var b = doc.createElement('button');
    b.type = 'button';
    b.id = 'mgb-novo-btn';
    b.innerHTML = '<span aria-hidden="true" style="font-size:20px;line-height:1">＋</span> Novo cliente';
    b.addEventListener('click', function () { abrir(); });
    hubs.parentNode.insertBefore(b, hubs);
  }

  function fechar() { var el = doc.getElementById('mgb-novo'); if (el) el.remove(); doc.removeEventListener('keydown', escFecha); }
  function escFecha(e) { if (e.key === 'Escape') fechar(); }

  function moldura(titulo, corpo, voltar) {
    var el = doc.getElementById('mgb-novo');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'mgb-novo';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      doc.body.appendChild(el);
      el.addEventListener('click', function (e) { if (e.target === el) fechar(); });
      doc.addEventListener('keydown', escFecha);
    }
    el.setAttribute('aria-label', titulo);
    el.innerHTML = '<div class="box"><div class="top"><h2>' + esc(titulo) + '</h2><div style="display:flex;gap:8px">' +
      (voltar ? '<button type="button" class="x" data-novo="inicio">Voltar</button>' : '') +
      '<button type="button" class="x" data-novo="fechar">Fechar</button></div></div><div class="corpo">' + corpo + '</div></div>';
    el.querySelectorAll('[data-novo]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-novo');
        if (a === 'fechar') fechar();
        if (a === 'inicio') abrir();
      });
    });
    el.scrollTop = 0;
    return el;
  }

  // ── Início: CRM + produtos ─────────────────────────────────────────────
  function abrir() {
    injetarEstilos();
    leadAtual = null;
    var pend = leadsPendentes(listaLeads());
    var crm = pend.length ? pend.map(function (l) {
      var m = modulo(l.produto);
      var rot = m ? m.label.split('—')[0].trim() : 'Sem produto';
      var acoes = '';
      if (l.produto === 'elev') {
        acoes = '<button type="button" class="b p" data-lead="' + l.id + '" data-acao="condominio">Cadastrar condomínio</button>' +
          '<button type="button" class="b" data-acao="anunciante">É anunciante</button>';
      } else if (l.produto === 'radio') {
        acoes = '<button type="button" class="b p" data-lead="' + l.id + '" data-acao="radio">Cadastrar rádio interna</button>' +
          '<button type="button" class="b" data-acao="mercadao">É anunciante do Mercadão</button>';
      } else if (l.produto === 'vaapty') {
        acoes = '<button type="button" class="b p" data-acao="vaapty">Abrir contrato Vaapty</button>';
      } else if (m) {
        acoes = '<button type="button" class="b" data-acao="modulo" data-mod="' + esc(l.produto) + '">Abrir ' + esc(rot) + '</button>';
      }
      return '<div class="lin"><div><div style="font-weight:700">' + esc(l.nome) + '</div><div style="font-size:13px;color:#6b6380">' +
        esc(rot) + (l.valor ? ' · ' + brl(l.valor) + '/mês' : '') + (l.cnpj ? ' · CNPJ ' + esc(l.cnpj) : '') + '</div></div><div class="acoes">' + acoes + '</div></div>';
    }).join('') : '<p class="sub">Nenhum cliente fechado esperando cadastro. Quando o Eder marcar um lead como Fechado no CRM, ele aparece aqui.</p>';

    var produtos = [
      ['condominio', 'Condomínio', 'Tela no elevador. Parceria: condomínio paga R$ 0, custo de R$ 70 por torre ao mês.', ''],
      ['anunciante', 'Anunciante · telas do elevador', 'Abre o contrato Tela Vertical, que já lança o anunciante nas telas escolhidas.', ''],
      ['vaapty', 'Unidade Vaapty', 'Abre o contrato Vaapty, que já cria a unidade no módulo.', ''],
      ['radio', 'Rádio interna', 'Uma unidade (loja) por vez, com o contrato padrão. Custo de R$ 70 ao mês.', ''],
      ['mercadao', 'Anunciante · Rádio Mercadão', 'Por enquanto abre o contrato Mercadão que já existe. O cadastro guiado é a próxima entrega.', ''],
      ['modulo:tv', 'TV interna', 'Abre o módulo TV Interna.', ''],
      ['modulo:taroba', 'Comissão Tarobá', 'Abre o módulo Tarobá para lançar o valor do mês.', ''],
      ['', 'Portal Londrina · Cascavel', 'Ainda não existe no hub.', 'em breve']
    ].map(function (p) {
      var dis = p[3] ? ' disabled' : '';
      var acao = p[0].indexOf('modulo:') === 0 ? ' data-acao="modulo" data-mod="' + p[0].split(':')[1] + '"' : (p[0] ? ' data-acao="' + p[0] + '"' : '');
      return '<button type="button" class="prod"' + acao + dis + '>' + (p[3] ? '<span class="tag">' + p[3] + '</span>' : '') +
        '<b>' + p[1] + '</b><span>' + p[2] + '</span></button>';
    }).join('');

    var el = moldura('Novo cliente',
      '<section class="card crm"><h3>Fechados no CRM, esperando cadastro' + (pend.length ? ' · ' + pend.length : '') + '</h3>' +
      '<p class="sub">Os dados do lead vêm preenchidos. Você só confere e completa.</p>' + crm + '</section>' +
      '<section class="card"><h3>Ou escolha o que vai lançar</h3><div class="grade">' + produtos + '</div></section>', false);

    el.querySelectorAll('[data-acao]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-acao');
        if (a === 'condominio') {
          var id = b.getAttribute('data-lead');
          var lead = id ? listaLeads().filter(function (l) { return String(l.id) === id; })[0] : null;
          formCondominio(lead);
        }
        if (a === 'radio') {
          var idr = b.getAttribute('data-lead');
          formRadio(idr ? listaLeads().filter(function (l) { return String(l.id) === idr; })[0] : null);
        }
        if (a === 'mercadao') irPara('contratos', 'mercadao');
        if (a === 'anunciante') irPara('contratos', 'elevador');
        if (a === 'vaapty') irPara('contratos', 'vaapty');
        if (a === 'modulo') { fechar(); try { global.drillMod(b.getAttribute('data-mod')); } catch (e) {} }
      });
    });
  }

  function irPara(grupo, aba) {
    fechar();
    try {
      global.goOperacional(grupo);
      var t = doc.querySelector('#page-operacional .hub-tab[data-tab="' + aba + '"]');
      if (t && typeof global.showOpPanel === 'function') global.showOpPanel(aba, t);
    } catch (e) {}
  }

  // ── Novo condomínio ────────────────────────────────────────────────────
  function formCondominio(lead) {
    leadAtual = lead || null;
    var L = lead || {};
    var hoje = new Date();
    var proxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    var ini = proxMes.toISOString().slice(0, 10);
    function campo(id, rotulo, valor, tipo, extra) {
      var crm = valor && lead ? ' class="crm"' : '';
      return '<label class="f" for="nv-' + id + '">' + rotulo + '<input id="nv-' + id + '"' + crm + ' type="' + (tipo || 'text') + '" value="' + esc(valor || '') + '"' + (extra || '') + '></label>';
    }
    var el = moldura('Novo condomínio',
      '<div class="duas"><main>' +
      '<p class="sub">' + (lead ? 'Campos em verde vieram do CRM. Confira e complete o resto.' : 'Preencha os dados do condomínio. Campos com * são obrigatórios.') + '</p>' +
      '<section class="card"><div class="sec">1 · Condomínio</div><div class="campos">' +
      campo('nome', 'Nome do condomínio *', L.nome) + campo('cnpj', 'CNPJ', L.cnpj) +
      campo('end', 'Endereço completo', '') + campo('bairro', 'Bairro ou região', '') + '</div></section>' +
      '<section class="card"><div class="sec">2 · Síndico</div><div class="campos">' +
      campo('sindico', 'Nome', L.responsavel) + campo('cpf', 'CPF', '') +
      campo('email', 'E-mail (recebe o contrato no Assinafy)', '', 'email') + campo('wpp', 'WhatsApp', L.tel) + '</div></section>' +
      '<section class="card"><div class="sec">3 · Estrutura e contrato</div><div class="campos">' +
      campo('torres', 'Número de torres *', '1', 'number', ' min="1"') + campo('telas', 'Número de telas', '1', 'number', ' min="1"') +
      campo('apts', 'Número de apartamentos', '', 'number', ' min="0"') + campo('inicio', 'Início *', ini, 'date') +
      '<label class="f" for="nv-vig">Vigência<select id="nv-vig"><option value="36">36 meses (renovação automática)</option><option value="24">24 meses (renovação automática)</option><option value="12">12 meses (renovação automática)</option></select></label>' +
      '</div></section></main>' +
      '<aside><section class="card"><div class="sec">Conta do mês</div>' +
      '<div class="conta"><span>Condomínio paga</span><b>R$ 0</b></div>' +
      '<div class="conta"><span id="nv-custo-rot">Custo · 1 torre × R$ 70</span><b id="nv-custo" style="color:#a33a1a">R$ 70/mês</b></div>' +
      '<p class="sub">A receita vem dos anunciantes que você colocar nestas telas.</p></section>' +
      '<section class="card"><div class="sec">Ao criar, o hub faz</div>' +
      '<div class="passo" id="nv-p1"><i>1</i><span>Cria a tela do condomínio no módulo Elevadores.</span></div>' +
      '<div class="passo" id="nv-p2"><i>2</i><span>Lança a despesa recorrente da licença das telas.</span></div>' +
      '<div class="passo" id="nv-p3"><i>3</i><span>' + (lead ? 'Marca o lead do CRM como cadastrado.' : 'Sem lead do CRM: nada a marcar.') + '</span></div>' +
      '<div class="passo" id="nv-p4"><i>4</i><span>Gera o contrato de parceria e envia ao síndico pelo Assinafy.</span></div>' +
      '<div class="passo" id="nv-p5"><i>5</i><span>Prepara o aviso ao Cleiton para instalar e programar.</span></div>' +
      '<div class="erros" id="nv-erros" role="alert"></div>' +
      '<button type="button" class="b p" id="nv-criar">Criar condomínio e enviar contrato</button>' +
      '</section></aside></div>', true);

    var torres = el.querySelector('#nv-torres');
    function atualizarConta() {
      var t = parseInt(torres.value, 10) || 0;
      el.querySelector('#nv-custo-rot').textContent = 'Custo · ' + t + (t === 1 ? ' torre' : ' torres') + ' × R$ ' + CUSTO_POR_TORRE;
      el.querySelector('#nv-custo').textContent = brl(custoCondominio(t)) + '/mês';
    }
    torres.addEventListener('input', atualizarConta);
    el.querySelector('#nv-criar').addEventListener('click', criarCondominio);
    el.querySelector('#nv-nome').focus();
  }

  function val(id) { var e = doc.getElementById('nv-' + id); return e ? String(e.value).trim() : ''; }
  function marcar(n, estado, texto) {
    var p = doc.getElementById('nv-p' + n);
    if (!p) return;
    p.className = 'passo ' + estado;
    p.querySelector('i').textContent = estado === 'ok' ? '✓' : estado === 'erro' ? '!' : n;
    if (texto) p.querySelector('span').innerHTML = texto;
  }

  function criarCondominio() {
    var d = {
      nome: val('nome'), cnpj: val('cnpj'), end: val('end'), bairro: val('bairro'), sindico: val('sindico'),
      cpf: val('cpf'), email: val('email'), wpp: val('wpp'), torres: val('torres'), telas: val('telas'),
      apts: val('apts'), inicio: val('inicio'), vig: (doc.getElementById('nv-vig') || {}).value || '36'
    };
    var errosEl = doc.getElementById('nv-erros');
    var erros = validarCondominio(d, condominiosExistentes());
    if (erros.length) { errosEl.innerHTML = erros.map(esc).join('<br>'); return; }
    errosEl.textContent = '';
    var btn = doc.getElementById('nv-criar');
    btn.disabled = true; btn.textContent = 'Criando…';

    // 1. tela no módulo Elevadores
    try {
      var cliente = { cnpj: d.cnpj, fantasia: d.nome, responsavel: d.sindico, cargo: 'Síndico(a)', tel: d.wpp, email: d.email,
        endereco: d.end, bairro: d.bairro, torres: parseInt(d.torres, 10), telas: parseInt(d.telas, 10) || '', apartamentos: parseInt(d.apts, 10) || '' };
      var criado = global.mgbCriarUnidadeModulo('elev', d.nome, { valor: 0, inicio: d.inicio.slice(0, 7), meses: parseInt(d.vig, 10), cliente: cliente });
      if (!criado) throw new Error('o módulo Elevadores não foi encontrado');
      marcar(1, 'ok', 'Tela <b>' + esc(d.nome) + '</b> criada no módulo Elevadores.');
    } catch (e) {
      marcar(1, 'erro', 'Não consegui criar a tela: ' + esc(e.message) + '. Nada foi lançado.');
      btn.disabled = false; btn.textContent = 'Tentar de novo';
      return;
    }

    // 2. despesa recorrente da licença
    try {
      var desp = despesaLicenca(d.torres, d.inicio, d.vig);
      applyToFin(desp, +1);                                   // eslint-disable-line no-undef
      if (!db.elev[d.nome]) db.elev[d.nome] = [];             // eslint-disable-line no-undef
      db.elev[d.nome].push(desp);                             // eslint-disable-line no-undef
      marcar(2, 'ok', 'Despesa de <b>' + brl(custoCondominio(d.torres)) + '/mês</b> lançada por ' + desp.mesesRec + ' meses a partir de ' + desp.dataInicio.split('-').reverse().join('/') + '.');
    } catch (e) {
      marcar(2, 'erro', 'A tela foi criada, mas a despesa não: ' + esc(e.message) + '. Lance a licença à mão no módulo Elevadores.');
    }

    // 3. lead do CRM
    if (leadAtual) {
      leadAtual.itemCriado = d.nome;
      marcar(3, 'ok', 'Lead <b>' + esc(leadAtual.nome) + '</b> marcado como cadastrado.');
    } else {
      marcar(3, 'ok', 'Sem lead do CRM para marcar.');
    }
    try { scheduleSave(); } catch (e) {}                     // eslint-disable-line no-undef
    try { global.buildSidebar(); } catch (e) {}
    try { global.buildHome(); } catch (e) {}

    // 4. contrato de parceria + Assinafy
    enviarContrato(d).then(function (r) {
      marcar(4, r.ok ? 'ok' : 'erro', r.msg);
    }).finally(function () {
      // 5. aviso ao Cleiton (WhatsApp: o hub não manda mensagem sozinho)
      var txt = 'Novo condomínio fechado: ' + d.nome + (d.bairro ? ' (' + d.bairro + ')' : '') + '. ' +
        d.torres + ' torre(s), ' + (d.telas || d.torres) + ' tela(s). Início ' + d.inicio.split('-').reverse().join('/') +
        '. Contrato enviado para assinatura: programar a instalação assim que for assinado.';
      marcar(5, 'ok', 'Aviso pronto: <a href="https://wa.me/?text=' + encodeURIComponent(txt) + '" target="_blank" rel="noopener">enviar ao Cleiton no WhatsApp</a>.');
      btn.textContent = 'Condomínio criado';
      var fim = doc.createElement('button');
      fim.type = 'button'; fim.className = 'b'; fim.textContent = 'Lançar outro';
      fim.addEventListener('click', function () { abrir(); });
      btn.parentNode.appendChild(fim);
    });
  }

  function enviarContrato(d) {
    function set(id, v) { var e = doc.getElementById(id); if (e) e.value = v; }
    try {
      set('p-razao', d.nome); set('p-cnpj', d.cnpj); set('p-end', d.end); set('p-sindico', d.sindico);
      set('p-cpf', d.cpf); set('p-email', d.email); set('p-wpp', d.wpp); set('p-torres', d.torres);
      set('p-apts', d.apts); set('p-telas', d.telas); set('p-bairro', d.bairro); set('p-vigencia', d.vig); set('p-inicio', d.inicio);
      global.parcGerar();
    } catch (e) {
      return Promise.resolve({ ok: false, msg: 'Não consegui gerar o contrato: ' + esc(e.message) + '. Gere pela aba Contratos › Parceria Cond.' });
    }
    var out = doc.getElementById('parc-output');
    if (!out || !out.innerHTML.trim()) return Promise.resolve({ ok: false, msg: 'Contrato não gerado. Gere pela aba Contratos › Parceria Cond.' });
    if (!d.email) return Promise.resolve({ ok: false, msg: 'Contrato gerado, mas sem e-mail do síndico. Envie pela aba Contratos › Parceria Cond. quando tiver o e-mail.' });
    return enviarAssinafy('elev', d.nome, 'Contrato de Parceria - ' + d.nome, out.innerHTML, d.sindico || d.nome, d.email,
      'Segue o contrato de parceria das telas digitais nos elevadores para assinatura eletrônica.')
      .then(function () { return { ok: true, msg: 'Contrato enviado ao síndico (' + esc(d.email) + ') e a você pelo Assinafy.' }; })
      .catch(function (e) { return { ok: false, msg: 'Contrato gerado, mas o envio ao Assinafy falhou: ' + esc(e.message) + '. Envie pela aba Contratos › Parceria Cond.' }; });
  }

  function documentoContrato(corpo) {
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>body{padding:24px;background:#fff;font-family:Arial,sans-serif}</style></head><body>' + corpo + '</body></html>';
  }

  // Envia ao Assinafy (Apps Script do hub). Assinam o cliente e o Eder. Guarda o docId no cadastro do cliente.
  function enviarAssinafy(modId, nome, nomeDoc, corpo, signatario, email, mensagem) {
    return fetch(ASSINAFY_API_URL + '?action=enviar', {
      method: 'POST',
      body: JSON.stringify({
        nomeDoc: nomeDoc,
        html: documentoContrato(corpo),
        signatarios: [{ nome: signatario, email: email }, { nome: 'Eder Balbino — MGB Mídia', email: 'ederbalbino@gmail.com' }],
        mensagem: mensagem
      })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.erro) throw new Error((j && j.erro) || 'resposta vazia');
      try {
        var info = clientesInfo[modId] && clientesInfo[modId][nome];  // eslint-disable-line no-undef
        if (info) { info.assinafyDocId = j.docId; scheduleSave(); }    // eslint-disable-line no-undef
      } catch (e) {}
      return j;
    });
  }

  function linkVerContrato(corpo) {
    try {
      var url = URL.createObjectURL(new Blob([documentoContrato(corpo)], { type: 'text/html' }));
      return ' <a href="' + url + '" target="_blank" rel="noopener">Ver o contrato</a>.';
    } catch (e) { return ''; }
  }

  // ── Nova rádio interna ─────────────────────────────────────────────────
  function campoNv(id, rotulo, valor, tipo, extra, doCrm) {
    return '<label class="f" for="nv-' + id + '">' + rotulo + '<input id="nv-' + id + '"' + (valor && doCrm ? ' class="crm"' : '') +
      ' type="' + (tipo || 'text') + '" value="' + esc(valor == null ? '' : valor) + '"' + (extra || '') + '></label>';
  }

  function unidadesRadio() { var m = modulo('radio'); return m ? m.items : []; }

  function formRadio(lead) {
    leadAtual = lead || null;
    var L = lead || {};
    var hoje = new Date();
    var ini = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1).toISOString().slice(0, 10);
    var crm = !!lead;
    var el = moldura('Nova rádio interna',
      '<div class="duas"><main>' +
      '<p class="sub">Uma unidade por vez: cada loja é um lead no CRM e é faturada separada.' + (lead ? ' Os campos em verde vieram do CRM.' : ' Campos com * são obrigatórios.') + '</p>' +
      '<section class="card"><div class="sec">1 · Cliente</div><div class="campos">' +
      campoNv('nome', 'Nome da unidade (loja) *', L.nome, 'text', ' placeholder="Ex.: Ótica Visão · Centro"', crm) +
      campoNv('razao', 'Razão social', '', 'text', ' placeholder="Se diferente do nome"') +
      campoNv('cnpj', 'CNPJ ou CPF', L.cnpj, 'text', '', crm) +
      campoNv('end', 'Endereço da unidade', '', 'text', ' placeholder="Rua, número, bairro, cidade"') +
      campoNv('resp', 'Responsável', L.responsavel, 'text', '', crm) +
      campoNv('email', 'E-mail (recebe o contrato e a nota)', '', 'email', ' placeholder="financeiro@cliente.com"') +
      campoNv('wpp', 'WhatsApp', L.tel, 'text', '', crm) + '</div></section>' +
      '<section class="card"><div class="sec">2 · Plano</div><div class="campos">' +
      campoNv('valor', 'Valor mensal do contrato (R$) *', L.valor ? String(L.valor).replace('.', ',') : '', 'text', ' inputmode="decimal" placeholder="0,00"', crm) +
      campoNv('inicio', 'Início *', ini, 'date') +
      '<label class="f" for="nv-vig">Duração<select id="nv-vig"><option value="12">12 meses</option><option value="24">24 meses</option><option value="6">6 meses</option></select></label>' +
      '<label class="f" for="nv-nf">Nota fiscal<select id="nv-nf"><option value="nota">Nota + boleto todo dia 5</option><option value="boleto">Só boleto, sem nota</option></select></label>' +
      '</div></section></main>' +
      '<aside><section class="card"><div class="sec">Conta do mês</div>' +
      '<div class="conta"><span>Receita</span><b id="nv-rec" style="color:#14583a">R$ 0/mês</b></div>' +
      '<div class="conta"><span>Custo da rádio</span><b style="color:#a33a1a">' + brl(CUSTO_RADIO) + '/mês</b></div>' +
      '<div class="conta" style="border-top:1px solid #ece7f5;padding-top:10px"><span>Sobra para a MGB</span><b id="nv-sobra">—</b></div></section>' +
      '<section class="card"><div class="sec">Ao criar, o hub faz</div>' +
      '<div class="passo" id="nv-p1"><i>1</i><span>Cria a unidade no módulo Rádio Interna, com a receita mensal.</span></div>' +
      '<div class="passo" id="nv-p2"><i>2</i><span>Lança o custo recorrente de ' + brl(CUSTO_RADIO) + '/mês.</span></div>' +
      '<div class="passo" id="nv-p3"><i>3</i><span>' + (lead ? 'Marca o lead do CRM como cadastrado.' : 'Sem lead do CRM: nada a marcar.') + '</span></div>' +
      '<div class="passo" id="nv-p4"><i>4</i><span>Gera o contrato padrão de rádio interna e envia pelo Assinafy.</span></div>' +
      '<div class="passo" id="nv-p5"><i>5</i><span>Prepara o aviso ao Cleiton para montar a programação.</span></div>' +
      '<div class="erros" id="nv-erros" role="alert"></div>' +
      '<button type="button" class="b p" id="nv-criar">Criar rádio interna e enviar contrato</button>' +
      '</section></aside></div>', true);

    var valor = el.querySelector('#nv-valor');
    function atualizarConta() {
      var v = numero(valor.value);
      el.querySelector('#nv-rec').textContent = brl(v) + '/mês';
      var s = sobraRadio(v);
      var b = el.querySelector('#nv-sobra');
      b.textContent = v ? brl(s) + '/mês' : '—';
      b.style.color = v && s < 0 ? '#a33a1a' : '';
    }
    valor.addEventListener('input', atualizarConta);
    atualizarConta();
    el.querySelector('#nv-criar').addEventListener('click', criarRadio);
    el.querySelector('#nv-nome').focus();
  }

  function criarRadio() {
    var d = {
      nome: val('nome'), razao: val('razao'), cnpj: val('cnpj'), end: val('end'), responsavel: val('resp'),
      email: val('email'), wpp: val('wpp'), valor: val('valor'), inicio: val('inicio'),
      meses: (doc.getElementById('nv-vig') || {}).value || '12', nf: (doc.getElementById('nv-nf') || {}).value || 'nota'
    };
    var errosEl = doc.getElementById('nv-erros');
    var erros = validarRadio(d, unidadesRadio());
    if (erros.length) { errosEl.innerHTML = erros.map(esc).join('<br>'); return; }
    errosEl.textContent = '';
    var btn = doc.getElementById('nv-criar');
    btn.disabled = true; btn.textContent = 'Criando…';
    var valor = numero(d.valor), meses = parseInt(d.meses, 10);

    // 1. unidade + receita no módulo Rádio Interna
    try {
      var cliente = { cnpj: d.cnpj, razao: d.razao || d.nome, fantasia: d.nome, responsavel: d.responsavel, tel: d.wpp, email: d.email,
        endereco: d.end, notaFiscal: d.nf === 'nota' };
      var criado = global.mgbCriarUnidadeModulo('radio', d.nome, { valor: valor, inicio: d.inicio.slice(0, 7), meses: meses, cliente: cliente });
      if (!criado) throw new Error('o módulo Rádio Interna não foi encontrado');
      marcar(1, 'ok', 'Unidade <b>' + esc(d.nome) + '</b> criada com receita de ' + brl(valor) + '/mês por ' + meses + ' meses.');
    } catch (e) {
      marcar(1, 'erro', 'Não consegui criar a unidade: ' + esc(e.message) + '. Nada foi lançado.');
      btn.disabled = false; btn.textContent = 'Tentar de novo';
      return;
    }
    try { global.buildAll(); } catch (e) {}

    // 2. custo recorrente
    try {
      var desp = despesaRadio(d.inicio, meses);
      applyToFin(desp, +1);                                     // eslint-disable-line no-undef
      if (!db.radio[d.nome]) db.radio[d.nome] = [];             // eslint-disable-line no-undef
      db.radio[d.nome].push(desp);                              // eslint-disable-line no-undef
      marcar(2, 'ok', 'Custo de <b>' + brl(CUSTO_RADIO) + '/mês</b> lançado a partir de ' + desp.dataInicio.split('-').reverse().join('/') + '.');
    } catch (e) {
      marcar(2, 'erro', 'A unidade foi criada, mas o custo não: ' + esc(e.message) + '. Lance a licença à mão no módulo Rádio Interna.');
    }

    // 3. lead do CRM
    if (leadAtual) { leadAtual.itemCriado = d.nome; marcar(3, 'ok', 'Lead <b>' + esc(leadAtual.nome) + '</b> marcado como cadastrado.'); }
    else marcar(3, 'ok', 'Sem lead do CRM para marcar.');
    try { scheduleSave(); } catch (e) {}                       // eslint-disable-line no-undef
    try { global.buildSidebar(); } catch (e) {}
    try { global.buildHome(); } catch (e) {}

    // 4. contrato padrão + Assinafy
    var corpo = contratoRadioInterna(d, {
      extenso: typeof global.fRecExtenso === 'function' ? global.fRecExtenso : null,
      hoje: new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }),
      numero: 'MGB-RAD-' + Date.now().toString().slice(-6)
    });
    var ver = linkVerContrato(corpo);
    var envio = d.email
      ? enviarAssinafy('radio', d.nome, 'Contrato Rádio Interna - ' + d.nome, corpo, d.responsavel || d.nome, d.email,
          'Segue o contrato da rádio interna para assinatura eletrônica.')
          .then(function () { return { ok: true, msg: 'Contrato enviado ao cliente (' + esc(d.email) + ') e a você pelo Assinafy.' + ver }; })
          .catch(function (e) { return { ok: false, msg: 'Contrato gerado, mas o envio ao Assinafy falhou: ' + esc(e.message) + '.' + ver }; })
      : Promise.resolve({ ok: false, msg: 'Contrato gerado, mas sem e-mail do cliente: nada foi enviado.' + ver });

    envio.then(function (r) { marcar(4, r.ok ? 'ok' : 'erro', r.msg); }).finally(function () {
      // 5. aviso ao Cleiton
      var txt = 'Nova rádio interna fechada: ' + d.nome + '. Início ' + d.inicio.split('-').reverse().join('/') +
        '. Contrato enviado para assinatura: montar a programação assim que for assinado (o material vem pela Karen).';
      marcar(5, 'ok', 'Aviso pronto: <a href="https://wa.me/?text=' + encodeURIComponent(txt) + '" target="_blank" rel="noopener">enviar ao Cleiton no WhatsApp</a>.');
      btn.textContent = 'Rádio interna criada';
      var fim = doc.createElement('button');
      fim.type = 'button'; fim.className = 'b'; fim.textContent = 'Lançar outra unidade';
      fim.addEventListener('click', function () { abrir(); });
      btn.parentNode.appendChild(fim);
    });
  }

  global.MGBNovo = Object.assign(api, { abrir: abrir });
  function iniciar() { injetarEstilos(); inserirBotaoHome(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
