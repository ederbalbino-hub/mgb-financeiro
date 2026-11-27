/* Hub MGB — fluxos entre telas (27/11/2026).
 *
 * Liga as telas do hub umas às outras: o que é lançado num lugar aparece certo nos outros, e cada
 * etapa tem o botão da próxima. Como os outros módulos, só "envelopa" funções do index.html.
 *
 * Mapa aprovado pelo Diego: https://claude.ai/artifact/3xiWpn4fCh3xXh2A32GjoT
 * Regras puras testadas em bot/test/fluxos.test.js.
 */
(function (global) {
  'use strict';

  // ── Regras puras ─────────────────────────────────────────────────────────
  // despPagamentos[mod][item] é indexado pela POSIÇÃO da linha em db[mod][item]. Quando a linha i sai,
  // as marcações das linhas de baixo sobem uma posição junto com elas (a da linha i vai embora).
  // Chaves que não são número (ex.: _contas) ficam como estão.
  function reindexarPagamentos(P, i) {
    if (!P || typeof P !== 'object') return P;
    var novo = {};
    Object.keys(P).forEach(function (k) {
      var n = Number(k);
      if (k === '' || isNaN(n)) novo[k] = P[k];
      else if (n < i) novo[n] = P[k];
      else if (n > i) novo[n - 1] = P[k];
    });
    return novo;
  }

  // A conferência com o Asaas (fFatSincronizarAsaas) só atualizava o mês aberto no Faturamento: um boleto
  // de outubro pago em novembro ficava "vencido" para sempre na ficha e no Início. Com as referências que
  // o Asaas devolve (refs["<id da linha>-AAAA-MM"].payment.status), atualiza também os outros meses.
  // recPagamentos[mod][item]['ano-mês' com jan=0] (+ _default.fatId) e fatEmissoes['<id>|AAAA-MM'].pg.
  function comp(ano, mes) { return ano + '-' + String(mes + 1).padStart(2, '0'); }
  function atualizarMesesAnteriores(recPag, emissoes, refs, mapPag, agoraIso) {
    var n = 0, em = agoraIso || new Date().toISOString();
    if (!refs) return 0;
    Object.keys(recPag || {}).forEach(function (mod) {
      Object.keys(recPag[mod] || {}).forEach(function (item) {
        var Q = recPag[mod][item] || {}, fatId = Q._default && Q._default.fatId; if (!fatId) return;
        Object.keys(Q).forEach(function (k) {
          var m = /^(\d{4})-(\d{1,2})$/.exec(k), pg = Q[k]; if (!m || !pg || !pg.asaas) return;
          var ref = refs[fatId + '-' + comp(+m[1], +m[2])], pay = ref && ref.payment; if (!pay) return;
          var st = mapPag(pay.status); if (pg.asaas.st === st) return;
          pg.asaas = Object.assign({}, pg.asaas, { st: st, em: em });
          if (pg.fonte !== 'manual') { pg.pago = st === 'pago'; pg.fonte = 'asaas'; }
          n++;
        });
      });
    });
    Object.keys(emissoes || {}).forEach(function (k) {
      var i = k.lastIndexOf('|'); if (i < 0) return;
      var ref = refs[k.slice(0, i) + '-' + k.slice(i + 1)], pay = ref && ref.payment, e = emissoes[k]; if (!pay || !e) return;
      var st = mapPag(pay.status); if (e.pg === st) return;
      e.pg = st; e.pgEm = em; n++;
    });
    return n;
  }

  // Link do e-mail de lead fechado: ...?cadastrar=<id do lead>
  function leadDoEndereco(busca) {
    var m = /[?&]cadastrar=(\d+)/.exec(busca || ''); return m ? +m[1] : null;
  }

  var regras = { reindexarPagamentos: reindexarPagamentos, atualizarMesesAnteriores: atualizarMesesAnteriores, leadDoEndereco: leadDoEndereco };
  if (typeof module !== 'undefined' && module.exports) module.exports = regras;
  if (typeof document === 'undefined') return;

  // ── Ligações com o index.html ───────────────────────────────────────────
  function ler(nome) { try { return global.eval('typeof ' + nome + "!=='undefined'?" + nome + ':undefined'); } catch (e) { return undefined; } }

  // Envelopa uma função de remover linha de db[mod][item]: se a linha saiu de fato (a pessoa pode
  // cancelar o confirm), anda com as marcações de pago das linhas seguintes.
  function andarPagamentosAoRemover(nomeFn, alvo) {
    var orig = global[nomeFn];
    if (typeof orig !== 'function' || orig.__fluxos) return;
    var nova = function (i) {
      var a = null, antes = -1;
      try { a = alvo(); var db = ler('db'); antes = a && db && db[a.mod] && db[a.mod][a.item] ? db[a.mod][a.item].length : -1; } catch (e) {}
      var r = orig.apply(this, arguments);
      try {
        var db2 = ler('db'), dp = ler('despPagamentos');
        var depois = a && db2 && db2[a.mod] && db2[a.mod][a.item] ? db2[a.mod][a.item].length : -1;
        if (a && antes >= 0 && depois === antes - 1 && dp && dp[a.mod] && dp[a.mod][a.item]) {
          dp[a.mod][a.item] = reindexarPagamentos(dp[a.mod][a.item], Number(i));
          if (typeof global.scheduleSave === 'function') global.scheduleSave();
        }
      } catch (e) { console.error('fluxos:', e); }
      return r;
    };
    nova.__fluxos = true;
    global[nomeFn] = nova;
  }

  function noInicio() { return ler('curPage') === 'home' && global.MGBInicio && typeof global.MGBInicio.montar === 'function'; }
  function redesenharInicio() { try { if (noInicio()) global.MGBInicio.montar(); } catch (e) {} }
  function lerTs(k) { try { return +global.localStorage.getItem(k) || 0; } catch (e) { return 0; } }
  function gravarTs(k) { try { global.localStorage.setItem(k, String(Date.now())); } catch (e) {} }

  // Depois de cada conferência com o Asaas: meses anteriores também
  function ligarMesesAnteriores() {
    var orig = global.fNotaSincronizarAvulsas;
    if (typeof orig !== 'function' || orig.__fluxos) return;
    var nova = function (refs) {
      var r = orig.apply(this, arguments);
      try {
        var n = atualizarMesesAnteriores(ler('recPagamentos'), ler('fatEmissoes'), refs, global.fFatMapPag || function (x) { return x; });
        if (n) { if (typeof global.scheduleSave === 'function') global.scheduleSave(); redesenharInicio(); }
      } catch (e) { console.error('fluxos: meses anteriores', e); }
      return r;
    };
    nova.__fluxos = true; global.fNotaSincronizarAvulsas = nova;
  }

  // De tempos em tempos, com o hub aberto e visível: assinaturas (a cada 30 min) e Asaas (a rotina do
  // index.html, que se limita a 1 vez por hora). Antes: assinatura só 6 s depois de abrir o hub.
  var ASSIN_MIN = 30;
  function rodada() {
    if (document.hidden || !ler('_cargaSheetsOk')) return;
    if (typeof global.mgbConferirAssinaturas === 'function' && Date.now() - lerTs('assin_auto_ts') >= ASSIN_MIN * 60000) {
      gravarTs('assin_auto_ts');
      Promise.resolve(global.mgbConferirAssinaturas()).then(function (n) { if (n) redesenharInicio(); }, function () {});
    }
    if (typeof global.fFatRotinaAuto === 'function') Promise.resolve(global.fFatRotinaAuto()).then(redesenharInicio, function () {});
  }

  // ?cadastrar=<id>: espera o login e o estado, abre o Novo cliente do lead (ou a ficha, se já cadastrado)
  function abrirDoEndereco() {
    var id = leadDoEndereco(global.location.search); if (id == null) return;
    var fim = Date.now() + 5 * 60000;
    (function tentar() {
      var lista = ler('leads') || [], l = lista.filter(function (x) { return x && x.id === id; })[0];
      if (ler('_cargaSheetsOk') && l && global.MGBNovo && global.MGBAcesso && global.MGBAcesso.usuario && global.MGBAcesso.usuario()) {
        try { global.history.replaceState(global.history.state, '', global.location.pathname + global.location.hash); } catch (e) {}
        try {
          if (l.itemCriado && l.itemCriado !== 'None' && global.MGBClientes) global.MGBClientes.abrirPorNome(l.itemCriado);
          else global.MGBNovo.abrirLead(id);
        } catch (e) { console.error('fluxos: cadastrar', e); }
        return;
      }
      if (Date.now() < fim) setTimeout(tentar, 1000);
    })();
  }

  function ligar() {
    ligarMesesAnteriores();
    abrirDoEndereco();
    setInterval(rodada, 10 * 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(rodada, 2500); });
    // Tabela de despesas do cliente/unidade e despesas do condomínio na Tela Vertical (defeito achado em 27/11)
    andarPagamentosAoRemover('delItem', function () { return { mod: ler('curMod'), item: ler('curItem') }; });
    andarPagamentosAoRemover('tvCondoDespRemover', function () { return { mod: 'elev', item: ler('tvCondoSel') }; });
  }

  global.MGBFluxos = Object.assign({ ligar: ligar }, regras);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
