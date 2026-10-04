/**
 * MGB Assinafy API — Apps Script standalone, SEM planilha.
 * Assinatura eletrônica pros contratos do hub (mgb-financeiro/index.html):
 * Contrato Tela Vertical (Elevadores) e Contrato Vaapty.
 *
 * Reaproveita a MESMA conta Assinafy já usada no Rádio Ops (Moinho Globo) —
 * mesma empresa, mesma conta, só um uso novo. Faz a conversão HTML→PDF aqui
 * dentro (Utilities.newBlob(...).getAs('application/pdf')) porque o Vercel
 * (onde mora o resto do hub) não tem esse recurso nativo — é exatamente o
 * motivo de isso ser um Apps Script e não um endpoint em bot/api/.
 *
 * Metadados de cada documento (nome + signatários) ficam em PropertiesService
 * (chave doc_<docId>) só o tempo necessário pro webhook saber pra quem
 * reenviar o PDF assinado — sem precisar de planilha nenhuma.
 *
 * GET  ?action=status&docId=...   -> { status, assinado:boolean }
 * GET  ?action=baixar&docId=...   -> { pdfBase64, nomeArquivo } (só quando assinado)
 * POST ?action=enviar             body: { nomeDoc, html, signatarios:[{nome,email}], mensagem? }
 *      -> { docId }
 * (webhook da Assinafy não é usado: a conta só aceita 1 URL, e é a do Rádio Ops — usa verificarPendentes + instalarGatilho)
 * POST (sem action, webhook da Assinafy) -> document_ready: baixa o PDF certificado
 *      e reenvia por e-mail a TODOS os signatários automaticamente.
 */

// Chave/conta da Assinafy NÃO ficam no código — configurar em Project Settings
// → Script Properties: ASSINAFY_API_KEY e ASSINAFY_ACCOUNT_ID (mesmos valores
// já usados no Code.gs do Rádio Ops, mesma conta "MGB Comunicação e Marketing").
function props_() { return PropertiesService.getScriptProperties(); }
function ASSINAFY_API_KEY_() {
  const v = props_().getProperty('ASSINAFY_API_KEY');
  if (!v) throw new Error('Falta a Script Property ASSINAFY_API_KEY (Project Settings → Script Properties).');
  return v;
}
function ASSINAFY_ACCOUNT_ID_() {
  const v = props_().getProperty('ASSINAFY_ACCOUNT_ID');
  if (!v) throw new Error('Falta a Script Property ASSINAFY_ACCOUNT_ID (Project Settings → Script Properties).');
  return v;
}
const EDER_EMAIL = 'ederbalbino@gmail.com';
const MGB_TELEFONE = '(43) 99696-0078';

/**
 * Rode esta função UMA VEZ pelo botão ▶ Executar do editor (não pela URL) —
 * é o jeito de fazer o Google mostrar a tela de permissão completa, incluindo
 * "Conectar a um serviço externo" (sem isso, UrlFetchApp falha mesmo com as
 * Script Properties configuradas certas). Selecione "autorizar_" no menu ao
 * lado do botão ▶ antes de clicar.
 */
function autorizarAssinafy() {
  const r = UrlFetchApp.fetch('https://api.assinafy.com.br/v1/accounts/' + ASSINAFY_ACCOUNT_ID_() + '/documents?per-page=1', {
    headers: { 'X-Api-Key': ASSINAFY_API_KEY_() }, muteHttpExceptions: true
  });
  Logger.log('Status: ' + r.getResponseCode() + ' — ' + r.getContentText().slice(0, 200));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function cors_(out) {
  // Apps Script Web Apps não suportam headers CORS customizados de verdade,
  // mas o fetch do hub usa mode:'cors' sem credenciais — funciona via GET/POST simples.
  return out;
}

function doGet(e) {
  try {
    const action = (e.parameter.action || '').toString();
    if (action === 'status') return cors_(json_(consultarStatus_(e.parameter.docId)));
    if (action === 'baixar') return cors_(json_(baixarAssinado_(e.parameter.docId)));
    return cors_(json_({ erro: "Ação desconhecida: '" + action + "'. Use status | baixar." }));
  } catch (err) {
    return cors_(json_({ erro: String(err) }));
  }
}

function doPost(e) {
  try {
    const action = (e.parameter.action || '').toString();
    if (action === 'enviar') {
      const body = JSON.parse(e.postData.contents || '{}');
      return cors_(json_(enviarParaAssinatura_(body.nomeDoc, body.html, body.signatarios, body.mensagem)));
    }
    // sem "action" conhecida = webhook da Assinafy (document_ready)
    return cors_(json_(processarWebhook_(e)));
  } catch (err) {
    try { MailApp.sendEmail(EDER_EMAIL, 'MGB Assinafy API — erro', String(err)); } catch (e2) {}
    return cors_(json_({ erro: String(err) }));
  }
}

/** Chamada à API da Assinafy (mesmo padrão do Rádio Ops) */
function assinafyReq_(metodo, caminho, payload, contentTypeJson) {
  const opts = {
    method: metodo,
    headers: { 'X-Api-Key': ASSINAFY_API_KEY_() },
    muteHttpExceptions: true
  };
  if (payload !== undefined && payload !== null) {
    if (contentTypeJson) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(payload); }
    else opts.payload = payload; // objeto com Blob → UrlFetchApp monta multipart sozinho
  }
  const resp = UrlFetchApp.fetch('https://api.assinafy.com.br/v1' + caminho, opts);
  const code = resp.getResponseCode();
  const corpo = resp.getContentText();
  if (code < 200 || code >= 300) throw new Error('Assinafy recusou (' + code + '): ' + corpo.slice(0, 300));
  try { return JSON.parse(corpo).data || JSON.parse(corpo); } catch (e) { return corpo; }
}

/** Envia um HTML (contrato gerado no hub) como PDF pra assinatura eletrônica */
function enviarParaAssinatura_(nomeDoc, html, signatarios, mensagem) {
  if (!nomeDoc || !html || !signatarios || !signatarios.length) {
    throw new Error('Faltam dados: nomeDoc, html e signatarios[].');
  }
  const pdf = Utilities.newBlob(html, 'text/html', nomeDoc + '.html').getAs('application/pdf').setName(nomeDoc + '.pdf');
  const doc = assinafyReq_('post', '/accounts/' + ASSINAFY_ACCOUNT_ID_() + '/documents', { file: pdf }, false);
  let st = doc.status, tent = 0;
  while (st !== 'metadata_ready' && tent < 10) {
    Utilities.sleep(1500); tent++;
    try { st = assinafyReq_('get', '/documents/' + doc.id).status; } catch (e) {}
  }
  const cachePorEmail = {};
  (assinafyReq_('get', '/accounts/' + ASSINAFY_ACCOUNT_ID_() + '/signers?per-page=100') || []).forEach(x => {
    if (x.email) cachePorEmail[x.email.toLowerCase()] = x.id;
  });
  const ids = [];
  signatarios.forEach(sg => {
    const chave = (sg.email || '').toLowerCase();
    if (chave && cachePorEmail[chave]) {
      if (ids.indexOf(cachePorEmail[chave]) === -1) ids.push(cachePorEmail[chave]);
      return;
    }
    const novo = assinafyReq_('post', '/accounts/' + ASSINAFY_ACCOUNT_ID_() + '/signers', { full_name: sg.nome, email: sg.email || '' }, true);
    if (chave) cachePorEmail[chave] = novo.id;
    ids.push(novo.id);
  });
  assinafyReq_('post', '/documents/' + doc.id + '/assignments', {
    method: 'virtual',
    signers: ids.map(id => ({ id: id })),
    message: mensagem || ('Documento enviado pela MGB Mídia / Tela Vertical. Dúvidas: ' + MGB_TELEFONE)
  }, true);

  // guarda metadados pro webhook saber pra quem reenviar quando todos assinarem
  PropertiesService.getScriptProperties().setProperty('doc_' + doc.id, JSON.stringify({ nomeDoc: nomeDoc, signatarios: signatarios }));

  return { docId: doc.id };
}

function consultarStatus_(docId) {
  if (!docId) throw new Error('Falta docId.');
  const doc = assinafyReq_('get', '/documents/' + docId);
  return { status: doc.status || '?', assinado: !!(doc.artifacts && doc.artifacts.certificated) };
}

function baixarAssinado_(docId) {
  if (!docId) throw new Error('Falta docId.');
  const doc = assinafyReq_('get', '/documents/' + docId);
  if (!doc.artifacts || !doc.artifacts.certificated) {
    throw new Error('Documento ainda não foi assinado por todos (status: ' + (doc.status || '?') + ').');
  }
  const resp = UrlFetchApp.fetch('https://api.assinafy.com.br/v1/documents/' + docId + '/download/certificated', {
    headers: { 'X-Api-Key': ASSINAFY_API_KEY_() }, muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new Error('Não consegui baixar o PDF assinado (' + resp.getResponseCode() + ').');
  const meta = metaDoDoc_(docId);
  return {
    pdfBase64: Utilities.base64Encode(resp.getBlob().getBytes()),
    nomeArquivo: (meta && meta.nomeDoc ? meta.nomeDoc : 'contrato-assinado') + '.pdf'
  };
}

function metaDoDoc_(docId) {
  const raw = PropertiesService.getScriptProperties().getProperty('doc_' + docId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/** Webhook da Assinafy — evento document_ready = todos assinaram */
function processarWebhook_(e) {
  const corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  const evento = corpo.event || corpo.event_type || (corpo.data && corpo.data.event) || '';
  const docId = (corpo.document && corpo.document.id) || (corpo.data && corpo.data.document && corpo.data.document.id) || corpo.document_id || '';
  if (String(evento).indexOf('document_ready') === -1 || !docId) return { ok: true, ignorado: true };

  const meta = metaDoDoc_(docId);
  if (!meta) {
    try { MailApp.sendEmail(EDER_EMAIL, 'MGB Assinafy — documento assinado (sem metadados)', 'Documento ' + docId + ' foi assinado por todos, mas não achei os metadados pra reenviar automaticamente. Baixe manual em app.assinafy.com.br.'); } catch (er) {}
    return { ok: true, semMeta: true };
  }


  // espera o certificado ficar pronto (chega alguns segundos depois do document_ready)
  let doc = assinafyReq_('get', '/documents/' + docId);
  for (let i = 0; i < 8 && !(doc.artifacts && doc.artifacts.certificated); i++) {
    Utilities.sleep(15000);
    doc = assinafyReq_('get', '/documents/' + docId);
  }
  if (!doc.artifacts || !doc.artifacts.certificated) {
    try { MailApp.sendEmail(EDER_EMAIL, 'MGB Assinafy — ⚠️ certificado demorou', 'O documento ' + meta.nomeDoc + ' (' + docId + ') foi assinado mas o PDF certificado não ficou pronto a tempo. Baixe manual em app.assinafy.com.br.'); } catch (er) {}
    return { ok: false };
  }
  return reenviarAssinado_(docId, meta);
}

/** Baixa o PDF certificado e reenvia por e-mail a todos os signatários */
function reenviarAssinado_(docId, meta) {
  const resp = UrlFetchApp.fetch('https://api.assinafy.com.br/v1/documents/' + docId + '/download/certificated', {
    headers: { 'X-Api-Key': ASSINAFY_API_KEY_() }, muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) return { ok: false };
  const pdfBlob = resp.getBlob().setName(meta.nomeDoc + '.pdf');

  const emails = (meta.signatarios || []).map(s => s.email).filter(Boolean);
  if (emails.length) {
    MailApp.sendEmail({
      to: emails.join(','),
      name: 'MGB Mídia',
      replyTo: EDER_EMAIL,
      subject: meta.nomeDoc + ' — assinado por todos ✅',
      body: 'Olá!\n\nSegue em anexo o contrato "' + meta.nomeDoc + '", assinado eletronicamente por todas as partes.\n\nQualquer dúvida, é só responder este e-mail.\n\nEder Balbino\nMGB Mídia · ' + MGB_TELEFONE,
      attachments: [pdfBlob]
    });
  }
  try { MailApp.sendEmail(EDER_EMAIL, 'MGB Assinafy — ' + meta.nomeDoc + ' assinado por todos ✅', 'O contrato foi assinado por todos e enviado automaticamente para: ' + emails.join(', ')); } catch (er) {}

  PropertiesService.getScriptProperties().deleteProperty('doc_' + docId);
  return { ok: true };
}

/**
 * Alternativa ao webhook: a Assinafy só aceita UMA URL de webhook por conta e
 * ela já é do Rádio Ops. Então este script confere sozinho, de tempos em
 * tempos (gatilho a cada 5 min), os contratos pendentes (doc_<id>) e reenvia
 * o PDF assinado quando todos assinarem. Rode instalarGatilho() uma vez.
 */
function verificarPendentes() {
  const todas = props_().getProperties();
  Object.keys(todas).filter(k => k.indexOf('doc_') === 0).forEach(k => {
    const docId = k.slice(4);
    let meta; try { meta = JSON.parse(todas[k]); } catch (e) { return; }
    try {
      const doc = assinafyReq_('get', '/documents/' + docId);
      if (doc.artifacts && doc.artifacts.certificated) reenviarAssinado_(docId, meta);
    } catch (err) { Logger.log(docId + ': ' + err); }
  });
}

function instalarGatilho() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'verificarPendentes').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('verificarPendentes').timeBased().everyMinutes(5).create();
}
