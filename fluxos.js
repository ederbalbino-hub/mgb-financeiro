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

  var regras = { reindexarPagamentos: reindexarPagamentos };
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

  function ligar() {
    // Tabela de despesas do cliente/unidade e despesas do condomínio na Tela Vertical (defeito achado em 27/11)
    andarPagamentosAoRemover('delItem', function () { return { mod: ler('curMod'), item: ler('curItem') }; });
    andarPagamentosAoRemover('tvCondoDespRemover', function () { return { mod: 'elev', item: ler('tvCondoSel') }; });
  }

  global.MGBFluxos = Object.assign({ ligar: ligar }, regras);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
