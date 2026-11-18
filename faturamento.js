/* Hub MGB — Faturamento do dia 5 no desenho aprovado em 18/11/2026 (canvas "Hub MGB — proposta visual").
 *
 * Só troca a APRESENTAÇÃO da tela Contabilidade › Faturamento. Toda a regra continua nas funções que já
 * existiam no index.html (fFatCarregar, fFatEmitirSelecionados, fFatModo, fFatValor, fFatSetVencDia,
 * fFatBaixaManual, fFatCancelar, fFatEnviarWhats, fFatRecibo, fFatEditar, fFatBoleto…). Os campos de
 * competência, ISS e Simples são os MESMOS elementos de antes, só mudam de lugar.
 *
 * Decisões de 18/11: as lojas da Léo Cosméticos continuam na área própria (já ficavam fora da lista);
 * cliente com o mês anterior vencido é emitido normalmente — o aviso fica na linha.
 */
(function (global) {
  'use strict';
  var doc = global.document;
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var EMITIDOS = ['emitida', 'aguardando-nota', 'boleto-emitido', 'emitindo'];

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function nomeMes(comp) { var m = /^(\d{4})-(\d{2})$/.exec(comp || ''); return m ? MESES[+m[2] - 1] : ''; }
  function mesAnterior(comp) { var m = /^(\d{4})-(\d{2})$/.exec(comp || ''); if (!m) return ''; var d = new Date(+m[1], +m[2] - 2, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function somaMes(comp, n) { var m = /^(\d{4})-(\d{2})$/.exec(comp || ''); if (!m) return comp; var d = new Date(+m[1], +m[2] - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

  // ── Regras puras (testadas em bot/test/faturamento.test.js) ──────────────
  function emitido(r) { return EMITIDOS.indexOf(r.status) !== -1; }
  function faltaValor(r, manual) { return !emitido(r) && !!manual && !(Number(r.valor) > 0); }

  function situacao(r, manual) {
    if (r.status === 'erro') return { rotulo: 'Erro ao emitir', tom: 'erro' };
    if (r.status === 'emitindo') return { rotulo: 'Emitindo…', tom: 'acao' };
    if (r.status === 'aguardando-nota') return { rotulo: 'Aguardando nota', tom: 'acao' };
    if (r.status === 'boleto-emitido') return { rotulo: 'Boleto emitido · falta a nota', tom: 'atencao' };
    if (r.status === 'emitida') return { rotulo: 'Emitida' + (r.nfNumero ? ' · NF ' + r.nfNumero : ''), tom: 'ok' };
    if (faltaValor(r, manual)) return { rotulo: 'Falta o valor', tom: 'atencao' };
    return { rotulo: 'A emitir', tom: 'acao' };
  }

  // anterior: {st:'vencido'|'pago'|...} do mês anterior (fFatUltimoPag / pagAnterior)
  function filtrar(linhas, filtro, info) {
    return linhas.filter(function (r) {
      var i = info(r);
      if (filtro === 'emitir') return !emitido(r);
      if (filtro === 'nota') return r.status === 'aguardando-nota' || r.status === 'boleto-emitido';
      if (filtro === 'problema') return r.status === 'erro' || r.statusPagamento === 'vencido' || (i.anterior && i.anterior.st === 'vencido') || faltaValor(r, i.manual);
      return true;
    });
  }

  function etapas(linhas) {
    var e = { total: linhas.length, emitidos: 0, notas: 0, recebidos: 0 };
    linhas.forEach(function (r) {
      if (emitido(r)) e.emitidos++;
      if (r.nfNumero) e.notas++;
      if (r.statusPagamento === 'pago') e.recebidos++;
    });
    return e;
  }

  // Recebimento das cobranças emitidas (boleto). Baixa manual conta como pago.
  function recebimento(linhas, baixa) {
    var o = { emitidos: 0, comBoleto: 0, pagos: 0, pendentes: 0, vencidos: 0, semStatus: 0, notas: 0, semNumero: 0 };
    linhas.forEach(function (r) {
      if (!emitido(r)) return;
      o.emitidos++;
      if (r.modo !== 'boleto') { if (r.nfNumero) o.notas++; else o.semNumero++; }
      var pago = r.statusPagamento === 'pago' || (baixa && baixa(r));
      if (r.modo === 'nota') { if (pago) o.pagos++; else o.semStatus++; return; }
      o.comBoleto++;
      if (pago) o.pagos++;
      else if (r.statusPagamento === 'vencido') o.vencidos++;
      else if (r.statusPagamento === 'pendente') o.pendentes++;
      else o.semStatus++;
    });
    return o;
  }

  // "O que travou": cobranças emitidas com boleto vencido, erro ou nota sem número, agrupadas por cliente.
  // Boleto pendente no prazo não trava (fica em "em dia").
  function travou(linhas, baixa) {
    var grupos = {}, ordem = [];
    linhas.forEach(function (r) {
      if (!emitido(r) && r.status !== 'erro') return;
      var pago = r.statusPagamento === 'pago' || (baixa && baixa(r));
      var p = {
        vencido: !pago && r.statusPagamento === 'vencido',
        erro: r.status === 'erro',
        semNumero: r.modo !== 'boleto' && !r.nfNumero && r.status !== 'erro',
      };
      if (!p.vencido && !p.erro && !p.semNumero) return;
      var k = String(r.apelido || r.cliente || r.id);
      if (!grupos[k]) { grupos[k] = { cliente: k, linhas: [], vencido: 0, erro: 0, semNumero: 0 }; ordem.push(k); }
      var g = grupos[k];
      g.linhas.push(r);
      if (p.vencido) g.vencido++;
      if (p.erro) g.erro++;
      if (p.semNumero) g.semNumero++;
    });
    return ordem.map(function (k) {
      var g = grupos[k], partes = [];
      if (g.erro) partes.push(g.erro > 1 ? g.erro + ' erros ao emitir' : 'erro ao emitir');
      if (g.vencido) partes.push(g.vencido > 1 ? g.vencido + ' boletos vencidos' : 'boleto vencido');
      if (g.semNumero) partes.push(g.semNumero > 1 ? g.semNumero + ' notas sem número' : 'nota sem número');
      g.motivo = partes.join(' e ');
      g.tom = g.erro || g.vencido ? 'erro' : 'atencao';
      return g;
    }).sort(function (a, b) { return (a.tom === b.tom ? 0 : a.tom === 'erro' ? -1 : 1) || a.cliente.localeCompare(b.cliente, 'pt-BR'); });
  }

  var regras = { recebimento: recebimento, travou: travou, situacao: situacao, filtrar: filtrar, etapas: etapas, emitido: emitido, faltaValor: faltaValor, somaMes: somaMes, mesAnterior: mesAnterior };
  if (typeof module !== 'undefined' && module.exports) module.exports = regras;
  if (!doc) return;

  // ── Estado da tela ───────────────────────────────────────────────────────
  var filtro = 'emitir', busca = '', aberto = null, vista = null, conferencia = null, buscouConf = false;
  function celular() { return !!(global.matchMedia && global.matchMedia('(max-width: 700px)').matches); }
  function baixaFeita(r) { try { return !!global.fFatBaixaManualFeita(r); } catch (e) { return false; } }
  function vistaAtual(L) {
    if (celular()) return 'acompanhar';
    if (vista) return vista;
    var e = etapas(L);
    return e.emitidos > 0 && e.emitidos === e.total ? 'acompanhar' : 'emitir';
  }
  function ler(nome, padrao) { try { var v = global.eval('typeof ' + nome + "!=='undefined'?" + nome + ':undefined'); return v === undefined ? padrao : v; } catch (e) { return padrao; } }
  function linhas() { return ler('fatLinhas', []) || []; }
  function comp() { return (doc.getElementById('f-fat-comp') || {}).value || ''; }
  function ehManual(r) { try { return !!global.fFatEhManual(r.modulo); } catch (e) { return false; } }
  function anterior(r) {
    var u = null;
    try { u = global.fFatUltimoPag(r); } catch (e) {}
    if (!u && r.pagAnterior && r.pagAnterior.st) {
      var m = String(r.pagAnterior.mes || '');
      u = { st: r.pagAnterior.st, lbl: m.length >= 7 ? m.slice(5, 7) + '/' + m.slice(2, 4) : '' };
    }
    if (!u) return null;
    var mm = /^(\d{2})\//.exec(u.lbl || '');
    return { st: u.st, mes: mm ? MESES[+mm[1] - 1] : '' };
  }
  function cap(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  function info(r) { return { manual: ehManual(r) || !!r.soHub, anterior: anterior(r) }; }
  function boleto(r) {
    if (emitido(r)) { var h = (ler('fatEmissoes', {}) || {})[r.id + '|' + comp()]; if (h && Number(h.boleto) > 0) return Number(h.boleto); }
    try { return global.fFatBoleto(r); } catch (e) { return Number(r.valor) || 0; }
  }
  function chip(rotulo, tom) { return '<span class="fat2-chip fat2-' + tom + '">' + esc(rotulo) + '</span>'; }

  // ── Topo: mês, ajustes, etapas e aviso ───────────────────────────────────
  function montarTopo() {
    var host = doc.getElementById('ferr-fat');
    var card = doc.querySelector('#ferr-fat > .ferr-card:not(#f-fat-config)');
    var lista = doc.getElementById('f-fat-lista');
    if (!host || !card || !lista || doc.getElementById('fat2-topo')) return;
    var cardLista = lista.closest('.ferr-card');
    var topo = doc.createElement('div');
    topo.id = 'fat2-topo';
    topo.innerHTML =
      '<header class="fat2-cab">' +
        '<div class="fat2-mes"><button type="button" class="fat2-icone" data-fat2="mes-1" aria-label="Mês anterior">‹</button>' +
        '<div><span class="fat2-sub" id="fat2-sub">Competência</span><h2 id="fat2-titulo">Faturamento</h2></div>' +
        '<button type="button" class="fat2-icone" data-fat2="mes+1" aria-label="Próximo mês">›</button></div>' +
        '<div class="fat2-acoes"><span class="fat2-chip fat2-acao" id="fat2-amb">Produção</span>' +
        '<button type="button" class="fat2-btn2" data-fat2="carregar">Carregar planilha</button>' +
        '<button type="button" class="fat2-btn2" data-fat2="asaas">Atualizar com o Asaas</button></div>' +
      '</header>' +
      '<div class="fat2-vistas" id="fat2-vistas" role="tablist" aria-label="O que fazer agora"></div>' +
      '<section class="fat2-ajustes" aria-label="Ajustes do mês"><div id="fat2-ajustes-campos"></div>' +
        '<p>Vale para todas as notas do mês. Vencimento diferente muda no painel do cliente.<br><span id="fat2-venc"></span></p></section>' +
      '<ol class="fat2-etapas" id="fat2-etapas" aria-label="Etapas do mês"></ol>' +
      '<div id="fat2-aviso"></div>' +
      '<div id="fat2-acomp"></div>' +
      '<div class="fat2-filtros"><div id="fat2-abas" role="tablist" aria-label="Filtrar clientes"></div>' +
        '<label class="fat2-busca"><span class="fat2-oculto">Buscar cliente</span><input id="fat2-busca" type="search" placeholder="Buscar cliente" autocomplete="off"></label></div>';
    host.insertBefore(topo, card);
    topo.querySelector('.fat2-ajustes').classList.add('fat2-so-emitir');
    topo.querySelector('#fat2-aviso').classList.add('fat2-so-emitir');
    topo.querySelector('.fat2-filtros').classList.add('fat2-so-emitir');
    // os mesmos campos de antes (competência, ISS, Simples), agora na faixa de ajustes
    var campos = doc.getElementById('fat2-ajustes-campos');
    ['f-fat-comp', 'f-fat-aliq', 'f-fat-simples'].forEach(function (id) {
      var inp = doc.getElementById(id);
      if (inp && inp.parentNode) campos.appendChild(inp.parentNode);
    });
    // lista logo abaixo dos filtros; o que sobrou do cartão antigo vira "Outras opções" no fim
    if (cardLista) { cardLista.classList.add('fat2-cartao-lista', 'fat2-so-emitir'); host.insertBefore(cardLista, card); }
    var amb = doc.getElementById('f-fat-amb');
    if (amb) amb.closest('div[style*="grid"]').classList.add('fat2-escondido');
    var btn = doc.getElementById('f-fat-btn-carregar');
    if (btn) btn.parentNode.classList.add('fat2-escondido');
    card.classList.add('fat2-outras', 'fat2-so-pc');
    var tt = doc.createElement('h3'); tt.className = 'fat2-outras-t'; tt.textContent = 'Outras opções';
    card.insertBefore(tt, card.firstChild);
    var st = doc.getElementById('f-fat-status');
    if (st) host.insertBefore(st, cardLista || card);
    doc.getElementById('fat2-busca').addEventListener('input', function (ev) { busca = ev.target.value; desenharLista(); });
  }

  function desenharTopo() {
    var c = comp(), L = linhas();
    var t = doc.getElementById('fat2-titulo');
    if (t) t.textContent = celular() ? (cap(nomeMes(c)) || '—') : 'Faturamento de ' + (nomeMes(c) || '—');
    var e = etapas(L), v = vistaAtual(L);
    var host = doc.getElementById('ferr-fat');
    if (host) { host.classList.toggle('fat2-v-acomp', v === 'acompanhar'); host.classList.toggle('fat2-v-emitir', v !== 'acompanhar'); }
    var sub = doc.getElementById('fat2-sub');
    if (sub) {
      var ts = 0; try { ts = +global.localStorage.getItem('fat_auto_ts') || 0; } catch (x) {}
      var d = ts ? new Date(ts) : null, hoje = d && d.toDateString() === new Date().toDateString();
      sub.textContent = celular() ? 'Faturamento' : v === 'acompanhar' && d ? 'Atualizado com o Asaas ' + (hoje ? 'hoje' : 'em ' + d.toLocaleDateString('pt-BR')) + ' às ' + d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0') : 'Competência';
    }
    var vs = doc.getElementById('fat2-vistas');
    if (vs) {
      var faltam = e.total - e.emitidos;
      vs.innerHTML = e.emitidos > 0 && faltam > 0
        ? [['emitir', 'Emitir · ' + faltam + (faltam === 1 ? ' falta' : ' faltam')], ['acompanhar', 'Acompanhar · ' + e.emitidos + (e.emitidos === 1 ? ' emitido' : ' emitidos')]].map(function (o) {
            return '<button type="button" role="tab" aria-selected="' + (v === o[0]) + '" class="fat2-aba' + (v === o[0] ? ' fat2-on' : '') + '" data-fat2="vista:' + o[0] + '">' + o[1] + '</button>'; }).join('')
        : '';
    }
    var et = doc.getElementById('fat2-etapas');
    if (et && v === 'acompanhar') {
      var rc = recebimento(L, baixaFeita);
      var cel = [
        ['1 · Conferir', 'feito', '', 'fat2-verde'],
        ['2 · Emitidos', String(rc.emitidos), rc.comBoleto + ' com boleto', ''],
        ['3 · Notas autorizadas', String(rc.notas), rc.semNumero ? rc.semNumero + ' sem número' : '', 'fat2-laranja'],
        ['4 · Recebidos', rc.pagos + ' de ' + rc.emitidos, rc.pendentes + ' pendentes · ' + rc.vencidos + ' vencidos', ''],
      ];
      et.innerHTML = cel.map(function (x, i) {
        return '<li class="' + (i === 3 ? 'fat2-atual' : '') + '"><span>' + x[0] + '</span><b class="' + (i === 0 ? x[3] : '') + '">' + esc(x[1]) + '</b>' +
          (x[2] ? '<span class="' + (i === 2 ? x[3] : '') + '">' + esc(x[2]) + '</span>' : '') + '</li>';
      }).join('');
    } else if (et) {
      var passo = !L.length ? 1 : e.emitidos === 0 ? 1 : e.emitidos < e.total ? 2 : e.recebidos < e.emitidos ? 4 : 4;
      var it = [
        ['1 · Conferir a lista', L.length ? e.total + ' clientes' : 'carregue a planilha', passo === 1],
        ['2 · Emitir', e.emitidos + ' de ' + e.total, passo === 2],
        ['3 · Notas autorizadas', String(e.notas), false],
        ['4 · Recebidos', e.recebidos + ' de ' + e.emitidos, passo === 4],
      ];
      et.innerHTML = it.map(function (x) { return '<li class="' + (x[2] ? 'fat2-atual' : '') + '"><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b></li>'; }).join('');
    }
    var venc = L.filter(function (r) { var a = anterior(r); return a && a.st === 'vencido'; });
    var av = doc.getElementById('fat2-aviso');
    if (av) av.innerHTML = venc.length
      ? '<div class="fat2-aviso" role="note"><b>Atenção:</b> ' + esc(venc.slice(0, 5).map(function (r) { return r.apelido || r.cliente; }).join(', ')) +
        (venc.length > 5 ? ' e mais ' + (venc.length - 5) : '') + ' ' + (venc.length === 1 ? 'ainda tem' : 'ainda têm') + ' boleto vencido' +
        (function () { var ms = venc.map(function (r) { return anterior(r).mes; }).filter(Boolean); var u = ms.filter(function (m, i) { return ms.indexOf(m) === i; }); return u.length === 1 ? ' de ' + u[0] : ''; })() +
        '. ' + (nomeMes(c) ? nomeMes(c).charAt(0).toUpperCase() + nomeMes(c).slice(1) : 'O mês') + ' sai normalmente; o aviso fica na linha de cada um para você cobrar.</div>'
      : '';
    var amb = doc.getElementById('f-fat-amb'), ac = doc.getElementById('fat2-amb');
    if (amb && ac) ac.textContent = (amb.options[amb.selectedIndex] || {}).text ? amb.options[amb.selectedIndex].text.replace(/^[^A-Za-zÀ-ú]+/, '') : 'Produção';
    var vv = doc.getElementById('f-fat-venc'), vd = doc.getElementById('fat2-venc');
    if (vv && vd) vd.textContent = vv.textContent.replace(/^[^A-Za-zÀ-ú]+/, '');
    var fi = doc.getElementById('fat2-abas');
    if (fi) {
      var n = function (f) { return filtrar(L, f, info).length; };
      var abas = [['todos', 'Todos', L.length], ['emitir', 'A emitir', n('emitir')], ['nota', 'Aguardando nota', n('nota')], ['problema', 'Com problema', n('problema')]];
      fi.innerHTML = abas.map(function (a) {
        return '<button type="button" role="tab" aria-selected="' + (filtro === a[0]) + '" class="fat2-aba' + (filtro === a[0] ? ' fat2-on' : '') + '" data-fat2="filtro:' + a[0] + '">' + a[1] + ' · ' + a[2] + '</button>';
      }).join('');
    }
  }

  // ── Lista ────────────────────────────────────────────────────────────────
  function desenharLista() {
    var el = doc.getElementById('f-fat-lista');
    if (!el) return;
    montarTopo();
    desenharTopo();
    var L = linhas();
    desenharAcompanhar(L);
    if (!L.length) { el.innerHTML = '<div class="fat2-vazio">Clique em <b>Carregar planilha</b> para ver os clientes do mês.</div>'; desenharBarra(); return; }
    var q = busca.trim().toLowerCase();
    var lst = filtrar(L, filtro, info).filter(function (r) { return !q || (String(r.apelido || r.cliente || '') + ' ' + (r.modulo || '')).toLowerCase().indexOf(q) !== -1; });
    lst.sort(function (a, b) { return String(a.modulo || '').localeCompare(String(b.modulo || '')) || String(a.cliente || '').localeCompare(String(b.cliente || ''), 'pt-BR', { sensitivity: 'base' }); });
    var c = comp(), ant = nomeMes(mesAnterior(c));
    var y = global.scrollY;
    el.innerHTML = '<div class="fat2-tabela"><table><thead><tr>' +
      '<th scope="col"><span class="fat2-oculto">Marcar</span></th><th scope="col">Cliente</th><th scope="col">Cobrança</th>' +
      '<th scope="col" class="fat2-num">Valor da nota</th><th scope="col" class="fat2-num">Boleto</th><th scope="col">Vence</th><th scope="col">Situação</th>' +
      '<th scope="col"><span class="fat2-oculto">Abrir</span></th></tr></thead><tbody>' +
      (lst.length ? lst.map(function (r) {
        var i = info(r), s = situacao(r, i.manual), em = emitido(r), id = esc(r.id);
        var podeMarcar = !em;
        var valor = (i.manual && !em)
          ? '<label class="fat2-oculto" for="fv-' + id + '">Valor da nota de ' + esc(r.cliente) + '</label><input id="fv-' + id + '" class="fat2-valor' + (faltaValor(r, i.manual) ? ' fat2-falta' : '') + '" value="' + (r.valor ? brl(r.valor) : '') + '" placeholder="digitar" data-fat2-valor="' + id + '">'
          : '<span class="fat2-mono">' + brl(r.valor) + '</span>';
        var bol = r.modo === 'nota' ? '<span class="fat2-sub">—</span>'
          : '<span class="fat2-mono">' + brl(boleto(r)) + '</span>' + (r.issRetido && r.modo !== 'boleto' ? '<br><span class="fat2-sub">− ISS retido</span>' : '');
        var vence = r.modo === 'nota' ? '<span class="fat2-sub">—</span>' : 'dia ' + esc((function () { try { return global.fFatVencDia(r); } catch (e) { return '—'; } })());
        var pg = '';
        var baixa = false; try { baixa = !!global.fFatBaixaManualFeita(r); } catch (e) {}
        if (baixa || r.statusPagamento === 'pago') pg = chip(baixa ? 'Pago (baixa manual)' : 'Pago', 'ok');
        else if (r.statusPagamento === 'vencido') pg = chip('Vencido', 'erro');
        else if (r.paymentId && r.statusPagamento) pg = chip('Pagamento pendente', 'atencao');
        var a = i.anterior;
        var antChip = a && a.st === 'vencido' && !em ? chip(cap(a.mes || ant || 'Mês anterior') + ' vencido', 'erro') : '';
        return '<tr data-fat2-linha="' + id + '" class="' + (r.selecionado ? 'fat2-sel' : '') + (aberto === r.id ? ' fat2-aberta' : '') + '">' +
          '<td>' + (podeMarcar ? '<input type="checkbox" aria-label="Marcar ' + esc(r.apelido || r.cliente) + '" data-fat2-marcar="' + id + '"' + (r.selecionado ? ' checked' : '') + '>' : '') + '</td>' +
          '<td><b>' + esc(r.apelido || r.cliente) + '</b><br><span class="fat2-sub">' + esc(r.modulo || '') + (r.soHub ? ' · só no hub' : '') + '</span></td>' +
          '<td>' + (em ? esc({ ambos: 'Nota + boleto', boleto: 'Só boleto', nota: 'Só nota' }[r.modo] || r.modo) :
            '<label class="fat2-oculto" for="fm-' + id + '">Cobrança de ' + esc(r.cliente) + '</label><select id="fm-' + id + '" class="fat2-modo" data-fat2-modo="' + id + '">' +
            [['ambos', 'Nota + boleto'], ['boleto', 'Só boleto'], ['nota', 'Só nota']].map(function (o) { return '<option value="' + o[0] + '"' + (r.modo === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>') + '</td>' +
          '<td class="fat2-num">' + valor + '</td><td class="fat2-num">' + bol + '</td><td>' + vence + '</td>' +
          '<td><div class="fat2-sit">' + chip(s.rotulo, s.tom) + pg + antChip + '</div></td>' +
          '<td><button type="button" class="fat2-mais" data-fat2="abrir:' + id + '" aria-label="Abrir ' + esc(r.apelido || r.cliente) + '">›</button></td></tr>';
      }).join('') : '<tr><td colspan="8" class="fat2-vazio">Nenhum cliente neste filtro.</td></tr>') +
      '</tbody></table></div>';
    if (global.scrollY !== y) global.scrollTo(0, y);
    desenharBarra();
    if (aberto) desenharPainel();
  }

  // ── Acompanhar o mês (depois de emitir) e celular ────────────────────────
  function buscarConferencia() {
    if (buscouConf) return;
    buscouConf = true;
    var base = String(ler('FATURAMENTO_API_URL', '') || '').replace(/\/faturamento.*$/, '');
    if (!base) return;
    global.fetch(base + '/conferencia?enviar=nao').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.ok) { conferencia = j; var el = doc.getElementById('fat2-conf'); if (el) el.outerHTML = cartaoConferencia(); } })
      .catch(function () {});
  }
  function cartaoConferencia() {
    if (!conferencia) return '<div id="fat2-conf"></div>';
    var av = conferencia.divergencias - conferencia.erros;
    return '<section id="fat2-conf" class="fat2-bloco fat2-conf fat2-so-pc" aria-labelledby="fat2-conf-t"><div><h3 id="fat2-conf-t">Conferência automática · todo dia às 8h</h3>' +
      '<span class="fat2-sub">' + (conferencia.erros ? 'O hub e a planilha têm ' + conferencia.erros + (conferencia.erros === 1 ? ' nota ou boleto diferente' : ' notas ou boletos diferentes') + '. ' : 'O hub e a planilha batem: nenhuma nota ou boleto diferente. ') +
      (av ? av + (av === 1 ? ' aviso' : ' avisos') + ' (boletos sem número de nota). ' : '') + 'Karen e Eder recebem e-mail quando aparece algo novo.</span></div>' +
      chip(conferencia.erros ? conferencia.erros + (conferencia.erros === 1 ? ' erro' : ' erros') : '0 erros', conferencia.erros ? 'erro' : 'ok') + '</section>';
  }
  function desenharAcompanhar(L) {
    var box = doc.getElementById('fat2-acomp');
    if (!box) return;
    if (vistaAtual(L) !== 'acompanhar') { box.innerHTML = ''; return; }
    var c = comp(), mes = cap(nomeMes(c)) || 'Este mês';
    if (!L.length) { box.innerHTML = '<div class="fat2-bloco fat2-vazio">Carregando os clientes de ' + esc(nomeMes(c) || 'este mês') + '…</div>'; return; }
    var rc = recebimento(L, baixaFeita), tr = travou(L, baixaFeita);
    if (!rc.emitidos) {
      box.innerHTML = '<div class="fat2-bloco"><b>Nada emitido em ' + esc(nomeMes(c)) + ' ainda.</b><p class="fat2-sub">' + L.length + ' clientes na lista. Emitir o mês e ajustar valores fica para o computador.</p></div>';
      return;
    }
    buscarConferencia();
    var barra = '<div class="fat2-progresso" role="img" aria-label="' + rc.pagos + ' pagos, ' + rc.pendentes + ' pendentes, ' + rc.vencidos + ' vencidos, ' + rc.semStatus + ' sem status">' +
      [[rc.pagos, '#15803D'], [rc.pendentes, '#E0A458'], [rc.vencidos, '#B42318'], [rc.semStatus, '#CFC7E6']].filter(function (x) { return x[0]; })
        .map(function (x) { return '<span style="flex:' + x[0] + ';background:' + x[1] + '"></span>'; }).join('') + '</div>';
    var nCob = tr.reduce(function (s, g) { return s + g.linhas.length; }, 0);
    var itens = tr.map(function (g) {
      var r0 = g.linhas[0], id = esc(r0.id);
      var venc = g.linhas.filter(function (r) { return r.statusPagamento === 'vencido' && r.boletoUrl; })[0];
      var mods = g.linhas.map(function (r) { return r.modulo; }).filter(Boolean).join(' e ');
      var bol = g.linhas.reduce(function (s, r) { return s + (r.modo !== 'nota' ? boleto(r) : 0); }, 0);
      var em = r0.emitidoEm ? new Date(r0.emitidoEm).toLocaleDateString('pt-BR').slice(0, 5) : '';
      var det = (g.linhas.length > 1 ? mods + ' · ' : '') + (bol ? 'R$ ' + brl(bol) + ' · ' : '') + (em ? 'emitido em ' + em : '') +
        (!g.vencido && !g.erro ? ' · ainda no prazo' : '') + (g.vencido && !g.semNumero && !g.erro ? ' · nota ok, só falta o pagamento' : '');
      return '<div class="fat2-trava"><span class="fat2-ponto" style="background:' + (g.tom === 'erro' ? '#B42318' : '#B45309') + '"></span>' +
        '<button type="button" class="fat2-trava-txt" data-fat2="abrir:' + id + '"><b>' + esc(g.cliente) + ' · ' + esc(g.motivo) + '</b><span>' + esc(det) + '</span></button>' +
        '<div class="fat2-trava-acoes">' +
        (venc ? '<button type="button" class="fat2-btn" data-fat2="whats:' + esc(venc.id) + '">Cobrar por WhatsApp</button>' : '') +
        (g.vencido && !g.semNumero && !g.erro ? '<button type="button" class="fat2-btn2" data-fat2="baixa:' + esc((venc || r0).id) + '">Dar baixa manual</button>' : '<button type="button" class="fat2-btn2" data-fat2="abrir:' + id + '">Abrir</button>') +
        '</div></div>';
    }).join('');
    var travados = {}; tr.forEach(function (g) { g.linhas.forEach(function (r) { travados[r.id] = 1; }); });
    var emDia = L.filter(function (r) { return emitido(r) && !travados[r.id]; });
    box.innerHTML =
      '<div class="fat2-progresso-pc fat2-so-pc">' + barra + '</div>' +
      '<section class="fat2-bloco fat2-so-cel fat2-receb"><div class="fat2-receb-t"><b>Recebidos</b><span class="fat2-sub">' + rc.pagos + ' de ' + rc.emitidos + '</span></div>' + barra +
        '<div class="fat2-receb-n"><div><b>' + rc.emitidos + '</b><span>emitidos</span></div><div><b>' + rc.notas + '</b><span>notas ok</span></div>' +
        '<div class="fat2-ruim"><b>' + rc.vencidos + '</b><span>vencidos</span></div></div></section>' +
      '<section class="fat2-bloco" aria-labelledby="fat2-travou"><div class="fat2-bloco-cab"><h3 id="fat2-travou">O que travou</h3>' +
        '<span class="fat2-sub">' + (tr.length ? nCob + (nCob === 1 ? ' cobrança' : ' cobranças') + ' de ' + tr.length + (tr.length === 1 ? ' cliente' : ' clientes') + ' · cada uma com a próxima ação' : '') + '</span></div>' +
        (itens || '<p class="fat2-sub">Nada travado em ' + esc(nomeMes(c)) + '. Tudo emitido está pago ou no prazo.</p>') + '</section>' +
      cartaoConferencia() +
      (emDia.length ? '<details class="fat2-bloco fat2-emdia"><summary>Ver as ' + emDia.length + ' cobranças em dia</summary><ul>' + emDia.map(function (r) {
          var pago = r.statusPagamento === 'pago' || baixaFeita(r);
          return '<li><button type="button" data-fat2="abrir:' + esc(r.id) + '"><span><b>' + esc(r.apelido || r.cliente) + '</b><span class="fat2-sub">' + esc(r.modulo || '') + '</span></span>' +
            chip(pago ? 'Pago' : r.modo === 'nota' ? 'Nota emitida' : 'No prazo', pago ? 'ok' : 'acao') + '<span class="fat2-mono">' + brl(r.valor) + '</span></button></li>';
        }).join('') + '</ul></details>' : '') +
      '<p class="fat2-sub fat2-so-cel" style="text-align:center">Emitir o mês e ajustar valores fica para o computador.</p>';
  }

  // ── Barra fixa: marcados e Emitir ────────────────────────────────────────
  function desenharBarra() {
    var host = doc.getElementById('ferr-fat');
    if (!host) return;
    var bar = doc.getElementById('fat2-barra');
    if (!bar) { bar = doc.createElement('div'); bar.id = 'fat2-barra'; host.appendChild(bar); }
    bar.classList.add('fat2-so-emitir');
    var sel = linhas().filter(function (r) { return r.selecionado && !emitido(r); });
    var total = sel.reduce(function (s, r) { return s + (Number(r.valor) || 0); }, 0);
    var bols = sel.filter(function (r) { return r.modo !== 'nota'; }).length;
    var venc = sel.filter(function (r) { var a = anterior(r); return a && a.st === 'vencido'; }).length;
    bar.innerHTML = '<div class="fat2-barra-txt"><b>' + (sel.length ? sel.length + ' ' + (sel.length === 1 ? 'cliente marcado' : 'clientes marcados') : 'Nenhum cliente marcado') + '</b>' +
      '<span>' + (sel.length ? 'R$ ' + brl(total) + ' em notas · ' + bols + ' ' + (bols === 1 ? 'boleto' : 'boletos') + ' · produção' + (venc ? ' · ' + venc + ' com mês anterior vencido' : '') : 'Marque quem vai ser emitido agora') + '</span></div>' +
      '<button type="button" class="fat2-btn2" data-fat2="desmarcar"' + (sel.length ? '' : ' disabled') + '>Desmarcar todos</button>' +
      '<button type="button" class="fat2-btn" data-fat2="emitir"' + (sel.length ? '' : ' disabled') + '>Emitir ' + (sel.length ? sel.length + ' ' : '') + (sel.length === 1 ? 'cobrança' : 'cobranças') + '</button>';
  }

  // ── Painel do cliente ────────────────────────────────────────────────────
  function desenharPainel() {
    var r = linhas().filter(function (x) { return x.id === aberto; })[0];
    var p = doc.getElementById('fat2-painel');
    if (!r) { if (p) p.remove(); aberto = null; return; }
    if (!p) { p = doc.createElement('aside'); p.id = 'fat2-painel'; p.setAttribute('aria-label', 'Cliente'); doc.body.appendChild(p); p.addEventListener('click', clique); p.addEventListener('change', mudou); }
    var i = info(r), s = situacao(r, i.manual), em = emitido(r), c = comp(), id = esc(r.id);
    var hist = [];
    var E = ler('fatEmissoes', {}) || {};
    for (var k = 0; k < 4; k++) {
      var mc = somaMes(c, -k), e = E[r.id + '|' + mc];
      if (!e) continue;
      var pago = e.pgManual || e.pg === 'pago';
      hist.push('<li><span class="fat2-ponto" style="background:' + (pago ? '#15803D' : e.pg === 'vencido' ? '#B42318' : '#E0A458') + '"></span><div><b>' +
        esc(nomeMes(mc).charAt(0).toUpperCase() + nomeMes(mc).slice(1)) + ' · ' + (pago ? 'pago' : e.pg === 'vencido' ? 'vencido' : (e.pg || e.status || 'emitido')) + '</b>' +
        '<span>' + (e.boleto ? 'Boleto R$ ' + brl(e.boleto) + ' · ' : '') + (e.nf ? 'NF ' + esc(e.nf) : (e.modo === 'boleto' ? 'sem nota' : 'nota sem número')) + (e.em ? ' · emitido em ' + new Date(e.em).toLocaleDateString('pt-BR') : '') + '</span></div></li>');
    }
    var a = i.anterior;
    p.innerHTML =
      '<div class="fat2-p-cab"><div><h3>' + esc(r.apelido || r.cliente) + '</h3><span class="fat2-sub">' + esc(r.modulo || '') + (r.issRetido ? ' · ISS retido pelo cliente' : '') + '</span></div>' +
        '<button type="button" class="fat2-icone" data-fat2="fechar" aria-label="Fechar painel">×</button></div>' +
      (em && r.statusPagamento === 'vencido' && !baixaFeita(r) ? '<div class="fat2-aviso"><b>O boleto de ' + esc(nomeMes(c)) + ' venceu.</b> Cobre pelo WhatsApp ou dê baixa se o cliente pagou por fora.</div>' : '') +
      (!em && a && a.st === 'vencido' ? '<div class="fat2-aviso"><b>' + esc(cap(a.mes || nomeMes(mesAnterior(c)))) + ' está em aberto.</b> ' + (em ? '' : 'Este mês sai normalmente; ') + 'cobre pelo WhatsApp ou dê baixa se pagou por fora.</div>' : '') +
      '<section><h4>' + esc(nomeMes(c).charAt(0).toUpperCase() + nomeMes(c).slice(1)) + ' · ' + esc(s.rotulo) + '</h4>' +
        (em ? '' : '<div class="fat2-seg" role="group" aria-label="Forma de cobrança">' + [['ambos', 'Nota + boleto'], ['boleto', 'Só boleto'], ['nota', 'Só nota']].map(function (o) {
          return '<button type="button" aria-pressed="' + (r.modo === o[0]) + '" data-fat2="modo:' + id + ':' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>') +
        '<div class="fat2-p-num"><div><span>Nota</span><b>' + brl(r.valor) + '</b></div><div><span>Boleto</span><b>' + (r.modo === 'nota' ? '—' : brl(boleto(r))) + '</b></div>' +
        (r.modo === 'nota' || em ? '' : '<label>Vence dia<input data-fat2-venc="' + id + '" inputmode="numeric" value="' + esc((function () { try { return global.fFatVencDia(r); } catch (e2) { return ''; } })()) + '"></label>') + '</div>' +
        (r.erro ? '<p class="fat2-msgerro">' + esc(r.erro) + '</p>' : '') + '</section>' +
      (hist.length ? '<section><h4>Histórico</h4><ol class="fat2-hist">' + hist.join('') + '</ol></section>' : '') +
      '<section class="fat2-p-acoes"><h4>Ações</h4>' +
        (r.boletoUrl && r.modo !== 'nota' ? '<button type="button" class="fat2-btn" data-fat2="whats:' + id + '">Enviar boleto por WhatsApp</button><a class="fat2-btn2" href="' + esc(r.boletoUrl) + '" target="_blank" rel="noopener">Abrir boleto</a>' : '') +
        '<button type="button" class="fat2-btn2" data-fat2="baixa:' + id + '">Dar baixa manual (pagou em dinheiro ou Pix)</button>' +
        '<button type="button" class="fat2-btn2" data-fat2="recibo:' + id + '">Gerar recibo</button>' +
        '<button type="button" class="fat2-btn2" data-fat2="editar:' + id + '">Editar dados para a nota</button>' +
        (r.paymentId || r.invoiceId ? '<button type="button" class="fat2-btn2 fat2-perigo" data-fat2="cancelar:' + id + '">Cancelar esta cobrança</button>' : '') +
      '</section>' +
      '<p class="fat2-sub">Último mês faturado na planilha: ' + esc(r.ultimoMesFaturado ? String(r.ultimoMesFaturado).slice(0, 7) : '—') + '</p>';
  }

  // ── Eventos ──────────────────────────────────────────────────────────────
  function mudarMes(n) {
    var inp = doc.getElementById('f-fat-comp');
    if (!inp) return;
    inp.value = somaMes(inp.value || new Date().toISOString().slice(0, 7), n);
    inp.dispatchEvent(new global.Event('change', { bubbles: true }));
    desenharLista();
  }

  function clique(ev) {
    var b = ev.target.closest('[data-fat2]');
    if (!b) {
      var tr = ev.target.closest('tr[data-fat2-linha]');
      if (tr && !ev.target.closest('input,select,label,button,a')) { aberto = tr.getAttribute('data-fat2-linha'); desenharLista(); desenharPainel(); }
      return;
    }
    var acao = b.getAttribute('data-fat2'), partes = acao.split(':'), id = partes[1];
    try {
      if (acao === 'mes-1') mudarMes(-1);
      else if (acao === 'mes+1') mudarMes(1);
      else if (acao === 'carregar') global.fFatCarregar();
      else if (acao === 'asaas') global.fFatSincronizarAsaas(true);
      else if (partes[0] === 'filtro') { filtro = id; desenharLista(); }
      else if (partes[0] === 'vista') { vista = id; desenharLista(); }
      else if (acao === 'desmarcar') global.fFatLimparSelecao();
      else if (acao === 'emitir') { vista = null; global.fFatEmitirSelecionados(); }
      else if (partes[0] === 'abrir') { aberto = id; desenharLista(); desenharPainel(); }
      else if (acao === 'fechar') { aberto = null; var p = doc.getElementById('fat2-painel'); if (p) p.remove(); desenharLista(); }
      else if (partes[0] === 'modo') global.fFatModo(id, partes[2]);
      else if (partes[0] === 'whats') global.fFatEnviarWhats(id);
      else if (partes[0] === 'baixa') global.fFatBaixaManual(id);
      else if (partes[0] === 'recibo') global.fFatRecibo(id);
      else if (partes[0] === 'editar') global.fFatEditar(id);
      else if (partes[0] === 'cancelar') global.fFatCancelar(id);
    } catch (e) { console.error('faturamento:', acao, e); }
  }

  function mudou(ev) {
    var t = ev.target;
    try {
      if (t.hasAttribute('data-fat2-marcar')) {
        var r = linhas().filter(function (x) { return x.id === t.getAttribute('data-fat2-marcar'); })[0];
        if (r) { r.selecionado = t.checked; var tr = t.closest('tr'); if (tr) tr.classList.toggle('fat2-sel', t.checked); }
        try { global.fFatResumo(); } catch (e) {}
        desenharBarra();
      } else if (t.hasAttribute('data-fat2-modo')) global.fFatModo(t.getAttribute('data-fat2-modo'), t.value);
      else if (t.hasAttribute('data-fat2-valor')) global.fFatValor(t.getAttribute('data-fat2-valor'), t.value);
      else if (t.hasAttribute('data-fat2-venc')) { global.fFatSetVencDia(t.getAttribute('data-fat2-venc'), t.value); desenharLista(); }
    } catch (e) { console.error('faturamento:', e); }
  }

  function estilos() {
    if (doc.getElementById('fat2-css')) return;
    var s = doc.createElement('style');
    s.id = 'fat2-css';
    s.textContent =
      '.fat2-escondido{display:none!important}' +
      '#ferr-fat.fat2-v-acomp .fat2-so-emitir{display:none!important}.fat2-so-cel{display:none!important}' +
      '.fat2-vistas{display:flex;flex-wrap:wrap;gap:8px}.fat2-vistas:empty{display:none}' +
      '#fat2-acomp{display:flex;flex-direction:column;gap:16px}#fat2-acomp:empty{display:none}' +
      '.fat2-bloco{background:#fff;border:1px solid #E4DFF0;border-radius:18px;padding:20px 22px;font-family:"DM Sans",system-ui,sans-serif;color:#241A38}' +
      '.fat2-bloco h3{margin:0;font-size:21px;font-weight:700}.fat2-bloco-cab{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px}' +
      '.fat2-progresso{display:flex;height:14px;border-radius:999px;overflow:hidden;gap:2px;background:#EFEBF7}' +
      '.fat2-trava{display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:14px 0;border-top:1px solid #EFEBF7}.fat2-trava .fat2-ponto{margin-top:0}' +
      '.fat2-trava-txt{flex:1 1 340px;display:flex;flex-direction:column;gap:3px;text-align:left;background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer}' +
      '.fat2-trava-txt b{font-size:16px}.fat2-trava-txt span{font-size:14px;color:#5D5868}.fat2-trava-acoes{display:flex;flex-wrap:wrap;gap:8px}' +
      '.fat2-conf{display:flex;flex-wrap:wrap;align-items:center;gap:16px}.fat2-conf>div{flex:1 1 420px;display:flex;flex-direction:column;gap:4px}.fat2-conf h3{font-size:17px}.fat2-conf .fat2-chip{font-size:14px;padding:8px 14px}' +
      '.fat2-emdia{padding:0 22px}.fat2-emdia summary{min-height:52px;display:flex;align-items:center;font-size:15px;font-weight:700;cursor:pointer}' +
      '.fat2-emdia ul{list-style:none;margin:0 0 12px;padding:0}.fat2-emdia button{width:100%;display:flex;align-items:center;gap:12px;padding:12px 0;border:0;border-top:1px solid #EFEBF7;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer}' +
      '.fat2-emdia button>span:first-child{flex:1;display:flex;flex-direction:column}' +
      '.fat2-etapas b.fat2-verde{color:#15803D}.fat2-etapas span.fat2-laranja{color:#8A4B08;font-weight:600}' +
      '.fat2-receb{display:flex;flex-direction:column;gap:12px}.fat2-receb .fat2-progresso{height:10px}.fat2-receb-t{display:flex;justify-content:space-between;align-items:baseline}.fat2-receb-t b{font-size:17px}' +
      '.fat2-receb-n{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;text-align:center}.fat2-receb-n div{background:#F6F4FA;border-radius:10px;padding:10px 4px;display:flex;flex-direction:column}' +
      '.fat2-receb-n b{font-size:20px}.fat2-receb-n span{font-size:12px;color:#5D5868}.fat2-receb-n .fat2-ruim{background:#FDECEA}.fat2-receb-n .fat2-ruim b{color:#B42318}.fat2-receb-n .fat2-ruim span{color:#7A1A12}' +
      '@media (max-width:700px){.fat2-so-cel{display:flex!important}.fat2-so-pc,#ferr-fat .fat2-etapas,#ferr-fat .fat2-vistas{display:none!important}' +
        '.fat2-acoes [data-fat2=carregar],#fat2-amb{display:none}.fat2-mes{width:100%;justify-content:space-between}.fat2-mes>div{text-align:center}' +
        '.fat2-bloco{padding:16px}.fat2-bloco h3{font-size:18px}.fat2-trava{gap:10px}.fat2-trava-txt{flex-basis:calc(100% - 30px)}.fat2-trava-txt b{font-size:15px}.fat2-trava-acoes{width:100%}.fat2-trava-acoes>*{flex:1}' +
        '#fat2-painel{padding:20px}}' +
      '#ferr-fat .fat2-cartao-lista{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;margin:16px 0 0!important}' +
      '#ferr-fat .fat2-cartao-lista>.ferr-t{display:none}#ferr-fat .fat2-cartao-lista>.ferr-d{font-size:13px;color:#5D5868;margin-bottom:4px}#ferr-fat #f-fat-lista{margin-top:6px!important}' +
      '#ferr-fat .fat2-outras{margin-top:18px}#ferr-fat .fat2-outras>.ferr-t,#ferr-fat .fat2-outras>.ferr-d{display:none}.fat2-outras-t{margin:0 0 4px;font:700 16px "DM Sans",system-ui,sans-serif;color:#241A38}' +
      '#ferr-fat #f-fat-status:not(:empty){margin-top:12px}' +
      '#fat2-topo{display:flex;flex-direction:column;gap:16px;font-family:"DM Sans",system-ui,sans-serif;color:#241A38}#fat2-abas{display:flex;flex-wrap:wrap;gap:8px}.fat2-cab{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between}' +
      '.fat2-mes{display:flex;align-items:center;gap:12px}.fat2-mes h2{margin:0;font-size:28px;font-weight:700}.fat2-sub{font-size:13px;color:#5D5868}' +
      '.fat2-acoes{display:flex;flex-wrap:wrap;gap:10px;align-items:center}' +
      '.fat2-icone{width:44px;height:44px;border:1px solid #CFC7E6;border-radius:10px;background:#fff;color:#2A1760;font-size:22px;cursor:pointer;line-height:1}' +
      '.fat2-btn,.fat2-btn2{min-height:44px;padding:0 16px;border-radius:10px;font:700 15px "DM Sans",system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;box-sizing:border-box}' +
      '.fat2-btn{border:0;background:#4E38B2;color:#fff}.fat2-btn:hover{background:#2A1760}.fat2-btn[disabled],.fat2-btn2[disabled]{opacity:.45;cursor:not-allowed}' +
      '.fat2-btn2{border:1px solid #CFC7E6;background:#fff;color:#2A1760;font-weight:600}.fat2-btn2:hover{background:#ECE8FA}.fat2-perigo{color:#B42318;border-color:#F3C2BD}' +
      '.fat2-ajustes{background:#fff;border:1px solid #E4DFF0;border-radius:16px;padding:14px 18px;display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end}' +
      '#fat2-ajustes-campos{display:flex;flex-wrap:wrap;gap:16px}#fat2-ajustes-campos .ferr-lbl{font-size:13px;font-weight:600;color:#3A3446}' +
      '#fat2-ajustes-campos .ferr-in{height:44px;border:1px solid #CFC7E6;border-radius:10px;padding:0 12px;font-size:15px;width:150px}.fat2-ajustes p{margin:0 0 10px;font-size:13px;color:#5D5868;flex:1 1 220px}' +
      '.fat2-etapas{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}' +
      '.fat2-etapas li{background:#fff;border:1px solid #E4DFF0;border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:2px}.fat2-etapas span{font-size:13px;color:#5D5868}.fat2-etapas b{font-size:19px}' +
      '.fat2-etapas li.fat2-atual{background:#2A1760;border-color:#2A1760;color:#fff}.fat2-etapas li.fat2-atual span{color:#D9D2F2}' +
      '.fat2-aviso{background:#FDECEA;color:#7A1A12;border-radius:12px;padding:12px 16px;font-size:15px}' +
      '.fat2-filtros{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.fat2-aba{min-height:40px;padding:0 14px;border:1px solid #CFC7E6;border-radius:999px;background:#fff;color:#3A3446;font:600 14px "DM Sans",system-ui,sans-serif;cursor:pointer}' +
      '.fat2-aba.fat2-on{background:#4E38B2;border-color:#4E38B2;color:#fff}.fat2-busca{margin-left:auto}.fat2-busca input{min-height:40px;width:220px;border:1px solid #CFC7E6;border-radius:999px;padding:0 16px;font:14px "DM Sans",system-ui,sans-serif}' +
      '.fat2-oculto{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}' +
      '.fat2-tabela{background:#fff;border:1px solid #E4DFF0;border-radius:16px;overflow-x:auto}.fat2-tabela table{width:100%;min-width:880px;border-collapse:collapse;font-size:14px}' +
      '.fat2-tabela th{text-align:left;padding:12px 8px;color:#5D5868;font-size:12px;text-transform:uppercase;letter-spacing:.05em;position:sticky;top:0;background:#fff;z-index:1}' +
      '.fat2-tabela td{padding:11px 8px;border-top:1px solid #EFEBF7;vertical-align:middle}.fat2-tabela td:first-child,.fat2-tabela th:first-child{padding-left:16px;width:36px}' +
      '.fat2-tabela tr[data-fat2-linha]{cursor:pointer}.fat2-tabela tr[data-fat2-linha]:hover td{background:#FBFAFE}.fat2-tabela tr.fat2-sel td{background:#F7F5FD}.fat2-tabela tr.fat2-aberta td{background:#ECE8FA}' +
      '.fat2-tabela input[type=checkbox]{width:18px;height:18px;accent-color:#4E38B2}.fat2-num{text-align:right}.fat2-mono{font-family:"DM Mono",ui-monospace,monospace}' +
      '.fat2-modo{min-height:36px;border:1px solid #CFC7E6;border-radius:8px;padding:0 8px;font:14px "DM Sans",system-ui,sans-serif;background:#fff;color:#241A38}' +
      '.fat2-valor{width:100px;height:36px;border:1px solid #CFC7E6;border-radius:8px;padding:0 8px;text-align:right;font:14px "DM Mono",ui-monospace,monospace}.fat2-falta{border-color:#E0A458;background:#FDF2E3}' +
      '.fat2-sit{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.fat2-chip{display:inline-block;font-size:12.5px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap}' +
      '.fat2-acao{color:#4E38B2;background:#ECE8FA}.fat2-ok{color:#15803D;background:#E8F6EE}.fat2-atencao{color:#8A4B08;background:#FDF2E3}.fat2-erro{color:#B42318;background:#FDECEA}' +
      '.fat2-mais{width:36px;height:36px;border:0;border-radius:8px;background:transparent;color:#5D5868;font-size:22px;cursor:pointer}.fat2-mais:hover{background:#ECE8FA}' +
      '.fat2-vazio{padding:18px;color:#5D5868;font-size:15px}' +
      '#fat2-barra{position:sticky;bottom:0;z-index:5;margin-top:8px;background:#fff;border:1px solid #E4DFF0;border-radius:14px;box-shadow:0 -6px 20px rgba(42,23,96,.08);padding:12px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-family:"DM Sans",system-ui,sans-serif;color:#241A38}' +
      'body:has(#ferr-fat[style*="block"]) #mgb-pill{bottom:96px}' +
      '.fat2-barra-txt{flex:1 1 260px;display:flex;flex-direction:column}.fat2-barra-txt b{font-size:16px}.fat2-barra-txt span{font-size:14px;color:#5D5868}' +
      '#fat2-painel{position:fixed;top:0;right:0;bottom:0;width:min(460px,100vw);z-index:9500;background:#fff;border-left:1px solid #E4DFF0;box-shadow:-12px 0 40px rgba(42,23,96,.12);overflow:auto;box-sizing:border-box;padding:26px;display:flex;flex-direction:column;gap:20px;font-family:"DM Sans",system-ui,sans-serif;color:#241A38}' +
      '.fat2-p-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.fat2-p-cab h3{margin:0;font-size:24px}#fat2-painel h4{margin:0 0 10px;font-size:16px}' +
      '.fat2-seg{display:flex;background:#ECE8FA;border-radius:10px;padding:4px;margin-bottom:10px}.fat2-seg button{flex:1;min-height:40px;border:0;border-radius:8px;background:transparent;color:#4E38B2;font:600 14px "DM Sans",system-ui,sans-serif;cursor:pointer}' +
      '.fat2-seg button[aria-pressed=true]{background:#fff;color:#2A1760;font-weight:700}' +
      '.fat2-p-num{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.fat2-p-num>*{background:#F6F4FA;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:2px;font-size:13px;color:#5D5868}' +
      '.fat2-p-num b{font:600 16px "DM Mono",ui-monospace,monospace;color:#241A38}.fat2-p-num input{height:32px;border:1px solid #CFC7E6;border-radius:8px;padding:0 8px;font:15px "DM Mono",ui-monospace,monospace;width:100%;box-sizing:border-box}' +
      '.fat2-hist{list-style:none;margin:0;padding:0}.fat2-hist li{display:flex;gap:12px;padding:10px 0;border-top:1px solid #EFEBF7}.fat2-hist div{display:flex;flex-direction:column;gap:2px}.fat2-hist span{font-size:13.5px;color:#5D5868}' +
      '.fat2-ponto{width:10px;height:10px;border-radius:50%;margin-top:6px;flex:none}.fat2-p-acoes{display:flex;flex-direction:column;gap:8px}.fat2-p-acoes .fat2-btn,.fat2-p-acoes .fat2-btn2{justify-content:flex-start;text-align:left;padding-top:8px;padding-bottom:8px}' +
      '.fat2-msgerro{margin:10px 0 0;color:#B42318;font-size:14px}' +
      '.fat2-btn:focus-visible,.fat2-btn2:focus-visible,.fat2-aba:focus-visible,.fat2-icone:focus-visible,.fat2-mais:focus-visible{outline:3px solid #6C55DB;outline-offset:2px}' +
      '@media (max-width:700px){.fat2-etapas{grid-template-columns:repeat(2,minmax(0,1fr))}.fat2-busca{margin-left:0;width:100%}.fat2-busca input{width:100%}.fat2-mes h2{font-size:23px}}';
    doc.head.appendChild(s);
  }

  var carregando = false;
  function ligar() {
    estilos();
    if (typeof global.fFatLista === 'function' && !global.fFatLista.__v2) {
      global.__fFatListaAntiga = global.fFatLista;
      var nova = function () { try { desenharLista(); } catch (e) { console.error('faturamento:', e); global.__fFatListaAntiga(); } };
      nova.__v2 = true;
      global.fFatLista = nova;
    }
    // Ao carregar o mês: marca sozinho quem ainda não foi emitido (mesma regra do antigo "Marcar todos").
    if (typeof global.fFatCarregar === 'function' && !global.fFatCarregar.__v2) {
      var carregar = global.fFatCarregar;
      var c2 = function () {
        var r = carregar.apply(this, arguments);
        return Promise.resolve(r).then(function (x) {
          try {
            var L = linhas();
            if (L.length && !L.some(function (y) { return y.selecionado; }) && !L.some(emitido)) global.fFatSelecionarTodos();
            else desenharLista();
          } catch (e) {}
          return x;
        });
      };
      c2.__v2 = true;
      global.fFatCarregar = c2;
    }
    // Abriu a aba sem lista: carrega a planilha sozinho (só leitura; emitir continua sendo um clique).
    if (typeof global.fFatInit === 'function' && !global.fFatInit.__v2) {
      var init = global.fFatInit;
      var i2 = function () { var r = init.apply(this, arguments); try { if (!linhas().length && !carregando) { carregando = true; Promise.resolve(global.fFatCarregar()).then(function () { carregando = false; }, function () { carregando = false; }); } } catch (e) {} return r; };
      i2.__v2 = true;
      global.fFatInit = i2;
    }
    if (global.matchMedia) { var mq = global.matchMedia('(max-width: 700px)'); var re = function () { if (doc.getElementById('fat2-topo')) desenharLista(); }; if (mq.addEventListener) mq.addEventListener('change', re); }
    // saiu da tela: fecha o painel do cliente (ele fica no <body>)
    ['goPage', 'showContabTab'].forEach(function (nome) {
      var f = global[nome];
      if (typeof f !== 'function' || f.__fat2) return;
      var g = function () { aberto = null; var p = doc.getElementById('fat2-painel'); if (p) p.remove(); return f.apply(this, arguments); };
      g.__fat2 = true;
      global[nome] = g;
    });
    doc.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && aberto) { aberto = null; var p = doc.getElementById('fat2-painel'); if (p) p.remove(); desenharLista(); } });
    var host = doc.getElementById('ferr-fat');
    if (host) { host.addEventListener('change', mudou); host.addEventListener('click', clique); }
  }

  global.MGBFaturamento = Object.assign({ desenhar: desenharLista }, regras);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
