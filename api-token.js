/* Hub MGB — login (Supabase Auth) e token em toda chamada para a API (mgb-financeiro.vercel.app/api/*).
 *
 * Carregado no <head>, logo depois de vendor/supabase-js, ANTES de qualquer outro script: a carga
 * inicial dos dados (/api/estado) acontece antes do acesso.js existir, e sem o token a API responde 401.
 *
 * - global.MGBSupabase: cliente do Supabase Auth (e-mail e senha). A chave abaixo é a PÚBLICA
 *   (publishable): sozinha ela não lê nada — as tabelas do hub não aceitam essa chave.
 * - Link de convite / troca de senha (#...type=invite|recovery): guardado em global.MGB_AUTH_LINK
 *   para o acesso.js pedir a senha nova.
 * - Token: o do Supabase (renovado sozinho); se não houver, o do login antigo (até ele ser desligado).
 * - Contratos rodam em iframes srcdoc com fetch próprio; lá as chamadas usam parent.fetch (este aqui).
 * - Resposta 401 com sessão aberta = sessão vencida ou usuário removido: volta para a tela de login.
 */
(function (global) {
  'use strict';
  var API_BASE = 'https://mgb-financeiro.vercel.app/api/';
  var SUPABASE_URL = 'https://wvatjibxyhhbotayabig.supabase.co';
  var SUPABASE_PUBLICA = 'sb_publishable_rtHNyTip0GLtYKAJJxPFvg_Ehj74OEp';
  var K_SESSAO = 'mgb_sessao';

  var hash = String((global.location && global.location.hash) || '');
  var tipoLink = (hash.match(/[#&]type=(invite|recovery)\b/) || [])[1] || '';
  global.MGB_AUTH_LINK = tipoLink;

  if (!global.MGBSupabase && global.supabase && typeof global.supabase.createClient === 'function') {
    global.MGBSupabase = global.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLICA, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'mgb_sb_sessao', flowType: 'implicit' }
    });
  }

  if (typeof global.fetch !== 'function' || global.fetch.__mgbAuth) return;

  function tokenAntigo() {
    try { var s = JSON.parse(global.localStorage.getItem(K_SESSAO) || 'null'); return (s && !s.novo && s.token) || ''; } catch (e) { return ''; }
  }

  function tokenAtual() {
    var sb = global.MGBSupabase;
    if (!sb) return Promise.resolve(tokenAntigo());
    return sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      return (s && s.access_token) || tokenAntigo();
    }, function () { return tokenAntigo(); });
  }

  var fetchOriginal = global.fetch;
  var fetchComToken = function (entrada, opcoes) {
    var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || String(entrada || '');
    if (url.indexOf(API_BASE) !== 0) return fetchOriginal.apply(global, arguments);
    return tokenAtual().then(function (t) {
      var o = Object.assign({}, opcoes || {});
      var h = new Headers(o.headers || (typeof entrada !== 'string' && entrada && entrada.headers) || {});
      if (t && !h.has('Authorization')) h.set('Authorization', 'Bearer ' + t);
      o.headers = h;
      if (o.mode === 'no-cors') o.mode = 'cors'; // no-cors descarta o cabeçalho Authorization
      return fetchOriginal.call(global, entrada, o).then(function (r) {
        if (r.status === 401 && t && global.MGBAcesso && typeof global.MGBAcesso.sair === 'function') global.MGBAcesso.sair();
        return r;
      });
    });
  };
  fetchComToken.__mgbAuth = true;
  global.fetch = fetchComToken;
})(typeof window !== 'undefined' ? window : globalThis);
