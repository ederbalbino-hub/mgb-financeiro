/**
 * MGB Hub — persistência do estado (Apps Script anexado à planilha principal).
 * Substitui o "Código.gs" antigo (doGet devolvia tudo e doPost gravava por cima, sem senha).
 *
 * O estado inteiro fica em "mgb-dados.json" no Drive (ID em Script Properties → DATA_FILE_ID).
 *
 * SEGURANÇA (11/2026)
 *   - Só responde a quem manda ?s=<HUB_STATE_SECRET> (Script Properties). Quem chama é o Vercel
 *     (bot/api/estado.js, que exige login no hub; bot do WhatsApp; /api/rede). O navegador não
 *     conhece o segredo. Sem HUB_STATE_SECRET configurado, recusa tudo (fail-closed).
 *   - GET sem segredo responde o texto "forbidden" (NÃO um JSON): os clientes antigos tratavam
 *     qualquer "{...}" como estado e poderiam gravar isso por cima.
 *
 * PROTEÇÃO DOS DADOS
 *   - Trava de versão: POST com ?v=N só grava se o _v atual no Drive ainda for N (senão devolve
 *     {conflito:true}); quem chamou relê, mescla e tenta de novo. Acaba com "uma aba atropela a outra".
 *   - LockService: duas gravações nunca rodam ao mesmo tempo.
 *   - Recusa estado vazio/inválido e estado que encolheu para menos de 30% do atual.
 *   - Backup diário em "MGB Backups" no Drive (30 últimos). Rode instalarBackupDiario() uma vez.
 *
 * IMPLANTAÇÃO: ver docs/seguranca-fase0.md (passo a passo).
 */

var MIN_BYTES_TRAVA_ENCOLHER = 20000;
var FRACAO_MINIMA = 0.3;
var PASTA_BACKUP = 'MGB Backups';
var BACKUPS_MANTER = 30;

// ── Segurança ──────────────────────────────────────────────────────────────────────
function igual_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function segredoOk_(e) {
  var k = PropertiesService.getScriptProperties().getProperty('HUB_STATE_SECRET');
  return igual_(e && e.parameter && e.parameter.s, k);
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Rode UMA vez no editor (Executar → gerarSegredo) e copie do log para HUB_STATE_SECRET no Vercel.
// Rodar de novo troca o segredo (o Vercel precisa receber o novo valor).
function gerarSegredo() {
  var bytes = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
  var s = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)).replace(/=+$/, '');
  PropertiesService.getScriptProperties().setProperty('HUB_STATE_SECRET', s);
  Logger.log('HUB_STATE_SECRET (cole no Vercel): ' + s);
  return s;
}

// ── Leitura ────────────────────────────────────────────────────────────────────────
function doGet(e) {
  if (!segredoOk_(e)) return ContentService.createTextOutput('forbidden').setMimeType(ContentService.MimeType.TEXT);
  try {
    var val = getOrCreateDataFile_().getBlob().getDataAsString();
    return ContentService.createTextOutput(val || '{}').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    // Erro NÃO vira "{}": o cliente trataria como estado vazio.
    return ContentService.createTextOutput('erro: ' + err).setMimeType(ContentService.MimeType.TEXT);
  }
}

// ── Gravação ───────────────────────────────────────────────────────────────────────
function doPost(e) {
  if (!segredoOk_(e)) return json_({ ok: false, erro: 'forbidden' });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, erro: 'ocupado, tente de novo' });
  try {
    var corpo = e.postData ? e.postData.contents : '';
    var novo;
    try { novo = JSON.parse(corpo); } catch (err) { return json_({ ok: false, erro: 'JSON inválido' }); }
    if (!novo || typeof novo !== 'object' || Array.isArray(novo) || Object.keys(novo).length === 0) {
      return json_({ ok: false, erro: 'estado vazio recusado' });
    }

    var file = getOrCreateDataFile_();
    var atualTxt = file.getBlob().getDataAsString() || '{}';
    var atual = {};
    try { atual = JSON.parse(atualTxt); } catch (err) { atual = {}; }
    var vAtual = Number(atual._v) || 0;

    var esperado = e.parameter && e.parameter.v;
    if (esperado !== undefined && esperado !== '' && Number(esperado) !== vAtual) {
      return json_({ ok: false, conflito: true, v: vAtual });
    }
    if (atualTxt.length > MIN_BYTES_TRAVA_ENCOLHER && corpo.length < atualTxt.length * FRACAO_MINIMA) {
      return json_({ ok: false, erro: 'estado encolheu demais (' + corpo.length + ' de ' + atualTxt.length + ' bytes) — não gravei' });
    }

    file.setContent(corpo);
    return json_({ ok: true, v: Number(novo._v) || 0 });
  } catch (err) {
    return json_({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ── Arquivo de dados ───────────────────────────────────────────────────────────────
// Acha o arquivo de dados no Drive (ID numa propriedade do script). Na primeira execução,
// migra o conteúdo antigo da célula A1 da aba "Dados".
function getOrCreateDataFile_() {
  var props = PropertiesService.getScriptProperties();
  var fileId = props.getProperty('DATA_FILE_ID');
  if (fileId) {
    try { return DriveApp.getFileById(fileId); } catch (err) { /* sumiu: recria abaixo */ }
  }
  var conteudoAntigo = '{}';
  try {
    var sheetAntiga = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Dados');
    if (sheetAntiga) {
      var val = sheetAntiga.getRange('A1').getValue();
      if (val) conteudoAntigo = val;
    }
  } catch (err) { /* segue com {} */ }
  var novoArquivo = DriveApp.createFile('mgb-dados.json', conteudoAntigo, MimeType.PLAIN_TEXT);
  props.setProperty('DATA_FILE_ID', novoArquivo.getId());
  return novoArquivo;
}

// ── Backup diário ──────────────────────────────────────────────────────────────────
function backupDiario() {
  var origem = getOrCreateDataFile_();
  var it = DriveApp.getFoldersByName(PASTA_BACKUP);
  var pasta = it.hasNext() ? it.next() : DriveApp.createFolder(PASTA_BACKUP);
  var nome = 'mgb-dados-' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd_HHmm') + '.json';
  pasta.createFile(nome, origem.getBlob().getDataAsString(), MimeType.PLAIN_TEXT);

  var arquivos = [];
  var fs = pasta.getFiles();
  while (fs.hasNext()) arquivos.push(fs.next());
  arquivos.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  arquivos.slice(BACKUPS_MANTER).forEach(function (f) { f.setTrashed(true); });
}

// Rode UMA vez no editor: agenda o backupDiario() todo dia entre 3h e 4h.
function instalarBackupDiario() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupDiario') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(3).create();
  backupDiario();
  Logger.log('Backup diário agendado e primeiro backup feito na pasta "' + PASTA_BACKUP + '".');
}

function testarDrive() {
  Logger.log('Arquivo de dados: ' + getOrCreateDataFile_().getId());
}
