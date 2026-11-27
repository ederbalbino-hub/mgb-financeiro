/* Hub MGB — botão Voltar do navegador/celular volta para a tela anterior do hub (27/11/2026).
 *
 * Antes: o hub era uma página só, então o Voltar saía do sistema (ia para o site visitado antes).
 * Agora: cada troca de tela (página, aba do Financeiro, aba de Contratos/Tela Vertical/Estúdio,
 * módulo, aba de Contabilidade/Ferramentas/Cobrança, ficha do cliente) vira um passo no histórico
 * do navegador. O Voltar refaz a tela anterior; o Avançar também funciona.
 * Não muda o endereço da página (nada de #) para não atrapalhar os links de convite/senha.
 */
(function (global) {
  'use strict';
  var doc = global.document;
  var restaurando = false, agendado = false;

  function ler(nome) { try { return Function('return typeof ' + nome + "!=='undefined'?" + nome + ':null')(); } catch (e) { return null; } }
  function chama(nome) { var fn = global[nome]; if (typeof fn === 'function') return fn.apply(global, Array.prototype.slice.call(arguments, 1)); }
  function visivel(el) { return !!(el && el.offsetParent !== null); }
  function abaAtiva(sel) {
    var l = doc.querySelectorAll(sel);
    for (var i = 0; i < l.length; i++) { if (l[i].classList.contains('on') || l[i].classList.contains('active')) return i; }
    return -1;
  }
  var ABAS = { contabilidade: '#page-contabilidade .ferr-tab', ferramentas: '#page-ferramentas .ferr-tab', relatorios: '#page-relatorios .rel-tab' };

  // A "foto" da tela atual: só o que importa para a página aberta
  function foto() {
    var p = ler('curPage');
    if (!p) return null;
    var f = { mgb: 1, p: p };
    if (p === 'overview') f.ov = ler('curOvTab') || 'visao';
    else if (p === 'custos') f.mod = ler('curMod');
    else if (p === 'operacional') {
      f.opg = ler('curOpGroup');
      var t = doc.querySelector('#page-operacional .hub-tab.active');
      f.opt = t ? t.getAttribute('data-tab') : ler('curOpTab');
    } else if (ABAS[p]) f.aba = abaAtiva(ABAS[p]);
    else if (p === 'clientes') f.cli = global.MGBClientes && global.MGBClientes.fichaAberta ? global.MGBClientes.fichaAberta() : null;
    return f;
  }
  function igual(a, b) { return !!a && !!b && JSON.stringify(a) === JSON.stringify(b); }

  function registrar() {
    agendado = false;
    if (restaurando) return;
    var f = foto();
    if (!f) return;
    var atual = global.history.state;
    if (!atual || !atual.mgb) { try { global.history.replaceState(f, ''); } catch (e) {} return; }
    if (!igual(atual, f)) { try { global.history.pushState(f, ''); } catch (e) {} }
  }
  function agendar() { if (agendado || restaurando) return; agendado = true; setTimeout(registrar, 60); }

  function restaurar(f) {
    restaurando = true;
    try {
      if (f.p === 'overview') { chama('goPage', 'overview'); chama('switchOvTab', f.ov || 'visao'); }
      else if (f.p === 'custos' && f.mod) chama('drillMod', f.mod);
      else if (f.p === 'operacional') chama('goOperacional', f.opg || 'contratos', f.opt || undefined);
      else if (ABAS[f.p]) {
        chama('goPage', f.p);
        var a = doc.querySelectorAll(ABAS[f.p])[f.aba];
        if (a && f.aba >= 0) a.click();
      } else if (f.p === 'clientes') {
        if (f.cli && global.MGBClientes && global.MGBClientes.abrir) global.MGBClientes.abrir(f.cli);
        else { if (global.MGBClientes && global.MGBClientes.fechar) global.MGBClientes.fechar(); chama('goPage', 'clientes'); }
      } else chama('goPage', f.p);
      global.scrollTo(0, 0);
    } catch (e) {}
    setTimeout(function () { restaurando = false; }, 120);
  }

  function envolver(nome) {
    var orig = global[nome];
    if (typeof orig !== 'function' || orig.__hist) return;
    var nova = function () { var r = orig.apply(this, arguments); agendar(); return r; };
    nova.__hist = true;
    try { Object.keys(orig).forEach(function (k) { nova[k] = orig[k]; }); } catch (e) {}
    global[nome] = nova;
  }

  function ligar() {
    ['goPage', 'switchOvTab', 'goOperacional', 'showOpPanel', 'drillMod', 'switchMod', 'showContabTab', 'showFerrTab', 'showRelTab'].forEach(envolver);
    // cliques que trocam a tela por dentro dos módulos novos (ficha do cliente, abas…)
    doc.addEventListener('click', function () { agendar(); }, true);
    global.addEventListener('popstate', function (ev) {
      var f = ev.state;
      if (f && f.mgb) restaurar(f);
    });
    agendar();
  }

  global.MGBHistorico = { foto: foto };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ligar); else setTimeout(ligar, 0);
})(window);
