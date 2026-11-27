/* Hub MGB — registro de ações (log no banco, tabela hub_log). Pedido do Diego em 27/11/2026:
 * tudo o que a Karen fizer fica registrado para consulta (vale para todos os usuários).
 *
 * O servidor já registra sozinho cada salvamento, com as seções que mudaram (bot/api/estado.js),
 * e cada emissão no Asaas, e-mail, Faturamento e Assinafy. Este arquivo só deixa o registro
 * mais legível: as telas chamam window.mgbLog('Baixa manual: Saul Elkind · nov/2026') e o texto
 * vai junto no próximo salvamento do estado, no campo _acoes. O servidor tira o _acoes antes
 * de gravar (não entra no estado) e guarda as frases na linha do registro.
 *
 * - Carregar DEPOIS do api-token.js: este embrulho fica por cima do fetch com token.
 * - A fila só é limpa quando o servidor responde ok. Se der conflito ou erro, as frases seguem
 *   na fila e vão no salvamento seguinte (o index.html tenta de novo sozinho).
 * - Corpo que não é JSON segue como veio, sem _acoes.
 * - mgbLog nunca lança erro e nunca bloqueia a tela.
 */
(function (global) {
  'use strict';
  if (typeof global.fetch !== 'function' || global.fetch.__mgbLog) return;
  var ESTADO = 'https://mgb-financeiro.vercel.app/api/estado';
  var MAX_FILA = 20, MAX_CHARS = 200;
  var fila = [];

  global.mgbLog = function (texto) {
    try {
      var t = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
      if (!t) return;
      fila.push(t);
      if (fila.length > MAX_FILA) fila.splice(0, fila.length - MAX_FILA);
    } catch (e) { /* nunca atrapalha a tela */ }
  };
  global.mgbLog.pendentes = function () { return fila.slice(); };

  var fetchAnterior = global.fetch;
  var fetchComLog = function (entrada, opcoes) {
    var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || String(entrada || '');
    var metodo = String((opcoes && opcoes.method) || 'GET').toUpperCase();
    if (url.indexOf(ESTADO) !== 0 || metodo !== 'POST' || !fila.length || !opcoes || typeof opcoes.body !== 'string') {
      return fetchAnterior.apply(global, arguments);
    }
    var enviadas = fila.slice();
    var corpo;
    try {
      var obj = JSON.parse(opcoes.body);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return fetchAnterior.apply(global, arguments);
      obj._acoes = enviadas;
      corpo = JSON.stringify(obj);
    } catch (e) {
      return fetchAnterior.apply(global, arguments);
    }
    var o = Object.assign({}, opcoes, { body: corpo });
    return fetchAnterior.call(global, entrada, o).then(function (r) {
      if (r && r.ok) {
        // tira da fila só o que foi enviado (o que entrou durante o envio fica para o próximo)
        enviadas.forEach(function (t) { var i = fila.indexOf(t); if (i !== -1) fila.splice(i, 1); });
      }
      return r;
    });
  };
  fetchComLog.__mgbLog = true;
  fetchComLog.__mgbAuth = fetchAnterior.__mgbAuth; // o api-token.js não embrulha de novo
  global.fetch = fetchComLog;
})(typeof window !== 'undefined' ? window : globalThis);
