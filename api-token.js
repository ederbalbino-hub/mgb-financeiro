/* Hub MGB — toda chamada do hub para a API (mgb-financeiro.vercel.app/api/*) leva o token do login.
 *
 * Carregado no <head>, ANTES de qualquer outro script: a carga inicial dos dados (/api/estado)
 * acontece antes do acesso.js existir, e sem o token a API responde 401 (desde 11/2026 ela não
 * atende ninguém sem login).
 *
 * Os contratos rodam em iframes srcdoc com fetch próprio; lá as chamadas usam parent.fetch (este aqui).
 * Resposta 401 com sessão aberta = token vencido ou usuário removido: volta para a tela de login.
 */
(function (global) {
  'use strict';
  var API_BASE = 'https://mgb-financeiro.vercel.app/api/';
  var K_SESSAO = 'mgb_sessao';
  if (typeof global.fetch !== 'function' || global.fetch.__mgbAuth) return;

  function token() {
    try { var s = JSON.parse(global.localStorage.getItem(K_SESSAO) || 'null'); return (s && s.token) || ''; } catch (e) { return ''; }
  }

  var fetchOriginal = global.fetch;
  var fetchComToken = function (entrada, opcoes) {
    var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || String(entrada || '');
    if (url.indexOf(API_BASE) !== 0 || url.indexOf(API_BASE + 'auth') === 0) return fetchOriginal.apply(global, arguments);
    var o = Object.assign({}, opcoes || {});
    var h = new Headers(o.headers || (typeof entrada !== 'string' && entrada && entrada.headers) || {});
    var t = token();
    if (t && !h.has('Authorization')) h.set('Authorization', 'Bearer ' + t);
    o.headers = h;
    if (o.mode === 'no-cors') o.mode = 'cors'; // no-cors descarta o cabeçalho Authorization
    return fetchOriginal.call(global, entrada, o).then(function (r) {
      if (r.status === 401 && t && global.MGBAcesso && typeof global.MGBAcesso.sair === 'function') global.MGBAcesso.sair();
      return r;
    });
  };
  fetchComToken.__mgbAuth = true;
  global.fetch = fetchComToken;
})(typeof window !== 'undefined' ? window : globalThis);
