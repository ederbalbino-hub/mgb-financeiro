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

  // Renomear uma unidade (✎ no módulo) só trocava db e rec: anunciante perdia a tela (e a receita dela),
  // pagos, cadastro e cobranças ficavam no nome antigo. Leva tudo junto. e = { anunciantes, despesasComp,
  // elevInvestimentos, despPagamentos, clientesInfo, recPagamentos, pagamentos, leads }.
  function renomearNoEstado(e, mod, de, para) {
    if (!de || !para || de === para) return 0;
    var n = 0;
    function trocaChave(obj) { if (obj && obj[mod] && Object.prototype.hasOwnProperty.call(obj[mod], de) && !Object.prototype.hasOwnProperty.call(obj[mod], para)) { obj[mod][para] = obj[mod][de]; delete obj[mod][de]; n++; } }
    ['despPagamentos', 'clientesInfo', 'recPagamentos', 'pagamentos'].forEach(function (k) { trocaChave(e[k]); });
    if (mod === 'elev') {
      (e.anunciantes || []).concat(e.despesasComp || []).forEach(function (a) {
        if (a && Array.isArray(a.telas)) a.telas = a.telas.map(function (t) { if (t === de) { n++; return para; } return t; });
      });
      (e.elevInvestimentos || []).forEach(function (x) { if (x && x.item === de) { x.item = para; n++; } });
    }
    (e.leads || []).forEach(function (l) {
      var m = l && (l.produto === 'condo' ? 'elev' : l.produto);
      if (l && l.itemCriado === de && m === mod) { l.itemCriado = para; n++; }
    });
    return n;
  }

  // Tela Vertical (Diego, 27/11): o que sobra no mês é dividido 50% / 50% entre Eder e Jadson.
  // Mês no vermelho não tem repasse (a diferença continua como excedente do Eder).
  function repasseSocios(resultado) {
    var r = Number(resultado) || 0, metade = r > 0 ? Math.round(r * 50) / 100 : 0;
    return { sobra: r > 0 ? r : 0, eder: metade, jadson: metade };
  }

  // Situação do anunciante no mês (cartão da Tela Vertical): recPagamentos.elev[nome]['ano-mês'] (jan=0)
  function situacaoAnunciante(pg) {
    if (pg && pg.pago) return { txt: 'Pago', tom: 'ok' };
    var st = pg && pg.asaas && pg.asaas.st;
    if (st === 'vencido') return { txt: 'Boleto vencido', tom: 'erro' };
    if (st === 'pendente' || st === 'aguardando') return { txt: 'Boleto em aberto', tom: 'atencao' };
    if (st === 'nota') return { txt: 'Só nota, paga por fora', tom: 'atencao' };
    return { txt: 'A emitir', tom: 'neutro' };
  }

  var regras = { reindexarPagamentos: reindexarPagamentos, atualizarMesesAnteriores: atualizarMesesAnteriores, leadDoEndereco: leadDoEndereco,
    renomearNoEstado: renomearNoEstado, repasseSocios: repasseSocios, situacaoAnunciante: situacaoAnunciante };
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

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  var MES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var COR = { ok: ['#E8F6EE', '#15803D'], erro: ['#FDECEA', '#B42318'], atencao: ['#FDF2E3', '#B45309'], neutro: ['#ECE8FA', '#4E38B2'] };
  function etiqueta(txt, tom) { var c = COR[tom] || COR.neutro; return '<span class="flx-et" style="background:' + c[0] + ';color:' + c[1] + '">' + esc(txt) + '</span>'; }
  function envelopar(nome, depois, antes) {
    var orig = global[nome]; if (typeof orig !== 'function' || orig.__fluxos) return;
    var nova = function () {
      var ctx = null;
      if (antes) { try { ctx = antes.apply(this, arguments); } catch (e) { console.error('fluxos:', nome, e); } if (ctx === false) return; }
      var r = orig.apply(this, arguments);
      try { depois(ctx, arguments); } catch (e) { console.error('fluxos:', nome, e); }
      return r;
    };
    nova.__fluxos = true; global[nome] = nova;
  }
  function temNovo() { return !document.body.classList.contains('mgb-sem-novo') && global.MGBNovo && typeof global.MGBNovo.escolher === 'function'; }
  function mesSelModulo() {
    var m = document.getElementById('mod-mes-sel'), a = document.getElementById('mod-ano-sel'), h = new Date();
    return { mes: m && m.value !== '' ? parseInt(m.value, 10) : h.getMonth(), ano: a && a.value ? parseInt(a.value, 10) : h.getFullYear() };
  }

  // Cartão do anunciante: situação do pagamento no mês, fim do contrato e atalho para a ficha
  function decorarAnunciantes() {
    var grid = document.getElementById('anunc-grid'); if (!grid) return;
    var s = mesSelModulo(), lista = (ler('anunciantes') || []).filter(function (a) { try { return global.anuncIsAtivo(a, s.ano, s.mes); } catch (e) { return false; } });
    var rp = ler('recPagamentos') || {}, cards = grid.querySelectorAll('.anunc-card.ativo'), h = new Date(), refHoje = h.getFullYear() * 12 + h.getMonth();
    Array.prototype.forEach.call(cards, function (card, i) {
      var a = lista[i]; if (!a || card.__flx) return; card.__flx = true;
      var sit = situacaoAnunciante((((rp.elev || {})[a.nome]) || {})[s.ano + '-' + s.mes]);
      var st = card.querySelector('.anunc-status');
      var fim = '';
      var m = /^(\d{4})-(\d{2})/.exec(a.inicio || '');
      if (m) { var f = +m[1] * 12 + (+m[2] - 1) + (a.meses || 1) - 1, falta = f - refHoje; if (falta <= 2 && falta >= 0) fim = etiqueta(falta === 0 ? 'Termina este mês' : 'Termina em ' + MES_C[f % 12] + '/' + String(Math.floor(f / 12)).slice(2), 'atencao'); }
      if (st) st.outerHTML = '<div class="flx-linha">' + etiqueta(sit.txt + ' · ' + MES_C[s.mes], sit.tom) + fim + '</div>';
      var ac = card.querySelector('.anunc-actions');
      if (ac && global.MGBClientes && global.MGBClientes.abrirPorNome) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'anunc-btn'; b.textContent = 'Ficha';
        b.addEventListener('click', function () { global.MGBClientes.abrirPorNome(a.nome); });
        ac.insertBefore(b, ac.firstChild);
      }
    });
  }

  // Painel da Tela Vertical: repasse 50/50, "Marcar relatório como enviado", "Nova despesa"
  function tvEnviados() { var r = ler('relAjustes'); if (!r || typeof r !== 'object') return {}; r.tvEnviado = r.tvEnviado || {}; return r.tvEnviado; }
  function decorarPainelTV() {
    var root = document.getElementById('tvp-root'); if (!root || root.querySelector('.flx-socio')) return;
    var mesIso = ler('tvpMes'); var mm = /^(\d{4})-(\d{2})$/.exec(mesIso || ''); if (!mm) return;
    var ano = +mm[1], mes = +mm[2] - 1, r = null; try { r = global.elevMesResumo(ano, mes); } catch (e) { return; }
    var rep = repasseSocios(r.resultado), env = tvEnviados()[mesIso];
    var alvo = null; Array.prototype.forEach.call(root.querySelectorAll('div'), function (d) { if (!alvo && d.textContent === 'Para o sócio') alvo = d; });
    var vis = ler('valuesVisible'); var v = function (x) { return vis === false ? 'R$ ••••' : brl(x); };
    var box = document.createElement('div'); box.className = 'flx-socio';
    box.innerHTML = '<div><b>Repasse de ' + MES_C[mes] + '/' + String(ano).slice(2) + ' · 50% para cada sócio</b><span>' +
      (rep.sobra ? 'Sobra ' + v(rep.sobra) + ' → Eder ' + v(rep.eder) + ' · Jadson ' + v(rep.jadson) : 'Sem sobra no mês: não há repasse (a diferença fica como excedente do Eder).') + '</span></div>' +
      (env ? '<span class="flx-ok">Relatório enviado em ' + esc(env.em) + (env.por ? ' por ' + esc(env.por) : '') + ' <button type="button" class="flx-link" data-flx="desenviar">desfazer</button></span>'
        : '<button type="button" class="flx-btn" data-flx="enviado">Marcar relatório como enviado</button>');
    if (alvo && alvo.parentNode) alvo.parentNode.insertBefore(box, alvo.nextSibling); else root.appendChild(box);
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-flx]'); if (!b) return;
      var E = tvEnviados(), u = global.MGBAcesso && global.MGBAcesso.usuario ? (global.MGBAcesso.usuario() || {}) : {};
      if (b.getAttribute('data-flx') === 'enviado') E[mesIso] = { em: new Date().toLocaleDateString('pt-BR'), por: u.nome || '' };
      else delete E[mesIso];
      if (typeof global.scheduleSave === 'function') global.scheduleSave();
      global.tvPainelRender();
    });
    // Cadastrar: "Nova despesa" já com destino Tela Vertical (quem pagou: MGB, Eder ou Jadson)
    Array.prototype.forEach.call(root.querySelectorAll('div'), function (d) {
      if (d.textContent !== 'Cadastrar' || !global.MGBLancar) return;
      var linha = d.nextSibling; if (!linha) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'flx-btn2'; b.textContent = '＋ Nova despesa (com quem pagou)';
      b.addEventListener('click', function () { global.MGBLancar.despesa({ destino: 'elev', item: '' }); });
      linha.appendChild(b);
    });
  }
  // Tela do condomínio: além do formulário rápido, a janela com "quem pagou"
  function decorarCondominio() {
    var item = ler('tvCondoSel'); if (!item || !global.MGBLancar) return;
    var bt = document.querySelector('button[onclick="tvCondoDespSalvar()"]'); if (!bt || bt.parentNode.querySelector('.flx-btn2')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'flx-btn2'; b.textContent = 'Pago do bolso de um sócio? Lançar com "quem pagou"';
    b.addEventListener('click', function () { global.MGBLancar.despesa({ destino: 'elev', item: item }); });
    bt.parentNode.appendChild(b);
  }

  function estilos() {
    if (document.getElementById('flx-css')) return;
    var st = document.createElement('style'); st.id = 'flx-css';
    st.textContent = '.flx-et{display:inline-block;font:700 11.5px "DM Sans",system-ui,sans-serif;padding:3px 9px;border-radius:999px;margin:0 6px 6px 0}.flx-linha{margin-bottom:4px}' +
      '.flx-socio{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between;background:#fff;border:1px solid #E3D8BF;border-radius:10px;padding:12px 14px;margin:0 0 12px}' +
      '.flx-socio div{display:flex;flex-direction:column;gap:2px;min-width:0}.flx-socio b{font:700 13.5px "DM Sans",system-ui,sans-serif;color:#16294F}.flx-socio span{font-size:12.5px;color:#5D5868}' +
      '.flx-btn{font:700 13px "DM Sans",system-ui,sans-serif;padding:9px 14px;border-radius:10px;border:0;background:#16294F;color:#fff;cursor:pointer}' +
      '.flx-btn2{font:700 13px "DM Sans",system-ui,sans-serif;padding:10px 16px;border-radius:10px;cursor:pointer;background:#fff;color:#16294F;border:1px solid #C0A062}' +
      '.flx-ok{color:#15803D!important;font-weight:700}.flx-link{border:0;background:none;color:#4E38B2;text-decoration:underline;cursor:pointer;font:inherit;padding:0 0 0 6px}' +
      '.flx-btn:focus-visible,.flx-btn2:focus-visible,.flx-link:focus-visible{outline:2px solid #4E38B2;outline-offset:2px}';
    document.head.appendChild(st);
  }

  function ligar() {
    estilos();
    ligarMesesAnteriores();
    envelopar('buildAnunciantes', decorarAnunciantes);
    envelopar('tvPainelRender', decorarPainelTV);
    envelopar('tvCondosRender', decorarCondominio);
    // Porta única: "+ Novo anunciante" da aba Anunciantes abre o Novo cliente (contrato, cadastro, faturamento)
    envelopar('toggleAnuncForm', function () {}, function () {
      var form = document.getElementById('anunc-form');
      if (form && !form.classList.contains('open') && temNovo()) { global.MGBNovo.escolher('anunciante'); return false; }
    });
    // Renomear unidade leva junto anunciantes, pagos, cadastro, cobranças e lead
    envelopar('confirmModal', function (ctx) {
      if (!ctx) return;
      var novo = ler('curItem'); if (!novo || novo === ctx.de) return;
      var n = renomearNoEstado({ anunciantes: ler('anunciantes'), despesasComp: ler('despesasComp'), elevInvestimentos: ler('elevInvestimentos'), despPagamentos: ler('despPagamentos'),
        clientesInfo: ler('clientesInfo'), recPagamentos: ler('recPagamentos'), pagamentos: ler('pagamentos'), leads: ler('leads') }, ctx.mod, ctx.de, novo);
      if (n) { if (typeof global.scheduleSave === 'function') global.scheduleSave(); try { global.buildAll(); } catch (e) {} }
    }, function () { return ler('modalMode') === 'edit' ? { mod: ler('curMod'), de: ler('curItem') } : null; });
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
