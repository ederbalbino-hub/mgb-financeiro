/* Hub MGB — "gestão à vista" em todas as áreas (27/11/2026).
 *
 * Pedido do Eder: o painel compacto do Financeiro em todo lugar — em qualquer área ou aba que se
 * entre, a primeira coisa é um painel visual com os números daquela área.
 * Este arquivo tem as peças do painel (cartão escuro, cartões com situação, gráfico mês a mês,
 * rosca, barras, "pulso" com indicadores) e um adaptador por área, que monta o painel com os
 * dados que o hub já tem. Só lê dados; não grava nada. O conteúdo de cada tela continua embaixo.
 * O Financeiro (Resumo, Visão Receita, Contas, Empresa, Módulo) tem o painel dentro do financeiro.js.
 */
(function (global) {
  'use strict';
  var doc = global.document;
  var MESES_N = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var PAL = ['#2A1760', '#4E38B2', '#8B7BE0', '#BBAEF2', '#DDD6F8', '#5D5868'];
  var DEST = '#F5B35C';

  // ── utilidades ───────────────────────────────────────────────────────────
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function curto(v) { v = Number(v) || 0; var a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1000 ? s + (a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : s + Math.round(a).toLocaleString('pt-BR'); }
  function k(v) { v = Number(v) || 0; var a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 1000 ? (a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k' : Math.round(a)); }
  function ler(nome, padrao) { try { var v = Function('return typeof ' + nome + "!=='undefined'?" + nome + ':undefined')(); return v === undefined ? padrao : v; } catch (e) { return padrao; } }
  function tenta(nome) { try { var fn = global[nome]; return typeof fn === 'function' ? fn.apply(global, Array.prototype.slice.call(arguments, 1)) : undefined; } catch (e) { return undefined; } }
  function cap(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  function pct(a, b) { return b ? Math.max(0, Math.min(100, a / b * 100)) : 0; }
  function hoje() { var d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth(), ref: d.getFullYear() * 12 + d.getMonth(), dia: d }; }
  function chave(d) { return d.getFullYear() * 12 + d.getMonth(); }
  function mesDe(txt) { var m = /^(\d{4})-(\d{2})/.exec(String(txt || '')); return m ? +m[1] * 12 + (+m[2] - 1) : null; }

  // ── peças ────────────────────────────────────────────────────────────────
  function chip(t, tom) { return '<span class="pnl-chip pnl-' + (tom || 'neutro') + '">' + esc(t) + '</span>'; }
  function anel(p, tam, traco, cor, fundo, txt, sub, rot) {
    var r = (tam - traco) / 2, C = 2 * Math.PI * r, d = C * Math.max(0, Math.min(100, p)) / 100;
    return '<div class="pnl-anel" style="width:' + tam + 'px;height:' + tam + 'px"><svg width="' + tam + '" height="' + tam + '" viewBox="0 0 ' + tam + ' ' + tam + '" role="img" aria-label="' + esc(Math.round(p) + '% ' + rot) + '">' +
      '<circle cx="' + tam / 2 + '" cy="' + tam / 2 + '" r="' + r.toFixed(1) + '" fill="none" stroke="' + fundo + '" stroke-width="' + traco + '"/>' +
      (d > 0 ? '<circle cx="' + tam / 2 + '" cy="' + tam / 2 + '" r="' + r.toFixed(1) + '" fill="none" stroke="' + cor + '" stroke-width="' + traco + '" stroke-linecap="round" stroke-dasharray="' + d.toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 ' + tam / 2 + ' ' + tam / 2 + ')"/>' : '') +
      '</svg><div><b style="color:' + txt + '">' + Math.round(p) + '%</b>' + (sub ? '<span style="color:' + sub + '">' + esc(rot) + '</span>' : '') + '</div></div>';
  }
  // h: {chip, titulo, valor, cor, frase, nums:[[rot,val,sub]], meta:[rot,val], anel:[pct,rot]}
  function hero(h) {
    return '<section class="pnl-hero" aria-label="' + esc(h.titulo) + '"><div class="pnl-hero-txt">' +
      (h.chip ? '<span class="pnl-hero-chip">' + esc(h.chip) + '</span>' : '') +
      '<div><h3>' + esc(h.titulo) + ' <span class="pnl-mono" style="color:' + (h.cor || DEST) + '">' + h.valor + '</span></h3>' + (h.frase ? '<p>' + h.frase + '</p>' : '') + '</div>' +
      (h.nums && h.nums.length ? '<div class="pnl-hero-nums" style="grid-template-columns:repeat(' + h.nums.length + ',minmax(0,1fr))">' + h.nums.map(function (n) { return '<div><b class="pnl-mono">' + n[1] + '</b><small>' + esc(n[0]) + (n[2] ? ' · ' + esc(n[2]) : '') + '</small></div>'; }).join('') + '</div>' : '') +
      '</div>' +
      (h.meta ? '<div class="pnl-hero-meta"><span>' + esc(h.meta[0]) + '</span><b class="pnl-mono" style="color:' + (h.cor || DEST) + '">' + h.meta[1] + '</b></div>' : '') +
      (h.anel ? '<div class="pnl-hero-anel">' + anel(h.anel[0], 112, 10, '#FFFFFF', 'rgba(255,255,255,0.16)', '#FFFFFF', '#D9D2F2', h.anel[1]) + '</div>' : '') +
      '</section>';
  }
  // c: {titulo, chip:[txt,tom], valor, sub, barra:[pct,cor], marca, tom}
  function cartoes(lista) {
    if (!lista || !lista.length) return '';
    return '<div class="pnl-cards">' + lista.map(function (c) {
      var tag = c.ir ? 'button type="button" data-pnl-ir="' + esc(c.ir) + '" aria-label="' + esc('Abrir ' + c.titulo) + '"' : 'div';
      return '<' + tag + ' class="pnl-card pnl-card-' + (c.tom || 'neutro') + (c.ir ? ' pnl-card-ir' : '') + '"' + (c.dica ? ' title="' + esc(c.dica) + '"' : '') + '><span class="pnl-card-cab"><b>' + esc(c.titulo) + '</b>' + (c.chip ? chip(c.chip[0], c.chip[1]) : '') + '</span>' +
        '<span class="pnl-card-v pnl-mono">' + c.valor + '</span>' + (c.sub ? '<small>' + esc(c.sub) + '</small>' : '') +
        (c.barra ? '<span class="pnl-card-b" aria-hidden="true"><i style="width:' + Math.max(0, Math.min(100, c.barra[0])).toFixed(0) + '%;background:' + (c.barra[1] || '#4E38B2') + '"></i>' + (c.marca != null ? '<u style="left:' + Math.max(0, Math.min(100, c.marca)).toFixed(0) + '%"></u>' : '') + '</span>' : '') + (c.ir ? '</button>' : '</div>');
    }).join('') + '</div>';
  }
  // serie: [{rot, a, b?, atual, prev}] — a = barra roxa, b = barra laranja (opcional), linha = a-b (opcional)
  function barras(serie, o) {
    o = o || {};
    var W = 640, H = o.H || 230, L = 42, R = 8, T = 22, B = 28, pw = W - L - R, ph = H - T - B;
    var max = 0; serie.forEach(function (m) { max = Math.max(max, m.a || 0, m.b || 0); });
    var top = escala(max), y = function (v) { return T + ph - Math.max(0, v) / top * ph; };
    var duas = serie.some(function (m) { return m.b; }), slot = pw / serie.length, bw = duas ? Math.min(16, slot / 2 - 4) : Math.min(24, slot - 12), s = [];
    [0, top / 3, top * 2 / 3, top].forEach(function (g) {
      s.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g).toFixed(1) + '" y2="' + y(g).toFixed(1) + '" stroke="#EFEBF7"/>');
      s.push('<text x="' + (L - 7) + '" y="' + (y(g) + 4).toFixed(1) + '" text-anchor="end" class="pnl-g-eixo">' + (o.fmt ? o.fmt(g) : k(g)) + '</text>');
    });
    var pts = [];
    serie.forEach(function (m, i) {
      var cx = L + slot * i + slot / 2, op = m.prev ? ' fill-opacity="0.4"' : '';
      s.push('<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" class="pnl-g-mes' + (m.atual ? ' pnl-g-atual' : '') + '">' + esc(m.rot) + '</text>');
      if (!m.a && !m.b) return;
      if (duas) {
        s.push('<rect x="' + (cx - bw - 1.5).toFixed(1) + '" y="' + y(m.a).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ph - y(m.a)).toFixed(1) + '" rx="4" fill="#4E38B2"' + op + '><title>' + esc(m.rot + ' · ' + (o.rotA || '') + ' ' + (o.fmt ? o.fmt(m.a) : brl(m.a))) + '</title></rect>');
        s.push('<rect x="' + (cx + 1.5).toFixed(1) + '" y="' + y(m.b).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ph - y(m.b)).toFixed(1) + '" rx="4" fill="#E0A458"' + op + '><title>' + esc(m.rot + ' · ' + (o.rotB || '') + ' ' + (o.fmt ? o.fmt(m.b) : brl(m.b))) + '</title></rect>');
        if (o.linha) pts.push({ x: cx, y: y((m.a || 0) - (m.b || 0)), prev: m.prev, atual: m.atual, v: (m.a || 0) - (m.b || 0) });
      } else {
        s.push('<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y(m.a).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ph - y(m.a)).toFixed(1) + '" rx="5" fill="' + (m.atual ? '#4E38B2' : '#8B7BE0') + '"' + op + '><title>' + esc(m.rot + ' · ' + (o.fmt ? o.fmt(m.a) : m.a)) + '</title></rect>');
        if (m.atual) s.push('<text x="' + cx.toFixed(1) + '" y="' + (y(m.a) - 6).toFixed(1) + '" text-anchor="middle" class="pnl-g-res">' + (o.fmt ? o.fmt(m.a) : k(m.a)) + '</text>');
      }
    });
    for (var i = 1; i < pts.length; i++) s.push('<line x1="' + pts[i - 1].x.toFixed(1) + '" y1="' + pts[i - 1].y.toFixed(1) + '" x2="' + pts[i].x.toFixed(1) + '" y2="' + pts[i].y.toFixed(1) + '" stroke="#15803D" stroke-width="2.5"' + (pts[i].prev ? ' stroke-dasharray="5 4"' : '') + '/>');
    pts.forEach(function (p) { s.push('<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (p.atual ? 4.5 : 3) + '" fill="' + (p.prev ? '#fff' : '#15803D') + '" stroke="#15803D" stroke-width="2"/>'); });
    return '<div class="pnl-g-rolar"><svg class="pnl-g" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.rotulo || 'Gráfico por mês') + '">' + s.join('') + '</svg></div>';
  }
  function escala(max) {
    max = Math.max(Number(max) || 0, 1);
    var bruto = max * 1.08, pot = Math.pow(10, Math.floor(Math.log10(bruto))), passos = [1.2, 1.5, 1.8, 2.4, 3, 4.5, 6, 7.5, 9, 12];
    for (var i = 0; i < passos.length; i++) { if (passos[i] * pot >= bruto - 1e-9) return Math.round(passos[i] * pot * 1000) / 1000; }
    return pot * 12;
  }
  function legenda(l) { return '<div class="pnl-leg">' + l.map(function (x) { return '<span><i style="' + x[0] + '"></i>' + esc(x[1]) + '</span>'; }).join('') + '</div>'; }
  // lista [{rot, valor}] já ordenada
  function rosca(lista, centro, rotCentro, fmt) {
    fmt = fmt || curto;
    var tot = lista.reduce(function (a, x) { return a + x.valor; }, 0), tam = 150, r = tam / 2 - 14, C = 2 * Math.PI * r, off = 0, s = [];
    lista.forEach(function (f, i) {
      var d = tot ? C * f.valor / tot : 0;
      s.push('<circle cx="75" cy="75" r="' + r.toFixed(1) + '" fill="none" stroke="' + (f.cor || PAL[i % PAL.length]) + '" stroke-width="22" stroke-dasharray="' + Math.max(d - 2, 0.5).toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-off).toFixed(1) + '" transform="rotate(-90 75 75)"/>');
      off += d;
    });
    return '<div class="pnl-rosca" role="img" aria-label="' + esc(lista.map(function (f) { return f.rot + ' ' + Math.round(pct(f.valor, tot)) + '%'; }).join(', ')) + '"><svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">' + (tot ? s.join('') : '<circle cx="75" cy="75" r="' + r.toFixed(1) + '" fill="none" stroke="#EFEBF7" stroke-width="22"/>') + '</svg><div><b>' + centro + '</b><span>' + esc(rotCentro) + '</span></div></div>' +
      '<div class="pnl-lista">' + lista.map(function (f, i) { return '<div><i style="background:' + (f.cor || PAL[i % PAL.length]) + '"></i><span>' + esc(f.rot) + '</span><b class="pnl-mono">' + fmt(f.valor) + '</b><small>' + Math.round(pct(f.valor, tot)) + '%</small></div>'; }).join('') + '</div>';
  }
  // lista [{rot, sub, valor, cor, txt}]
  function barrasH(lista, fmt) {
    fmt = fmt || curto;
    var mx = Math.max.apply(null, lista.map(function (x) { return Math.abs(x.valor); }).concat([1]));
    return '<div class="pnl-bh">' + lista.map(function (x) {
      return '<div><span>' + esc(x.rot) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span><div class="pnl-bh-t" aria-hidden="true"><i style="width:' + Math.max(x.valor ? 2 : 0, Math.abs(x.valor) / mx * 100).toFixed(1) + '%;background:' + (x.cor || '#4E38B2') + '"></i></div><b class="pnl-mono">' + (x.txt != null ? esc(x.txt) : fmt(x.valor)) + '</b></div>';
    }).join('') + '</div>';
  }
  function sparkline(v) {
    if (!v || v.length < 2) return '';
    var W = 300, H = 44, mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), sp = mx - mn || 1;
    var p = v.map(function (x, i) { return (i / (v.length - 1) * (W - 8) + 4).toFixed(1) + ',' + (H - 6 - (x - mn) / sp * (H - 12)).toFixed(1); });
    var u = p[p.length - 1].split(',');
    return '<svg class="pnl-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + p.join(' ') + '" fill="none" stroke="#4ADE80" stroke-width="2" stroke-linejoin="round"/><circle cx="' + u[0] + '" cy="' + u[1] + '" r="3.5" fill="#4ADE80"/></svg>';
  }
  // p: {titulo, sub, sigla, spark:[], tiles:[[rot,val,cor,extra]]}
  function pulso(p) {
    return '<section class="pnl-pulso" aria-label="' + esc(p.titulo) + '"><div class="pnl-pulso-cab"><span>' + esc(p.sigla || p.titulo.slice(0, 2)) + '</span><div><b>' + esc(p.titulo) + '</b><small>' + esc(p.sub || '') + '</small></div></div>' +
      sparkline(p.spark) +
      '<div class="pnl-tiles">' + p.tiles.map(function (t) { return '<div><span>' + esc(t[0]) + '</span><b class="pnl-mono"' + (t[2] ? ' style="color:' + t[2] + '"' : '') + '>' + t[1] + '</b>' + (t[3] ? '<small>' + esc(t[3]) + '</small>' : '') + '</div>'; }).join('') + '</div></section>';
  }
  function bloco(titulo, extra, corpo, nota) {
    return '<section class="pnl-bloco"><div class="pnl-bloco-cab"><h3>' + esc(titulo) + '</h3>' + (extra || '') + '</div>' + corpo + (nota ? '<span class="pnl-nota">' + esc(nota) + '</span>' : '') + '</section>';
  }
  function vazio(t) { return '<p class="pnl-vazio">' + esc(t) + '</p>'; }
  // monta o painel: {hero, cartoes, grafico:{titulo,extra,corpo}, pulso, blocos:[html]}
  function montar(p) {
    return (p.hero ? hero(p.hero) : '') + cartoes(p.cartoes) +
      (p.grafico || p.pulso ? '<div class="pnl-g2">' + (p.grafico ? bloco(p.grafico.titulo, p.grafico.extra, p.grafico.corpo, p.grafico.nota) : '') + (p.pulso ? pulso(p.pulso) : '') + '</div>' : '') +
      (p.blocos && p.blocos.length ? '<div class="pnl-g3" style="grid-template-columns:repeat(' + Math.min(3, p.blocos.length) + ',minmax(0,1fr))">' + p.blocos.join('') + '</div>' : '');
  }

  // id do módulo a partir do id ou do nome ("MB — Móveis Brasília", "Rádio Interna"…)
  function idModulo(x) {
    var mods = ler('MODULES', []) || [], n = String(x || '').split('—')[0].trim().toLowerCase();
    var m = mods.filter(function (mm) { return mm.id === x || String(mm.label).toLowerCase() === String(x).toLowerCase() || String(mm.label).split('—')[0].trim().toLowerCase() === n; })[0];
    return m ? m.id : '';
  }
  function clique(ev) {
    var b = ev.target.closest && ev.target.closest('[data-pnl-ir]');
    if (!b) return;
    var v = b.getAttribute('data-pnl-ir');
    if (v.indexOf('mod:') === 0) { var id = v.slice(4); if (typeof global.drillMod === 'function') { global.drillMod(id); global.scrollTo(0, 0); } }
    else if (v === 'fat' && typeof global.fatAbrirFaturamento === 'function') global.fatAbrirFaturamento();
  }

  // ── adaptadores por área ─────────────────────────────────────────────────
  var AREAS = {};

  // Funil de vendas
  AREAS.leads = function () {
    var L = ler('leads', []) || [], ST = ler('LEAD_STAGES', []) || [], H = hoje();
    if (!L.length) return null;
    var vencido = function (l) { try { return !!global.leadLembreteVencido(l); } catch (e) { return false; } };
    var abertos = L.filter(function (l) { return l.estagio !== 'fechado' && l.estagio !== 'perdido'; });
    var neg = L.filter(function (l) { return l.estagio === 'negociando'; });
    var fech = L.filter(function (l) { return l.estagio === 'fechado'; }), perd = L.filter(function (l) { return l.estagio === 'perdido'; });
    var valNeg = neg.reduce(function (a, l) { return a + (Number(l.valor) || 0); }, 0);
    var valAb = abertos.reduce(function (a, l) { return a + (Number(l.valor) || 0); }, 0);
    var atras = abertos.filter(vencido);
    var conv = pct(fech.length, fech.length + perd.length);
    var doMes = L.filter(function (l) { return mesDe(l.criado) === H.ref; });
    var fechMes = fech.filter(function (l) { return mesDe(l.fechadoEm || l.atualizado || l.criado) === H.ref; });
    var ticket = fech.length ? fech.reduce(function (a, l) { return a + (Number(l.valor) || 0); }, 0) / fech.length : 0;
    var serie = []; for (var i = 5; i >= 0; i--) { var d = new Date(H.ano, H.mes - i, 1), kk = chave(d); serie.push({ rot: MES_C[d.getMonth()], a: L.filter(function (l) { return mesDe(l.criado) === kk; }).length, b: L.filter(function (l) { return l.estagio === 'fechado' && mesDe(l.criado) === kk; }).length, atual: i === 0 }); }
    var cores = { novo: '#4E38B2', contatado: '#B45309', negociando: '#2A1760', fechado: '#15803D', perdido: '#B42318' };
    var etapas = ST.map(function (s) {
      var ls = L.filter(function (l) { return l.estagio === s.id; }), v = ls.reduce(function (a, l) { return a + (Number(l.valor) || 0); }, 0);
      var at = ls.filter(vencido).length;
      return { titulo: String(s.label).replace(/\s*[✅❌]/g, ''), valor: String(ls.length), sub: (v ? curto(v) + '/mês' : 'sem valor') + (at ? ' · ' + at + ' atrasado' + (at > 1 ? 's' : '') : ''), chip: at ? ['retorno atrasado', 'erro'] : null, tom: s.id === 'fechado' ? 'saudavel' : s.id === 'perdido' ? 'critico' : at ? 'atencao' : 'neutro', barra: [pct(ls.length, L.length), cores[s.id] || '#4E38B2'] };
    });
    var porProd = {}; abertos.forEach(function (l) { var p = l.produto || 'outro'; porProd[p] = (porProd[p] || 0) + 1; });
    var NOME_P = { radio: 'Rádio', tv: 'TV Interna', condo: 'Condomínio', elev: 'Tela Vertical', vaapty: 'Vaapty', mb: 'MB' };
    var prod = Object.keys(porProd).map(function (p) { return { rot: NOME_P[p] || cap(p), valor: porProd[p] }; }).sort(function (a, b) { return b.valor - a.valor; });
    var porResp = {}; abertos.forEach(function (l) { var r = l.responsavel || 'Sem responsável'; porResp[r] = porResp[r] || { n: 0, v: 0 }; porResp[r].n++; porResp[r].v += Number(l.valor) || 0; });
    var resp = Object.keys(porResp).map(function (r) { return { rot: r, valor: porResp[r].v, sub: porResp[r].n + ' em aberto' }; }).sort(function (a, b) { return b.valor - a.valor; }).slice(0, 6);
    return {
      hero: { chip: 'Funil de vendas · ' + MESES_N[H.mes], titulo: 'Em negociação', valor: 'R$ ' + brl(valNeg) + '<small>/mês</small>', frase: neg.length + (neg.length === 1 ? ' negócio em negociação · ' : ' negócios em negociação · ') + abertos.length + ' em aberto somam R$ ' + brl(valAb) + '/mês.',
        nums: [['leads novos no mês', String(doMes.length)], ['fechados', String(fech.length), 'ticket ' + curto(ticket)], ['retornos atrasados', String(atras.length)], ['perdidos', String(perd.length)]],
        anel: [conv, 'conversão'] },
      cartoes: etapas,
      grafico: { titulo: 'Leads por mês', extra: '<span class="pnl-sub">últimos 6 meses</span>', corpo: barras(serie, { rotA: 'leads', rotB: 'fechados', fmt: function (v) { return Math.round(v); }, rotulo: 'Leads novos e fechados por mês' }) + legenda([['background:#4E38B2', 'leads novos'], ['background:#E0A458', 'viraram cliente']]) },
      pulso: { titulo: 'Pulso do funil', sub: 'leads novos nos últimos 6 meses', sigla: 'FN', spark: serie.map(function (m) { return m.a; }),
        tiles: [['CONVERSÃO', Math.round(conv) + '%', '#4ADE80', 'fechados ÷ decididos'], ['EM ABERTO', String(abertos.length), '#FFFFFF', curto(valAb) + '/mês'], ['ATRASADOS', String(atras.length), atras.length ? '#FCA5A5' : '#FFFFFF', 'retornos vencidos'], ['TICKET MÉDIO', curto(ticket), '#C9BEFA', 'dos fechados'], ['NO MÊS', String(doMes.length), DEST, 'leads novos'], ['FECHADOS NO MÊS', String(fechMes.length), '#4ADE80', 'contratos']] },
      blocos: [
        bloco('Em aberto por produto', chip(abertos.length + ' leads', 'acao'), prod.length ? rosca(prod, String(abertos.length), 'em aberto', function (v) { return String(v); }) : vazio('Nenhum lead em aberto.')),
        bloco('Por responsável', '<span class="pnl-sub">valor em aberto</span>', resp.length ? barrasH(resp, function (v) { return curto(v); }) : vazio('Nenhum lead em aberto.')),
        bloco('Retornos atrasados', atras.length ? chip(String(atras.length), 'erro') : chip('em dia', 'ok'), atras.length ? '<div class="pnl-itens">' + atras.slice(0, 6).map(function (l) { return '<div><i style="background:#B42318"></i><span>' + esc(l.nome) + '<small>' + esc((l.responsavel || '') + (l.lembrete ? ' · era ' + String(l.lembrete).slice(8, 10) + '/' + String(l.lembrete).slice(5, 7) : '')) + '</small></span></div>'; }).join('') + '</div>' : vazio('Nenhum retorno atrasado.'))
      ]
    };
  };

  // Clientes (só na lista; a ficha já tem os números do cliente)
  AREAS.clientes = function () {
    if (global.MGBClientes && global.MGBClientes.fichaAberta && global.MGBClientes.fichaAberta()) return null;
    var D = global.MGBClientes && global.MGBClientes.dados ? global.MGBClientes.dados() : [];
    if (!D.length) return null;
    var ativos = D.filter(function (c) { return c.pagaPorMes > 0; });
    var mensal = ativos.reduce(function (a, c) { return a + c.pagaPorMes; }, 0);
    var venc = D.filter(function (c) { return c.vencidos; }), emAb = venc.reduce(function (a, c) { return a + c.emAberto; }, 0);
    var top = ativos.slice().sort(function (a, b) { return b.pagaPorMes - a.pagaPorMes; });
    var conc = pct(top.slice(0, 5).reduce(function (a, c) { return a + c.pagaPorMes; }, 0), mensal);
    var porMod = {}; ativos.forEach(function (c) { (c.contratos || []).forEach(function (ct) { var id = ct.mod || ct.modRot || 'outros'; porMod[id] = porMod[id] || { rot: ct.modRot || 'Outros', valor: 0, n: 0 }; porMod[id].valor += ct.doMes || 0; if (ct.doMes) porMod[id].n++; }); });
    var mods = Object.keys(porMod).map(function (id) { return { id: id, rot: porMod[id].rot, valor: porMod[id].valor, n: porMod[id].n }; }).filter(function (x) { return x.valor > 0; }).sort(function (a, b) { return b.valor - a.valor; });
    var ticket = ativos.length ? mensal / ativos.length : 0;
    return {
      hero: { chip: 'Carteira de clientes', titulo: 'Carteira', valor: 'R$ ' + brl(mensal) + '<small>/mês</small>', frase: ativos.length + ' clientes pagando este mês' + (venc.length ? ' · ' + venc.length + ' com boleto vencido' : ' · ninguém com boleto vencido') + '.',
        nums: [['clientes ativos', String(ativos.length)], ['valor médio por cliente', curto(ticket)], ['em aberto vencido', curto(emAb)], ['cadastrados', String(D.length)]],
        anel: [pct(ativos.length - venc.length, ativos.length), 'em dia'] },
      cartoes: mods.slice(0, 6).map(function (m) { return { titulo: m.rot, valor: curto(m.valor), sub: Math.round(pct(m.valor, mensal)) + '% da carteira · ' + m.n + (m.n === 1 ? ' cliente' : ' clientes'), tom: 'neutro', barra: [pct(m.valor, mods[0].valor), '#4E38B2'], ir: idModulo(m.id) ? 'mod:' + idModulo(m.id) : '' }; }),
      blocos: [
        bloco('Maiores clientes', '<span class="pnl-sub">por mês</span>', barrasH(top.slice(0, 7).map(function (c) { return { rot: c.nome, valor: c.pagaPorMes, cor: c.vencidos ? '#B42318' : '#4E38B2' }; }))),
        bloco('Concentração', chip(Math.round(conc) + '% nos 5 maiores', conc > 60 ? 'atencao' : 'ok'), rosca(top.slice(0, 5).map(function (c) { return { rot: c.nome, valor: c.pagaPorMes }; }).concat(top.length > 5 ? [{ rot: 'Demais ' + (top.length - 5), valor: top.slice(5).reduce(function (a, c) { return a + c.pagaPorMes; }, 0), cor: '#E4DFF0' }] : []), curto(mensal), 'por mês')),
        bloco('Boletos vencidos', venc.length ? chip(String(venc.length), 'erro') : chip('nenhum', 'ok'), venc.length ? '<div class="pnl-itens">' + venc.slice(0, 6).map(function (c) { return '<div><i style="background:#B42318"></i><span>' + esc(c.nome) + '<small>' + c.vencidos + (c.vencidos > 1 ? ' boletos' : ' boleto') + '</small></span><b class="pnl-mono">' + curto(c.emAberto) + '</b></div>'; }).join('') + '</div>' : vazio('Todos em dia.'))
      ]
    };
  };

  // Operação: Tela Vertical / Contratos / Estúdio
  function painelTelaVertical() {
    var H = hoje(), resumo = function (a, m) { return tenta('elevMesResumo', a, m) || { rec: 0, desp: 0, resultado: 0, excedente: 0 }; };
    var r = resumo(H.ano, H.mes), inv = tenta('elevInvestTotais') || { total: 0, eder: 0, jadson: 0 };
    var condos = tenta('tvRedeHub') || [], telas = tenta('tvTelasAtivas') || 0;
    var anun = (ler('anunciantes', []) || []).filter(function (a) { if (!a.inicio || !a.valor) return false; var i = mesDe(a.inicio), n = Number(a.meses) || 1; return i != null && H.ref >= i && H.ref < i + n; });
    var hist = tenta('elevExcedenteHistorico') || [], acum = hist.reduce(function (a, x) { return a + (x.excedente || 0); }, 0);
    var serie = MES_C.map(function (rot, m) { var x = resumo(H.ano, m); return { rot: rot, a: x.rec, b: x.desp, atual: m === H.mes, prev: m > H.mes }; });
    var meta = (ler('ELEV_TELAS_QTD', 0) || 0) * (ler('ELEV_INVEST_POR_TELA', 0) || 0);
    var cartoesA = anun.slice().sort(function (a, b) { return b.valor - a.valor; }).slice(0, 6).map(function (a) {
      var fim = mesDe(a.inicio) + (Number(a.meses) || 1) - 1, faltam = fim - H.ref;
      return { titulo: a.nome, valor: curto(a.valor), sub: (faltam <= 0 ? 'termina este mês' : 'faltam ' + faltam + (faltam === 1 ? ' mês' : ' meses')) + ' · ' + (a.telas ? (Array.isArray(a.telas) ? a.telas.length : a.telas) + ' telas' : 'todas as telas'), chip: faltam <= 1 ? ['renovar', 'atencao'] : ['no ar', 'ok'], tom: faltam <= 1 ? 'atencao' : 'saudavel', barra: [pct((Number(a.meses) || 1) - faltam, Number(a.meses) || 1), faltam <= 1 ? '#B45309' : '#15803D'] };
    });
    return {
      hero: { chip: 'Tela Vertical · ' + MESES_N[H.mes], titulo: r.resultado >= 0 ? 'Resultado' : 'Prejuízo', valor: (r.resultado < 0 ? '−' : '') + 'R$ ' + brl(Math.abs(r.resultado)), cor: r.resultado >= 0 ? DEST : '#FCA5A5', frase: 'Receita R$ ' + brl(r.rec) + ' · despesas R$ ' + brl(r.desp) + ' · ' + condos.length + ' condomínios e ' + telas + ' telas.',
        nums: [['anunciantes ativos', String(anun.length)], ['excedente acumulado', curto(acum), 'custo do Eder'], ['investido', curto(inv.total), meta ? 'meta ' + curto(meta) : ''], ['telas no ar', String(telas)]],
        anel: [pct(inv.total, meta || inv.total || 1), meta ? 'do investimento' : 'investido'] },
      cartoes: cartoesA,
      grafico: { titulo: 'Receita e despesa mês a mês', extra: '<span class="pnl-sub">' + H.ano + '</span>', corpo: barras(serie, { linha: true, rotA: 'receita', rotB: 'despesa', rotulo: 'Tela Vertical: receita e despesa por mês' }) + legenda([['background:#4E38B2', 'receita'], ['background:#E0A458', 'despesa'], ['height:0;border-top:2.5px solid #15803D;width:16px;border-radius:0', 'resultado']]) },
      pulso: { titulo: 'Pulso da Tela Vertical', sub: 'resultado mês a mês', sigla: 'TV', spark: serie.filter(function (m) { return !m.prev; }).map(function (m) { return m.a - m.b; }),
        tiles: [['RECEITA', curto(r.rec), '#4ADE80', 'no mês'], ['DESPESAS', curto(r.desp), '#FFFFFF', 'licenças e rateios'], ['CONDOMÍNIOS', String(condos.length), DEST, telas + ' telas'], ['ANUNCIANTES', String(anun.length), '#C9BEFA', 'ativos no mês'], ['EDER', curto(inv.eder), '#FFFFFF', 'investido'], ['JADSON', curto(inv.jadson), '#FFFFFF', 'investido']] },
      blocos: []
    };
  }
  function painelContratos() {
    var H = hoje(), L = tenta('contratosLista') || [];
    if (!L.length) return null;
    var noAr = L.filter(function (c) { return c.fimKey != null && c.fimKey >= H.ref && (c.iniKey == null || c.iniKey <= H.ref); });
    var mensal = noAr.reduce(function (a, c) { return a + (Number(c.valor) || 0); }, 0);
    var ren = noAr.filter(function (c) { return c.fimKey < H.ref + 3 && !(c.meses >= 120); }).sort(function (a, b) { return a.fimKey - b.fimKey; });
    var renV = ren.reduce(function (a, c) { return a + (Number(c.valor) || 0); }, 0);
    var enc = L.filter(function (c) { return c.fimKey != null && c.fimKey < H.ref; });
    var porOr = {}; noAr.forEach(function (c) { var o = String(c.origem || 'Outros').split('—')[0].trim(); porOr[o] = porOr[o] || { n: 0, v: 0 }; porOr[o].n++; porOr[o].v += Number(c.valor) || 0; });
    var ors = Object.keys(porOr).map(function (o) { return { rot: o, valor: porOr[o].v, n: porOr[o].n }; }).sort(function (a, b) { return b.valor - a.valor; });
    var semFim = noAr.filter(function (c) { return c.meses >= 120; }).length;
    var rotM = function (kk) { return MES_C[kk % 12] + '/' + String(Math.floor(kk / 12)).slice(2); };
    return {
      hero: { chip: 'Contratos no ar · ' + MESES_N[H.mes], titulo: 'Contratos somam', valor: 'R$ ' + brl(mensal) + '<small>/mês</small>', frase: noAr.length + ' contratos no ar' + (ren.length ? ' · ' + ren.length + ' vencem nos próximos 90 dias (R$ ' + brl(renV) + '/mês a defender).' : ' · nenhum vence nos próximos 90 dias.'),
        nums: [['no ar', String(noAr.length)], ['vencem em 90 dias', String(ren.length), curto(renV) + '/mês'], ['sem data para acabar', String(semFim)], ['encerrados', String(enc.length)]],
        anel: [pct(mensal - renV, mensal), 'garantido 90 dias'] },
      cartoes: ors.slice(0, 6).map(function (o) { var id = idModulo(o.rot); return { titulo: o.rot, valor: curto(o.valor), sub: o.n + (o.n === 1 ? ' contrato' : ' contratos') + ' · ' + Math.round(pct(o.valor, mensal)) + '%', tom: 'neutro', barra: [pct(o.valor, ors[0].valor), '#4E38B2'], ir: id ? 'mod:' + id : '' }; }),
      blocos: [
        bloco('Valor por área', '', rosca(ors, curto(mensal), 'por mês')),
        bloco('Renovações 90 dias', ren.length ? chip(ren.length + ' contratos', 'atencao') : chip('nenhuma', 'ok'), ren.length ? '<div class="pnl-itens">' + ren.slice(0, 7).map(function (c) { return '<div><i style="background:' + (c.fimKey === H.ref ? '#B42318' : '#B45309') + '"></i><span>' + esc(c.nome) + '<small>vence ' + rotM(c.fimKey) + '</small></span><b class="pnl-mono">' + curto(c.valor) + '</b></div>'; }).join('') + '</div>' : vazio('Nenhum contrato vence nos próximos 90 dias.')),
        bloco('Maiores contratos', '<span class="pnl-sub">por mês</span>', barrasH(noAr.slice().sort(function (a, b) { return b.valor - a.valor; }).slice(0, 7).map(function (c) { return { rot: c.nome, sub: String(c.origem || '').split('—')[0].trim(), valor: Number(c.valor) || 0 }; })))
      ]
    };
  }
  function painelEstudio() {
    var mods = ler('MODULES', []) || [], H = hoje();
    var radio = mods.filter(function (m) { return m.id === 'radio' || m.id === 'mb' || m.id === 'tv'; });
    var cli = radio.map(function (m) { var at = (m.items || []).filter(function (i) { return (tenta('recOfMes', m.id, i, H.ano, H.mes) || 0) > 0; }).length; return { rot: String(m.label).split('—')[0].trim(), valor: at, sub: (m.items || []).length + ' cadastrados' }; });
    var blocos = 0, grade = 0; try { var d = JSON.parse(global.localStorage.getItem('mgb_blocos_v4') || '{}') || {}; blocos = Object.keys(d).length; Object.keys(d).forEach(function (kk) { var v = d[kk]; if (v && typeof v === 'object') grade += Object.keys(v).length; }); } catch (e) {}
    var tot = cli.reduce(function (a, x) { return a + x.valor; }, 0);
    return {
      hero: { chip: 'Estúdio · ' + MESES_N[H.mes], titulo: 'Clientes no ar', valor: String(tot), frase: 'Rádio Interna, MB e TV Interna com receita neste mês · grade de blocos com ' + blocos + ' blocos salvos.',
        nums: cli.map(function (x) { return [x.rot, String(x.valor), x.sub]; }).concat([['blocos na grade', String(blocos)]]) },
      cartoes: cli.map(function (x) { return { titulo: x.rot, valor: String(x.valor), sub: 'com receita no mês · ' + x.sub, tom: x.valor ? 'saudavel' : 'neutro', barra: [pct(x.valor, Math.max.apply(null, cli.map(function (y) { return y.valor; }).concat([1]))), '#4E38B2'] }; }),
      blocos: []
    };
  }
  AREAS.operacional = function () {
    var g = ler('curOpGroup', 'contratos');
    if (g === 'telavertical') return painelTelaVertical();
    if (g === 'estudio') return painelEstudio();
    return painelContratos();
  };

  // Contabilidade: recibos, notas, Léo, faturamento
  AREAS.contabilidade = function () {
    var H = hoje(), comp = H.ano + '-' + String(H.mes + 1).padStart(2, '0');
    var notas = (ler('notas', []) || []).filter(function (n) { return mesDe(n.data) === H.ref && n.ambiente !== 'sandbox'; });
    var nVal = notas.reduce(function (a, n) { return a + (Number(n.valor) || 0); }, 0);
    var rec = (ler('recibos', []) || []).filter(function (r) { return r.ts && chave(new Date(r.ts)) === H.ref; });
    var rVal = rec.reduce(function (a, r) { return a + (Number(r.valor) || 0); }, 0);
    var leo = ler('leoUnidades', []) || [], leoOk = leo.filter(function (u) { return u.status === 'emitida' || u.status === 'enviada'; }).length;
    var fat = ler('fatEmissoes', {}) || {}, fk = Object.keys(fat).filter(function (kk) { return kk.split('|')[1] === comp; });
    var nFat = ((ler('fatLinhas', []) || []).filter(function (r) { return !r.soLeo; })).length; // 27/11: era "0/0" com 15 clientes na lista
    var fOk = fk.filter(function (kk) { return /emitid|autoriz|pago|enviad|aguardando|boleto/i.test(fat[kk].status || ''); }).length, fErr = fk.filter(function (kk) { return /erro/i.test(fat[kk].status || ''); }).length;
    var recMes = tenta('finGetRec', H.ano, H.mes) || 0, fech = 0; try { fech = global.mesFechamentoNotas(comp).total || 0; } catch (e) {}
    var porSt = {}; notas.forEach(function (n) { var s = /autoriz|issued|emitid/i.test(n.status || '') ? 'Autorizada' : /erro|error|cancel/i.test(n.status || '') ? 'Com problema' : 'Processando'; porSt[s] = (porSt[s] || 0) + 1; });
    var COR_ST = { 'Autorizada': '#15803D', 'Processando': '#E0A458', 'Com problema': '#B42318' };
    return {
      hero: { chip: 'Contabilidade · ' + MESES_N[H.mes], titulo: 'Notas do mês', valor: 'R$ ' + brl(fech || nVal), frase: 'Notas fiscais com competência de ' + MESES_N[H.mes] + ' frente a uma receita de R$ ' + brl(recMes) + '.',
        nums: [['notas avulsas', String(notas.length), curto(nVal)], ['Faturamento', fOk + ' de ' + Math.max(fk.length, nFat), fErr ? fErr + ' com erro' : 'sem erro'], ['Léo', leoOk + ' de ' + leo.length, 'notas'], ['recibos', String(rec.length), curto(rVal)]],
        anel: [pct(fech || nVal, recMes), 'em notas'] },
      cartoes: [
        { titulo: 'Faturamento do dia 5', valor: fOk + ' de ' + Math.max(fk.length, nFat), sub: 'clientes emitidos · abrir a lista', ir: 'fat', chip: fErr ? [fErr + ' com erro', 'erro'] : null, tom: fErr ? 'critico' : fk.length && fOk === fk.length ? 'saudavel' : 'atencao', barra: [pct(fOk, fk.length), '#15803D'] },
        { titulo: 'Léo Cosméticos', valor: leoOk + '/' + leo.length, sub: 'unidades com nota', tom: leo.length && leoOk === leo.length ? 'saudavel' : 'atencao', barra: [pct(leoOk, leo.length), '#4E38B2'] },
        { titulo: 'Notas avulsas', valor: String(notas.length), sub: 'R$ ' + brl(nVal), tom: 'neutro' },
        { titulo: 'Recibos', valor: String(rec.length), sub: 'R$ ' + brl(rVal), tom: 'neutro' }
      ],
      blocos: [
        bloco('Notas avulsas por situação', '', notas.length ? rosca(Object.keys(porSt).map(function (s2) { return { rot: s2, valor: porSt[s2], cor: COR_ST[s2] }; }), String(notas.length), 'notas', function (v) { return String(v); }) : vazio('Nenhuma nota avulsa neste mês.')),
        bloco('Últimas notas', '', notas.length ? '<div class="pnl-itens">' + notas.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, 6).map(function (n) { return '<div><i style="background:' + (COR_ST[/autoriz|issued|emitid/i.test(n.status || '') ? 'Autorizada' : /erro|error|cancel/i.test(n.status || '') ? 'Com problema' : 'Processando']) + '"></i><span>' + esc(n.cliente || n.tomador) + '<small>' + esc(String(n.data || '').slice(8, 10) + '/' + String(n.data || '').slice(5, 7)) + '</small></span><b class="pnl-mono">' + curto(n.valor) + '</b></div>'; }).join('') + '</div>' : vazio('Nenhuma nota avulsa neste mês.')),
        bloco('Últimos recibos', '', rec.length ? '<div class="pnl-itens">' + rec.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, 6).map(function (r) { return '<div><i style="background:#4E38B2"></i><span>' + esc(r.cliente) + '<small>nº ' + esc(r.numero || '') + '</small></span><b class="pnl-mono">' + curto(r.valor) + '</b></div>'; }).join('') + '</div>' : vazio('Nenhum recibo neste mês.'))
      ]
    };
  };

  // Cobrança mensal (relatórios de repasse)
  AREAS.relatorios = function () {
    var H = hoje(), mods = ler('MODULES', []) || [];
    var linhas = mods.filter(function (m) { return m.id !== 'taroba'; }).map(function (m) { return { id: m.id, rot: String(m.label).split('—')[0].trim(), valor: tenta('recModMes', m.id, H.ano, H.mes) || 0, n: (m.items || []).filter(function (i) { return (tenta('recOfMes', m.id, i, H.ano, H.mes) || 0) > 0; }).length }; }).filter(function (x) { return x.valor > 0; }).sort(function (a, b) { return b.valor - a.valor; });
    var cli = tenta('coletaClientesMes', H.ano, H.mes) || [], prev = cli.reduce(function (a, l) { return a + (l.valor || 0); }, 0), pago = cli.filter(function (l) { return l.pago; }).reduce(function (a, l) { return a + l.valor; }, 0);
    var venc = cli.filter(function (l) { return !l.pago && l.asaas && l.asaas.st === 'vencido'; });
    return {
      hero: { chip: 'Repasses e relatórios · ' + MESES_N[H.mes], titulo: 'Recebido', valor: 'R$ ' + brl(pago), frase: 'de R$ ' + brl(prev) + ' cobrados de ' + cli.length + ' clientes neste mês.',
        nums: [['a receber', curto(prev - pago)], ['vencidos', String(venc.length), curto(venc.reduce(function (a, l) { return a + l.valor; }, 0))], ['clientes', String(cli.length)]],
        anel: [pct(pago, prev), 'recebido'] },
      cartoes: linhas.slice(0, 6).map(function (x) { return { titulo: x.rot, valor: curto(x.valor), sub: x.n + ' clientes com receita', tom: 'neutro', barra: [pct(x.valor, linhas[0].valor), '#4E38B2'], ir: 'mod:' + x.id }; }),
      blocos: []
    };
  };

  // Ferramentas: saúde do hub
  AREAS.ferramentas = function () {
    var ult = null; try { ult = global.localStorage.getItem('mgb_ultimo_backup'); } catch (e) {}
    var dias = ult ? Math.floor((Date.now() - new Date(ult).getTime()) / 86400000) : null;
    var est = 0; try { est = Math.round(JSON.stringify(global.localStorage).length / 1024); } catch (e) {}
    var mods = ler('MODULES', []) || [], itens = mods.reduce(function (a, m) { return a + (m.items || []).length; }, 0);
    var L = (ler('leads', []) || []).length, N = (ler('notas', []) || []).length, R = (ler('recibos', []) || []).length;
    return {
      hero: { chip: 'Ferramentas · saúde do hub', titulo: 'Último backup', valor: dias == null ? 'nunca' : dias === 0 ? 'hoje' : 'há ' + dias + (dias === 1 ? ' dia' : ' dias'), cor: dias == null || dias > 7 ? '#FCA5A5' : DEST, frase: 'Recomendado: baixar um backup por semana, ou antes de mexer em algo grande.',
        nums: [['clientes e unidades', String(itens)], ['leads', String(L)], ['notas', String(N)], ['recibos', String(R)]] },
      cartoes: [
        { titulo: 'Backup', valor: dias == null ? '—' : dias + 'd', sub: dias == null ? 'nenhum backup baixado neste computador' : 'desde o último', tom: dias == null || dias > 7 ? 'critico' : dias > 3 ? 'atencao' : 'saudavel', chip: dias == null || dias > 7 ? ['baixar agora', 'erro'] : ['em dia', 'ok'] },
        { titulo: 'Dados neste navegador', valor: est + ' KB', sub: 'cópia local do hub', tom: 'neutro' },
        { titulo: 'Módulos', valor: String(mods.length), sub: itens + ' clientes/unidades', tom: 'neutro' }
      ],
      blocos: []
    };
  };

  // ── Cartões de seção no lugar das abas (Tela Vertical, Contratos, Estúdio — 27/11) ──
  function ico(nome) {
    var I = (global.MGBTelas2 && global.MGBTelas2.icones) || {};
    if (nome === 'proximo') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[nome] || I.documento || '') + '</svg>';
  }
  function secoesDoGrupo(g) {
    var H = hoje();
    if (g === 'telavertical') {
      var r = tenta('elevMesResumo', H.ano, H.mes) || { resultado: 0, rec: 0, desp: 0 }, condos = tenta('tvRedeHub') || [], telas = tenta('tvTelasAtivas') || 0;
      var inv = tenta('elevInvestTotais') || { total: 0 }, meta = (ler('ELEV_TELAS_QTD', 0) || 0) * (ler('ELEV_INVEST_POR_TELA', 0) || 0);
      var an = (ler('anunciantes', []) || []).filter(function (a) { if (!a.inicio || !a.valor) return false; var i = mesDe(a.inicio), n = Number(a.meses) || 1; return i != null && H.ref >= i && H.ref < i + n; });
      var anV = an.reduce(function (a, x) { return a + (Number(x.valor) || 0); }, 0);
      var renovar = an.filter(function (a) { return mesDe(a.inicio) + (Number(a.meses) || 1) - 1 - H.ref <= 1; }).length;
      return [
        { grupo: 'Gestão da rede', tab: 'tvpainel', ico: 'financeiro', nome: 'Mês e sócio', fato: (r.resultado < 0 ? '−' : '') + 'R$ ' + curto(Math.abs(r.resultado)), sub: 'resultado de ' + MESES_N[H.mes], tom: r.resultado < 0 ? 'erro' : 'ok' },
        { grupo: 'Gestão da rede', tab: 'tvcondos', ico: 'empresa', nome: 'Condomínios', fato: String(condos.length), sub: telas + ' telas no ar' },
        { grupo: 'Gestão da rede', tab: 'tvanunc', ico: 'comercial', nome: 'Anunciantes', fato: String(an.length), sub: 'R$ ' + curto(anV) + '/mês', chip: renovar ? [renovar + ' a renovar', 'atencao'] : null },
        { grupo: 'Gestão da rede', tab: 'tvdespesas', ico: 'despesa', nome: 'Despesas gerais', fato: 'R$ ' + curto(inv.total), sub: meta ? 'investido de ' + curto(meta) : 'e investimento dos sócios' },
        { grupo: 'Vender e fechar', tab: 'elevador', ico: 'contrato', nome: 'Contrato Anunciante', fato: '', sub: 'gerar o contrato de anúncio' },
        { grupo: 'Vender e fechar', tab: 'parceria', ico: 'clientes', nome: 'Contrato Condomínio', fato: '', sub: 'parceria com o condomínio' },
        { grupo: 'Vender e fechar', tab: 'tvproposta', ico: 'tela-vertical', nome: 'Proposta Elevadores', fato: '', sub: 'mídia kit para anunciantes' },
        { grupo: 'Vender e fechar', tab: 'tvsindicos', ico: 'documento', nome: 'Proposta Síndicos', fato: '', sub: 'apresentação para síndicos' }
      ];
    }
    if (g === 'estudio') return [
      { grupo: 'Estúdio', tab: 'gerador', ico: 'spot', nome: 'Gerador de Spots', fato: '', sub: 'texto do spot com IA a partir do briefing' },
      { grupo: 'Estúdio', tab: 'blocos', ico: 'radio', nome: 'Blocos Rádio', fato: '', sub: 'grade de blocos das rádios' }
    ];
    var L = tenta('contratosLista') || [], noAr = L.filter(function (c) { return c.fimKey != null && c.fimKey >= H.ref && (c.iniKey == null || c.iniKey <= H.ref); });
    return [
      { grupo: 'Contratos', tab: 'mercadao', ico: 'radio', nome: 'Contrato Mercadão', fato: '', sub: 'rádio indoor do Mercadão' },
      { grupo: 'Contratos', tab: 'vaapty', ico: 'contrato', nome: 'Contrato Vaapty', fato: '', sub: 'franqueados: comodato e gestão' },
      // 27/11 (usabilidade): mostrava os contratos no ar (17) e a lista abria com "0"; agora conta os arquivos salvos da pasta
      { grupo: 'Contratos', tab: 'pasta', ico: 'pasta', nome: 'Contratos salvos', fato: String(salvosNaPasta()), sub: 'gerados neste computador · ' + noAr.length + ' contratos no ar' }
    ];
  }
  function salvosNaPasta() {
    try { var d = JSON.parse(global.localStorage.getItem('mgb_pasta_v2') || 'null') || {}; return ['mercadao', 'elevador', 'vaapty'].reduce(function (a, k) { return a + ((d[k] || []).length); }, 0); } catch (e) { return 0; }
  }
  function secoes() {
    var pg = doc.getElementById('page-operacional');
    if (!pg || pg.style.display === 'none') return;
    var g = ler('curOpGroup', 'contratos'), nav = pg.querySelector('.hub-nav');
    if (!nav) return;
    var ativa = (pg.querySelector('.hub-tab.active') || { getAttribute: function () { return ''; } }).getAttribute('data-tab');
    var L = secoesDoGrupo(g), box = pg.querySelector('.pnl-secoes');
    if (!box) { box = doc.createElement('div'); box.className = 'pnl-secoes'; nav.parentNode.insertBefore(box, nav); }
    pg.classList.add('pnl-com-secoes'); pg.classList.toggle('pnl-tv', g === 'telavertical');
    var grupos = []; L.forEach(function (c) { if (grupos.indexOf(c.grupo) === -1) grupos.push(c.grupo); });
    box.innerHTML = grupos.map(function (gr) {
      return '<div class="pnl-sec-grupo">' + (grupos.length > 1 ? '<span class="pnl-sec-rot">' + esc(gr) + '</span>' : '') + '<div class="pnl-sec-grade">' + L.filter(function (c) { return c.grupo === gr; }).map(function (c) {
        var on = c.tab === ativa;
        return '<button type="button" class="pnl-sec' + (on ? ' pnl-sec-on' : '') + '" data-pnl-secao="' + esc(c.tab) + '" aria-pressed="' + on + '">' +
          '<span class="pnl-sec-ico">' + ico(c.ico) + '</span><span class="pnl-sec-txt"><b>' + esc(c.nome) + '</b><small>' + esc(c.sub) + '</small></span>' +
          (c.fato ? '<span class="pnl-sec-fato pnl-mono' + (c.tom === 'erro' ? ' pnl-vermelho' : '') + '">' + esc(c.fato) + '</span>' : '<span class="pnl-sec-seta">' + ico('proximo') + '</span>') +
          (c.chip ? '<span class="pnl-sec-chip">' + chip(c.chip[0], c.chip[1]) + '</span>' : '') + '</button>';
      }).join('') + '</div></div>';
    }).join('');
    // cabeçalho da Tela Vertical no visual do hub (logo azul-marinho, sem a faixa azul e dourada)
    var hdr = pg.querySelector('.page-hdr'), ttl = doc.getElementById('op-hub-title'), sub = doc.getElementById('op-hub-sub');
    if (g === 'telavertical' && ttl) {
      if (hdr) hdr.style.background = '';
      var logo = ler('TV_LOGO_NAVY', '');
      if (logo && !ttl.querySelector('.pnl-tv-logo')) ttl.innerHTML = '<span class="pnl-tv-logo">' + logo.replace('<svg ', '<svg style="height:42px;width:auto;display:block" ') + '</span>';
      var condos = tenta('tvRedeHub') || [];
      if (sub) { sub.style.color = ''; sub.textContent = 'Rede de telas em elevadores · ' + condos.length + ' condomínios · ' + (tenta('tvTelasAtivas') || 0) + ' telas'; }
    }
  }
  function cliqueSecao(ev) {
    var b = ev.target.closest && ev.target.closest('[data-pnl-secao]');
    if (!b) return;
    var t = b.getAttribute('data-pnl-secao'), el = doc.querySelector('#page-operacional .hub-tab[data-tab="' + t + '"]');
    if (typeof global.showOpPanel === 'function') global.showOpPanel(t, el);
    rolarAte(doc.getElementById('panel-' + t)); // 27/11 (usabilidade): o conteúdo abria embaixo e parecia que nada acontecia
  }
  function rolarAte(alvo) {
    if (!alvo) return;
    setTimeout(function () {
      if (!alvo.offsetParent) return;
      var y = alvo.getBoundingClientRect().top + (global.scrollY || 0) - (global.innerWidth <= 760 ? 64 : 16);
      try { global.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) { global.scrollTo(0, y); }
    }, 80);
  }

  // ── Cobrança mensal: cartões no lugar das abas + forma de repasse de cada fluxo (27/11) ──
  var REP_PADRAO = {
    mercadao: { favorecido: 'Mercadão Prochet', doc: '12.578.708/0001-03', forma: '', origemDoc: 'CNPJ do cadastro do Mercadão Prochet no hub' },
    vaapty: { favorecido: 'Franqueadora Vaapty (VA Vaapty Gestão de Franquias)', doc: '', forma: '' },
    elev: { favorecido: 'Jadson (sócio da Tela Vertical)', doc: '', forma: '' }
  };
  var FORMAS = { pix: 'PIX', transf: 'Transferência bancária', boleto: 'Boleto', dinheiro: 'Dinheiro' };
  function repCfg(id) {
    var nc = ler('notaConfig', null); if (!nc) return Object.assign({}, REP_PADRAO[id]);
    nc.repasses = nc.repasses || {};
    return Object.assign({}, REP_PADRAO[id], nc.repasses[id] || {});
  }
  function repSalvar(id, dados) {
    var nc = ler('notaConfig', null); if (!nc) return false;
    nc.repasses = nc.repasses || {};
    nc.repasses[id] = Object.assign({}, nc.repasses[id] || {}, dados, { atualizadoEm: new Date().toISOString() });
    try { global.scheduleSave(); } catch (e) {}
    return true;
  }
  function repValor(id) {
    var H = hoje();
    if (id === 'mercadao') {
      var dados = {}; try { dados = JSON.parse(global.localStorage.getItem('mgb_blocos_v4') || '{}') || {}; } catch (e) {}
      var r = tenta('mercRepasseCalc', dados) || { base: 0, pct: (tenta('mercCfg') || {}).pct || 20, valor: 0 };
      return { valor: r.valor, base: r.base, pct: r.pct, sobre: 'das cotas dos anunciantes do mês' };
    }
    if (id === 'vaapty') { var v = tenta('vaaptyRepasseMes', H.ano, H.mes) || { valor: 0, base: 0, pct: 15 }; return { valor: v.valor, base: v.base, pct: v.pct, sobre: 'da receita das unidades Vaapty' }; }
    var e = tenta('elevMesResumo', H.ano, H.mes) || { rec: 0, resultado: 0 };
    return { valor: e.resultado, base: e.rec, pct: null, sobre: 'resultado do mês (receita − despesas)' };
  }
  var editRep = null;
  function repasseHtml(id) {
    var c = repCfg(id), v = repValor(id), H = hoje(), dadosOk = c.forma && (c.forma !== 'pix' || c.pix) && (c.forma !== 'transf' || (c.banco && c.conta));
    var tit = id === 'elev' ? 'Prestação de contas ao sócio' : 'Repasse de ' + MESES_N[H.mes];
    var linhaV = id === 'elev' ? 'Resultado do mês: <b class="pnl-mono">' + (v.valor < 0 ? '−' : '') + 'R$ ' + brl(Math.abs(v.valor)) + '</b> · receita R$ ' + brl(v.base)
      : '<b class="pnl-mono">R$ ' + brl(v.valor) + '</b> = ' + (v.pct || 0) + '% de R$ ' + brl(v.base) + ' ' + esc(v.sobre);
    var dados = [];
    if (c.forma) dados.push(['Forma', FORMAS[c.forma] || c.forma]);
    if (c.forma === 'pix' && c.pix) dados.push(['Chave PIX', c.pix, true]);
    if (c.forma === 'transf') { if (c.banco) dados.push(['Banco', c.banco]); if (c.agencia) dados.push(['Agência', c.agencia, true]); if (c.conta) dados.push(['Conta', c.conta, true]); }
    if (c.doc) dados.push(['CNPJ/CPF', c.doc, true]);
    if (c.obs) dados.push(['Observação', c.obs]);
    var form = editRep === id ? '<form class="pnl-rep-form" data-pnl-rep-form="' + id + '" data-forma="' + esc(c.forma || '') + '" onsubmit="return false">' +
      '<label>Favorecido<input name="favorecido" value="' + esc(c.favorecido || '') + '"></label>' +
      '<label>CNPJ/CPF<input name="doc" value="' + esc(c.doc || '') + '"></label>' +
      '<label>Forma de repasse<select name="forma" onchange="this.form.setAttribute(\'data-forma\',this.value)">' + ['', 'pix', 'transf', 'boleto', 'dinheiro'].map(function (f) { return '<option value="' + f + '"' + (c.forma === f ? ' selected' : '') + '>' + (f ? FORMAS[f] : 'Escolha…') + '</option>'; }).join('') + '</select></label>' +
      '<label data-so="pix">Chave PIX<input name="pix" value="' + esc(c.pix || '') + '" placeholder="CNPJ, e-mail, telefone ou chave aleatória"></label>' +
      '<label data-so="transf">Banco<input name="banco" value="' + esc(c.banco || '') + '"></label>' +
      '<label data-so="transf">Agência<input name="agencia" value="' + esc(c.agencia || '') + '"></label>' +
      '<label data-so="transf">Conta<input name="conta" value="' + esc(c.conta || '') + '"></label>' +
      '<label class="pnl-rep-larga">Observação<input name="obs" value="' + esc(c.obs || '') + '" placeholder="ex.: repasse até o dia 10, mandar comprovante por WhatsApp"></label>' +
      '<div class="pnl-rep-acoes"><button type="button" class="pnl-bt" data-pnl-rep="salvar:' + id + '">Salvar dados</button><button type="button" class="pnl-bt2" data-pnl-rep="cancelar:' + id + '">Cancelar</button></div></form>' : '';
    return '<section class="pnl-rep" aria-label="' + esc(tit) + '"><div class="pnl-rep-cab"><div><span class="pnl-rep-rot">' + esc(tit) + '</span><b>' + esc(c.favorecido || '—') + '</b><small>' + linhaV + '</small></div>' +
      (dadosOk ? chip('dados de pagamento ok', 'ok') : chip('falta a forma de repasse', 'atencao')) + '</div>' +
      (dados.length ? '<div class="pnl-rep-dados">' + dados.map(function (d) { return '<div><span>' + esc(d[0]) + '</span><b' + (d[2] ? ' class="pnl-mono"' : '') + '>' + esc(d[1]) + '</b>' + (d[2] ? '<button type="button" class="pnl-copiar" data-pnl-copiar="' + esc(d[1]) + '" aria-label="Copiar ' + esc(d[0]) + '">Copiar</button>' : '') + '</div>'; }).join('') + '</div>'
        : '<p class="pnl-vazio">Ainda não há forma de repasse cadastrada para ' + esc(c.favorecido) + '. Clique em "Preencher dados" e informe PIX ou conta.</p>') +
      (c.origemDoc && c.doc && !c.atualizadoEm ? '<span class="pnl-nota">CNPJ: ' + esc(c.origemDoc) + '. Confira antes do primeiro repasse.</span>' : '') +
      (editRep === id ? form : '<div><button type="button" class="pnl-bt2" data-pnl-rep="editar:' + id + '">' + (dados.length > 1 ? 'Editar dados de pagamento' : 'Preencher dados') + '</button></div>') + '</section>';
  }
  function cobranca() {
    var pg = doc.getElementById('page-relatorios');
    if (!pg || pg.style.display === 'none') return;
    var abas = pg.querySelector('.rel-tab'); abas = abas && abas.parentNode;
    if (!abas) return;
    var ativa = (pg.querySelector('.rel-tab.active') || { getAttribute: function () { return 'mercadao'; } }).getAttribute('data-reltab');
    var H = hoje(), vm = repValor('mercadao'), vv = repValor('vaapty'), ve = repValor('elev');
    var L = [
      { tab: 'mercadao', ico: 'radio', nome: 'Mercadão', sub: 'repasse ' + (vm.pct || 0) + '% ao Mercadão Prochet', fato: 'R$ ' + curto(vm.valor), cfg: repCfg('mercadao') },
      { tab: 'vaapty', ico: 'contrato', nome: 'Vaapty', sub: 'repasse ' + (vv.pct || 0) + '% à franqueadora', fato: 'R$ ' + curto(vv.valor), cfg: repCfg('vaapty') },
      { tab: 'elev', ico: 'tela-vertical', nome: 'Tela Vertical', sub: 'prestação de contas ao sócio', fato: (ve.valor < 0 ? '−' : '') + 'R$ ' + curto(Math.abs(ve.valor)), tom: ve.valor < 0 ? 'erro' : '', cfg: repCfg('elev') }
    ];
    var box = pg.querySelector('.pnl-secoes');
    if (!box) { box = doc.createElement('div'); box.className = 'pnl-secoes'; abas.parentNode.insertBefore(box, abas); }
    abas.classList.add('pnl-abas-ocultas');
    box.innerHTML = '<div class="pnl-sec-grupo"><span class="pnl-sec-rot">Fluxos de repasse · ' + MESES_N[H.mes] + '</span><div class="pnl-sec-grade pnl-sec-3">' + L.map(function (c) {
      var on = c.tab === ativa, ok = c.cfg.forma;
      return '<button type="button" class="pnl-sec' + (on ? ' pnl-sec-on' : '') + '" data-pnl-rel="' + c.tab + '" aria-pressed="' + on + '"><span class="pnl-sec-ico">' + ico(c.ico) + '</span><span class="pnl-sec-txt"><b>' + esc(c.nome) + '</b><small>' + esc(c.sub) + '</small></span>' +
        '<span class="pnl-sec-fato pnl-mono' + (c.tom === 'erro' ? ' pnl-vermelho' : '') + '">' + esc(c.fato) + '</span>' +
        '<span class="pnl-sec-chip">' + (ok ? chip(FORMAS[c.cfg.forma] || c.cfg.forma, 'ok') : chip('sem forma de repasse', 'atencao')) + '</span></button>';
    }).join('') + '</div></div>';
    // bloco da forma de repasse no topo do fluxo aberto
    ['mercadao', 'vaapty', 'elev'].forEach(function (id) {
      var sub = doc.getElementById('rel-sub-' + id); if (!sub) return;
      var b = sub.querySelector(':scope>.pnl-rep-raiz');
      if (id !== ativa) { if (b) b.remove(); return; }
      if (!b) { b = doc.createElement('div'); b.className = 'pnl-rep-raiz'; sub.insertBefore(b, sub.firstChild); }
      b.innerHTML = repasseHtml(id);
    });
  }
  function cliqueCobranca(ev) {
    var t = ev.target.closest && ev.target.closest('[data-pnl-rel],[data-pnl-rep],[data-pnl-copiar]');
    if (!t) return;
    if (t.hasAttribute('data-pnl-rel')) {
      var id = t.getAttribute('data-pnl-rel'), el = doc.querySelector('#page-relatorios .rel-tab[data-reltab="' + id + '"]');
      editRep = null; if (typeof global.showRelTab === 'function') global.showRelTab(id, el); rolarAte(doc.getElementById('rel-sub-' + id)); return;
    }
    if (t.hasAttribute('data-pnl-copiar')) {
      var txt = t.getAttribute('data-pnl-copiar');
      try { global.navigator.clipboard.writeText(txt).then(function () { t.textContent = 'Copiado'; setTimeout(function () { t.textContent = 'Copiar'; }, 1500); }); } catch (e) {}
      return;
    }
    var a = t.getAttribute('data-pnl-rep').split(':'), ac = a[0], rid = a[1];
    if (ac === 'editar') editRep = rid;
    else if (ac === 'cancelar') editRep = null;
    else if (ac === 'salvar') {
      var f = doc.querySelector('[data-pnl-rep-form="' + rid + '"]'), d = {};
      if (f) Array.prototype.forEach.call(f.elements, function (el) { if (el.name) d[el.name] = String(el.value || '').trim(); });
      if (repSalvar(rid, d)) editRep = null;
    }
    cobranca();
  }

  // ── colocar na tela ──────────────────────────────────────────────────────
  var ONDE = {
    leads: function (pg) { return pg.querySelector(':scope>.page-hdr') || pg.firstElementChild; },
    clientes: function (pg) { return pg.querySelector(':scope>header'); },
    operacional: function (pg) { return pg.querySelector(':scope .hub-nav'); },
    contabilidade: function (pg) { return pg.querySelector(':scope>.page-hdr'); },
    relatorios: function (pg) { var t = pg.querySelector('.rel-tab'); return (t && t.parentNode) || pg.querySelector(':scope>.page-hdr'); },
    ferramentas: function (pg) { return pg.querySelector(':scope>.page-hdr'); }
  };
  function desenhar(area) {
    var pg = doc.getElementById('page-' + area), fn = AREAS[area];
    if (!pg || !fn) return;
    var box = pg.querySelector(':scope .pnl-raiz');
    var dados = null; try { dados = fn(); } catch (e) { if (global.console) console.warn('painel ' + area, e); }
    if (!dados) { if (box) box.remove(); return; }
    if (!box) {
      box = doc.createElement('div'); box.className = 'pnl-raiz';
      var ref = ONDE[area] && ONDE[area](pg);
      if (ref && ref.parentNode) ref.parentNode.insertBefore(box, ref.nextSibling); else pg.insertBefore(box, pg.firstChild);
    }
    box.setAttribute('data-area', area);
    box.innerHTML = montar(dados);
  }
  function atual() {
    var p = ler('curPage', '');
    if (AREAS[p]) desenhar(p);
    if (p === 'operacional') { try { secoes(); } catch (e) {} }
    if (p === 'relatorios') { try { cobranca(); } catch (e) {} }
    // no celular os gráficos mês a mês abrem nos meses mais recentes
    Array.prototype.forEach.call(doc.querySelectorAll('.pnl-g-rolar,.fin2-g-rolar'), function (el) { if (!el.scrollLeft && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth; });
  }
  var ag = false;
  function agendar() { if (ag) return; ag = true; setTimeout(function () { ag = false; try { atual(); } catch (e) {} }, 80); }

  function envolver(nome) {
    var orig = global[nome];
    if (typeof orig !== 'function' || orig.__pnl) return;
    var nova = function () { var r = orig.apply(this, arguments); agendar(); return r; };
    nova.__pnl = true;
    try { Object.keys(orig).forEach(function (kk) { nova[kk] = orig[kk]; }); } catch (e) {}
    global[nome] = nova;
  }

  var CSS =
    '.pnl-raiz{font-family:"DM Sans",system-ui,sans-serif;color:#241A38;max-width:1240px;margin:0 auto;padding:14px 22px 6px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box}' +
    '#page-operacional .pnl-raiz{padding-top:16px}.pnl-raiz *{box-sizing:border-box}.pnl-mono{font-family:"DM Mono",ui-monospace,monospace}.pnl-sub{font-size:12px;color:#5D5868}' +
    '.pnl-chip{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap}.pnl-ok{color:#15803D;background:#E8F6EE}.pnl-atencao{color:#8A4B08;background:#FDF2E3}.pnl-erro{color:#B42318;background:#FDECEA}.pnl-acao{color:#4E38B2;background:#ECE8FA}.pnl-neutro{color:#5D5868;background:#EFEBF7}' +
    '.pnl-hero{background:linear-gradient(135deg,#2A1760 0%,#3B2386 100%);color:#fff;border-radius:18px;padding:18px 22px;display:flex;flex-wrap:wrap;align-items:center;gap:20px;position:relative;overflow:hidden;box-shadow:0 10px 30px rgba(42,23,96,.18)}' +
    '.pnl-hero:before{content:"";position:absolute;right:-90px;top:-110px;width:300px;height:300px;border-radius:50%;border:40px solid rgba(255,255,255,.05);pointer-events:none}' +
    '.pnl-hero-txt{flex:999 1 420px;display:flex;flex-direction:column;gap:9px;min-width:0;position:relative}.pnl-hero-chip{align-self:flex-start;font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.12);color:#E8E2FA}' +
    '.pnl-hero h3{margin:0;font-size:23px;line-height:1.15;font-weight:700;letter-spacing:-.02em;color:#fff}.pnl-hero h3 .pnl-mono{font-weight:500}.pnl-hero h3 small{font-size:13px;color:#C9C0E6;margin-left:2px}.pnl-hero p{margin:3px 0 0;font-size:13px;color:#D9D2F2}' +
    '.pnl-hero-nums{display:grid;gap:12px}.pnl-hero-nums>div{display:flex;flex-direction:column;gap:1px;min-width:0}.pnl-hero-nums b{font-size:17px;font-weight:500}.pnl-hero-nums small{font-size:11.5px;color:#C9C0E6}' +
    '.pnl-hero-meta{display:flex;flex-direction:column;align-items:flex-end;position:relative}.pnl-hero-meta span{font-size:11px;letter-spacing:.12em;color:#C9C0E6;font-weight:700}.pnl-hero-meta b{font-size:36px;font-weight:500;line-height:1}' +
    '.pnl-hero-anel{flex:0 0 auto;position:relative}.pnl-anel{position:relative;flex:none}.pnl-anel svg{display:block}.pnl-anel>div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}' +
    '.pnl-anel b{font:500 22px "DM Mono",ui-monospace,monospace}.pnl-anel span{font-size:11px;max-width:80px;line-height:1.2}' +
    '.pnl-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}' +
    '.pnl-card{display:flex;flex-direction:column;gap:3px;padding:11px 13px 13px;border-radius:14px;border:1px solid #E4DFF0;border-top:3px solid #CFC7E6;background:#fff;min-width:0}' +
    '.pnl-card-ir{font:inherit;color:inherit;text-align:left;cursor:pointer;width:100%}.pnl-card-ir:hover{border-color:#CFC7E6;box-shadow:0 4px 14px rgba(42,23,96,.08)}.pnl-card-ir:focus-visible{outline:3px solid #6C55DB;outline-offset:2px}' +
    '.pnl-card-saudavel{border-top-color:#15803D;background:#F6FBF8}.pnl-card-atencao{border-top-color:#B45309;background:#FFFAF2}.pnl-card-critico{border-top-color:#B42318;background:#FEF6F5}' +
    '.pnl-card-cab{display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:0}.pnl-card-cab b{font-size:13px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.pnl-card-v{font-size:21px;font-weight:500;letter-spacing:-.02em}.pnl-card small{font-size:11.5px;color:#5D5868;line-height:1.35}' +
    '.pnl-card-b{position:relative;height:5px;border-radius:999px;background:#E9E5F3;margin-top:5px}.pnl-card-b i{position:absolute;left:0;top:0;bottom:0;border-radius:999px}.pnl-card-b u{position:absolute;top:-3px;bottom:-3px;width:2px;background:#241A38}' +
    '.pnl-g2{display:grid;grid-template-columns:minmax(0,1.9fr) minmax(0,1fr);gap:12px}.pnl-g3{display:grid;gap:12px}' +
    '.pnl-bloco{background:#fff;border:1px solid #E4DFF0;border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:9px;min-width:0}' +
    '.pnl-bloco-cab{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px}.pnl-bloco h3{margin:0;font-size:15px;font-weight:700}.pnl-nota{font-size:11.5px;color:#5D5868}' +
    '.pnl-g-rolar{overflow-x:auto}.pnl-g{width:100%;min-width:480px;height:auto;display:block}.pnl-g-eixo{font:10.5px "DM Mono",ui-monospace,monospace;fill:#5D5868}.pnl-g-mes{font:11px "DM Sans",system-ui,sans-serif;fill:#5D5868}.pnl-g-atual{fill:#241A38;font-weight:700}.pnl-g-res{font:600 11.5px "DM Mono",ui-monospace,monospace;fill:#2A1760}' +
    '.pnl-leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:#5D5868}.pnl-leg span{display:inline-flex;align-items:center;gap:6px}.pnl-leg i{width:11px;height:11px;border-radius:3px;display:inline-block}' +
    '.pnl-pulso{background:linear-gradient(160deg,#2A1760,#1E1048);color:#fff;border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:9px;min-width:0;box-shadow:0 10px 30px rgba(42,23,96,.2)}' +
    '.pnl-pulso-cab{display:flex;align-items:center;gap:10px}.pnl-pulso-cab>span{width:32px;height:32px;border-radius:50%;background:#4E38B2;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px}.pnl-pulso-cab>div{display:flex;flex-direction:column}.pnl-pulso-cab b{font-size:14px}.pnl-pulso-cab small{font-size:11.5px;color:#C9C0E6}' +
    '.pnl-spark{width:100%;height:44px;display:block}.pnl-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}' +
    '.pnl-tiles>div{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:8px 10px;display:flex;flex-direction:column;min-width:0}.pnl-tiles span{font-size:10px;letter-spacing:.08em;font-weight:700;color:#C9C0E6}.pnl-tiles b{font-size:18px;font-weight:500;color:#fff}.pnl-tiles small{font-size:10.5px;color:#C9C0E6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.pnl-rosca{position:relative;width:150px;height:150px;margin:0 auto}.pnl-rosca svg{display:block}.pnl-rosca>div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}.pnl-rosca b{font:500 18px "DM Mono",ui-monospace,monospace}.pnl-rosca span{font-size:11.5px;color:#5D5868}' +
    '.pnl-lista>div,.pnl-itens>div{display:flex;align-items:center;gap:9px;padding:5px 0;border-top:1px solid #EFEBF7;font-size:12.5px}.pnl-lista i,.pnl-itens i{width:9px;height:9px;border-radius:3px;flex:none}.pnl-itens i{border-radius:50%}' +
    '.pnl-lista span,.pnl-itens span{flex:1;min-width:0;display:flex;flex-direction:column}.pnl-itens small{font-size:11.5px;color:#5D5868}.pnl-lista b,.pnl-itens b{font-size:12px;font-weight:500;white-space:nowrap}.pnl-lista small{width:34px;text-align:right;font-size:11.5px;color:#5D5868}' +
    '.pnl-bh{display:flex;flex-direction:column}.pnl-bh>div{display:grid;grid-template-columns:minmax(0,150px) minmax(0,1fr) 70px;align-items:center;gap:10px;padding:4px 0}.pnl-bh span{font-size:12.5px;min-width:0;display:flex;flex-direction:column;overflow:hidden}.pnl-bh span small{font-size:11px;color:#5D5868}' +
    '.pnl-bh-t{position:relative;height:12px;background:#F6F4FA;border-radius:6px;overflow:hidden}.pnl-bh-t i{position:absolute;left:0;top:0;bottom:0;border-radius:6px}.pnl-bh b{font-size:12px;font-weight:500;text-align:right;white-space:nowrap}' +
    '.pnl-vazio{margin:0;font-size:12.5px;color:#5D5868}' +
    '.pnl-com-secoes .hub-nav{display:none!important}.pnl-secoes{font-family:\"DM Sans\",system-ui,sans-serif;max-width:1240px;margin:0 auto;padding:6px 22px 4px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box}' +
    '.pnl-sec-grupo{display:flex;flex-direction:column;gap:6px}.pnl-sec-rot{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5D5868}' +
    '.pnl-sec-grade{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}' +
    '.pnl-sec{all:unset;box-sizing:border-box;position:relative;cursor:pointer;display:flex;align-items:center;gap:11px;min-height:66px;padding:11px 13px;border:1px solid #E4DFF0;border-radius:14px;background:#fff;color:#241A38;font-family:\"DM Sans\",system-ui,sans-serif;min-width:0}' +
    '.pnl-sec:hover{border-color:#CFC7E6;box-shadow:0 4px 14px rgba(42,23,96,.08)}.pnl-sec:focus-visible{outline:3px solid #6C55DB;outline-offset:2px}' +
    '.pnl-sec-on{border-color:#4E38B2;background:#F3F0FD;box-shadow:inset 0 0 0 1px #4E38B2}' +
    '.pnl-sec-ico{width:38px;height:38px;border-radius:11px;background:#ECE8FA;color:#4E38B2;display:flex;align-items:center;justify-content:center;flex:none}.pnl-sec-ico svg{width:20px;height:20px}.pnl-sec-on .pnl-sec-ico{background:#4E38B2;color:#fff}' +
    '.pnl-sec-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}.pnl-sec-txt b{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pnl-sec-txt small{font-size:11.5px;color:#5D5868;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.pnl-sec-fato{font-size:16px;font-weight:500;white-space:nowrap}.pnl-vermelho{color:#B42318}.pnl-sec-seta{color:#8B7BE0;display:flex}.pnl-sec-seta svg{width:16px;height:16px}' +
    '.pnl-sec-chip{position:absolute;top:-8px;right:10px}' +
    '.pnl-abas-ocultas{display:none!important}.pnl-sec-3{grid-template-columns:repeat(3,minmax(0,1fr))}#page-relatorios .pnl-secoes{padding-top:2px;padding-bottom:10px}#page-relatorios .pnl-sec{min-height:74px;padding-top:15px}' +
    '.pnl-rep-raiz{padding:0 22px 14px;max-width:1240px;margin:0 auto;box-sizing:border-box;font-family:\"DM Sans\",system-ui,sans-serif;color:#241A38}' +
    '.pnl-rep{background:#fff;border:1px solid #E4DFF0;border-left:0;border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 0 rgba(42,23,96,.02)}' +
    '.pnl-rep-cab{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px}.pnl-rep-cab>div{display:flex;flex-direction:column;gap:2px;min-width:0}' +
    '.pnl-rep-rot{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5D5868}.pnl-rep-cab b{font-size:15.5px}.pnl-rep-cab small{font-size:13px;color:#5D5868}.pnl-rep-cab small b{font-size:13.5px;color:#241A38;font-weight:500}' +
    '.pnl-rep-dados{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}.pnl-rep-dados>div{background:#F6F4FA;border-radius:10px;padding:8px 11px;display:flex;flex-direction:column;gap:1px;position:relative;min-width:0}' +
    '.pnl-rep-dados span{font-size:11px;color:#5D5868}.pnl-rep-dados b{font-size:13.5px;font-weight:600;overflow-wrap:anywhere;padding-right:56px}.pnl-rep-dados b.pnl-mono{font-weight:500}' +
    '.pnl-copiar{position:absolute;right:8px;top:50%;transform:translateY(-50%);min-height:28px;padding:0 9px;border:1px solid #CFC7E6;border-radius:8px;background:#fff;color:#2A1760;font:600 11.5px \"DM Sans\",system-ui,sans-serif;cursor:pointer}' +
    '.pnl-bt,.pnl-bt2{min-height:36px;padding:0 14px;border-radius:10px;font:700 13px \"DM Sans\",system-ui,sans-serif;cursor:pointer}.pnl-bt{border:0;background:#4E38B2;color:#fff}.pnl-bt:hover{background:#2A1760}.pnl-bt2{border:1px solid #CFC7E6;background:#fff;color:#2A1760;font-weight:600}.pnl-bt2:hover{background:#ECE8FA}' +
    '.pnl-rep-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;background:#FBFAFE;border:1px solid #EFEBF7;border-radius:12px;padding:12px}' +
    '.pnl-rep-form [data-so]{display:none!important}.pnl-rep-form[data-forma=pix] [data-so=pix],.pnl-rep-form[data-forma=transf] [data-so=transf]{display:flex!important}.pnl-rep-form label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:600;color:#3A3446}.pnl-rep-form input,.pnl-rep-form select{min-height:38px;border:1px solid #CFC7E6;border-radius:9px;padding:0 10px;font:14px \"DM Sans\",system-ui,sans-serif;background:#fff;color:#241A38}' +
    '.pnl-rep-larga{grid-column:1/-1}.pnl-rep-acoes{grid-column:1/-1;display:flex;gap:8px}' +
    '@media (max-width:760px){.pnl-sec-3{grid-template-columns:minmax(0,1fr)!important}.pnl-rep-raiz{padding:0 14px 12px}.pnl-rep-form{grid-template-columns:minmax(0,1fr)}}' +
    '.pnl-tv .page-hdr{background:none!important}.pnl-tv-logo{display:inline-block}' +
    '@media (max-width:1000px){.pnl-sec-grade{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '@media (max-width:520px){.pnl-secoes{padding:6px 14px 4px}.pnl-sec-grade{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.pnl-sec{flex-wrap:wrap;min-height:0;padding:10px}.pnl-sec-fato{width:100%;font-size:15px}.pnl-sec-seta{display:none}.pnl-sec-txt b,.pnl-sec-txt small{white-space:normal}.pnl-sec-ico{width:32px;height:32px}}' +
    '@media (max-width:760px){.pnl-raiz{padding:12px 14px 4px}.pnl-g2,.pnl-g3{grid-template-columns:minmax(0,1fr)!important}.pnl-hero{padding:16px 18px}.pnl-hero h3{font-size:20px}.pnl-hero-nums{grid-template-columns:repeat(2,minmax(0,1fr))!important}.pnl-hero-meta{align-items:flex-start}.pnl-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.pnl-bh>div{grid-template-columns:minmax(0,1fr) 70px}.pnl-bh>div>span{grid-column:1/-1}}' +
    '@media (max-width:760px){#mod-tabs{overflow-x:auto;flex-wrap:nowrap!important;scrollbar-width:none}#mod-tabs>.mtab{flex:none}}' +
    '#page-operacional:has(.pnl-raiz) #tvp-root>div:nth-child(2),#page-operacional:has(.pnl-raiz) #tvp-root>div:nth-child(3){display:none!important}' +
    '@media print{.pnl-raiz{display:none!important}}';

  function ligar() {
    if (!doc.getElementById('pnl-css')) { var st = doc.createElement('style'); st.id = 'pnl-css'; st.textContent = CSS; (doc.body || doc.head).appendChild(st); }
    ['goPage', 'goOperacional', 'showOpPanel', 'applyOpGroup', 'showContabTab', 'showFerrTab', 'showRelTab', 'buildLeads', 'aplicarEstado', 'buildAll'].forEach(envolver);
    if (global.MGBClientes && typeof global.MGBClientes.desenhar === 'function' && !global.MGBClientes.desenhar.__pnl) {
      var od = global.MGBClientes.desenhar, nd = function () { var r = od.apply(this, arguments); agendar(); return r; }; nd.__pnl = true; global.MGBClientes.desenhar = nd;
    }
    doc.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('#page-clientes [data-cli2], #page-leads')) agendar(); }, true);
    doc.addEventListener('click', clique);
    doc.addEventListener('click', cliqueSecao);
    doc.addEventListener('click', cliqueCobranca);
    agendar();
  }

  global.MGBPainel = { desenhar: desenhar, atual: atual, pecas: { hero: hero, cartoes: cartoes, barras: barras, rosca: rosca, barrasH: barrasH, pulso: pulso, bloco: bloco, montar: montar }, escala: escala };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ligar); else setTimeout(ligar, 0);
})(window);
