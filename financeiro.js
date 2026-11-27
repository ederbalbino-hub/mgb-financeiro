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

  // Contratos que terminam entre o mês ref e os próximos n-1 meses (a renovar), do mais próximo ao mais distante
  function renovacoes(lista, ref, n) {
    var l = lista.filter(function (c) { return c.fimKey != null && c.fimKey >= ref && c.fimKey < ref + n && (Number(c.valor) || 0) > 0 && !(c.meses >= SEM_FIM); })
      .sort(function (a, b) { return (a.fimKey - b.fimKey) || (b.valor - a.valor); });
    return { qtd: l.length, valor: l.reduce(function (a, c) { return a + (Number(c.valor) || 0); }, 0), lista: l };
  }
  // Situação de um módulo pela margem: saudável, atenção ou crítico
  function saudeModulo(r, d) {
    if (!r && !d) return 'vazio';
    if (r <= 0) return 'critico';
    var m = (r - d) / r * 100;
    return m >= 60 ? 'saudavel' : m >= 20 ? 'atencao' : 'critico';
  }
  // Teto "redondo" do eixo dos gráficos e as 4 marcas (0, 1/3, 2/3, teto)
  function escala(max) {
    max = Math.max(Number(max) || 0, 1);
    // tetos que dividem em 3 partes redondas (0, 30k, 60k, 90k)
    var bruto = max * 1.08, pot = Math.pow(10, Math.floor(Math.log10(bruto))), passos = [1.2, 1.5, 1.8, 2.4, 3, 4.5, 6, 7.5, 9, 12];
    var teto = pot * 12;
    for (var i = 0; i < passos.length; i++) { if (passos[i] * pot >= bruto - 1e-9) { teto = Math.round(passos[i] * pot * 1000) / 1000; break; } }
    return { teto: teto, marcas: [0, teto / 3, teto * 2 / 3, teto] };
  }
  // As n maiores fatias e o resto somado em "Outros", com a porcentagem de cada uma
  function fatias(lista, n) {
    var pos = lista.filter(function (x) { return x.valor > 0; }).sort(function (a, b) { return b.valor - a.valor; });
    var tot = pos.reduce(function (a, x) { return a + x.valor; }, 0);
    var top = pos.slice(0, n), resto = pos.slice(n);
    if (resto.length === 1) top.push(resto[0]);
    else if (resto.length) top.push({ rot: 'Outros (' + resto.length + ')', valor: resto.reduce(function (a, x) { return a + x.valor; }, 0), outros: true });
    return top.map(function (x) { return Object.assign({}, x, { pct: tot ? x.valor / tot * 100 : 0 }); });
  }

  // Vencimento de uma conta a pagar no mês (ano, mes0) visto de "hoje" (27/11): vencida, vence hoje, vence em
  // até 7 dias ou nada. Mês já passado e não paga = vencida. Dia 31 em mês curto vira o último dia.
  function situacaoVenc(dia, ano, mes0, hoje) {
    var d = parseInt(dia, 10); if (!(d >= 1 && d <= 31)) return null;
    var h = hoje || new Date(), ult = new Date(ano, mes0 + 1, 0).getDate();
    var venc = new Date(ano, mes0, Math.min(d, ult)), h0 = new Date(h.getFullYear(), h.getMonth(), h.getDate());
    var dias = Math.round((venc - h0) / 86400000);
    if (dias < 0) return { tom: 'erro', txt: 'vencida', dias: dias };
    if (dias === 0) return { tom: 'erro', txt: 'vence hoje', dias: 0 };
    if (dias <= 7) return { tom: 'atencao', txt: dias === 1 ? 'vence amanhã' : 'vence em ' + dias + ' dias', dias: dias };
    return null;
  }
  // Para o Início: contas não pagas do mês atual que venceram ou vencem em até 7 dias
  function contasAvisar(hoje) {
    var h = hoje || new Date(), ano = h.getFullYear(), mes = h.getMonth();
    var dKey = tenta('despPagKey', ano, mes) || (ano + '-' + mes);
    var L = agruparContas(tenta('coletaDespesasMes', ano, mes) || [], function (d) { return estaPago(d, dKey); }, vencimentos());
    return L.filter(function (g) { return !g.pago; }).map(function (g) { return { titulo: g.titulo, total: g.total, venc: situacaoVenc(g.dia, ano, mes, h) }; })
      .filter(function (x) { return x.venc; }).sort(function (a, b) { return a.venc.dias - b.venc.dias; });
  }

  var regras = { situacaoVenc: situacaoVenc, agruparContas: agruparContas, chaveConta: chaveConta, contrato: contrato, resumoContratos: resumoContratos, mudancas: mudancas, rotMes: rotMes, escala: escala, fatias: fatias, renovacoes: renovacoes, saudeModulo: saudeModulo };
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

  // ── Gráficos (desenho aprovado em 27/11: layout do painel do Eder, tipografia do hub) ──
  var PAL = ['#2A1760', '#4E38B2', '#8B7BE0', '#BBAEF2', '#DDD6F8'];
  var DESTAQUE = '#F5B35C';
  function kCurto(v) { var a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 1000 ? (a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: a >= 100000 ? 0 : 1 }) + 'k' : Math.round(a)); }
  function anel(pct, tam, traco, cor, fundo, txt, sub, rot) {
    var r = (tam - traco) / 2, C = 2 * Math.PI * r, d = C * Math.max(0, Math.min(100, pct)) / 100;
    return '<div class="fin2-anel" style="width:' + tam + 'px;height:' + tam + 'px"><svg width="' + tam + '" height="' + tam + '" viewBox="0 0 ' + tam + ' ' + tam + '" role="img" aria-label="' + esc(Math.round(pct) + '% ' + rot) + '">' +
      '<circle cx="' + tam / 2 + '" cy="' + tam / 2 + '" r="' + r.toFixed(1) + '" fill="none" stroke="' + fundo + '" stroke-width="' + traco + '"/>' +
      (d > 0 ? '<circle cx="' + tam / 2 + '" cy="' + tam / 2 + '" r="' + r.toFixed(1) + '" fill="none" stroke="' + cor + '" stroke-width="' + traco + '" stroke-linecap="round" stroke-dasharray="' + d.toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 ' + tam / 2 + ' ' + tam / 2 + ')"/>' : '') +
      '</svg><div><b style="color:' + txt + '">' + Math.round(pct) + '%</b>' + (sub ? '<span style="color:' + sub + '">' + esc(rot) + '</span>' : '') + '</div></div>';
  }
  // Barras de receita e despesa por mês + linha do resultado. serie: [{rot, rec, desp, prev, atual}]
  function graficoMeses(serie, opc) {
    opc = opc || {};
    var W = 640, H = opc.H || 300, L = 46, R = 8, T = 22, B = 30, pw = W - L - R, ph = H - T - B;
    var max = 0; serie.forEach(function (m) { max = Math.max(max, m.rec, m.desp); });
    var e = escala(max), y = function (v) { return T + ph - Math.max(0, v) / e.teto * ph; };
    var slot = pw / serie.length, bw = opc.soReceita ? Math.min(26, slot - 12) : Math.min(18, slot / 2 - 4), o = [];
    e.marcas.forEach(function (g) {
      o.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g).toFixed(1) + '" y2="' + y(g).toFixed(1) + '" stroke="#EFEBF7"/>');
      o.push('<text x="' + (L - 8) + '" y="' + (y(g) + 4).toFixed(1) + '" text-anchor="end" class="fin2-g-eixo">' + kCurto(g) + '</text>');
    });
    var pts = [];
    serie.forEach(function (m, i) {
      var cx = L + slot * i + slot / 2, op = m.prev ? ' fill-opacity="0.4"' : '';
      o.push('<text x="' + cx.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" class="fin2-g-mes' + (m.atual ? ' fin2-g-atual' : '') + '">' + m.rot + '</text>');
      if (!m.rec && !m.desp) return;
      if (opc.soReceita) { o.push('<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y(m.rec).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ph - y(m.rec)).toFixed(1) + '" rx="5" fill="' + (m.atual ? '#4E38B2' : '#8B7BE0') + '"' + (m.prev ? ' fill-opacity="0.4"' : '') + '><title>' + esc(m.rot + ' · R$ ' + brl(m.rec)) + '</title></rect>'); if (m.atual) o.push('<text x="' + cx.toFixed(1) + '" y="' + (y(m.rec) - 7).toFixed(1) + '" text-anchor="middle" class="fin2-g-res" style="fill:#2A1760">' + kCurto(m.rec) + '</text>'); return; }
      o.push('<rect x="' + (cx - bw - 1.5).toFixed(1) + '" y="' + y(m.rec).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ph - y(m.rec)).toFixed(1) + '" rx="4" fill="#4E38B2"' + op + '><title>' + esc(m.rot + ' · receita R$ ' + brl(m.rec)) + '</title></rect>');
      o.push('<rect x="' + (cx + 1.5).toFixed(1) + '" y="' + y(m.desp).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ph - y(m.desp)).toFixed(1) + '" rx="4" fill="#E0A458"' + op + '><title>' + esc(m.rot + ' · despesa R$ ' + brl(m.desp)) + '</title></rect>');
      pts.push({ x: cx, y: y(m.rec - m.desp), prev: m.prev, atual: m.atual, v: m.rec - m.desp });
    });
    for (var i = 1; i < pts.length; i++) {
      o.push('<line x1="' + pts[i - 1].x.toFixed(1) + '" y1="' + pts[i - 1].y.toFixed(1) + '" x2="' + pts[i].x.toFixed(1) + '" y2="' + pts[i].y.toFixed(1) + '" stroke="#15803D" stroke-width="2.5"' + (pts[i].prev ? ' stroke-dasharray="5 4"' : '') + '/>');
    }
    pts.forEach(function (p) {
      o.push('<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (p.atual ? 5 : 3.5) + '" fill="' + (p.prev ? '#FFFFFF' : '#15803D') + '" stroke="#15803D" stroke-width="2"/>');
      if (p.atual) o.push('<rect x="' + (p.x - 26).toFixed(1) + '" y="' + (p.y + 9).toFixed(1) + '" width="52" height="19" rx="6" fill="#FFFFFF"/><text x="' + p.x.toFixed(1) + '" y="' + (p.y + 22).toFixed(1) + '" text-anchor="middle" class="fin2-g-res">' + kCurto(p.v) + '</text>');
    });
    var real = serie.filter(function (m) { return !m.prev && (m.rec || m.desp); });
    var rot = 'Receita e despesa por mês. ' + real.map(function (m) { return m.rot + ': receita ' + kCurto(m.rec) + ', despesa ' + kCurto(m.desp); }).join('; ');
    return '<svg class="fin2-g" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(rot) + '">' + o.join('') + '</svg>';
  }
  function legenda(itens) {
    return '<div class="fin2-leg">' + itens.map(function (x) { return '<span><i style="' + x[0] + '"></i>' + esc(x[1]) + '</span>'; }).join('') + '</div>';
  }
  function rosca(lista, total, extra) {
    var tam = 180, r = tam / 2 - 16, C = 2 * Math.PI * r, off = 0, o = [];
    lista.forEach(function (f, i) {
      var d = C * f.pct / 100;
      o.push('<circle cx="90" cy="90" r="' + r.toFixed(1) + '" fill="none" stroke="' + PAL[i % PAL.length] + '" stroke-width="26" stroke-dasharray="' + Math.max(d - 2, 1).toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-off).toFixed(1) + '" transform="rotate(-90 90 90)"/>');
      off += d;
    });
    var rot = 'Receita por módulo: ' + lista.map(function (f) { return f.rot + ' ' + Math.round(f.pct) + '%'; }).join(', ');
    return '<div class="fin2-rosca" role="img" aria-label="' + esc(rot) + '"><svg width="' + tam + '" height="' + tam + '" viewBox="0 0 180 180" aria-hidden="true">' + (lista.length ? o.join('') : '<circle cx="90" cy="90" r="' + r.toFixed(1) + '" fill="none" stroke="#EFEBF7" stroke-width="26"/>') + '</svg>' +
      '<div><b>' + kCurto(total) + '</b><span>receita</span></div></div>' +
      '<div class="fin2-rosca-l">' + lista.map(function (f, i) {
        return '<div><i style="background:' + PAL[i % PAL.length] + '"></i><span>' + esc(f.rot) + '</span><b class="fin2-mono">' + curto(f.valor) + '</b><small>' + Math.round(f.pct) + '%</small></div>';
      }).join('') + (extra || '') + '</div>';
  }
  // Barras que crescem para a direita (lucro) ou para a esquerda em vermelho (prejuízo)
  function barrasModulos(linhas) {
    var pmax = 0, nmax = 0;
    linhas.forEach(function (l) { var v = l.r - l.d; if (v > pmax) pmax = v; if (-v > nmax) nmax = -v; });
    var z = nmax > 0 ? Math.max(12, Math.min(40, Math.round(nmax / (pmax + nmax) * 100))) : 0;
    return '<div class="fin2-div">' + linhas.map(function (l) {
      var v = l.r - l.d, bar = '';
      if (l.falta) bar = '';
      else if (v > 0 && pmax) bar = '<i style="left:' + z + '%;width:' + (v / pmax * (100 - z)).toFixed(1) + '%"></i>';
      else if (v < 0 && nmax) bar = '<i class="fin2-neg" style="right:' + (100 - z) + '%;width:' + (-v / nmax * z).toFixed(1) + '%"></i>';
      return '<div' + (l.id ? ' class="fin2-clicavel" tabindex="0" role="button" data-fin2="modulo:' + esc(l.id) + '"' : '') + '><span>' + esc(l.rot) + '</span>' +
        '<div class="fin2-div-t" aria-hidden="true">' + bar + (z ? '<u style="left:' + z + '%"></u>' : '') + '</div>' +
        '<b class="fin2-mono' + (v < 0 ? ' fin2-vermelho' : '') + (l.falta ? ' fin2-laranja' : '') + '">' + (l.falta ? 'falta lançar' : (l.r || l.d) ? curto(v) : '—') + '</b></div>';
    }).join('') + '</div>';
  }
  function aneisDespesa(lista) {
    var cores = ['#4E38B2', '#B45309', '#2A1760', '#8B7BE0', '#15803D', '#5D5868'];
    return '<div class="fin2-aneis">' + lista.map(function (f, i) {
      return '<div>' + anel(f.pct, 60, 6, cores[i % cores.length], '#EFEBF7', '#241A38', '', 'de ' + f.rot) +
        '<div><b>' + esc(f.rot) + '</b><span class="fin2-mono">R$ ' + brl(f.valor) + '</span>' + (f.det ? '<small>' + esc(f.det) + '</small>' : '') + '</div></div>';
    }).join('') + '</div>';
  }
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

    // gráficos: ano do mês escolhido (meses depois de hoje = previsão pelos contratos)
    var hoje = new Date(), refHoje = hoje.getFullYear() * 12 + hoje.getMonth();
    var serie = MES_CURTO.map(function (rotM, k) {
      var r = tenta('finGetRec', ano, k) || 0, d = tenta('finGetDesp', ano, k) || 0;
      return { rot: rotM, rec: r, desp: d, prev: ano * 12 + k > refHoje, atual: k === mes };
    });
    var temPrev = serie.some(function (m) { return m.prev && (m.rec || m.desp); });
    var px2 = new Date(ano, mes + 1, 1), recP = tenta('finGetRec', px2.getFullYear(), px2.getMonth()) || 0, despP = tenta('finGetDesp', px2.getFullYear(), px2.getMonth()) || 0;
    var mg = rec > 0 ? Math.max(0, Math.min(100, res / rec * 100)) : 0;

    var porMod = fatias(linhas.filter(function (l) { return l.id && l.r > 0; }).map(function (l) { return { rot: moduloRot({ label: l.rot }), valor: l.r }; }), 4);
    var faltaMod = tarobaPend ? '<div class="fin2-falta-l"><i></i><span>Tarobá</span>' + chip('falta lançar', 'atencao') + '</div>' : '';

    var dKey = tenta('despPagKey', ano, mes) || (ano + '-' + mes);
    var contas = agruparContas(tenta('coletaDespesasMes', ano, mes) || [], function (d) { return estaPago(d, dKey); }, vencimentos());
    var totC = contas.reduce(function (x, g) { return x + g.total; }, 0);
    var pagoC = contas.reduce(function (x, g) { return x + g.itens.filter(function (d) { return estaPago(d, dKey); }).reduce(function (y, d) { return y + d.vlrMes; }, 0); }, 0);
    var porConta = fatias(contas.map(function (g) { return { rot: g.titulo, valor: g.total, det: g.itens.length > 1 ? g.itens.length + ' lançamentos' : (g.subtitulo || '') }; }), 5);
    var pctPago = totC ? Math.round(pagoC / totC * 100) : 0;

    var azul = res >= 0;
    var subTopo = (rec || desp) ? ('Receita ' + (Math.abs(rec - recA) < 0.005 ? 'igual a ' : rec < recA ? 'menor que ' : 'maior que ') + nomeAnt + ', despesa ' + (Math.abs(desp - despA) < 0.005 ? 'igual' : desp < despA ? 'menor' : 'maior') +
      (falta.length ? ' e ' + falta.length + (falta.length === 1 ? ' coisa' : ' coisas') + ' para lançar antes de fechar o mês.' : '.')) : 'Ainda não há lançamentos neste mês.';
    var faltaTxt = falta.length ? (tarobaPend ? '1 pendência: comissões da Tarobá' : falta.length + (falta.length === 1 ? ' pendência de lançamento' : ' pendências de lançamento')) : 'tudo lançado';

    // dados extras do painel compacto (27/11, referência do painel do Eder)
    var cli = tenta('coletaClientesMes', ano, mes) || [];
    var recebido = cli.filter(function (l) { return l.pago; }).reduce(function (x, l) { return x + l.valor; }, 0);
    var prevCli = cli.reduce(function (x, l) { return x + (l.valor || 0); }, 0);
    var vencidos = cli.filter(function (l) { return !l.pago && l.asaas && l.asaas.st === 'vencido'; });
    var vencV = vencidos.reduce(function (x, l) { return x + l.valor; }, 0);
    var notas = 0; try { notas = chama('mesFechamentoNotas', ano + '-' + String(mes + 1).padStart(2, '0')).total || 0; } catch (e) {}
    var listaCtt = tenta('contratosLista') || [];
    var ren = renovacoes(listaCtt, ref, 3);
    var ticket = cli.length ? prevCli / cli.length : 0;
    var proximos = [1, 2, 3].map(function (k) { var d = new Date(ano, mes + k, 1), r = tenta('finGetRec', d.getFullYear(), d.getMonth()) || 0, dd = tenta('finGetDesp', d.getFullYear(), d.getMonth()) || 0; return { rot: MES_CURTO[d.getMonth()] + '/' + String(d.getFullYear()).slice(2), r: r, d: dd }; });
    var spark = serie.filter(function (m) { return !m.prev && (m.rec || m.desp); }).map(function (m) { return m.rec - m.desp; });
    var mods = linhas.filter(function (l) { return l.id && (l.r || l.d || l.falta); });
    var SAUDE = { saudavel: ['saudável', 'ok', '#15803D'], atencao: ['atenção', 'atencao', '#B45309'], critico: ['crítico', 'erro', '#B42318'], vazio: ['sem receita', 'neutro', '#CFC7E6'] };
    function sparkline(v) {
      if (v.length < 2) return '';
      var W = 300, H = 46, mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), sp = mx - mn || 1;
      var pts = v.map(function (x, i) { return (i / (v.length - 1) * (W - 8) + 4).toFixed(1) + ',' + (H - 6 - (x - mn) / sp * (H - 12)).toFixed(1); });
      return '<svg class="fin2-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts.join(' ') + '" fill="none" stroke="#4ADE80" stroke-width="2" stroke-linejoin="round"/><circle cx="' + pts[pts.length - 1].split(',')[0] + '" cy="' + pts[pts.length - 1].split(',')[1] + '" r="3.5" fill="#4ADE80"/></svg>';
    }
    function tile(rot, val, cor, extra) { return '<div class="fin2-tile"><span>' + esc(rot) + '</span><b class="fin2-mono"' + (cor ? ' style="color:' + cor + '"' : '') + '>' + val + '</b>' + (extra ? '<small>' + esc(extra) + '</small>' : '') + '</div>'; }
    var cartoesMod = mods.map(function (l) {
      var sd = l.falta ? 'atencao' : saudeModulo(l.r, l.d), S = SAUDE[sd], mgL = l.r > 0 ? Math.max(0, Math.round((l.r - l.d) / l.r * 100)) : 0;
      return '<button type="button" class="fin2-mod fin2-mod-' + sd + '" data-fin2="modulo:' + esc(l.id) + '">' +
        '<span class="fin2-mod-cab"><b title="' + esc(l.rot) + '">' + esc(moduloRot({ label: l.rot }).replace(/\s*\(.*\)$/, '')) + '</b>' + chip(l.falta ? 'falta lançar' : S[0], S[1]) + '</span>' +
        '<span class="fin2-mod-v fin2-mono">' + (l.falta ? '—' : curto(l.r)) + '</span>' +
        '<small>resultado ' + (l.r || l.d ? curto(l.r - l.d) : '—') + ' · ' + mgL + '% de margem</small>' +
        '<span class="fin2-mod-b" aria-hidden="true"><i style="width:' + mgL + '%;background:' + S[2] + '"></i><u style="left:' + Math.round(mg) + '%"></u></span></button>';
    }).join('');

    primeiro = true;
    box.innerHTML =
      '<header class="fin2-topo"><div><span class="fin2-sub"><b>Financeiro MGB</b> · ' + esc(cap(MESES_N[mes])) + ' de ' + ano + '</span>' +
        '<h2>' + esc(cap(MESES_N[mes])) + ', ' + (azul ? 'no azul' : 'no vermelho') + '</h2><p class="fin2-sub">' + esc(subTopo) + '</p></div>' +
        '<div class="fin2-acoes"><button type="button" class="fin2-icone" data-fin2="mes-resumo:-1" aria-label="Mês anterior">' + SETA_E + '</button>' +
        '<button type="button" class="fin2-icone" data-fin2="mes-resumo:1" aria-label="Próximo mês">' + SETA_D + '</button>' +
        '<button type="button" class="fin2-btn fin2-btn-escuro" data-fin2="relatorio">Relatório do ano</button></div></header>' +

      '<section class="fin2-hero" aria-label="Resultado de ' + esc(MESES_N[mes]) + '"><div class="fin2-hero-txt">' +
        '<span class="fin2-hero-chip">Resultado de ' + esc(MESES_N[mes]) + ' · ' + esc(faltaTxt) + '</span>' +
        '<div><h3>' + (azul ? 'Sobraram ' : 'Prejuízo de ') + '<span class="fin2-mono" style="color:' + (azul ? DESTAQUE : '#FCA5A5') + '">R$ ' + brl(Math.abs(res)) + '</span></h3>' +
        '<p>Receita <b>R$ ' + brl(rec) + '</b> · despesa <b>R$ ' + brl(desp) + '</b> · ' + esc(dif(recA, rec)) + '</p></div>' +
        '<div class="fin2-hero-nums fin2-hero-4">' +
          '<div><b class="fin2-mono">' + curto(recebido) + '</b><small>recebido de ' + curto(prevCli) + '</small></div>' +
          '<div><b class="fin2-mono">' + curto(notas) + '</b><small>em notas emitidas</small></div>' +
          '<div><b class="fin2-mono">' + curto(pagoC) + '</b><small>contas pagas de ' + curto(totC) + '</small></div>' +
          '<div><b class="fin2-mono">' + (recP - despP < 0 ? '−' : '') + curto(Math.abs(recP - despP)) + '</b><small>' + esc(MESES_N[px2.getMonth()]) + ' previsto</small></div>' +
        '</div></div>' +
        '<div class="fin2-hero-meta"><span>RESULTADO DO MÊS</span><b class="fin2-mono" style="color:' + (azul ? DESTAQUE : '#FCA5A5') + '">' + curto(res) + '</b></div>' +
        '<div class="fin2-hero-anel">' + anel(mg, 120, 11, '#FFFFFF', 'rgba(255,255,255,0.16)', '#FFFFFF', '#D9D2F2', 'de margem') + '</div></section>' +

      (cartoesMod ? '<div class="fin2-mods">' + cartoesMod + '</div>' : '') +

      '<div class="fin2-g2b">' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Próximos meses</h3><span class="fin2-sub">previsão pelos contratos que seguem</span></div>' +
          '<div class="fin2-prox">' + proximos.map(function (p) {
            var rp = p.r - p.d;
            return '<div><span>' + p.rot.toUpperCase() + '</span><b class="fin2-mono">' + curto(p.r) + '</b><small>receita · despesa ' + curto(p.d) + '</small>' +
              '<em class="fin2-mono' + (rp < 0 ? ' fin2-vermelho' : ' fin2-verde') + '">' + (rp < 0 ? '' : '+') + curto(rp) + '</em><i aria-hidden="true"><u style="width:' + (p.r ? Math.max(0, Math.min(100, rp / p.r * 100)) : 0).toFixed(0) + '%"></u></i></div>';
          }).join('') + '</div></section>' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3 class="fin2-cap">Renovações 90 dias</h3>' + chip(ren.qtd + (ren.qtd === 1 ? ' contrato' : ' contratos'), ren.qtd ? 'atencao' : 'ok') + '</div>' +
          '<b class="fin2-grande fin2-mono">' + curto(ren.valor) + '<small>/mês</small></b><span class="fin2-sub fin2-peq">a defender' + (ren.qtd ? ' · 1º vence em ' + rotMes(ren.lista[0].fimKey) : '') + '</span>' +
          '<div class="fin2-ren">' + ren.lista.slice(0, 3).map(function (c) { return '<div><span>' + esc(c.nome) + '</span><small>' + rotMes(c.fimKey) + '</small><b class="fin2-mono">' + curto(c.valor) + '</b></div>'; }).join('') + '</div>' +
          '<button type="button" class="fin2-link" data-fin2="contratos">Ver contratos</button></section>' +
      '</div>' +

      '<div class="fin2-g2c">' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Receita e despesa mês a mês</h3><span class="fin2-sub">' + ano + '</span></div>' +
          '<div class="fin2-g-rolar">' + graficoMeses(serie, { H: 250 }) + '</div>' +
          legenda([['background:#4E38B2', 'receita'], ['background:#E0A458', 'despesa'], ['height:0;border-top:2.5px solid #15803D;width:18px;border-radius:0', 'resultado']].concat(temPrev ? [['background:#4E38B2;opacity:.4', 'previsto']] : [])) + '</section>' +
        '<section class="fin2-pulso" aria-label="Pulso do mês"><div class="fin2-pulso-cab"><span class="fin2-pulso-ic">' + esc(cap(MESES_N[mes]).slice(0, 2)) + '</span><div><b>Pulso de ' + esc(MESES_N[mes]) + '</b><small>resultado mês a mês até aqui</small></div></div>' +
          sparkline(spark) +
          '<div class="fin2-tiles">' +
            tile('RECEBIDO', Math.round(prevCli ? recebido / prevCli * 100 : 0) + '%', '#4ADE80', curto(recebido) + ' de ' + curto(prevCli)) +
            tile('VENCIDO', curto(vencV), vencV ? '#FCA5A5' : '#FFFFFF', vencidos.length + (vencidos.length === 1 ? ' boleto' : ' boletos')) +
            tile('MARGEM', Math.round(mg) + '%', DESTAQUE, 'resultado ÷ receita') +
            tile('TICKET MÉDIO', curto(ticket), '#C9BEFA', cli.length + ' clientes no mês') +
            tile('CONTRATOS', String(C.ativo), '#FFFFFF', C.termina ? C.termina + ' terminam este mês' : 'no ar') +
            tile('CONTAS PAGAS', pctPago + '%', pctPago >= 100 ? '#4ADE80' : '#FFFFFF', contas.length + ' contas') +
          '</div><button type="button" class="fin2-pulso-bt" data-fin2="aba:lanc">Ver receita</button></section>' +
      '</div>' +

      '<div class="fin2-g3c">' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Para onde vai a despesa</h3>' + chip('R$ ' + curto(totC), 'neutro') + '</div>' +
          (porConta.length ? aneisDespesa(porConta) : '<p class="fin2-sub">Nenhuma despesa lançada neste mês.</p>') +
          '<button type="button" class="fin2-link" data-fin2="aba:desp">Ver contas do mês</button></section>' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>De onde vem a receita</h3>' + chip(porMod.length + ' módulos', 'acao') + '</div>' + rosca(porMod, rec, faltaMod) + '</section>' +
        '<section class="fin2-bloco fin2-graf" aria-labelledby="fin2-falta"><div class="fin2-bloco-cab"><h3 id="fin2-falta">Falta lançar</h3>' + (falta.length ? chip(String(falta.length), 'atencao') : chip('tudo lançado', 'ok')) + '</div>' +
          (falta.length ? '<div class="fin2-lista-c">' + falta.map(function (p) {
            var bt = p.acao ? '<button type="button" class="fin2-chip-bt" data-fin2="' + p.acao + '">' + (/tarob/i.test(p.txt) ? 'Lançar' : 'Abrir') + '</button>' : '';
            return '<div><span class="fin2-ponto" style="background:#B45309"></span><span><b>' + esc(p.txt) + '</b><small>' + esc(p.det) + '</small></span>' + bt + '</div>';
          }).join('') + '</div>' : '<p class="fin2-sub fin2-peq">Nada pendente: o resultado está completo.</p>') +
          '<div class="fin2-bloco-cab fin2-sub-cab"><h3>O que mudou</h3><span class="fin2-sub">de ' + nomeAnt + '</span></div>' +
          (mudHtml ? '<ul class="fin2-mud fin2-mud-c">' + mudHtml + '</ul>' : '<p class="fin2-sub fin2-peq">Nada mudou entre os dois meses.</p>') +
          (prox ? '<span class="fin2-sub fin2-peq">' + esc(prox) + '</span>' : '') + '</section>' +
      '</div>';
    var rolar = box.querySelector('.fin2-g-rolar'); if (rolar) rolar.scrollLeft = rolar.scrollWidth; // no celular, mostra os meses mais recentes
  }

  // ── 1b. Visão Receita com gráficos (mesmo estilo do Resumo, 27/11) ────────
  function topo(sub, titulo, linha, acaoMes, direita) {
    return '<header class="fin2-topo"><div><span class="fin2-sub"><b>Financeiro MGB</b> · ' + esc(sub) + '</span><h2>' + esc(titulo) + '</h2>' + (linha ? '<p class="fin2-sub">' + esc(linha) + '</p>' : '') + '</div>' +
      '<div class="fin2-acoes"><button type="button" class="fin2-icone" data-fin2="' + acaoMes + ':-1" aria-label="Mês anterior">' + SETA_E + '</button>' +
      '<button type="button" class="fin2-icone" data-fin2="' + acaoMes + ':1" aria-label="Próximo mês">' + SETA_D + '</button>' + (direita || '') + '</div></header>';
  }
  function heroBloco(rotulo, chipTxt, titulo, valorTxt, cor, frase, nums, pct, rotAnel) {
    return '<section class="fin2-hero" aria-label="' + esc(rotulo) + '"><div class="fin2-hero-txt">' +
      '<span class="fin2-hero-chip">' + esc(chipTxt) + '</span>' +
      '<div><h3>' + esc(titulo) + ' <span class="fin2-mono" style="color:' + cor + '">' + valorTxt + '</span></h3><p>' + esc(frase) + '</p></div>' +
      '<div class="fin2-hero-nums" style="grid-template-columns:repeat(' + nums.length + ',minmax(0,1fr))">' + nums.map(function (n) { return '<div><span>' + esc(n[0]) + '</span><b class="fin2-mono">' + n[1] + '</b><small>' + esc(n[2]) + '</small></div>'; }).join('') + '</div></div>' +
      '<div class="fin2-hero-anel">' + anel(pct, 168, 14, DESTAQUE, 'rgba(255,255,255,0.14)', '#FFFFFF', '#D9D2F2', rotAnel) + '</div></section>';
  }
  function situacaoCobranca(l) {
    var a = l.asaas;
    if (l.pago) return 'pago';
    if (a && a.st === 'vencido') return 'vencido';
    if (a && a.st === 'cancelado') return 'cancelado';
    if (a && a.st === 'nota') return 'nota';
    if (a) return 'aberto';
    return 'sem';
  }
  var SIT_COB = [
    ['pago', 'Recebido', '#15803D'], ['aberto', 'Boleto em aberto', '#E0A458'], ['vencido', 'Vencido', '#B42318'],
    ['nota', 'Só nota emitida', '#8B7BE0'], ['sem', 'Ainda sem cobrança', '#CFC7E6'], ['cancelado', 'Cancelado', '#5D5868']
  ];
  function esconderAntigo(sub, seletores) {
    var raiz = doc.getElementById(sub); if (!raiz) return;
    raiz.classList.add('fin2-ativo-v');
    seletores.forEach(function (sel) {
      var el = sel.charAt(0) === '!' ? (doc.getElementById(sel.slice(1)) || {}).closest && doc.getElementById(sel.slice(1)).closest('#' + sub + '>div') : raiz.querySelector(':scope>' + sel);
      if (el && el !== raiz) el.classList.add('fin2-esconde');
    });
  }
  function desenharReceita() {
    var box = container('ov-sub-lanc', 'fin2-receita');
    if (!box) return;
    esconderAntigo('ov-sub-lanc', ['.page-hdr', '#aviso-virada-rec', '!lancRecChart']);
    var s = mesSel('lanc-mes-sel2', 'lanc-ano-sel2'), ano = s.ano, mes = s.mes;
    var linhas = tenta('coletaClientesMes', ano, mes) || [];
    var prev = linhas.reduce(function (a, l) { return a + (l.valor || 0); }, 0);
    var pago = linhas.filter(function (l) { return l.pago; }).reduce(function (a, l) { return a + l.valor; }, 0);
    var pend = prev - pago, pct = prev ? pago / prev * 100 : 0;
    var nPago = linhas.filter(function (l) { return l.pago; }).length;
    var porSit = {}; linhas.forEach(function (l) { var k = situacaoCobranca(l); porSit[k] = porSit[k] || { n: 0, v: 0 }; porSit[k].n++; porSit[k].v += l.valor || 0; });
    var venc = porSit.vencido || { n: 0, v: 0 };
    var hoje = new Date(), refHoje = hoje.getFullYear() * 12 + hoje.getMonth();
    var serie = MES_CURTO.map(function (rotM, k) { return { rot: rotM, rec: tenta('finGetRec', ano, k) || 0, desp: 0, prev: ano * 12 + k > refHoje, atual: k === mes }; });
    var porMod = {}; linhas.forEach(function (l) { var r = String(l.modLabel || '').split('—')[0].trim() || 'Outros'; porMod[r] = (porMod[r] || 0) + (l.valor || 0); });
    var fat = fatias(Object.keys(porMod).map(function (k) { return { rot: k, valor: porMod[k] }; }), 4);
    var maiores = linhas.slice().sort(function (a, b) { return b.valor - a.valor; }).slice(0, 8), vmax = maiores.length ? maiores[0].valor : 1;
    var barraSit = SIT_COB.filter(function (x) { return porSit[x[0]] && porSit[x[0]].v > 0; });

    box.innerHTML = topo('Visão Receita', 'Receita de ' + MESES_N[mes], linhas.length ? nPago + ' de ' + linhas.length + ' clientes já pagaram' + (venc.n ? ' · ' + venc.n + ' com boleto vencido' : '') + '.' : 'Nenhum cliente com receita neste mês.', 'mes-receita',
        '<button type="button" class="fin2-btn fin2-btn-escuro" data-fin2="asaas">Conferir com o Asaas</button>') +
      heroBloco('Recebimento de ' + MESES_N[mes], 'Receita de ' + MESES_N[mes] + ' de ' + ano, 'Recebido', 'R$ ' + brl(pago), DESTAQUE,
        prev ? 'de R$ ' + brl(prev) + ' previstos para o mês.' : 'Sem receita prevista neste mês.',
        [['Previsto', brl(prev), linhas.length + ' clientes'], ['Falta receber', brl(pend), (linhas.length - nPago) + ' clientes'], ['Vencido', brl(venc.v), venc.n ? venc.n + (venc.n === 1 ? ' boleto' : ' boletos') : 'nenhum boleto vencido']],
        pct, 'recebido') +
      '<div class="fin2-g2">' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Receita mês a mês</h3><span class="fin2-sub">' + ano + '</span></div>' +
          '<div class="fin2-g-rolar">' + graficoMeses(serie, { soReceita: true, H: 240 }) + '</div>' +
          legenda([['background:#4E38B2', 'mês escolhido'], ['background:#8B7BE0', 'outros meses']].concat(serie.some(function (m) { return m.prev && m.rec; }) ? [['background:#8B7BE0;opacity:.4', 'previsto pelos contratos']] : [])) + '</section>' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>De onde vem a receita</h3></div>' + rosca(fat, prev) + '</section>' +
      '</div>' +
      '<div class="fin2-g3">' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Situação das cobranças</h3><span class="fin2-sub">espelho do Asaas</span></div>' +
          '<div class="fin2-pilha" role="img" aria-label="' + esc(barraSit.map(function (x) { return x[1] + ' ' + porSit[x[0]].n; }).join(', ')) + '">' + barraSit.map(function (x) { return '<i style="flex:' + porSit[x[0]].v.toFixed(2) + ';background:' + x[2] + '"></i>'; }).join('') + '</div>' +
          '<div class="fin2-rosca-l">' + (barraSit.length ? barraSit.map(function (x) { var q = porSit[x[0]]; return '<div><i style="background:' + x[2] + '"></i><span>' + x[1] + ' · ' + q.n + '</span><b class="fin2-mono">' + curto(q.v) + '</b><small>' + Math.round(prev ? q.v / prev * 100 : 0) + '%</small></div>'; }).join('') : '<p class="fin2-sub">Nada para cobrar neste mês.</p>') + '</div>' +
          '<span class="fin2-sub fin2-peq">"Conferir com o Asaas" lê as cobranças do mês e atualiza esta conta.</span></section>' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Maiores clientes do mês</h3><span class="fin2-sub">' + Math.min(8, linhas.length) + ' de ' + linhas.length + '</span></div>' +
          '<div class="fin2-top">' + (maiores.length ? maiores.map(function (l) {
            var k = situacaoCobranca(l), cor = (SIT_COB.filter(function (x) { return x[0] === k; })[0] || [])[2] || '#CFC7E6';
            return '<div><span>' + esc(l.item) + '<small>' + esc(String(l.modLabel || '').split('—')[0].trim()) + '</small></span><div class="fin2-top-t" aria-hidden="true"><i style="width:' + Math.max(2, l.valor / vmax * 100).toFixed(1) + '%"></i></div><b class="fin2-mono">' + curto(l.valor) + '</b><em title="' + esc((SIT_COB.filter(function (x) { return x[0] === k; })[0] || [])[1] || '') + '" style="background:' + cor + '"></em></div>';
          }).join('') : '<p class="fin2-sub">Nenhum cliente com receita neste mês.</p>') + '</div>' +
          '<span class="fin2-sub fin2-peq">A bolinha mostra a situação da cobrança. A lista completa, com NF e observações, está logo abaixo.</span></section>' +
      '</div>';
    var rolar = box.querySelector('.fin2-g-rolar'); if (rolar) rolar.scrollLeft = rolar.scrollWidth;
  }

  // ── 1c. Empresa com gráficos ─────────────────────────────────────────────
  function desenharEmpresa() {
    var box = container('ov-sub-emp', 'fin2-empresa');
    if (!box) return;
    esconderAntigo('ov-sub-emp', ['.page-hdr', '#aviso-virada-emp', '#ov-emp-kpis']);
    var s = mesSel('ov-emp-mes-sel', 'ov-emp-ano-sel'), ano = s.ano, mes = s.mes;
    var recOf = tenta('receitaOficialMes', ano, mes) || { valor: 0, fonte: 'prevista' };
    var rec = recOf.valor || 0, fechado = recOf.fonte === 'notas';
    var aliq = tenta('impostoAliq') || 0, imposto = rec * aliq;
    var despMes = tenta('coletaDespesasMes', ano, mes) || [];
    var despTot = despMes.reduce(function (a, d) { return a + d.vlrMes; }, 0);
    var empD = despMes.filter(function (d) { return d.m && d.m.id === '_empresa'; });
    var custoEmp = empD.reduce(function (a, d) { return a + d.vlrMes; }, 0);
    var dKey = tenta('despPagKey', ano, mes) || (ano + '-' + mes);
    var despPagas = despMes.filter(function (d) { return estaPago(d, dKey); }).reduce(function (a, d) { return a + d.vlrMes; }, 0);
    var recebido = (tenta('coletaClientesMes', ano, mes) || []).filter(function (l) { return l.pago; }).reduce(function (a, l) { return a + l.valor; }, 0);
    var aportes = (ler('empresaReceitas', []) || []).filter(function (er) { if (er.ativo === false || !er.valor || !er.inicio) return false; var p = er.inicio.split('-').map(Number); return p[0] === ano && p[1] - 1 === mes; }).reduce(function (a, er) { return a + er.valor; }, 0);
    var resultado = rec - despTot, caixa = recebido + aportes - despPagas;
    var comp = ano + '-' + String(mes + 1).padStart(2, '0');
    var notas = 0; try { notas = chama('mesFechamentoNotas', comp).total || 0; } catch (e) {}
    var pctNotas = rec ? Math.min(100, notas / rec * 100) : 0;
    var hoje = new Date(), refHoje = hoje.getFullYear() * 12 + hoje.getMonth();
    var serie = MES_CURTO.map(function (rotM, k) {
      return { rot: rotM, rec: tenta('finGetRec', ano, k) || 0, desp: tenta('despesaTotalMesMod', '_empresa', ano, k) || 0, prev: ano * 12 + k > refHoje, atual: k === mes };
    });
    var contas = agruparContas(empD, function (d) { return estaPago(d, dKey); }, vencimentos());
    var porConta = fatias(contas.map(function (g) { return { rot: g.titulo, valor: g.total, det: g.itens.length > 1 ? g.itens.length + ' lançamentos' : '' }; }), 5);
    var cx = [['Recebido dos clientes', recebido, '#15803D'], ['Aportes', aportes, '#8B7BE0'], ['Despesas pagas', -despPagas, '#B42318']];
    var cxMax = Math.max(1, recebido, aportes, despPagas, Math.abs(caixa));
    var rotImp = tenta('impostoRotulo') || '';

    box.innerHTML = topo('Empresa', 'Empresa em ' + MESES_N[mes], 'Imposto, equipe e contador: o que não pertence a um módulo só.', 'mes-empresa',
        '<button type="button" class="fin2-btn" data-fin2="lancar-despesa">Lançar despesa</button>') +
      heroBloco('Resultado de ' + MESES_N[mes], (fechado ? 'Mês fechado pelas notas' : 'Mês aberto · receita prevista pelos contratos'), resultado >= 0 ? 'Resultado' : 'Prejuízo',
        (resultado < 0 ? '−' : '') + 'R$ ' + brl(Math.abs(resultado)), resultado >= 0 ? DESTAQUE : '#FCA5A5',
        'Receita de R$ ' + brl(rec) + ' menos todas as despesas do mês.',
        [['Imposto ' + rotImp, brl(imposto), 'sobre a receita'], ['Custo da empresa', brl(custoEmp), 'imposto, equipe e contador'], ['Caixa realizado', (caixa < 0 ? '−' : '') + brl(Math.abs(caixa)), 'recebido + aportes − pagas']],
        pctNotas, 'em notas') +
      '<div class="fin2-g2">' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Receita e custo da empresa</h3><span class="fin2-sub">' + ano + '</span></div>' +
          '<div class="fin2-g-rolar">' + graficoMeses(serie, { H: 240 }) + '</div>' +
          legenda([['background:#4E38B2', 'receita'], ['background:#E0A458', 'custo da empresa'], ['height:0;border-top:2.5px solid #15803D;width:18px;border-radius:0', 'receita menos custo da empresa']]) + '</section>' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Notas do mês</h3><span class="fin2-sub">' + (fechado ? 'fechado' : 'aberto') + '</span></div>' +
          '<div class="fin2-notas">' + anel(pctNotas, 150, 14, '#4E38B2', '#EFEBF7', '#241A38', '#5D5868', 'emitido') + '</div>' +
          '<div class="fin2-rosca-l"><div><i style="background:#4E38B2"></i><span>Notas emitidas</span><b class="fin2-mono">' + brl(notas) + '</b></div>' +
          '<div><i style="background:#EFEBF7"></i><span>Receita do mês</span><b class="fin2-mono">' + brl(rec) + '</b></div></div>' +
          '<span class="fin2-sub fin2-peq">O resultado oficial fecha pelas notas emitidas no Faturamento.</span></section>' +
      '</div>' +
      '<div class="fin2-g3">' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Para onde vai o custo da empresa</h3><span class="fin2-sub fin2-mono">R$ ' + brl(custoEmp) + '</span></div>' +
          (porConta.length ? aneisDespesa(porConta) : '<p class="fin2-sub">Nenhuma despesa da empresa neste mês.</p>') + '</section>' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Caixa do mês</h3><span class="fin2-sub">o que de fato entrou e saiu</span></div>' +
          '<div class="fin2-caixa">' + cx.map(function (x) {
            return '<div><span>' + x[0] + '</span><div class="fin2-top-t" aria-hidden="true"><i style="width:' + Math.max(x[1] ? 2 : 0, Math.abs(x[1]) / cxMax * 100).toFixed(1) + '%;background:' + x[2] + '"></i></div><b class="fin2-mono' + (x[1] < 0 ? ' fin2-vermelho' : '') + '">' + (x[1] < 0 ? '−' : x[1] > 0 ? '+' : '') + brl(Math.abs(x[1])) + '</b></div>';
          }).join('') +
          '<div class="fin2-caixa-tot"><span>Caixa realizado</span><b class="fin2-mono' + (caixa < 0 ? ' fin2-vermelho' : ' fin2-verde') + '">' + (caixa < 0 ? '−' : '') + 'R$ ' + brl(Math.abs(caixa)) + '</b></div></div>' +
          '<span class="fin2-sub fin2-peq">Conta só o que foi marcado como recebido (Visão Receita) e como pago (Contas do mês).</span></section>' +
      '</div>';
    var rolar = box.querySelector('.fin2-g-rolar'); if (rolar) rolar.scrollLeft = rolar.scrollWidth;
  }

  // ── Painéis de gestão à vista: Contas do mês e Módulo (27/11) ────────────
  function painelContas(s, L, total, pago, nLanc, aPagar, pagas, C) {
    var hoje = new Date(), refHoje = hoje.getFullYear() * 12 + hoje.getMonth(), diaHoje = hoje.getDate();
    var p = total ? pago / total * 100 : 0;
    var serie = MES_CURTO.map(function (rotM, k) { return { rot: rotM, rec: tenta('finGetDesp', s.ano, k) || 0, desp: 0, prev: s.ano * 12 + k > refHoje, atual: k === s.mes }; });
    var vencidas = 0, semana = 0, vencV = 0;
    if (s.ano * 12 + s.mes === refHoje) aPagar.forEach(function (g) { if (g.dia && g.dia < diaHoje) { vencidas++; vencV += g.total; } else if (g.dia && g.dia <= diaHoje + 7) semana++; });
    var fat = fatias(L.map(function (g) { return { rot: g.titulo, valor: g.total, det: g.itens.length > 1 ? g.itens.length + ' lançamentos' : '' }; }), 5);
    var maior = L.slice().sort(function (a, b) { return b.total - a.total; })[0];
    var porMod = {}; L.forEach(function (g) { g.itens.forEach(function (d) { var r = moduloRot(d.m) || 'Empresa'; porMod[r] = (porMod[r] || 0) + d.vlrMes; }); });
    var mods = fatias(Object.keys(porMod).map(function (r) { return { rot: r, valor: porMod[r] }; }), 4);
    return heroBloco('Contas de ' + MESES_N[s.mes], 'Contas de ' + MESES_N[s.mes] + ' · ' + L.length + ' contas', 'Pago', 'R$ ' + brl(pago), pago >= total && total ? '#4ADE80' : DESTAQUE,
        'de R$ ' + brl(total) + ' em ' + nLanc + ' lançamentos.',
        [['A pagar', brl(total - pago), aPagar.length + (aPagar.length === 1 ? ' conta' : ' contas')], ['Vencidas', String(vencidas), vencidas ? 'R$ ' + brl(vencV) : 'nenhuma'], ['Vencem em 7 dias', String(semana), 'contas'], ['Maior conta', maior ? curto(maior.total) : '—', maior ? maior.titulo : '']],
        p, 'pago') +
      '<div class="fin2-g2c">' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Despesa mês a mês</h3><span class="fin2-sub">' + s.ano + '</span></div>' +
          '<div class="fin2-g-rolar">' + graficoMeses(serie, { soReceita: true, H: 230 }) + '</div>' +
          legenda([['background:#4E38B2', 'mês escolhido'], ['background:#8B7BE0', 'outros meses'], ['background:#8B7BE0;opacity:.4', 'previsto']]) + '</section>' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Por módulo</h3></div>' + rosca(mods, total).replace('<span>receita</span>', '<span>despesa</span>') + '</section>' +
      '</div>' +
      '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Maiores contas</h3><span class="fin2-sub fin2-mono">R$ ' + brl(total) + '</span></div>' + (fat.length ? aneisDespesa(fat).replace('fin2-aneis', 'fin2-aneis fin2-aneis-3') : '<p class="fin2-sub">Nenhuma conta neste mês.</p>') + '</section>';
  }
  function painelModulo(m, s, recMes, custoMes, noAr, cli, forn, todos) {
    var hoje = new Date(), refHoje = hoje.getFullYear() * 12 + hoje.getMonth(), res = recMes - custoMes, mgM = recMes > 0 ? Math.max(0, Math.min(100, res / recMes * 100)) : 0;
    var serie = MES_CURTO.map(function (rotM, k) { return { rot: rotM, rec: tenta('recModMes', m.id, s.ano, k) || 0, desp: tenta('despesaTotalMesMod', m.id, s.ano, k) || 0, prev: s.ano * 12 + k > refHoje, atual: k === s.mes }; });
    var ativos = cli.filter(function (c) { return c.estado === 'ativo' || c.estado === 'termina'; });
    var termina = cli.filter(function (c) { return c.estado === 'termina'; }).length;
    var ticket = ativos.length ? ativos.reduce(function (a, c) { return a + c.valor; }, 0) / ativos.length : 0;
    var top = ativos.slice().sort(function (a, b) { return b.valor - a.valor; }).slice(0, 8), vmax = top.length ? top[0].valor : 1;
    var custoF = {}; todos.forEach(function (d) { var f = (d.r && d.r.f && d.r.f !== '—') ? d.r.f : (d.r && d.r.d) || 'Outros'; custoF[f] = (custoF[f] || 0) + d.vlrMes; });
    var fat = fatias(Object.keys(custoF).map(function (f) { return { rot: f, valor: custoF[f] }; }), 3);
    return heroBloco(moduloRot(m) + ' em ' + MESES_N[s.mes], moduloRot(m) + ' · ' + MESES_N[s.mes] + ' de ' + s.ano, res >= 0 ? 'Resultado' : 'Prejuízo', (res < 0 ? '−' : '') + 'R$ ' + brl(Math.abs(res)), res >= 0 ? DESTAQUE : '#FCA5A5',
        'Receita R$ ' + brl(recMes) + ' · custo R$ ' + brl(custoMes) + (forn.length ? ' (' + forn.slice(0, 3).join(', ') + (forn.length > 3 ? '…' : '') + ')' : '') + '.',
        [['Clientes no ar', String(noAr), termina ? termina + ' termina' + (termina > 1 ? 'm' : '') + ' este mês' : 'nenhum termina'], ['Ticket médio', curto(ticket), 'por cliente'], ['Receita', brl(recMes), 'no mês'], ['Custo', brl(custoMes), 'no mês']],
        mgM, 'de margem') +
      '<div class="fin2-g2c">' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Receita e custo mês a mês</h3><span class="fin2-sub">' + s.ano + '</span></div>' +
          '<div class="fin2-g-rolar">' + graficoMeses(serie, { H: 230 }) + '</div>' +
          legenda([['background:#4E38B2', 'receita'], ['background:#E0A458', 'custo'], ['height:0;border-top:2.5px solid #15803D;width:18px;border-radius:0', 'resultado']]) + '</section>' +
        '<section class="fin2-bloco fin2-graf"><div class="fin2-bloco-cab"><h3>Maiores clientes</h3><span class="fin2-sub">por mês</span></div>' +
          (top.length ? '<div class="fin2-top fin2-top-c">' + top.map(function (c) { return '<div><span>' + esc(c.item) + '</span><div class="fin2-top-t" aria-hidden="true"><i style="width:' + Math.max(2, c.valor / vmax * 100).toFixed(1) + '%"></i></div><b class="fin2-mono">' + curto(c.valor) + '</b><em style="background:' + (c.estado === 'termina' ? '#B45309' : '#15803D') + '" title="' + (c.estado === 'termina' ? 'termina este mês' : 'no ar') + '"></em></div>'; }).join('') + '</div>' : '<p class="fin2-sub">Nenhum cliente no ar.</p>') +
          (fat.length ? '<div class="fin2-bloco-cab fin2-sub-cab"><h3>Custos</h3></div><div class="fin2-rosca-l">' + fat.map(function (f, i) { return '<div><i style="background:' + PAL[i % PAL.length] + '"></i><span>' + esc(f.rot) + '</span><b class="fin2-mono">' + curto(f.valor) + '</b><small>' + Math.round(f.pct) + '%</small></div>'; }).join('') + '</div>' : '') + '</section>' +
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
    // 27/11 (usabilidade): a linha sumia para "Pagas" sem aviso; agora diz o que fez e deixa desfazer
    if (typeof global.mgbAcao === 'function') global.mgbAcao((novo ? 'Conta paga: ' : 'Conta voltou para a pagar: ') + g.titulo + ' (' + brl(g.total) + ')');
    tenta('scheduleSave');
    desenharContas();
    if (typeof global.mgbAviso === 'function') global.mgbAviso((novo ? g.titulo + ' paga em ' + hoje : g.titulo + ' voltou para "A pagar"'), { rotulo: 'Desfazer', acao: function () { marcarConta(chave); } });
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
    var lista = filtroContas === 'pagas' ? pagas : aPagar.slice().sort(function (a, b) { // vencidas e as que vencem antes em cima
      var va = situacaoVenc(a.dia, s.ano, s.mes), vb = situacaoVenc(b.dia, s.ano, s.mes);
      return (va ? va.dias : 99) - (vb ? vb.dias : 99) || (a.dia || 99) - (b.dia || 99);
    });
    var pct = total > 0 ? Math.min(100, pago / total * 100) : 0;
    var linhas = lista.map(function (g) {
      var k = esc(g.chave), aberto = !!abertas[g.chave];
      var dia = editandoDia === g.chave
        ? '<label class="fin2-dia-rot" for="fin2-dia">Vence todo dia</label><input id="fin2-dia" class="fin2-dia" inputmode="numeric" maxlength="2" placeholder="10" value="' + (g.dia || '') + '" data-fin2-dia="' + k + '"><button type="button" class="fin2-link fin2-dia-ok" data-fin2="dia-ok:' + k + '">OK</button>'
        : '<button type="button" class="fin2-link" data-fin2="dia:' + k + '" aria-label="Dia de vencimento de ' + esc(g.titulo) + '">' + (g.dia ? 'dia ' + g.dia : 'definir dia') + '</button>';
      var sv = !g.pago && editandoDia !== g.chave ? situacaoVenc(g.dia, s.ano, s.mes) : null;
      if (sv) dia += ' ' + chip(sv.txt, sv.tom);
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
      painelContas(s, L, total, pago, nLanc, aPagar, pagas, C) +
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
      painelModulo(m, s, recMes, custoMes, noAr, cli, forn, todos) +
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
      else if (acao === 'aba') chama('switchOvTab', arg);
      else if (acao === 'mes-receita') mudarMes('lanc-mes-sel2', 'lanc-ano-sel2', +arg, function () { chama('buildLancRec'); });
      else if (acao === 'mes-empresa') mudarMes('ov-emp-mes-sel', 'ov-emp-ano-sel', +arg, function () { chama('buildVisaoEmpresa'); });
      else if (acao === 'asaas') chama('lancRecConferirAsaas');
      else if (acao === 'lancar-despesa') { if (global.MGBLancar && global.MGBLancar.despesa) global.MGBLancar.despesa(); }
      else if (acao === 'voltar-resumo') { chama('goPage', 'overview'); tenta('switchOvTab', 'visao'); }
      else if (acao === 'filtro') { filtroContas = arg; desenharContas(); }
      else if (acao === 'abrir') { abertas[arg] = !abertas[arg]; desenharContas(); }
      else if (acao === 'dia') { editandoDia = arg; desenharContas(); }
      else if (acao === 'dia-ok') { var di = doc.getElementById('fin2-dia'); if (editandoDia && di) salvarDia(arg, di.value); }
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
    if (ev.key === 'Enter' && t && t.matches && t.matches('tr.fin2-clicavel,div.fin2-clicavel')) { t.click(); ev.preventDefault(); }
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
      '.fin2-dia-rot{font-size:13px;color:#5D5868;margin-right:6px}.fin2-dia-ok{margin-left:6px;min-height:36px}' +
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
      // Resumo do mês com gráficos (aprovado em 27/11)
      '.fin2-topo{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px}.fin2-topo>div:first-child{display:flex;flex-direction:column;gap:6px;min-width:0}' +
      '.fin2-topo h2{font-size:40px;line-height:1.05;letter-spacing:-.02em}.fin2-topo p{margin:0;font-size:15px}.fin2-topo .fin2-sub b{color:#241A38}' +
      '.fin2-btn-escuro{background:#241A38}.fin2-btn-escuro:hover{background:#000}' +
      '.fin2-hero{background:#2A1760;color:#fff;border-radius:22px;padding:30px 32px;display:flex;flex-wrap:wrap;align-items:center;gap:28px;position:relative;overflow:hidden}' +
      '.fin2-hero:before{content:"";position:absolute;right:-90px;top:-110px;width:320px;height:320px;border-radius:50%;border:44px solid rgba(255,255,255,.05);pointer-events:none}' +
      '.fin2-hero-txt{flex:999 1 420px;display:flex;flex-direction:column;gap:16px;min-width:0;position:relative}' +
      '.fin2-hero-chip{align-self:flex-start;font-size:12.5px;font-weight:600;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.12);color:#E8E2FA}' +
      '.fin2-hero h3{font-size:36px;line-height:1.1;letter-spacing:-.02em;color:#fff}.fin2-hero h3 .fin2-mono{font-weight:500;letter-spacing:-.02em}.fin2-hero p{margin:4px 0 0;font-size:15px;color:#D9D2F2}' +
      '.fin2-hero-nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.fin2-hero-nums>div{display:flex;flex-direction:column;gap:3px;min-width:0}' +
      '.fin2-hero-nums span,.fin2-hero-nums small{font-size:13px;color:#C9C0E6}.fin2-hero-nums small{font-size:12.5px}.fin2-hero-nums b{font-size:22px;font-weight:500;color:#fff}' +
      '.fin2-hero-anel{flex:1 1 150px;display:flex;justify-content:center;position:relative}' +
      '.fin2-anel{position:relative;flex:none}.fin2-anel svg{display:block}.fin2-anel>div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}' +
      '.fin2-anel b{font:500 15px "DM Mono",ui-monospace,monospace}.fin2-hero-anel .fin2-anel b{font-size:32px}.fin2-anel span{font-size:12.5px}' +
      '.fin2-g2{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:20px}.fin2-g3{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}' +
      '.fin2-graf{gap:14px}.fin2-graf h3{font-size:20px}.fin2-peq{font-size:13px!important}' +
      '.fin2-g-rolar{overflow-x:auto}.fin2-g{width:100%;min-width:520px;height:auto;display:block}' +
      '.fin2-g-eixo{font:11px "DM Mono",ui-monospace,monospace;fill:#5D5868}.fin2-g-mes{font:11.5px "DM Sans",system-ui,sans-serif;fill:#5D5868}.fin2-g-atual{fill:#241A38;font-weight:700}.fin2-g-res{font:600 12px "DM Mono",ui-monospace,monospace;fill:#15803D}' +
      '.fin2-leg{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:13.5px;color:#5D5868}.fin2-leg span{display:inline-flex;align-items:center;gap:7px}.fin2-leg i{width:12px;height:12px;border-radius:3px;display:inline-block}' +
      '.fin2-rosca{position:relative;width:180px;height:180px;margin:0 auto}.fin2-rosca svg{display:block}.fin2-rosca>div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}' +
      '.fin2-rosca b{font:500 22px "DM Mono",ui-monospace,monospace}.fin2-rosca span{font-size:12.5px;color:#5D5868}' +
      '.fin2-rosca-l>div{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid #EFEBF7;font-size:14px}.fin2-rosca-l i{width:10px;height:10px;border-radius:3px;flex:none}' +
      '.fin2-rosca-l span{flex:1;min-width:0}.fin2-rosca-l b{font-size:13.5px;font-weight:500}.fin2-rosca-l small{width:40px;text-align:right;font-size:13px;color:#5D5868}' +
      '.fin2-falta-l i{border:1.5px dashed #CFC7E6;background:none!important;box-sizing:border-box}.fin2-falta-l span{color:#5D5868}' +
      '.fin2-div{display:flex;flex-direction:column}.fin2-div>div{display:grid;grid-template-columns:minmax(0,190px) minmax(0,1fr) 84px;align-items:center;gap:12px;padding:6px 4px;border-radius:8px}' +
      '.fin2-div>div.fin2-clicavel:hover{background:#FBFAFE}.fin2-div>div:focus-visible{outline:3px solid #6C55DB;outline-offset:0}.fin2-div span{font-size:14px;min-width:0}' +
      '.fin2-div-t{position:relative;height:16px;background:#F6F4FA;border-radius:6px}.fin2-div-t i{position:absolute;top:0;bottom:0;min-width:3px;background:#4E38B2;border-radius:0 6px 6px 0}' +
      '.fin2-div-t i.fin2-neg{background:#B42318;border-radius:6px 0 0 6px}.fin2-div-t u{position:absolute;top:-4px;bottom:-4px;width:1.5px;background:#CFC7E6}.fin2-div b{font-size:13.5px;font-weight:500;text-align:right;white-space:nowrap}' +
      '.fin2-aneis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 16px}.fin2-aneis>div{display:flex;align-items:center;gap:12px;min-width:0}' +
      '.fin2-aneis>div>div:last-child{display:flex;flex-direction:column;gap:1px;min-width:0}.fin2-aneis b{font-size:15px}.fin2-aneis .fin2-mono{font-size:13.5px}.fin2-aneis small{font-size:13px;color:#5D5868}' +
      '.fin2-pago{display:flex;flex-direction:column;gap:8px;margin-top:6px}.fin2-pago>div:first-child{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.fin2-pago b{font-size:15px}' +
      '.fin2-nota{background:#F6F4FA;border-radius:12px;padding:12px 14px;font-size:14px;color:#3A3446}' +
      '.fin2-ativo-v>.fin2-esconde{display:none!important}#fin2-receita,#fin2-empresa{padding-bottom:18px}' +
      '.fin2-pilha{display:flex;gap:3px;height:16px;border-radius:999px;overflow:hidden;background:#EFEBF7}.fin2-pilha i{display:block;min-width:4px}' +
      '.fin2-top,.fin2-caixa{display:flex;flex-direction:column}.fin2-top>div,.fin2-caixa>div{display:grid;grid-template-columns:minmax(0,190px) minmax(0,1fr) 84px 10px;align-items:center;gap:12px;padding:6px 0}' +
      '.fin2-caixa>div{grid-template-columns:minmax(0,170px) minmax(0,1fr) 110px}.fin2-top span,.fin2-caixa span{font-size:14px;min-width:0;display:flex;flex-direction:column}.fin2-top small{font-size:12.5px;color:#5D5868}' +
      '.fin2-top-t{position:relative;height:14px;background:#F6F4FA;border-radius:6px;overflow:hidden}.fin2-top-t i{position:absolute;left:0;top:0;bottom:0;background:#4E38B2;border-radius:6px}' +
      '.fin2-top b,.fin2-caixa b{font-size:13.5px;font-weight:500;text-align:right;white-space:nowrap}.fin2-top em{width:10px;height:10px;border-radius:50%}' +
      '.fin2-caixa-tot{border-top:1px solid #E4DFF0;margin-top:6px;padding-top:12px!important;grid-template-columns:1fr auto!important}.fin2-caixa-tot span{font-weight:700;font-size:15px}.fin2-caixa-tot b{font-size:18px}' +
      '.fin2-notas{display:flex;justify-content:center}.fin2-notas .fin2-anel b{font-size:26px}' +
      // Painel compacto (27/11): letras menores, mais informação por tela
      '#fin2-resumo,#fin2-receita,#fin2-empresa{max-width:1240px;padding:20px 22px 8px;gap:14px}' +
      '#fin2-resumo .fin2-topo h2,#fin2-receita .fin2-topo h2,#fin2-empresa .fin2-topo h2{font-size:30px}.fin2-topo p{font-size:13.5px!important}.fin2-topo .fin2-sub{font-size:12.5px}' +
      '#fin2-resumo .fin2-icone,#fin2-receita .fin2-icone,#fin2-empresa .fin2-icone{width:38px;height:38px}#fin2-resumo .fin2-acoes .fin2-btn,#fin2-receita .fin2-acoes .fin2-btn,#fin2-empresa .fin2-acoes .fin2-btn{min-height:38px;font-size:13px}' +
      '.fin2-hero{padding:20px 24px;gap:22px;border-radius:18px;background:linear-gradient(135deg,#2A1760 0%,#3B2386 100%);box-shadow:0 10px 30px rgba(42,23,96,.18)}' +
      '.fin2-hero-txt{gap:10px}.fin2-hero h3{font-size:24px}.fin2-hero p{font-size:13px;margin-top:2px}.fin2-hero p b{color:#fff;font-weight:600}.fin2-hero-chip{font-size:11.5px;padding:4px 10px}' +
      '.fin2-hero-nums{gap:12px}.fin2-hero-nums b{font-size:17px}.fin2-hero-nums span,.fin2-hero-nums small{font-size:11.5px}.fin2-hero-4{grid-template-columns:repeat(4,minmax(0,1fr))}' +
      '.fin2-hero-meta{display:flex;flex-direction:column;align-items:flex-end;gap:2px;position:relative}.fin2-hero-meta span{font-size:11px;letter-spacing:.12em;color:#C9C0E6;font-weight:700}.fin2-hero-meta b{font-size:40px;font-weight:500;letter-spacing:-.03em;line-height:1}' +
      '.fin2-hero-anel{flex:0 0 auto}.fin2-hero-anel .fin2-anel b{font-size:24px}' +
      '.fin2-bloco.fin2-graf{padding:16px 18px;gap:10px;border-radius:16px}.fin2-graf h3{font-size:15.5px!important}.fin2-graf .fin2-sub{font-size:12.5px}.fin2-peq{font-size:12px!important}' +
      '.fin2-graf .fin2-bloco-cab{gap:8px}.fin2-graf .fin2-chip{font-size:11.5px;padding:3px 9px}.fin2-leg{font-size:12px}' +
      '.fin2-chip.fin2-erro{color:#B42318;background:#FDECEA}.fin2-chip.fin2-neutro{color:#5D5868;background:#EFEBF7}' +
      '.fin2-mods{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.fin2-graf>.fin2-link{align-self:flex-start}' +
      '.fin2-mod{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;gap:4px;padding:12px 14px 14px;border-radius:14px;border:1px solid #E4DFF0;border-top:3px solid #CFC7E6;background:#fff;font-family:"DM Sans",system-ui,sans-serif;color:#241A38;min-width:0}' +
      '.fin2-mod:hover{border-color:#CFC7E6;box-shadow:0 4px 14px rgba(42,23,96,.08)}.fin2-mod:focus-visible{outline:3px solid #6C55DB;outline-offset:2px}' +
      '.fin2-mod-saudavel{border-top-color:#15803D;background:#F6FBF8}.fin2-mod-atencao{border-top-color:#B45309;background:#FFFAF2}.fin2-mod-critico{border-top-color:#B42318;background:#FEF6F5}' +
      '.fin2-mod-cab{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;width:100%}.fin2-mod-cab b{font-size:13.5px;line-height:1.25;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fin2-mod .fin2-chip{font-size:11px;padding:2px 8px}' +
      '.fin2-mod-v{font-size:22px;font-weight:500;letter-spacing:-.02em}.fin2-mod small{font-size:11.5px;color:#5D5868;line-height:1.35}' +
      '.fin2-mod-b{position:relative;height:5px;border-radius:999px;background:#E9E5F3;margin-top:6px}.fin2-mod-b i{position:absolute;left:0;top:0;bottom:0;border-radius:999px}.fin2-mod-b u{position:absolute;top:-3px;bottom:-3px;width:2px;background:#241A38;border-radius:2px}' +
      '.fin2-g2b{display:grid;grid-template-columns:minmax(0,2.2fr) minmax(0,1fr);gap:14px}.fin2-g2c{display:grid;grid-template-columns:minmax(0,1.9fr) minmax(0,1fr);gap:14px}.fin2-g3c{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}' +
      '.fin2-prox{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.fin2-prox>div{background:#F3F0FA;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:2px;min-width:0}' +
      '.fin2-prox span{font-size:11px;letter-spacing:.08em;font-weight:700;color:#5D5868}.fin2-prox b{font-size:21px;font-weight:500}.fin2-prox small{font-size:11.5px;color:#5D5868}.fin2-prox em{font-style:normal;font-size:12.5px;font-weight:500}' +
      '.fin2-prox i{display:block;height:4px;border-radius:999px;background:#E2DCF2;margin-top:4px;overflow:hidden}.fin2-prox i u{display:block;height:100%;background:#4E38B2}' +
      '.fin2-cap{font-size:12px!important;letter-spacing:.08em;text-transform:uppercase;color:#5D5868}.fin2-grande{font-size:28px;font-weight:500;letter-spacing:-.02em;line-height:1.1}.fin2-grande small{font-size:13px;color:#5D5868;margin-left:3px}' +
      '.fin2-ren{display:flex;flex-direction:column}.fin2-ren>div{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:baseline;padding:5px 0;border-top:1px solid #EFEBF7;font-size:12.5px}' +
      '.fin2-ren span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fin2-ren small{color:#5D5868;font-size:11.5px}.fin2-ren b{font-weight:500}' +
      '.fin2-pulso{background:linear-gradient(160deg,#2A1760,#1E1048);color:#fff;border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;min-width:0;box-shadow:0 10px 30px rgba(42,23,96,.2)}' +
      '.fin2-pulso-cab{display:flex;align-items:center;gap:10px}.fin2-pulso-cab>div{display:flex;flex-direction:column}.fin2-pulso-cab b{font-size:14.5px}.fin2-pulso-cab small{font-size:11.5px;color:#C9C0E6}' +
      '.fin2-pulso-ic{width:34px;height:34px;border-radius:50%;background:#4E38B2;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12.5px}' +
      '.fin2-spark{width:100%;height:46px;display:block}' +
      '.fin2-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.fin2-tile{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:9px 11px;display:flex;flex-direction:column;gap:1px;min-width:0}' +
      '.fin2-tile span{font-size:10.5px;letter-spacing:.08em;font-weight:700;color:#C9C0E6}.fin2-tile b{font-size:19px;font-weight:500;color:#fff}.fin2-tile small{font-size:11px;color:#C9C0E6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.fin2-pulso-bt{align-self:flex-end;min-height:34px;padding:0 14px;border:0;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font:600 12.5px "DM Sans",system-ui,sans-serif;cursor:pointer}.fin2-pulso-bt:hover{background:rgba(255,255,255,.24)}' +
      '.fin2-g3c .fin2-aneis{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 10px}.fin2-g3c .fin2-aneis>div{gap:8px}.fin2-g3c .fin2-aneis .fin2-anel{transform:scale(.82);margin:-5px}' +
      '.fin2-g3c .fin2-aneis b{font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fin2-g3c .fin2-aneis .fin2-mono{font-size:12px}.fin2-g3c .fin2-aneis small{font-size:11px}' +
      '.fin2-g3c .fin2-rosca{width:150px;height:150px}.fin2-g3c .fin2-rosca svg{width:150px;height:150px}.fin2-g3c .fin2-rosca b{font-size:18px}.fin2-g3c .fin2-rosca-l>div{padding:5px 0;font-size:12.5px}.fin2-g3c .fin2-rosca-l b{font-size:12px}.fin2-g3c .fin2-rosca-l small{font-size:11.5px;width:34px}' +
      '.fin2-lista-c>div{display:flex;align-items:flex-start;gap:9px;padding:7px 0;border-top:1px solid #EFEBF7}.fin2-lista-c .fin2-ponto{margin-top:5px;width:8px;height:8px}.fin2-lista-c>div>span:nth-child(2){flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}' +
      '.fin2-lista-c b{font-size:12.5px;font-weight:600}.fin2-lista-c small{font-size:11.5px;color:#5D5868}' +
      '.fin2-chip-bt{flex:none;min-height:28px;padding:0 10px;border-radius:999px;border:1px solid #CFC7E6;background:#fff;color:#2A1760;font:600 12px "DM Sans",system-ui,sans-serif;cursor:pointer}.fin2-chip-bt:hover{background:#ECE8FA}' +
      '.fin2-sub-cab{margin-top:6px}.fin2-mud-c li{font-size:12.5px!important;padding:6px 0!important;gap:8px!important}.fin2-mud-c .fin2-mono{font-size:12px}' +
      '#fin2-receita .fin2-hero-anel .fin2-anel,#fin2-empresa .fin2-hero-anel .fin2-anel{transform:scale(.75);margin:-20px}' +
      '#fin2-receita .fin2-g2,#fin2-empresa .fin2-g2,#fin2-receita .fin2-g3,#fin2-empresa .fin2-g3{gap:14px}' +
      '#fin2-receita .fin2-top>div,#fin2-receita .fin2-rosca-l>div,#fin2-empresa .fin2-rosca-l>div,#fin2-empresa .fin2-caixa>div{padding:4px 0;font-size:13px}#fin2-receita .fin2-top span{font-size:13px}' +
      '#fin2-empresa .fin2-aneis,#fin2-receita .fin2-aneis{gap:10px}' +
      '.fin2-aneis-3{grid-template-columns:repeat(3,minmax(0,1fr))!important}.fin2-top-c>div{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 70px 10px!important;padding:4px 0!important}.fin2-top-c span{font-size:12.5px!important}' +
      '#fin2-contas,#fin2-modulo{max-width:1240px;gap:14px}#fin2-contas .fin2-hero-anel .fin2-anel,#fin2-modulo .fin2-hero-anel .fin2-anel{transform:scale(.75);margin:-20px}' +
      '.fin2-ctt-linha{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}.fin2-ctt-linha>span{display:flex;flex-wrap:wrap;gap:6px}' +
      '@media (max-width:760px){.fin2{padding:18px 14px 8px}.fin2-g2,.fin2-g3,.fin2-aneis{grid-template-columns:minmax(0,1fr)}.fin2-hero{padding:22px 20px;gap:20px}.fin2-hero h3{font-size:27px}.fin2-hero-nums{grid-template-columns:repeat(2,minmax(0,1fr))!important}.fin2-hero-anel .fin2-anel{transform:scale(.85)}.fin2-topo h2{font-size:32px}.fin2-div>div{grid-template-columns:minmax(0,1fr) 84px}.fin2-div span{grid-column:1/-1}.fin2-top>div{grid-template-columns:minmax(0,1fr) 84px 10px}.fin2-top>div>span{grid-column:1/-1}.fin2-caixa>div:not(.fin2-caixa-tot){grid-template-columns:minmax(0,1fr) 110px}.fin2-caixa>div:not(.fin2-caixa-tot)>span{grid-column:1/-1}.fin2-linha-txt{flex-basis:calc(100% - 30px)!important}.fin2-g2b,.fin2-g2c,.fin2-g3c,.fin2-aneis-3{grid-template-columns:minmax(0,1fr)!important}.fin2-hero-4{grid-template-columns:repeat(2,minmax(0,1fr))}.fin2-hero-meta{align-items:flex-start}.fin2-hero-meta b{font-size:32px}.fin2-prox{gap:6px}.fin2-prox>div{padding:9px 10px}.fin2-prox b{font-size:16px}.fin2-prox small{display:none}.fin2-mods{grid-template-columns:repeat(2,minmax(0,1fr))}.fin2-mod-v{font-size:19px}#page-overview div:has(>.mtab){overflow-x:auto;scrollbar-width:none}#page-overview div:has(>.mtab)>.mtab{flex:none}.fin2 h2{font-size:22px}.fin2-nums{grid-template-columns:1fr}.fin2-num b{font-size:22px}.fin2-duas{grid-template-columns:1fr}' +
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
    // Visão Receita e Empresa com gráficos (o botão Lançar despesa da Empresa, pedido de 23/11, fica no topo novo)
    envolver('buildLancRec', desenharReceita);
    envolver('buildVisaoEmpresa', desenharEmpresa);
    // nomes das abas do Financeiro MGB
    var t1 = doc.getElementById('ov-tab-visao'), t2 = doc.getElementById('ov-tab-desp');
    if (t1) t1.textContent = 'Resumo do mês';
    if (t2) t2.textContent = 'Contas do mês';
  }

  global.MGBFinanceiro = Object.assign({ resumo: desenharResumo, contas: desenharContas, modulo: desenharModulo, receita: desenharReceita, empresa: desenharEmpresa, contasAvisar: contasAvisar,
    // Abre o módulo já com o painel do cliente (botão "Abrir no módulo" da ficha, 27/11)
    abrirCliente: function (item) { aberto = item; try { desenharModulo(); desenharPainel(); } catch (e) { console.error('financeiro:', e); } } }, regras);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
