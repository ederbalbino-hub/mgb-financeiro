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

  // ── Aditivo de prorrogação (renovação, Diego 27/11) ─────────────────────
  function isoDia(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function brData(iso) { return String(iso || '').split('-').reverse().join('/'); }
  // Novo período: começa no dia seguinte ao fim atual e dura "meses" meses
  function periodoAditivo(fimIso, meses) {
    var p = String(fimIso || '').split('-').map(Number); if (p.length !== 3 || !p[0]) return null;
    var de = new Date(p[0], p[1] - 1, p[2] + 1), n = parseInt(meses, 10) || 12;
    var ate = new Date(de.getFullYear(), de.getMonth() + n, de.getDate() - 1);
    return { de: isoDia(de), ate: isoDia(ate), meses: n };
  }
  function fimDoMes(ref) { var d = new Date(Math.floor(ref / 12), ref % 12 + 1, 0); return isoDia(d); }
  function escH(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function documentoAditivo(d) {
    var v = Number(d.valor) || 0, val = v ? 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Termo aditivo de prorrogação</title><style>' +
      'body{font-family:Arial,sans-serif;color:#1d1730;max-width:760px;margin:0 auto;padding:32px;line-height:1.55;font-size:14px}h1{font-size:19px;text-align:center;margin:0 0 4px;color:#2A1760}' +
      '.sub{text-align:center;color:#666;font-size:12px;margin-bottom:24px}h2{font-size:14px;margin:20px 0 6px;color:#2A1760}table{border-collapse:collapse;width:100%;font-size:13px}td{padding:5px 8px;border-bottom:1px solid #e4dff0;vertical-align:top}td:first-child{color:#5D5868;width:34%}' +
      '.ass{display:flex;gap:40px;margin-top:48px}.ass div{flex:1;border-top:1px solid #2A1760;padding-top:6px;font-size:12px}</style></head><body>' +
      '<h1>Termo Aditivo de Prorrogação de Contrato</h1><div class="sub">' + escH(d.produto) + ' · ' + escH(d.nome) + '</div>' +
      '<h2>Partes</h2><table><tr><td>Contratada</td><td>MGB Comunicação e Marketing Ltda. · CNPJ 23.770.170/0001-50 · Londrina – PR</td></tr>' +
      '<tr><td>Contratante</td><td>' + escH(d.razao || d.nome) + (d.cnpj ? ' · CNPJ ' + escH(d.cnpj) : '') + '</td></tr></table>' +
      '<h2>Cláusula 1ª · Objeto</h2><p>As partes prorrogam o contrato de ' + escH(d.produto) + (d.assinadoEm ? ' assinado em ' + escH(brData(d.assinadoEm.slice(0, 10))) : '') +
        ' por mais <b>' + d.meses + ' ' + (d.meses === 1 ? 'mês' : 'meses') + '</b>, de <b>' + escH(brData(d.de)) + '</b> a <b>' + escH(brData(d.ate)) + '</b>.</p>' +
      '<h2>Cláusula 2ª · Valor</h2><p>' + (val ? 'O valor mensal continua <b>' + val + '</b>, com as mesmas condições de pagamento do contrato.' : 'O valor e as condições de pagamento continuam os do contrato.') + '</p>' +
      '<h2>Cláusula 3ª · Demais condições</h2><p>Ficam mantidas todas as demais cláusulas e condições do contrato, que este termo passa a integrar.</p>' +
      '<p>Assinado eletronicamente pelas partes, pela plataforma Assinafy.</p>' +
      '<div class="ass"><div>' + escH(d.razao || d.nome) + '<br><span style="color:#888">CONTRATANTE</span></div><div>MGB Comunicação e Marketing Ltda.<br><span style="color:#888">CONTRATADA</span></div></div>' +
      '</body></html>';
  }

  var regras = { periodoAditivo: periodoAditivo, documentoAditivo: documentoAditivo, fimDoMes: fimDoMes, reindexarPagamentos: reindexarPagamentos, atualizarMesesAnteriores: atualizarMesesAnteriores, leadDoEndereco: leadDoEndereco,
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

  // Janela do aditivo (botão "Renovou: gerar aditivo" do aviso de renovação)
  var ASSINAFY = 'https://mgb-financeiro.vercel.app/api/assinafy';
  var PASTA = { vaapty: 'Vaapty', elev: 'Tela Vertical', radio: 'Rádio Interna', tv: 'TV Interna', mercadao: 'Mercadão', mb: 'Móveis Brasília' };
  function modDoContrato(c) {
    if (global.MGBAcesso && global.MGBAcesso.ehTelaVertical && global.MGBAcesso.ehTelaVertical(c.origem)) return 'elev';
    var m = (ler('MODULES') || []).filter(function (x) { return x.label === c.origem; })[0]; return m ? m.id : null;
  }
  function abrirAditivo(c, op) {
    op = op || {};
    var info = op.contato || {}, mod = modDoContrato(c), fim = c.fimData || (c.fimKey != null ? fimDoMes(c.fimKey) : '');
    var antigo = document.getElementById('flx-adit'); if (antigo) antigo.remove();
    var w = document.createElement('div'); w.id = 'flx-adit'; w.className = 'flx-fundo';
    w.innerHTML = '<div class="flx-caixa" role="dialog" aria-modal="true" aria-labelledby="flx-adit-t"><h2 id="flx-adit-t">Aditivo de prorrogação · ' + esc(c.nome) + '</h2>' +
      '<p class="flx-sub">' + esc(c.origem) + ' · contrato atual termina em ' + esc(brData(fim)) + '. O prazo do hub só aumenta quando o cliente e o Eder assinarem.</p>' +
      '<div class="flx-campos"><label>Prorrogar por (meses)<input id="flx-ad-m" type="number" min="1" max="60" value="' + (c.meses && c.meses < 120 ? c.meses : 12) + '"></label>' +
      '<label>Quem assina pelo cliente<input id="flx-ad-n" value="' + esc(info.responsavel || '') + '" autocomplete="off"></label>' +
      '<label>E-mail de quem assina<input id="flx-ad-e" type="email" value="' + esc(info.email || '') + '" autocomplete="off"></label></div>' +
      '<div class="flx-prev" id="flx-ad-p"></div><div class="flx-erro" id="flx-ad-x" role="alert"></div>' +
      '<div class="flx-bts"><button type="button" class="flx-btn" id="flx-ad-ok">Enviar para assinatura</button><button type="button" class="flx-btn2" id="flx-ad-ver">Ver o aditivo</button><button type="button" class="flx-link" id="flx-ad-c">Cancelar</button></div></div>';
    document.body.appendChild(w);
    function dados() {
      var per = periodoAditivo(fim, document.getElementById('flx-ad-m').value) || {};
      return { nome: c.nome, razao: info.razao || '', cnpj: info.cnpj || '', produto: String(c.origem || '').split('—')[0].trim(), meses: per.meses, de: per.de, ate: per.ate,
        valor: c.valor, assinadoEm: info.assinadoEm || '', signatario: document.getElementById('flx-ad-n').value.trim(), email: document.getElementById('flx-ad-e').value.trim() };
    }
    function prev() { var d = dados(); document.getElementById('flx-ad-p').innerHTML = d.de ? 'Novo período: <b>' + esc(brData(d.de)) + '</b> a <b>' + esc(brData(d.ate)) + '</b> · ' + d.meses + ' meses' + (c.valor ? ' · ' + brl(c.valor) + '/mês (mesmo valor)' : '') : 'Não achei a data de fim do contrato.'; }
    function fechar() { w.remove(); }
    prev();
    document.getElementById('flx-ad-m').addEventListener('input', prev);
    document.getElementById('flx-ad-c').addEventListener('click', fechar);
    w.addEventListener('click', function (ev) { if (ev.target === w) fechar(); });
    w.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') fechar(); });
    document.getElementById('flx-ad-ver').addEventListener('click', function () {
      try { global.open(URL.createObjectURL(new Blob([documentoAditivo(dados())], { type: 'text/html' })), '_blank', 'noopener'); } catch (e) {}
    });
    document.getElementById('flx-ad-ok').addEventListener('click', function () {
      var d = dados(), x = document.getElementById('flx-ad-x'), b = this;
      if (!mod) { x.textContent = 'Não achei o módulo deste contrato.'; return; }
      if (!d.de) { x.textContent = 'Não achei a data de fim do contrato.'; return; }
      if (!d.signatario || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) { x.textContent = 'Informe o nome e um e-mail válido de quem assina pelo cliente.'; return; }
      if (/^\s*treino\b/i.test(c.nome)) { x.textContent = 'Cliente de TREINO: o aditivo não é enviado (não gasta crédito da Assinafy).'; return; }
      x.textContent = ''; b.disabled = true; b.textContent = 'Enviando…';
      fetch(ASSINAFY + '?action=enviar', { method: 'POST', body: JSON.stringify({
        nomeDoc: 'Aditivo de prorrogação - ' + c.nome, html: documentoAditivo(d),
        signatarios: [{ nome: d.signatario, email: d.email }, { nome: 'Eder Balbino — MGB Comunicação e Marketing Ltda.', email: 'ederbalbino@gmail.com' }],
        mensagem: 'Olá! Segue o aditivo de prorrogação do contrato de ' + d.produto + ' com a MGB (' + d.meses + ' meses, de ' + brData(d.de) + ' a ' + brData(d.ate) + '). É só assinar pelo link.',
        pasta: (PASTA[mod] || 'Outros') + '/' + String(c.nome).trim()
      }) }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || j.erro || !j.docId) throw new Error((j && j.erro) || 'a Assinafy não devolveu o documento');
        var ci = ler('clientesInfo'); ci[mod] = ci[mod] || {};
        var i = ci[mod][c.nome] || (ci[mod][c.nome] = { fantasia: c.nome });
        i.aditivo = { docId: j.docId, enviadoEm: new Date().toISOString(), meses: d.meses, de: d.de, ate: d.ate, valor: c.valor || 0, origem: c.origem, inicio: c.inicio || '', fimKey: c.fimKey, mesesAntes: c.meses || 12, assinadoEm: null };
        (i.jornada = i.jornada || []).push({ em: i.aditivo.enviadoEm, texto: 'Aditivo de prorrogação enviado para assinatura (+' + d.meses + ' meses, até ' + brData(d.ate) + ')' });
        if (typeof global.scheduleSave === 'function') global.scheduleSave();
        try { if (op.aoEnviar) op.aoEnviar(); } catch (e) {}
        w.querySelector('.flx-caixa').innerHTML = '<h2>Aditivo enviado</h2><p class="flx-sub">' + esc(c.nome) + ' recebe o link por e-mail. Quando todos assinarem, o hub prorroga o contrato sozinho e o Início deixa de mostrar o aviso.</p><div class="flx-bts"><button type="button" class="flx-btn" id="flx-ad-f">Fechar</button></div>';
        document.getElementById('flx-ad-f').addEventListener('click', fechar);
        redesenharInicio();
      }).catch(function (e) { b.disabled = false; b.textContent = 'Enviar para assinatura'; x.textContent = 'Não consegui enviar: ' + e.message + '. Nada foi gravado.'; });
    });
    setTimeout(function () { var m = document.getElementById('flx-ad-m'); if (m) m.focus(); }, 0);
  }

  // Aditivo assinado: prorroga o contrato (rec ou anunciante) e os custos que acabavam junto
  function aplicarAditivo(mod, nome, i) {
    var a = i.aditivo, A = global.MGBAcesso || {}, m = /^(\d{4})-(\d{2})/.exec(a.inicio || '');
    // fim pela cobrança (início + meses), que é como os custos recorrentes da unidade foram lançados
    var fimCob = m ? +m[1] * 12 + (+m[2] - 1) + (a.mesesAntes || 12) - 1 : a.fimKey;
    var c = { origem: a.origem, nome: nome, inicio: a.inicio, fimKey: fimCob, meses: a.meses };
    var obj = A.objetoDoContrato ? A.objetoDoContrato(c) : null;
    if (obj && A.estenderContrato) A.estenderContrato(obj, a.meses);
    try { if (A.estenderCustos) A.estenderCustos(c); } catch (e) {}
    try { if (mod === 'elev' && global.syncAnuncReceita) global.syncAnuncReceita(); } catch (e) {}
    (i.aditivos = i.aditivos || []).push(a);
    (i.jornada = i.jornada || []).push({ em: a.assinadoEm, texto: obj ? 'Aditivo assinado por todos ✅ · contrato prorrogado até ' + brData(a.ate) : 'Aditivo assinado ✅ · não achei o contrato no hub para prorrogar: ajuste a duração à mão' });
    try { var r = (ler('clientesInfo') || {})._renovacoes; if (r && A.chaveRenov) r[A.chaveRenov(c)] = { s: 'renovado', em: a.assinadoEm.slice(0, 10), por: 'aditivo', meses: a.meses }; } catch (e) {}
    return !!obj;
  }
  function ligarConferenciaAditivos() {
    var orig = global.mgbConferirAssinaturas;
    if (typeof orig !== 'function' || orig.__fluxos) return;
    var nova = function () {
      return Promise.resolve(orig.apply(this, arguments)).then(function (n) {
        var ci = ler('clientesInfo') || {}, pend = [];
        Object.keys(ci).forEach(function (mod) { if (mod.charAt(0) === '_') return; Object.keys(ci[mod] || {}).forEach(function (nome) { var i = ci[mod][nome]; if (i && i.aditivo && i.aditivo.docId && !i.aditivo.assinadoEm) pend.push([mod, nome, i]); }); });
        return pend.reduce(function (p, x) {
          return p.then(function (k) {
            return fetch(ASSINAFY + '?action=status&docId=' + encodeURIComponent(x[2].aditivo.docId)).then(function (r) { return r.json(); }).then(function (j) {
              if (!j || !j.assinado) return k;
              x[2].aditivo.assinadoEm = new Date().toISOString(); aplicarAditivo(x[0], x[1], x[2]); return k + 1;
            }, function () { return k; });
          });
        }, Promise.resolve(0)).then(function (k) {
          if (k) { if (typeof global.scheduleSave === 'function') global.scheduleSave(); try { global.buildAll(); } catch (e) {} try { global.leadToast('✅ Aditivo assinado: contrato prorrogado'); } catch (e) {} }
          return (Number(n) || 0) + k;
        });
      });
    };
    nova.__fluxos = true; global.mgbConferirAssinaturas = nova;
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
      '.flx-btn:focus-visible,.flx-btn2:focus-visible,.flx-link:focus-visible{outline:2px solid #4E38B2;outline-offset:2px}' +
      '.flx-fundo{position:fixed;inset:0;background:rgba(36,26,56,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.flx-caixa{background:#fff;border-radius:16px;max-width:560px;width:100%;padding:22px;font-family:"DM Sans",system-ui,sans-serif;color:#241A38;box-shadow:0 20px 50px rgba(36,26,56,.25)}' +
      '.flx-caixa h2{margin:0 0 6px;font-size:19px}.flx-sub{color:#5D5868;font-size:14px;margin:0 0 14px}.flx-campos{display:grid;gap:10px}' +
      '.flx-campos label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:#5D5868}.flx-campos input{min-height:40px;border:1px solid #CFC7E6;border-radius:10px;padding:0 12px;font:400 15px "DM Sans",system-ui,sans-serif;color:#241A38}' +
      '.flx-prev{margin:14px 0 4px;padding:10px 12px;background:#ECE8FA;border-radius:10px;font-size:14px}.flx-erro{color:#B42318;font-size:13px;min-height:18px;margin:4px 0}.flx-bts{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}' +
      '.flx-caixa .flx-btn{background:#4E38B2}.flx-caixa .flx-btn2{color:#4E38B2;border-color:#CFC7E6}';
    document.head.appendChild(st);
  }

  function ligar() {
    estilos();
    ligarMesesAnteriores();
    ligarConferenciaAditivos();
    setTimeout(rodada, 12000);                  // primeira conferência (inclui aditivos) logo depois de abrir
    envelopar('buildAnunciantes', decorarAnunciantes);
    envelopar('tvPainelRender', decorarPainelTV);
    envelopar('tvCondosRender', decorarCondominio);
    // Lead da Rádio Moinho fechado: não há contrato no hub (campanha e PI ficam no Rádio Ops); vira cliente
    // na hora e a nota sai pelo Faturamento do mês, com o valor do Rádio Ops (27/11)
    envelopar('leadFecharRegistrarCliente', function (ctx, args) {
      var l = args[0]; if (!l || l.produto !== 'radioops') return;
      if (!l.itemCriado || l.itemCriado === 'None') l.itemCriado = l.nome;
      try { global.leadToast('✅ "' + l.nome + '" fechado! A campanha é lançada no Rádio Ops; a nota da Moinho sai no Faturamento do mês.'); } catch (e) {}
      if (typeof global.scheduleSave === 'function') global.scheduleSave();
    });
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

  global.MGBFluxos = Object.assign({ ligar: ligar, abrirAditivo: abrirAditivo }, regras);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
