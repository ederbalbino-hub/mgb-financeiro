/* Hub MGB — Financeiro no desenho aprovado em 19/11/2026 (canvas "Hub MGB — proposta visual").
 *
 * Três telas, só apresentação: as contas continuam nas funções que já existiam no index.html
 * (finGetRec, finGetDesp, recModMes, despesaTotalMesMod, coletaDespesasMes, avisosVirada,
 * contratosLista, recOfMes, despPagamentos, rec, refresh, scheduleSave…).
 *
 *  - Resumo do mês (Financeiro MGB › Visão Geral): resultado, "Falta lançar", tabela por módulo,
 *    o que mudou e contratos.
 *  - Contas do mês (Visão Despesas): uma linha por fornecedor; marcar pago marca todos os
 *    lançamentos dela. O dia de vencimento fica em despPagamentos._contas[chave].dia.
 *  - Módulo (Custos por projeto): clientes em tabela; o painel edita o contrato (rec[mod][item]).
 *    Tarobá continua na tela antiga (receita digitada mês a mês).
 *
 * Decisões de 19/11: juntar por fornecedor (sim), vencimento preenchido uma vez (pode ser),
 * "Empresa" como linha da tabela de módulos (mantém).
 */
(function (global) {
  'use strict';
  var doc = global.document;
  var MESES_N = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var SEM_FIM = 120; // contratos lançados com 120 meses são "sem data para acabar"

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function curto(v) {
    var a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1000) return s + (a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return s + Math.round(a).toLocaleString('pt-BR');
  }
  function cap(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  function norm(t) { return String(t || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // ── Regras puras (testadas em bot/test/financeiro.test.js) ───────────────
  var NOMES_CONTA = {
    'receita federal': 'Imposto Simples',
    'listen': 'Listen (rádio)',
    '4yousee': '4Yousee (telas)',
    'eder': 'Pró-labore do Eder',
    'guina': 'Comissão do Guina',
    'va vaapty gestao de franquias': 'Repasse Vaapty',
    'connectmix': 'Connectmix (auditoria)',
  };
  var DIA_PADRAO = { 'receita federal': 20, 'eder': 21 };

  function chaveConta(d) {
    var forn = String((d.r && d.r.f) || '').trim();
    if (!forn || forn === '—' || forn === '-') forn = (d.r && d.r.d) || d.item || '';
    return norm(forn);
  }

  // despesas: itens de coletaDespesasMes; pago(d) -> bool; vencs: {chave:{dia}}
  function agruparContas(despesas, pago, vencs) {
    vencs = vencs || {};
    var mapa = {}, ordem = [];
    despesas.forEach(function (d) {
      var k = chaveConta(d);
      if (!mapa[k]) { mapa[k] = { chave: k, itens: [], total: 0, pagos: 0, modulos: [], porModulo: {} }; ordem.push(k); }
      var g = mapa[k];
      g.itens.push(d);
      g.total += d.vlrMes;
      if (pago(d)) g.pagos++;
      var rot = String((d.m && d.m.label) || '').split('—')[0].trim();
      if (rot && g.modulos.indexOf(rot) === -1) g.modulos.push(rot);
      var pm = g.porModulo[rot] || (g.porModulo[rot] = { rot: rot, valor: 0, n: 0 });
      pm.valor += d.vlrMes; pm.n++;
    });
    return ordem.map(function (k) {
      var g = mapa[k], d0 = g.itens[0], forn = String((d0.r && d0.r.f) || '').trim();
      var semForn = !forn || forn === '—' || forn === '-';
      g.titulo = NOMES_CONTA[k] || (semForn ? (d0.r && d0.r.d) || d0.item : forn);
      if (g.itens.length > 1) g.sub = g.itens.length + ' lançamentos · ' + g.modulos.join(', ');
      else {
        var desc = (d0.r && d0.r.d) || '';
        g.sub = [desc && norm(desc) !== norm(g.titulo) ? (desc.length > 70 ? desc.slice(0, 68).replace(/\s+\S*$/, '') + '…' : desc) : '', g.modulos[0] && g.modulos[0] !== 'Empresa' ? g.modulos[0] : ''].filter(Boolean).join(' · ');
      }
      g.total = Math.round(g.total * 100) / 100;
      g.pago = g.pagos === g.itens.length;
      g.dia = (vencs[k] && vencs[k].dia) || DIA_PADRAO[k] || null;
      g.porModulo = Object.keys(g.porModulo).map(function (r) { return g.porModulo[r]; }).sort(function (a, b) { return b.valor - a.valor; });
      return g;
    }).sort(function (a, b) { return (a.pago - b.pago) || (b.total - a.total); });
  }

  // ro: rec[mod][item] = {valor, inicio:'AAAA-MM', meses}; ref = ano*12+mes
  function contrato(ro, ref) {
    ro = ro || {};
    var valor = Number(ro.valor) || 0;
    var m = /^(\d{4})-(\d{2})/.exec(ro.inicio || '');
    if (!valor) return { estado: 'sem', valor: 0 };
    if (!m) return { estado: 'sem-inicio', valor: valor };
    var ini = +m[1] * 12 + (+m[2] - 1), meses = Number(ro.meses) || 12;
    var semFim = meses >= SEM_FIM, fim = ini + meses - 1;
    var estado = ref < ini ? 'futuro' : (!semFim && ref > fim) ? 'encerrado' : (!semFim && ref === fim) ? 'termina' : 'ativo';
    return { estado: estado, valor: valor, ini: ini, fim: semFim ? null : fim, semFim: semFim, meses: meses };
  }
  function rotMes(k) { return k == null ? '' : MES_CURTO[k % 12] + '/' + String(Math.floor(k / 12)).slice(2); }

  // lista: contratosLista() [{fimKey, iniKey, valor}]
  function resumoContratos(lista, ref) {
    var r = { ativo: 0, termina: 0, encerrado: 0, futuro: 0, terminaNomes: [] };
    lista.forEach(function (c) {
      if (c.fimKey === null || c.fimKey === undefined) return;
      if (c.fimKey === ref) { r.termina++; r.terminaNomes.push(c.nome); }
      else if (c.fimKey < ref) r.encerrado++;
      else if (c.iniKey > ref) r.futuro++;
      else r.ativo++;
    });
    return r;
  }

  // A: avisosVirada(ano,mes) — as maiores mudanças de receita e despesa
  function mudancas(A, n) {
    var out = [];
    (A.rec || []).forEach(function (x) { out.push({ desp: false, x: x }); });
    (A.desp || []).forEach(function (x) { out.push({ desp: true, x: x }); });
    out.forEach(function (o) { var x = o.x; o.delta = x.tipo === 'sai' ? -x.a : x.tipo === 'entra' ? x.b : x.b - x.a; });
    out.sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    return out.slice(0, n || 5);
  }

  var regras = { agruparContas: agruparContas, chaveConta: chaveConta, contrato: contrato, resumoContratos: resumoContratos, mudancas: mudancas, rotMes: rotMes };
  if (typeof module !== 'undefined' && module.exports) module.exports = regras;
  if (!doc) return;

  // ── Acesso ao estado do index.html ───────────────────────────────────────
  function ler(nome, padrao) { try { var v = global.eval('typeof ' + nome + "!=='undefined'?" + nome + ':undefined'); return v === undefined ? padrao : v; } catch (e) { return padrao; } }
  function chama(nome) { var fn = global[nome]; if (typeof fn !== 'function') throw new Error(nome + ' não existe'); return fn.apply(global, Array.prototype.slice.call(arguments, 1)); }
  function tenta(nome) { try { return chama.apply(null, arguments); } catch (e) { return undefined; } }
  function mesSel(idM, idA) {
    var m = doc.getElementById(idM), a = doc.getElementById(idA), h = new Date();
    return { mes: m && m.value !== '' ? +m.value : h.getMonth(), ano: a && a.value !== '' ? +a.value : h.getFullYear() };
  }
  function mudarMes(idM, idA, n, depois) {
    var s = mesSel(idM, idA), d = new Date(s.ano, s.mes + n, 1);
    var m = doc.getElementById(idM), a = doc.getElementById(idA);
    if (!m || !a) return;
    if (!Array.prototype.some.call(a.options, function (o) { return +o.value === d.getFullYear(); })) return;
    m.value = d.getMonth(); a.value = d.getFullYear();
    depois();
  }
  function moduloRot(m) { return String(m.label || '').split('—')[0].trim(); }

  var SETA_E = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  var SETA_D = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  function cabecalho(sub, titulo, acaoMes, direita) {
    return '<header class="fin2-cab"><div class="fin2-mes">' +
      '<button type="button" class="fin2-icone" data-fin2="' + acaoMes + ':-1" aria-label="Mês anterior">' + SETA_E + '</button>' +
      '<div><span class="fin2-sub">' + esc(sub) + '</span><h2>' + esc(titulo) + '</h2></div>' +
      '<button type="button" class="fin2-icone" data-fin2="' + acaoMes + ':1" aria-label="Próximo mês">' + SETA_D + '</button></div>' +
      '<div class="fin2-acoes">' + (direita || '') + '</div></header>';
  }
  function numero(rot, val, det, tom) {
    return '<div class="fin2-num"><span>' + esc(rot) + '</span><b class="' + (tom || '') + '">' + val + '</b><small>' + esc(det) + '</small></div>';
  }
  function chip(t, tom) { return '<span class="fin2-chip fin2-' + tom + '">' + esc(t) + '</span>'; }
  function container(paiId, id, antesDe) {
    var pai = doc.getElementById(paiId);
    if (!pai) return null;
    var el = doc.getElementById(id);
    if (!el) {
      el = doc.createElement('div'); el.id = id; el.className = 'fin2';
      pai.insertBefore(el, antesDe ? pai.querySelector(antesDe) : pai.firstChild);
      el.addEventListener('click', clique);
      el.addEventListener('change', mudou);
    }
    return el;
  }

  // ── 1. Resumo do mês ─────────────────────────────────────────────────────
  function desenharResumo() {
    var box = container('ov-sub-visao', 'fin2-resumo');
    if (!box) return;
    doc.getElementById('ov-sub-visao').classList.add('fin2-ativo');
    var s = mesSel('ov-mes-sel', 'ov-ano-sel'), ano = s.ano, mes = s.mes, ref = ano * 12 + mes;
    var MODS = ler('MODULES', []) || [];
    var rec = tenta('finGetRec', ano, mes) || 0, desp = tenta('finGetDesp', ano, mes) || 0;
    var ant = new Date(ano, mes - 1, 1);
    var recA = tenta('finGetRec', ant.getFullYear(), ant.getMonth()) || 0, despA = tenta('finGetDesp', ant.getFullYear(), ant.getMonth()) || 0;
    var res = rec - desp, nomeAnt = MESES_N[ant.getMonth()];
    var dif = function (a, b, palavra) { var d = b - a; return Math.abs(d) < 0.005 ? 'igual a ' + nomeAnt : 'R$ ' + brl(Math.abs(d)) + (d < 0 ? ' a menos' : ' a mais') + ' que ' + nomeAnt; };
    var A = null, B = null;
    try { A = chama('avisosVirada', ano, mes); var px = new Date(ano, mes + 1, 1); B = chama('avisosVirada', px.getFullYear(), px.getMonth()); } catch (e) {}

    var falta = (A && A.pend || []).map(function (p) {
      var acao = /tarob/i.test(p.txt) ? 'modulo:taroba' : /r[áa]dio ops/i.test(p.txt) ? 'pagina:radioops' : '';
      var rot = /tarob/i.test(p.txt) ? 'Lançar comissão' : /r[áa]dio ops/i.test(p.txt) ? 'Abrir Rádio Ops' : '';
      return { txt: p.txt, det: (p.v && !/foi R\$/.test(p.dica || '') ? 'No mês anterior foi R$ ' + brl(p.v) + '. ' : '') + (p.dica || ''), acao: acao, rot: rot };
    });
    var primeiro = true;
    var faltaHtml = falta.length ? '<section class="fin2-bloco" aria-labelledby="fin2-falta"><div class="fin2-bloco-cab"><h3 id="fin2-falta">Falta lançar</h3><span class="fin2-sub">sem isso, o resultado de ' + MESES_N[mes] + ' está incompleto</span></div>' +
      falta.map(function (p) {
        var b = p.acao ? '<button type="button" class="' + (primeiro ? 'fin2-btn' : 'fin2-btn2') + '" data-fin2="' + p.acao + '">' + p.rot + '</button>' : '';
        if (p.acao) primeiro = false;
        return '<div class="fin2-linha"><span class="fin2-ponto" style="background:#B45309"></span><div class="fin2-linha-txt"><b>' + esc(p.txt) + '</b><span>' + esc(p.det) + '</span></div>' + b + '</div>';
      }).join('') + '</section>' : '';

    var tarobaPend = falta.some(function (p) { return /tarob/i.test(p.txt); });
    var linhas = MODS.map(function (m) {
      var r = tenta('recModMes', m.id, ano, mes) || 0, d = tenta('despesaTotalMesMod', m.id, ano, mes) || 0;
      var nCli = (m.items || []).filter(function (i) { return (tenta('recOfMes', m.id, i, ano, mes) || 0) > 0; }).length;
      return { id: m.id, rot: m.label, sub: nCli ? nCli + (nCli === 1 ? ' com receita no mês' : ' com receita no mês') : (m.items || []).length + ' cadastrados', r: r, d: d, falta: m.id === 'taroba' && tarobaPend && !r };
    }).sort(function (a, b) { return (b.r - b.d) - (a.r - a.d); });
    var dEmp = tenta('despesaTotalMesMod', '_empresa', ano, mes) || 0;
    if (dEmp) linhas.push({ id: '', rot: 'Empresa (impostos e equipe)', sub: 'imposto, pró-labore, equipe e contador', r: 0, d: dEmp });
    var tab = linhas.map(function (l) {
      var resL = l.r - l.d, mg = l.r > 0 ? Math.max(0, Math.round(resL / l.r * 100)) : 0;
      return '<tr' + (l.id ? ' data-fin2="modulo:' + esc(l.id) + '" class="fin2-clicavel" tabindex="0"' : '') + '><td><b>' + esc(l.rot) + '</b><br><span class="fin2-sub">' + esc(l.sub) + '</span></td>' +
        '<td class="fin2-n' + (l.falta ? ' fin2-laranja' : '') + '">' + (l.falta ? 'falta lançar' : l.r ? curto(l.r) : '—') + '</td>' +
        '<td class="fin2-n">' + (l.d ? curto(l.d) : '—') + '</td>' +
        '<td class="fin2-n fin2-forte' + (resL < 0 ? ' fin2-vermelho' : '') + '">' + (l.r || l.d ? curto(resL) : '—') + '</td>' +
        '<td class="fin2-mg"><div aria-hidden="true"><i style="width:' + mg + '%"></i></div><span>' + (mg ? mg + '% de margem' : '') + '</span></td></tr>';
    }).join('');

    var mud = A ? mudancas(A, 5) : [];
    var verbo = { sai: 'terminou', entra: 'começa', muda: 'mudou' };
    var mudHtml = mud.map(function (o) {
      var x = o.x, bom = o.desp ? o.delta < 0 : o.delta > 0;
      var txt = x.rot + ' ' + verbo[x.tipo] + (x.tipo === 'muda' ? ' de ' + brl(x.a) + ' para ' + brl(x.b) : '');
      return '<li><span class="' + (bom ? 'fin2-verde' : 'fin2-vermelho') + '">' + (o.delta >= 0 ? '+' : '−') + '</span><span>' + esc(txt) + '</span><span class="fin2-mono ' + (bom ? 'fin2-verde' : 'fin2-vermelho') + '">' + (o.desp ? 'despesa ' : '') + (o.delta >= 0 ? '+' : '−') + brl(Math.abs(o.delta)) + '</span></li>';
    }).join('');
    var prox = B ? 'Em ' + B.mes + ': receita ' + (Math.abs(B.recB - B.recA) < 0.005 ? 'igual' : 'R$ ' + brl(Math.abs(B.recB - B.recA)) + (B.recB < B.recA ? ' menor' : ' maior')) +
      ' e despesa ' + (Math.abs(B.despB - B.despA) < 0.005 ? 'igual' : 'R$ ' + brl(Math.abs(B.despB - B.despA)) + (B.despB < B.despA ? ' menor' : ' maior')) + '.' : '';

    var C = resumoContratos(tenta('contratosLista') || [], ref);

    box.innerHTML = cabecalho('Financeiro MGB', cap(MESES_N[mes]) + ' de ' + ano, 'mes-resumo',
        '<button type="button" class="fin2-btn2" data-fin2="relatorio">Relatório do ano</button>') +
      '<div class="fin2-nums">' +
        numero('Receita do mês', brl(rec), dif(recA, rec)) +
        numero('Despesa do mês', brl(desp), dif(despA, desp)) +
        numero('Resultado', (res < 0 ? '−' : '') + brl(Math.abs(res)), rec > 0 ? Math.round(res / rec * 100) + '% da receita' : '', res >= 0 ? 'fin2-verde' : 'fin2-vermelho') +
      '</div>' + faltaHtml +
      '<section class="fin2-bloco fin2-sem-pad" aria-labelledby="fin2-mod"><div class="fin2-bloco-cab"><h3 id="fin2-mod">Por módulo</h3><span class="fin2-sub">tocar num módulo abre os clientes e os custos dele</span></div>' +
        '<div class="fin2-rolar"><table class="fin2-tab"><thead><tr><th scope="col">Módulo</th><th scope="col" class="fin2-n">Receita</th><th scope="col" class="fin2-n">Despesa</th><th scope="col" class="fin2-n">Resultado</th><th scope="col"><span class="fin2-oculto">Margem</span></th></tr></thead><tbody>' + tab + '</tbody></table></div></section>' +
      '<div class="fin2-duas">' +
        '<section class="fin2-bloco" aria-labelledby="fin2-mud"><h3 id="fin2-mud">O que mudou de ' + nomeAnt + ' para ' + MESES_N[mes] + '</h3>' +
          (mudHtml ? '<ul class="fin2-mud">' + mudHtml + '</ul>' : '<p class="fin2-sub">Nada mudou entre os dois meses.</p>') + (prox ? '<p class="fin2-sub">' + esc(prox) + '</p>' : '') + '</section>' +
        '<section class="fin2-bloco" aria-labelledby="fin2-ctt"><h3 id="fin2-ctt">Contratos em ' + MESES_N[mes] + '</h3>' +
          '<div class="fin2-ctt"><div class="fin2-ok"><b>' + C.ativo + '</b><span>no ar</span></div><div class="fin2-atencao"><b>' + C.termina + '</b><span>' + (C.termina === 1 ? 'termina' : 'terminam') + ' este mês</span></div><div><b>' + C.encerrado + '</b><span>encerrados</span></div></div>' +
          (C.terminaNomes.length ? '<p class="fin2-sub">' + esc(C.terminaNomes.slice(0, 4).join(', ')) + (C.terminaNomes.length > 4 ? '…' : '') + ' ' + (C.termina === 1 ? 'termina' : 'terminam') + ' em ' + MESES_N[mes] + '. Renovar por telefone não precisa de Assinafy.</p>' : '') +
          '<div><button type="button" class="fin2-btn2" data-fin2="contratos">Ver contratos</button></div></section>' +
      '</div>';
  }

  // ── 2. Contas do mês ─────────────────────────────────────────────────────
  var filtroContas = 'pagar', abertas = {}, editandoDia = null;
  function chavePag(d, dKey) { return (((ler('despPagamentos', {}) || {})[d.m.id] || {})[d.item] || {})[d.idx] || {}; }
  function estaPago(d, dKey) { var p = chavePag(d)[dKey]; return !!(p && p.pago); }
  function vencimentos() { var dp = ler('despPagamentos', {}) || {}; return dp._contas || {}; }
  function contasDoMes() {
    var s = mesSel('ov-desp-mes-sel', 'ov-desp-ano-sel'), dKey = tenta('despPagKey', s.ano, s.mes) || (s.ano + '-' + s.mes);
    var desp = tenta('coletaDespesasMes', s.ano, s.mes) || [];
    return { s: s, dKey: dKey, contas: agruparContas(desp, function (d) { return estaPago(d, dKey); }, vencimentos()) };
  }
  function marcarConta(chave) {
    var C = contasDoMes(), g = C.contas.filter(function (x) { return x.chave === chave; })[0];
    if (!g) return;
    var dp = ler('despPagamentos', null);
    if (!dp) return;
    var novo = !g.pago, hoje = new Date().toLocaleDateString('pt-BR');
    g.itens.forEach(function (d) {
      dp[d.m.id] = dp[d.m.id] || {}; dp[d.m.id][d.item] = dp[d.m.id][d.item] || {}; dp[d.m.id][d.item][d.idx] = dp[d.m.id][d.item][d.idx] || {};
      var atual = dp[d.m.id][d.item][d.idx][C.dKey] || { pago: false, obs: '' };
      dp[d.m.id][d.item][d.idx][C.dKey] = Object.assign({}, atual, { pago: novo, dataPago: novo ? hoje : '' });
    });
    tenta('scheduleSave');
    desenharContas();
  }
  function salvarDia(chave, valor) {
    var dp = ler('despPagamentos', null);
    if (!dp) return;
    var n = parseInt(valor, 10);
    dp._contas = dp._contas || {};
    if (n >= 1 && n <= 31) dp._contas[chave] = { dia: n }; else delete dp._contas[chave];
    editandoDia = null;
    tenta('scheduleSave');
    desenharContas();
  }
  function desenharContas() {
    var sub = doc.getElementById('ov-sub-desp');
    var box = container('ov-sub-desp', 'fin2-contas');
    if (!box) return;
    sub.classList.add('fin2-ativo');
    sub.classList.toggle('fin2-mostra-antiga', filtroContas === 'todos');
    var C = contasDoMes(), s = C.s, L = C.contas;
    var total = L.reduce(function (a, g) { return a + g.total; }, 0);
    var pago = L.reduce(function (a, g) { return a + g.itens.filter(function (d) { return estaPago(d, C.dKey); }).reduce(function (b, d) { return b + d.vlrMes; }, 0); }, 0);
    var nLanc = L.reduce(function (a, g) { return a + g.itens.length; }, 0);
    var aPagar = L.filter(function (g) { return !g.pago; }), pagas = L.filter(function (g) { return g.pago; });
    var lista = filtroContas === 'pagas' ? pagas : aPagar;
    var pct = total > 0 ? Math.min(100, pago / total * 100) : 0;
    var linhas = lista.map(function (g) {
      var k = esc(g.chave), aberto = !!abertas[g.chave];
      var dia = editandoDia === g.chave
        ? '<label class="fin2-oculto" for="fin2-dia">Dia de vencimento de ' + esc(g.titulo) + '</label><input id="fin2-dia" class="fin2-dia" inputmode="numeric" maxlength="2" value="' + (g.dia || '') + '" data-fin2-dia="' + k + '">'
        : '<button type="button" class="fin2-link" data-fin2="dia:' + k + '" aria-label="Dia de vencimento de ' + esc(g.titulo) + '">' + (g.dia ? 'dia ' + g.dia : 'definir dia') + '</button>';
      var det = aberto ? '<div class="fin2-det">' + (g.itens.length > 1 ? g.porModulo.map(function (p) {
          return '<div><span>' + esc(p.rot) + ' · ' + p.n + (p.n === 1 ? ' lançamento' : ' lançamentos') + '</span><span class="fin2-mono">' + brl(p.valor) + '</span></div>'; }).join('') : '') +
        g.itens.map(function (d) { return '<div class="fin2-det-l"><span>' + esc(moduloRot(d.m)) + ' · ' + esc(d.item) + ' · ' + esc((d.r && d.r.d) || '') + ' <i>' + esc(d.tipoLbl || '') + '</i></span><span class="fin2-mono">' + brl(d.vlrMes) + '</span></div>'; }).join('') +
        '<p class="fin2-sub">Marcar a conta como paga marca os ' + g.itens.length + ' lançamentos. Os valores por módulo continuam no resultado de cada módulo.</p></div>' : '';
      return '<div class="fin2-conta' + (g.pago ? ' fin2-paga' : '') + '"><input type="checkbox" aria-label="Marcar ' + esc(g.titulo) + ' como paga"' + (g.pago ? ' checked' : '') + ' data-fin2-pago="' + k + '">' +
        '<button type="button" class="fin2-conta-txt" data-fin2="abrir:' + k + '" aria-expanded="' + aberto + '"><b>' + esc(g.titulo) + '</b>' + (g.sub ? '<span>' + esc(g.sub) + '</span>' : '') + '</button>' +
        '<span class="fin2-venc">' + dia + '</span><b class="fin2-mono fin2-valor">' + brl(g.total) + '</b>' +
        '<button type="button" class="fin2-seta' + (aberto ? ' fin2-girada' : '') + '" data-fin2="abrir:' + k + '" aria-label="Ver lançamentos de ' + esc(g.titulo) + '">' + SETA_D + '</button></div>' + det;
    }).join('');
    box.innerHTML = cabecalho('Financeiro MGB', 'Contas de ' + MESES_N[s.mes], 'mes-contas',
        '<button type="button" class="fin2-btn" data-fin2="lancar-despesa">Lançar despesa</button>') +
      '<section class="fin2-bloco fin2-progresso-bloco"><div class="fin2-bloco-cab"><b>Pago R$ ' + brl(pago) + ' de R$ ' + brl(total) + '</b><span class="fin2-sub">' + nLanc + ' lançamentos em ' + L.length + ' contas</span></div>' +
        '<div class="fin2-barra" role="img" aria-label="' + Math.round(pct) + '% pago"><i style="width:' + pct + '%"></i></div></section>' +
      '<div class="fin2-abas" role="tablist" aria-label="Filtrar contas">' +
        [['pagar', 'A pagar · ' + aPagar.length], ['pagas', 'Pagas · ' + pagas.length], ['todos', 'Lançamento por lançamento']].map(function (a) {
          return '<button type="button" role="tab" aria-selected="' + (filtroContas === a[0]) + '" class="fin2-aba' + (filtroContas === a[0] ? ' fin2-on' : '') + '" data-fin2="filtro:' + a[0] + '">' + a[1] + '</button>'; }).join('') + '</div>' +
      (filtroContas === 'todos' ? '' : '<section class="fin2-bloco fin2-sem-pad" aria-label="Contas do mês"><div class="fin2-conta fin2-conta-cab" aria-hidden="true"><span></span><span>Conta</span><span class="fin2-venc">Vence</span><span class="fin2-valor">Valor</span><span></span></div>' +
        (linhas || '<p class="fin2-vazio">' + (filtroContas === 'pagas' ? 'Nenhuma conta marcada como paga em ' + MESES_N[s.mes] + '.' : 'Todas as contas de ' + MESES_N[s.mes] + ' estão pagas.') + '</p>') + '</section>' +
        '<p class="fin2-sub">O dia de vencimento é preenchido uma vez e vale para todos os meses.</p>');
    var inp = doc.getElementById('fin2-dia');
    if (inp) { inp.focus(); inp.select(); }
  }

  // ── 3. Módulo ────────────────────────────────────────────────────────────
  var aberto = null;
  function moduloAtual() { var id = ler('curMod', ''); return (ler('MODULES', []) || []).filter(function (m) { return m.id === id; })[0] || null; }
  function usaTelaNova(m) { return m && m.id !== 'taroba' && m.id !== 'elev' && m.id !== 'radioops'; }
  function custosItem(m, item, s) {
    return (tenta('coletaDespesasMes', s.ano, s.mes) || []).filter(function (d) { return d.m.id === m.id && d.item === item; });
  }
  function desenharModulo() {
    var pg = doc.getElementById('page-custos');
    if (!pg) return;
    var m = moduloAtual();
    var box = doc.getElementById('fin2-modulo');
    if (!usaTelaNova(m)) { pg.classList.remove('fin2-ativo'); if (box) box.innerHTML = ''; fecharPainel(); return; }
    if (!box) {
      box = doc.createElement('div'); box.id = 'fin2-modulo'; box.className = 'fin2';
      var kpi = doc.getElementById('kpi-row');
      pg.insertBefore(box, kpi || pg.firstChild);
      box.addEventListener('click', clique);
      recolherAntigos();
    }
    pg.classList.add('fin2-ativo');
    var s = mesSel('mod-mes-sel', 'mod-ano-sel'), ref = s.ano * 12 + s.mes;
    var R = ler('rec', {}) || {}, rm = R[m.id] || {};
    var custoMes = tenta('despesaTotalMesMod', m.id, s.ano, s.mes) || 0;
    var recMes = tenta('recModMes', m.id, s.ano, s.mes) || 0;
    var todos = (tenta('coletaDespesasMes', s.ano, s.mes) || []).filter(function (d) { return d.m.id === m.id; });
    var custoPor = {}; todos.forEach(function (d) { custoPor[d.item] = (custoPor[d.item] || 0) + d.vlrMes; });
    var forn = []; todos.forEach(function (d) { var f = (d.r && d.r.f) || ''; if (f && f !== '—' && forn.indexOf(f) === -1) forn.push(f); });
    var cli = (m.items || []).map(function (item) { var c = contrato(rm[item], ref); c.item = item; c.custo = custoPor[item] || 0; return c; });
    var ordem = { termina: 0, ativo: 1, futuro: 2, 'sem-inicio': 3, sem: 4, encerrado: 5 };
    cli.sort(function (a, b) { return (ordem[a.estado] - ordem[b.estado]) || (b.valor - a.valor) || a.item.localeCompare(b.item, 'pt-BR'); });
    var noAr = cli.filter(function (c) { return c.estado === 'ativo' || c.estado === 'termina'; }).length;
    var enc = cli.filter(function (c) { return c.estado === 'encerrado'; });
    var visiveis = cli.filter(function (c) { return c.estado !== 'encerrado'; });
    var sit = { ativo: chip('No ar', 'ok'), termina: chip('Termina este mês', 'atencao'), futuro: chip('Ainda não começou', 'acao'), 'sem-inicio': chip('Sem data de início', 'atencao'), sem: chip('Sem valor', 'neutro') };
    var res = recMes - custoMes;
    box.innerHTML =
      '<header class="fin2-cab"><div class="fin2-mes">' +
        '<button type="button" class="fin2-icone" data-fin2="mes-modulo:-1" aria-label="Mês anterior">' + SETA_E + '</button>' +
        '<div><span class="fin2-sub">Financeiro MGB › Módulos</span><h2>' + esc(moduloRot(m)) + ' · ' + MESES_N[s.mes] + '</h2></div>' +
        '<button type="button" class="fin2-icone" data-fin2="mes-modulo:1" aria-label="Próximo mês">' + SETA_D + '</button></div>' +
        '<div class="fin2-acoes"><button type="button" class="fin2-btn2" data-fin2="voltar-resumo">Resumo do mês</button></div></header>' +
      '<div class="fin2-nums">' +
        numero('Receita do mês', brl(recMes), noAr + (noAr === 1 ? ' cliente no ar' : ' clientes no ar')) +
        numero('Custo do mês', brl(custoMes), forn.length ? forn.slice(0, 3).join(', ') + (forn.length > 3 ? '…' : '') : 'nenhum custo lançado') +
        numero('Resultado', (res < 0 ? '−' : '') + brl(Math.abs(res)), recMes > 0 ? Math.round(res / recMes * 100) + '% da receita' : '', res >= 0 ? 'fin2-verde' : 'fin2-vermelho') +
      '</div>' +
      '<section class="fin2-bloco fin2-sem-pad" aria-labelledby="fin2-cli"><div class="fin2-bloco-cab"><h3 id="fin2-cli">Clientes</h3><button type="button" class="fin2-btn2" data-fin2="novo-item">Novo cliente no módulo</button></div>' +
        '<div class="fin2-rolar"><table class="fin2-tab"><thead><tr><th scope="col">Cliente</th><th scope="col" class="fin2-n">Por mês</th><th scope="col">Desde</th><th scope="col">Até</th><th scope="col" class="fin2-n">Custo no mês</th><th scope="col">Situação</th></tr></thead><tbody>' +
        visiveis.map(function (c) {
          return '<tr class="fin2-clicavel' + (aberto === c.item ? ' fin2-sel' : '') + '" tabindex="0" data-fin2="cliente:' + esc(c.item) + '"><td><b>' + esc(c.item) + '</b></td>' +
            '<td class="fin2-n">' + (c.valor ? brl(c.valor) : '—') + '</td><td>' + (c.ini != null ? rotMes(c.ini) : '—') + '</td>' +
            '<td class="fin2-nowrap">' + (c.ini == null ? '—' : c.semFim ? 'sem fim' : rotMes(c.fim)) + '</td>' +
            '<td class="fin2-n fin2-cinza">' + (c.custo ? brl(c.custo) : '—') + '</td><td>' + (sit[c.estado] || '') + '</td></tr>';
        }).join('') +
        (enc.length ? '<tr class="fin2-clicavel" data-fin2="encerrados"><td colspan="6"><b class="fin2-cinza">' + enc.length + (enc.length === 1 ? ' contrato encerrado' : ' contratos encerrados') + '</b> <span class="fin2-sub">· ' +
          (mostrarEnc ? 'tocar para esconder' : esc(enc.map(function (c) { return c.item; }).join(', '))) + '</span></td></tr>' +
          (mostrarEnc ? enc.map(function (c) { return '<tr class="fin2-clicavel fin2-enc" tabindex="0" data-fin2="cliente:' + esc(c.item) + '"><td>' + esc(c.item) + '</td><td class="fin2-n">' + brl(c.valor) + '</td><td>' + rotMes(c.ini) + '</td><td>' + rotMes(c.fim) + '</td><td class="fin2-n fin2-cinza">' + (c.custo ? brl(c.custo) : '—') + '</td><td>' + chip('Encerrado', 'neutro') + '</td></tr>'; }).join('') : '') : '') +
        '</tbody></table></div></section>' +
      '<p class="fin2-sub">Gráficos, parcelamentos e lançamentos de cada cliente continuam abaixo.</p>';
    if (aberto) desenharPainel();
  }
  var mostrarEnc = false;
  function recolherAntigos() {
    ['charts', 'parc'].forEach(function (n) {
      var h = doc.getElementById('acc-hdr-' + n);
      if (h && h.classList.contains('open')) tenta('toggleAcc', n);
    });
  }
  function fecharPainel() { aberto = null; var p = doc.getElementById('fin2-painel'); if (p) p.remove(); }
  function desenharPainel() {
    var m = moduloAtual();
    if (!m || !aberto) { fecharPainel(); return; }
    var s = mesSel('mod-mes-sel', 'mod-ano-sel'), ref = s.ano * 12 + s.mes;
    var R = ler('rec', {}) || {}, ro = (R[m.id] || {})[aberto] || {};
    var c = contrato(ro, ref), custos = custosItem(m, aberto, s);
    var custoMes = custos.reduce(function (a, d) { return a + d.vlrMes; }, 0);
    var acum = tenta('totalOf', m.id, aberto) || 0;
    var p = doc.getElementById('fin2-painel');
    if (!p) { p = doc.createElement('aside'); p.id = 'fin2-painel'; p.className = 'fin2'; p.setAttribute('aria-label', 'Cliente'); doc.body.appendChild(p); p.addEventListener('click', clique); p.addEventListener('change', mudou); }
    var inicio = /^\d{4}-\d{2}/.test(ro.inicio || '') ? ro.inicio.slice(0, 7) : '';
    var semFim = !ro.meses || Number(ro.meses) >= SEM_FIM;
    p.innerHTML =
      '<div class="fin2-p-cab"><div><h3>' + esc(aberto) + '</h3><span class="fin2-sub">' + esc(moduloRot(m)) + '</span></div>' +
        '<button type="button" class="fin2-icone" data-fin2="fechar" aria-label="Fechar painel"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      (c.estado === 'termina' ? '<div class="fin2-aviso-laranja"><b>O contrato termina em ' + MESES_N[s.mes] + '.</b> Renovar por telefone não precisa de Assinafy: é só mudar "Até quando".</div>' : '') +
      '<section><h4>Contrato</h4><div class="fin2-form">' +
        '<label>Valor por mês (R$)<input id="fin2-c-valor" inputmode="decimal" value="' + (c.valor ? brl(c.valor) : '') + '" placeholder="0,00"></label>' +
        '<label>Começou a pagar<input id="fin2-c-inicio" type="month" value="' + inicio + '"></label>' +
        '<label class="fin2-larga">Até quando<select id="fin2-c-ate"><option value="sem"' + (semFim ? ' selected' : '') + '>Sem data para acabar</option><option value="meses"' + (semFim ? '' : ' selected') + '>Por um número de meses</option></select></label>' +
        '<label class="fin2-larga" id="fin2-c-meses-l"' + (semFim ? ' hidden' : '') + '>Quantos meses<input id="fin2-c-meses" type="number" min="1" max="119" value="' + (semFim ? 12 : ro.meses) + '"></label>' +
      '</div></section>' +
      '<section><h4>Custos deste cliente em ' + MESES_N[s.mes] + '</h4>' +
        (custos.length ? custos.map(function (d) { return '<div class="fin2-custo"><span><b>' + esc((d.r && d.r.d) || '—') + '</b><br><span class="fin2-sub">' + esc([d.tipoLbl, d.r && d.r.f !== '—' ? d.r.f : ''].filter(Boolean).join(' · ')) + '</span></span><b class="fin2-mono">' + brl(d.vlrMes) + '</b></div>'; }).join('') : '<p class="fin2-sub">Nenhum custo lançado para este cliente no mês.</p>') +
        '<button type="button" class="fin2-link" data-fin2="lancamentos">Ver e lançar custos deste cliente</button></section>' +
      '<section class="fin2-p-nums"><div><span>Sobra no mês</span><b class="' + ((c.estado === 'ativo' || c.estado === 'termina' ? c.valor : 0) - custoMes >= 0 ? 'fin2-verde' : 'fin2-vermelho') + '">' + brl((c.estado === 'ativo' || c.estado === 'termina' ? c.valor : 0) - custoMes) + '</b></div><div><span>Custo acumulado</span><b>' + brl(acum) + '</b></div></section>' +
      '<div class="fin2-p-acoes"><button type="button" class="fin2-btn" data-fin2="salvar">Salvar</button>' +
        (c.estado === 'ativo' && c.ini != null ? '<button type="button" class="fin2-btn2" data-fin2="encerrar">Encerrar contrato em ' + MESES_N[s.mes] + '</button>' : '') + '</div>' +
      '<p class="fin2-sub" id="fin2-c-msg" role="status"></p>';
  }
  function numBR(t) { t = String(t || '').trim(); if (!t) return 0; if (t.indexOf(',') !== -1) t = t.replace(/\./g, '').replace(',', '.'); var n = parseFloat(t); return isNaN(n) ? NaN : n; }
  function salvarContrato(encerrar) {
    var m = moduloAtual(), R = ler('rec', null);
    if (!m || !aberto || !R) return;
    var msg = doc.getElementById('fin2-c-msg');
    var valor = numBR((doc.getElementById('fin2-c-valor') || {}).value);
    if (isNaN(valor) || valor < 0) { if (msg) msg.textContent = 'Valor inválido. Use só números, por exemplo 1.500,00.'; return; }
    var inicio = (doc.getElementById('fin2-c-inicio') || {}).value || '';
    var ate = (doc.getElementById('fin2-c-ate') || {}).value;
    var meses = ate === 'sem' ? SEM_FIM : Math.max(1, Math.min(SEM_FIM - 1, parseInt((doc.getElementById('fin2-c-meses') || {}).value, 10) || 12));
    if (encerrar) {
      var s = mesSel('mod-mes-sel', 'mod-ano-sel'), mi = /^(\d{4})-(\d{2})/.exec(inicio);
      if (!mi) return;
      if (!global.confirm('Encerrar o contrato de ' + aberto + ' em ' + MESES_N[s.mes] + '? A receita dele sai dos meses seguintes.')) return;
      meses = Math.max(1, s.ano * 12 + s.mes - (+mi[1] * 12 + (+mi[2] - 1)) + 1);
    }
    if (valor > 0 && !inicio) { if (msg) msg.textContent = 'Informe o mês em que o cliente começou a pagar.'; return; }
    R[m.id] = R[m.id] || {};
    R[m.id][aberto] = Object.assign({}, R[m.id][aberto] || {}, { valor: valor, inicio: inicio, meses: meses });
    tenta('syncFinanceiro');
    tenta('refresh'); // redesenha o módulo e salva (scheduleSave)
    desenharModulo();
    var msg2 = doc.getElementById('fin2-c-msg');
    if (msg2) msg2.textContent = encerrar ? 'Contrato encerrado.' : 'Salvo.';
  }

  // ── Eventos ──────────────────────────────────────────────────────────────
  function clique(ev) {
    var b = ev.target.closest('[data-fin2]');
    if (!b || ev.target.closest('input,select,label') && !b.matches('button,tr')) return;
    var a = b.getAttribute('data-fin2'), i = a.indexOf(':'), acao = i === -1 ? a : a.slice(0, i), arg = i === -1 ? '' : a.slice(i + 1);
    try {
      if (acao === 'mes-resumo') mudarMes('ov-mes-sel', 'ov-ano-sel', +arg, function () { chama('buildOverview'); });
      else if (acao === 'mes-contas') mudarMes('ov-desp-mes-sel', 'ov-desp-ano-sel', +arg, function () { chama('buildVisaoDespesas'); });
      else if (acao === 'mes-modulo') mudarMes('mod-mes-sel', 'mod-ano-sel', +arg, function () { ['buildKPIs', 'buildCharts', 'buildAnunciantes', 'buildTable', 'buildReceitas', 'buildPayback'].forEach(function (f) { tenta(f); }); desenharModulo(); });
      else if (acao === 'relatorio') chama('toggleRelatorioAnual');
      else if (acao === 'contratos') chama('goOperacional', 'contratos');
      else if (acao === 'modulo') chama('drillMod', arg);
      else if (acao === 'pagina') chama('goPage', arg);
      else if (acao === 'voltar-resumo') { chama('goPage', 'overview'); tenta('switchOvTab', 'visao'); }
      else if (acao === 'filtro') { filtroContas = arg; desenharContas(); }
      else if (acao === 'abrir') { abertas[arg] = !abertas[arg]; desenharContas(); }
      else if (acao === 'dia') { editandoDia = arg; desenharContas(); }
      else if (acao === 'lancar-despesa') { if (global.MGBLancar && global.MGBLancar.despesa) global.MGBLancar.despesa(); }
      else if (acao === 'cliente') { aberto = arg; desenharModulo(); desenharPainel(); }
      else if (acao === 'encerrados') { mostrarEnc = !mostrarEnc; desenharModulo(); }
      else if (acao === 'fechar') { fecharPainel(); desenharModulo(); }
      else if (acao === 'salvar') salvarContrato(false);
      else if (acao === 'encerrar') salvarContrato(true);
      else if (acao === 'novo-item') chama('openModal', 'add');
      else if (acao === 'lancamentos') {
        var item = aberto; fecharPainel(); chama('switchItem', item); desenharModulo();
        var t = doc.querySelector('#page-custos .tcard') || doc.getElementById('ltabs');
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (e) { console.error('financeiro:', acao, e); }
  }
  function mudou(ev) {
    var t = ev.target;
    if (t.hasAttribute('data-fin2-pago')) marcarConta(t.getAttribute('data-fin2-pago'));
    else if (t.hasAttribute('data-fin2-dia')) salvarDia(t.getAttribute('data-fin2-dia'), t.value);
    else if (t.id === 'fin2-c-ate') { var l = doc.getElementById('fin2-c-meses-l'); if (l) l.hidden = t.value === 'sem'; }
  }
  doc.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && aberto) { fecharPainel(); desenharModulo(); return; }
    var t = ev.target;
    if (ev.key === 'Enter' && t && t.matches && t.matches('tr.fin2-clicavel')) { t.click(); ev.preventDefault(); }
    if (ev.key === 'Enter' && t && t.id === 'fin2-dia') { salvarDia(t.getAttribute('data-fin2-dia'), t.value); ev.preventDefault(); }
    if (ev.key === 'Escape' && t && t.id === 'fin2-dia') { editandoDia = null; desenharContas(); }
  });
  doc.addEventListener('focusout', function (ev) { var t = ev.target; if (t && t.id === 'fin2-dia' && editandoDia) salvarDia(t.getAttribute('data-fin2-dia'), t.value); });

  function estilos() {
    if (doc.getElementById('fin2-css')) return;
    var s = doc.createElement('style');
    s.id = 'fin2-css';
    s.textContent =
      '#ov-sub-visao.fin2-ativo>*:not(#fin2-resumo):not(#ov-annual-wrap){display:none!important}' +
      '#ov-sub-desp.fin2-ativo>*:not(#fin2-contas){display:none!important}' +
      '#ov-sub-desp.fin2-ativo.fin2-mostra-antiga>*:not(#fin2-contas):not(.page-hdr):not([id^=aviso-virada]){display:block!important}' +
      '#page-custos.fin2-ativo>#kpi-row,#page-custos.fin2-ativo>.rec-section,#page-custos.fin2-ativo>#pb-row,#page-custos.fin2-ativo>.page-hdr{display:none!important}' +
      '.fin2{font-family:"DM Sans",system-ui,sans-serif;color:#241A38;padding:28px 28px 8px;max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:18px;box-sizing:border-box;min-width:0;width:100%}.fin2>*{min-width:0;max-width:100%}' +
      '#fin2-painel.fin2{position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);max-width:none;margin:0;z-index:9500;background:#fff;border-left:1px solid #E4DFF0;box-shadow:-12px 0 40px rgba(42,23,96,.12);overflow:auto;padding:26px;gap:20px}' +
      '.fin2 h2{margin:0;font-size:28px;font-weight:700}.fin2 h3{margin:0;font-size:20px;font-weight:700}.fin2 h4{margin:0 0 10px;font-size:16px;font-weight:700}' +
      '.fin2-sub{font-size:14px;color:#5D5868}.fin2 p.fin2-sub{margin:0}' +
      '.fin2-cab{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px}.fin2-mes{display:flex;align-items:center;gap:12px}.fin2-mes>div{display:flex;flex-direction:column}.fin2-acoes{display:flex;flex-wrap:wrap;gap:10px}' +
      '.fin2-icone{width:44px;height:44px;border:1px solid #CFC7E6;border-radius:10px;background:#fff;color:#2A1760;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none}' +
      '.fin2-btn,.fin2-btn2{min-height:44px;padding:0 16px;border-radius:10px;font:700 14px "DM Sans",system-ui,sans-serif;cursor:pointer;white-space:nowrap}' +
      '.fin2-btn{border:0;background:#4E38B2;color:#fff}.fin2-btn:hover{background:#2A1760}.fin2-btn2{border:1px solid #CFC7E6;background:#fff;color:#2A1760;font-weight:600}.fin2-btn2:hover{background:#ECE8FA}' +
      '.fin2-link{background:none;border:0;padding:0;color:#4E38B2;font:600 14px "DM Sans",system-ui,sans-serif;cursor:pointer;text-decoration:underline;text-underline-offset:3px;min-height:32px}' +
      '.fin2-nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}' +
      '.fin2-num{background:#fff;border:1px solid #E4DFF0;border-radius:18px;padding:18px 20px;display:flex;flex-direction:column;gap:4px}.fin2-num>span{font-size:14px;color:#5D5868}' +
      '.fin2-num b{font:600 27px "DM Mono",ui-monospace,monospace}.fin2-num small{font-size:13.5px;color:#5D5868}' +
      '.fin2-bloco{background:#fff;border:1px solid #E4DFF0;border-radius:18px;padding:20px 22px;display:flex;flex-direction:column;gap:6px}.fin2-sem-pad{padding:0;overflow:hidden;gap:0}' +
      '.fin2-bloco-cab{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}.fin2-sem-pad>.fin2-bloco-cab{padding:18px 20px 8px}' +
      '.fin2-linha{display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:13px 0;border-top:1px solid #EFEBF7}.fin2-linha-txt{flex:1 1 360px;display:flex;flex-direction:column;gap:3px}.fin2-linha-txt b{font-size:16px}.fin2-linha-txt span{font-size:14px;color:#5D5868}' +
      '.fin2-ponto{width:10px;height:10px;border-radius:50%;flex:none}' +
      '.fin2-rolar{overflow-x:auto;position:relative}.fin2-tab{width:100%;border-collapse:collapse;font-size:14.5px;min-width:640px}' +
      '.fin2-tab th{text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#5D5868;font-weight:700}.fin2-tab th:first-child,.fin2-tab td:first-child{padding-left:20px}.fin2-tab th:last-child,.fin2-tab td:last-child{padding-right:20px}' +
      '.fin2-tab td{padding:12px;border-top:1px solid #EFEBF7;vertical-align:middle}.fin2-n{text-align:right!important;font-family:"DM Mono",ui-monospace,monospace;font-size:14px;white-space:nowrap}' +
      '.fin2-clicavel{cursor:pointer}.fin2-clicavel:hover td{background:#FBFAFE}.fin2-clicavel:focus-visible{outline:3px solid #6C55DB;outline-offset:-3px}.fin2-sel td{background:#ECE8FA!important}.fin2-sel td:first-child{box-shadow:inset 4px 0 0 #4E38B2}' +
      '.fin2-forte{font-weight:600}.fin2-verde{color:#15803D!important}.fin2-vermelho{color:#B42318!important}.fin2-laranja{color:#8A4B08!important}.fin2-cinza{color:#5D5868}.fin2-nowrap{white-space:nowrap}.fin2-enc td{color:#5D5868}' +
      '.fin2-mono{font-family:"DM Mono",ui-monospace,monospace}' +
      '.fin2-mg{width:150px}.fin2-mg div{height:8px;border-radius:999px;background:#EFEBF7;overflow:hidden}.fin2-mg i{display:block;height:100%;background:#4E38B2}.fin2-mg span{font-size:12.5px;color:#5D5868}' +
      '.fin2-duas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fin2-duas .fin2-bloco{gap:10px}.fin2-duas h3{font-size:18px}' +
      '.fin2-mud{list-style:none;margin:0;padding:0}.fin2-mud li{display:flex;align-items:baseline;gap:12px;padding:10px 0;border-top:1px solid #EFEBF7;font-size:15px}.fin2-mud li>span:nth-child(2){flex:1}.fin2-mud li>span:first-child{width:14px;font-family:"DM Mono",monospace}.fin2-mud .fin2-mono{white-space:nowrap;font-size:14px}' +
      '.fin2-ctt{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;text-align:center}.fin2-ctt>div{background:#F6F4FA;border-radius:12px;padding:14px 6px;display:flex;flex-direction:column}.fin2-ctt b{font-size:24px}.fin2-ctt span{font-size:13px;color:#5D5868}' +
      '.fin2-ctt .fin2-ok{background:#E8F6EE}.fin2-ctt .fin2-ok b{color:#15803D}.fin2-ctt .fin2-ok span{color:#14532D}.fin2-ctt .fin2-atencao{background:#FDF2E3}.fin2-ctt .fin2-atencao b,.fin2-ctt .fin2-atencao span{color:#8A4B08}' +
      '.fin2-chip{display:inline-block;font-size:12.5px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap}.fin2-chip.fin2-ok{color:#15803D;background:#E8F6EE}.fin2-chip.fin2-atencao{color:#8A4B08;background:#FDF2E3}.fin2-chip.fin2-acao{color:#4E38B2;background:#ECE8FA}.fin2-chip.fin2-neutro{color:#5D5868;background:#EFEBF7}' +
      '.fin2-barra{height:12px;border-radius:999px;background:#EFEBF7;overflow:hidden}.fin2-barra i{display:block;height:100%;background:#15803D}.fin2-progresso-bloco b{font-size:18px}' +
      '.fin2-abas{display:flex;flex-wrap:wrap;gap:8px}.fin2-aba{min-height:40px;padding:0 14px;border:1px solid #CFC7E6;border-radius:999px;background:#fff;color:#3A3446;font:600 14px "DM Sans",system-ui,sans-serif;cursor:pointer}.fin2-aba.fin2-on{background:#4E38B2;border-color:#4E38B2;color:#fff}' +
      '.fin2-conta{display:grid;grid-template-columns:22px minmax(0,1fr) 100px 120px 36px;align-items:center;gap:14px;padding:13px 20px;border-top:1px solid #EFEBF7}.fin2-conta input[type=checkbox]{width:22px;height:22px;accent-color:#15803D;margin:0}' +
      '.fin2-conta-cab{border-top:0;padding-top:12px;padding-bottom:8px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#5D5868;font-weight:700}' +
      '.fin2-conta-txt{display:flex;flex-direction:column;gap:2px;text-align:left;background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;min-width:0}.fin2-conta-txt b{font-size:16px}.fin2-conta-txt span{font-size:14px;color:#5D5868}' +
      '.fin2-paga .fin2-conta-txt b,.fin2-paga .fin2-valor{color:#5D5868;text-decoration:line-through}.fin2-venc{font-size:14px;color:#5D5868}.fin2-valor{text-align:right;font-size:15px}' +
      '.fin2-dia{width:56px;height:36px;border:1px solid #4E38B2;border-radius:8px;padding:0 8px;font:15px "DM Mono",monospace}' +
      '.fin2-seta{width:36px;height:36px;border:0;border-radius:8px;background:none;color:#5D5868;cursor:pointer;display:flex;align-items:center;justify-content:center}.fin2-seta:hover{background:#ECE8FA}.fin2-girada svg{transform:rotate(90deg)}' +
      '.fin2-det{background:#FBFAFE;padding:6px 20px 14px 56px;display:flex;flex-direction:column}.fin2-det>div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #EFEBF7;font-size:14px}.fin2-det-l{color:#5D5868;font-size:13.5px!important}.fin2-det-l i{font-style:normal;font-size:12px;color:#8A8494}.fin2-det p{margin:8px 0 0}' +
      '.fin2-vazio{padding:18px 20px;margin:0;color:#5D5868;font-size:15px}' +
      '.fin2-oculto{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}' +
      '.fin2-p-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.fin2-p-cab h3{font-size:24px}' +
      '.fin2-aviso-laranja{background:#FDF2E3;color:#6B3A06;border-radius:12px;padding:12px 14px;font-size:14.5px}' +
      '.fin2-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fin2-form label{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600;color:#3A3446}.fin2-form .fin2-larga{grid-column:1/-1}.fin2-form label[hidden]{display:none}' +
      '.fin2-form input,.fin2-form select{height:44px;border:1px solid #CFC7E6;border-radius:10px;padding:0 12px;font:15px "DM Sans",system-ui,sans-serif;background:#fff;color:#241A38;box-sizing:border-box;width:100%}#fin2-c-valor{font-family:"DM Mono",monospace}' +
      '.fin2-custo{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;background:#F6F4FA;border-radius:10px;font-size:14px;margin-bottom:8px}' +
      '.fin2-p-nums{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.fin2-p-nums div{background:#F6F4FA;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:2px}.fin2-p-nums span{font-size:13px;color:#5D5868}.fin2-p-nums b{font:600 17px "DM Mono",monospace}' +
      '.fin2-p-acoes{display:flex;flex-direction:column;gap:10px}' +
      '.fin2-icone:focus-visible,.fin2-btn:focus-visible,.fin2-btn2:focus-visible,.fin2-aba:focus-visible,.fin2-link:focus-visible,.fin2-conta-txt:focus-visible,.fin2-seta:focus-visible{outline:3px solid #6C55DB;outline-offset:2px}' +
      '@media (max-width:760px){.fin2{padding:18px 14px 8px}.fin2 h2{font-size:22px}.fin2-nums{grid-template-columns:1fr}.fin2-num b{font-size:22px}.fin2-duas{grid-template-columns:1fr}' +
        '.fin2-conta{grid-template-columns:22px minmax(0,1fr) auto;grid-template-areas:"c t v" ". d s"}.fin2-conta>input{grid-area:c}.fin2-conta-txt{grid-area:t}.fin2-valor{grid-area:v}.fin2-venc{grid-area:d}.fin2-seta{grid-area:s;justify-self:end}.fin2-conta-cab{display:none}' +
        '.fin2-mes{width:100%;justify-content:space-between}.fin2-mes>div{text-align:center}.fin2-det{padding-left:20px}#fin2-painel.fin2{padding:20px}}';
    doc.head.appendChild(s);
  }

  function envolver(nome, depois) {
    var f = global[nome];
    if (typeof f !== 'function' || f.__fin2) return;
    var g = function () { var r = f.apply(this, arguments); try { depois.apply(this, arguments); } catch (e) { console.error('financeiro:', nome, e); } return r; };
    g.__fin2 = true;
    global[nome] = g;
  }
  function ligar() {
    estilos();
    envolver('buildOverview', desenharResumo);
    envolver('buildVisaoDespesas', desenharContas);
    envolver('buildAll', desenharModulo);
    envolver('buildReceitas', function () { if (doc.getElementById('fin2-modulo')) desenharModulo(); });
    envolver('goPage', function (p) { if (p !== 'custos') fecharPainel(); });
    envolver('switchMod', function () { fecharPainel(); desenharModulo(); });
    // nomes das abas do Financeiro MGB
    var t1 = doc.getElementById('ov-tab-visao'), t2 = doc.getElementById('ov-tab-desp');
    if (t1) t1.textContent = 'Resumo do mês';
    if (t2) t2.textContent = 'Contas do mês';
  }

  global.MGBFinanceiro = Object.assign({ resumo: desenharResumo, contas: desenharContas, modulo: desenharModulo }, regras);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
