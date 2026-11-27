/* Hub MGB — Clientes e Ficha do cliente (Hub v2, desenho aprovado em 23/11/2026).
 *
 * Página nova "Clientes" (page-clientes): lista de todos os clientes com contrato no hub, com busca,
 * situação (em dia / vencido) e, ao tocar, a ficha única do cliente: contratos (todos os módulos),
 * faturamento mês a mês, contato, histórico e observações.
 *
 * Lê o que já existe no hub: MODULES, rec (contrato), anunciantes (Tela Vertical), clientesInfo
 * (cadastro, assinatura, jornada), recPagamentos (pago / status do Asaas por mês), leads (CRM),
 * recOfMes (receita do mês). Grava só as observações (clientesInfo[mod][item].obsFicha).
 */
(function (global) {
  'use strict';
  var doc = global.document;
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MC = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var IGNORAR = /^(Outros|Expansão|Cliente Piloto|Franqueado Piloto)$/;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function dig(t) { return String(t || '').replace(/\D/g, ''); }
  function rotMod(m) { return String(m.label || m.id).split('—').pop().trim(); }

  // ── Regras puras (testadas em bot/test/clientes.test.js) ─────────────────
  // fontes: {modulos, rec, clientesInfo, anunciantes, recPagamentos, leads, recOfMes(mod,item,ano,mes)}
  function statusMes(pg, valor, ehPassado) {
    if (pg && pg.pago) return 'pago';
    var st = pg && pg.asaas && pg.asaas.st;
    if (st === 'vencido') return 'vencido';
    if (st) return st === 'pago' ? 'pago' : 'pendente';
    if (!valor) return 'sem cobrança';
    return ehPassado ? 'sem baixa' : 'a emitir';
  }
  function montarClientes(f, ano, mes) {
    var porChave = {}, lista = [];
    var info = f.clientesInfo || {}, rp = f.recPagamentos || {}, fe = f.fatEmissoes || {};
    var refHoje = ano * 12 + mes;
    function grupo(nome, i) {
      var d = dig(i.cnpj), k = d.length >= 11 ? 'd' + d : 'n' + norm(nome);
      var g = porChave[k] || porChave['n' + norm(nome)];
      if (!g) {
        g = { chave: k, nome: nome, razao: '', cnpj: '', tel: '', email: '', responsavel: '', cargo: '', contratos: [], leadId: null };
        porChave[k] = g; porChave['n' + norm(nome)] = g; lista.push(g);
      }
      ['razao', 'cnpj', 'tel', 'email', 'responsavel', 'cargo'].forEach(function (c) { if (!g[c] && i[c]) g[c] = i[c]; });
      if (!g.razao && i.fantasia && i.fantasia !== nome) g.razao = i.fantasia;
      return g;
    }
    (f.modulos || []).forEach(function (m) {
      var itens = m.id === 'elev' ? (f.anunciantes || []).map(function (a) { return a.nome; }) : (m.items || []);
      itens.forEach(function (item) {
        if (!item || IGNORAR.test(item)) return;
        var i = (info[m.id] || {})[item] || {};
        var padrao = (((rp[m.id] || {})[item] || {})._default) || {};
        if (!i.cnpj && /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/.test(padrao.obs || '')) i = Object.assign({}, i, { cnpj: (padrao.obs.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/) || [''])[0] });
        var c;
        if (m.id === 'elev') {
          var a = (f.anunciantes || []).filter(function (x) { return x.nome === item; })[0] || {};
          c = { valor: Number(a.valor) || 0, inicio: a.inicio || '', meses: Number(a.meses) || 0, telas: a.telas || [] };
        } else {
          var r = ((f.rec || {})[m.id] || {})[item] || {};
          c = { valor: Number(r.valor) || 0, inicio: r.inicio || '', meses: Number(r.meses) || 0, telas: [] };
        }
        var doMes = 0; try { doMes = f.recOfMes ? (Number(f.recOfMes(m.id, item, ano, mes)) || 0) : 0; } catch (e) {}
        if (m.id === 'elev') doMes = ativoNoMes(c, refHoje) ? c.valor : 0;
        if (!c.valor && !doMes) return;           // item sem contrato nem receita (ex.: lead) não vira cliente aqui
        var g = grupo(item, i);
        var meses = [];
        for (var k = 0; k < 4; k++) {
          var ref = refHoje - k, a2 = Math.floor(ref / 12), m2 = ref % 12;
          var pg = ((rp[m.id] || {})[item] || {})[a2 + '-' + m2];
          var v = m.id === 'elev' ? (ativoNoMes(c, ref) ? c.valor : 0) : (f.recOfMes ? (Number(f.recOfMes(m.id, item, a2, m2)) || 0) : c.valor);
          if (pg && pg.asaas && Number(pg.asaas.valor) > 0) v = Number(pg.asaas.valor);   // valor do boleto (já sem ISS retido)
          var em = padrao.fatId ? fe[padrao.fatId + '|' + a2 + '-' + String(m2 + 1).padStart(2, '0')] : null;   // linha do dia 5 deste mês
          var semNota = !!(em && (em.modo === 'ambos' || em.modo === 'nota') && !em.nf && em.status !== 'cancelada' && (em.paymentId || em.invoiceId));
          meses.push({ ano: a2, mes: m2, valor: v, status: statusMes(pg, v, k > 0), nf: pg && pg.asaas && pg.asaas.nf || '', boletoUrl: pg && pg.asaas && pg.asaas.boletoUrl || '', semNota: semNota });
        }
        g.contratos.push({ mod: m.id, modRot: rotMod(m), item: item, valor: c.valor, doMes: doMes, inicio: c.inicio, meses: c.meses, telas: c.telas,
          assinadoEm: i.assinadoEm || '', assinafy: !!i.assinafyDocId, aditivoPendente: !!(i.aditivo && i.aditivo.docId && !i.aditivo.assinadoEm), modLabel: m.label || m.id, issRetido: !!i.issRetido, jornada: i.jornada || [], obs: i.obsFicha || '', historico: meses });
      });
    });
    (f.leads || []).forEach(function (l) {
      var g = porChave['n' + norm(l.itemCriado)] || porChave['n' + norm(l.nome)] || (dig(l.cnpj).length >= 11 ? porChave['d' + dig(l.cnpj)] : null);
      if (g && !g.leadId) { g.leadId = l.id; g.origem = l.origem || ''; g.leadCriado = l.criado || ''; g.leadHistorico = l.historico || []; ['tel', 'email', 'responsavel'].forEach(function (c) { if (!g[c] && l[c]) g[c] = l[c]; }); }
    });
    lista.forEach(function (g) {
      g.pagaPorMes = g.contratos.reduce(function (s, c) { return s + c.doMes; }, 0);
      g.emAberto = 0; g.vencidos = 0;
      g.contratos.forEach(function (c) { c.historico.forEach(function (h) { if (h.status === 'vencido') { g.emAberto += h.valor; g.vencidos++; } }); });
      g.modulos = g.contratos.map(function (c) { return c.modRot; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      g.situacao = g.vencidos ? 'vencido' : g.pagaPorMes ? 'em dia' : 'sem receita no mês';
    });
    return lista.sort(function (a, b) { return (b.vencidos - a.vencidos) || (b.pagaPorMes - a.pagaPorMes) || a.nome.localeCompare(b.nome, 'pt-BR'); });
  }
  function ativoNoMes(c, ref) {
    var m = /^(\d{4})-(\d{2})/.exec(c.inicio || '');
    if (!m || !c.valor) return false;
    var ini = +m[1] * 12 + (+m[2] - 1), dur = c.meses || 12;
    return ref >= ini && (dur >= 120 || ref <= ini + dur - 1);
  }
  // Fim do contrato (Diego, 27/11): conta da data da assinatura; sem assinatura no hub, do mês em que
  // começa a pagar (como antes). Contrato de 120 meses ou mais não acaba. Devolve a data do último dia.
  function fimContrato(c) {
    var dur = Number(c && c.meses) || 12; if (dur >= 120) return null;
    var a = c && c.assinadoEm ? new Date(c.assinadoEm) : null, base;
    if (a && !isNaN(a)) base = { ano: a.getFullYear(), mes: a.getMonth(), dia: a.getDate(), de: 'assinatura' };
    else { var m = /^(\d{4})-(\d{2})/.exec((c && c.inicio) || ''); if (!m) return null; base = { ano: +m[1], mes: +m[2] - 1, dia: 1, de: 'inicio' }; }
    var d = new Date(base.ano, base.mes + dur, base.dia - 1);
    var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return { data: iso, ref: d.getFullYear() * 12 + d.getMonth(), de: base.de };
  }
  function diasAte(iso, hoje) {
    var p = iso.split('-'), h = hoje || new Date();
    return Math.round((new Date(+p[0], +p[1] - 1, +p[2]) - new Date(h.getFullYear(), h.getMonth(), h.getDate())) / 86400000);
  }
  function vigencia(c) {
    var m = /^(\d{4})-(\d{2})/.exec(c.inicio || '');
    if (!m) return 'sem data de início';
    var ini = +m[1] * 12 + (+m[2] - 1), fim = ini + (c.meses || 12) - 1;
    var r = function (k) { return MC[k % 12] + '/' + String(Math.floor(k / 12)).slice(2); };
    return 'desde ' + r(ini) + ((c.meses || 12) >= 120 ? ', sem data para acabar' : ' até ' + r(fim));
  }

  var regras = { montarClientes: montarClientes, statusMes: statusMes, ativoNoMes: ativoNoMes, vigencia: vigencia, fimContrato: fimContrato, diasAte: diasAte };
  if (typeof module !== 'undefined' && module.exports) module.exports = regras;
  if (!doc) return;

  // ── Tela ─────────────────────────────────────────────────────────────────
  function ler(nome, padrao) { try { var v = global.eval('typeof ' + nome + "!=='undefined'?" + nome + ':undefined'); return v === undefined ? padrao : v; } catch (e) { return padrao; } }
  var aberto = null, busca = '', filtro = 'todos', editContato = false;
  function faltaAssinar(g) { return g.contratos.some(function (c) { return (c.assinafy && !c.assinadoEm) || c.aditivoPendente; }); }
  function dados() {
    var h = new Date();
    return montarClientes({
      modulos: (ler('MODULES', []) || []).filter(function (m) { return m.id !== 'taroba'; }),
      rec: ler('rec', {}), clientesInfo: ler('clientesInfo', {}), anunciantes: ler('anunciantes', []),
      recPagamentos: ler('recPagamentos', {}), leads: ler('leads', []), fatEmissoes: ler('fatEmissoes', {}),
      recOfMes: typeof global.recOfMes === 'function' ? global.recOfMes : null,
    }, h.getFullYear(), h.getMonth());
  }
  function pill(t, tom) { return '<span class="cli2-pill cli2-' + tom + '">' + esc(t) + '</span>'; }
  var TOM = { pago: 'ok', vencido: 'erro', pendente: 'atencao', 'a emitir': 'acao', 'sem baixa': 'atencao', 'sem cobrança': 'neutro' };
  var COR = { pago: '#15803D', vencido: '#B42318', pendente: '#E0A458', 'a emitir': '#CFC7E6', 'sem baixa': '#E0A458', 'sem cobrança': '#E4DFF0' };

  function pagina() {
    var pg = doc.getElementById('page-clientes');
    if (!pg) {
      pg = doc.createElement('div'); pg.id = 'page-clientes'; pg.style.display = 'none'; pg.className = 'cli2';
      var main = doc.querySelector('main.main') || doc.querySelector('main');
      main.appendChild(pg);
      pg.addEventListener('click', clique);
      pg.addEventListener('input', function (ev) { if (ev.target.id === 'cli2-busca') { busca = ev.target.value; desenharLista(true); } });
    }
    return pg;
  }

  function desenhar() { if (aberto) desenharFicha(); else desenharLista(); }

  function desenharLista(soTabela) {
    var pg = pagina(), L = dados();
    var q = norm(busca);
    var vis = L.filter(function (g) {
      if (filtro === 'vencido' && g.situacao !== 'vencido') return false;
      if (filtro === 'assinar' && !faltaAssinar(g)) return false;
      if (filtro.indexOf('mod:') === 0 && g.modulos.indexOf(filtro.slice(4)) === -1) return false;
      return !q || norm(g.nome + ' ' + g.razao).indexOf(q) !== -1 || (dig(busca).length >= 3 && dig(g.cnpj).indexOf(dig(busca)) !== -1);
    });
    var mods = {}; L.forEach(function (g) { g.modulos.forEach(function (m) { mods[m] = (mods[m] || 0) + 1; }); });
    var nVenc = L.filter(function (g) { return g.situacao === 'vencido'; }).length;
    var nAss = L.filter(faltaAssinar).length; // 27/11 (usabilidade): quem espera assinatura aparecia só como "Em dia"
    var tabela = '<div class="cli2-rolar"><table class="cli2-tab"><thead><tr><th scope="col">Cliente</th><th scope="col">Produtos</th><th scope="col" class="cli2-n">Paga por mês</th><th scope="col">Situação</th></tr></thead><tbody>' +
      (vis.length ? vis.map(function (g) {
        return '<tr class="cli2-linha" tabindex="0" data-cli2="abrir:' + esc(g.chave) + '"><td><b>' + esc(g.nome) + '</b>' + (g.razao ? '<br><span class="cli2-sub">' + esc(g.razao) + '</span>' : '') + '</td>' +
          '<td>' + esc(g.modulos.join(', ')) + '</td><td class="cli2-n">' + (g.pagaPorMes ? brl(g.pagaPorMes) : '—') + '</td>' +
          '<td>' + (g.situacao === 'vencido' ? pill(g.vencidos === 1 ? '1 mês vencido' : g.vencidos + ' meses vencidos', 'erro') : g.situacao === 'em dia' ? pill('Em dia', 'ok') : pill('Sem receita no mês', 'neutro')) +
            (faltaAssinar(g) ? ' ' + pill('Falta assinar', 'atencao') : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="cli2-vazio">Nenhum cliente com esse filtro.</td></tr>') + '</tbody></table></div>';
    if (soTabela && doc.getElementById('cli2-lista')) { doc.getElementById('cli2-lista').innerHTML = tabela; return; }
    pg.innerHTML =
      '<header class="cli2-cab"><div><span class="cli2-sub">Clientes e contratos</span><h2>Clientes</h2></div>' +
        '<div class="cli2-acoes"><button type="button" class="cli2-btn2" data-cli2="contratos">Gerar contrato</button><button type="button" class="cli2-btn" data-cli2="novo">Novo cliente</button></div></header>' +
      '<div class="cli2-filtros"><label class="cli2-oculto" for="cli2-busca">Buscar cliente</label><input id="cli2-busca" type="search" placeholder="Buscar por nome ou CNPJ" value="' + esc(busca) + '" autocomplete="off">' +
        [['todos', 'Todos · ' + L.length], ['vencido', 'Com vencido · ' + nVenc], ['assinar', 'Aguardando assinatura · ' + nAss]].concat(Object.keys(mods).sort().map(function (m) { return ['mod:' + m, m + ' · ' + mods[m]]; })).map(function (c) {
          return '<button type="button" class="cli2-chip' + (filtro === c[0] ? ' cli2-on' : '') + '" aria-pressed="' + (filtro === c[0]) + '" data-cli2="filtro:' + esc(c[0]) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>' +
      '<section class="cli2-bloco cli2-sem-pad" id="cli2-lista">' + tabela + '</section>';
  }

  function desenharFicha() {
    var pg = pagina(), g = dados().filter(function (x) { return x.chave === aberto; })[0];
    if (!g) { aberto = null; desenharLista(); return; }
    var h = new Date(), anoAtual = h.getFullYear();
    var recebidoAno = 0, nCob = 0;
    g.contratos.forEach(function (c) { c.historico.forEach(function (x) { if (x.ano === anoAtual && x.status === 'pago') { recebidoAno += x.valor; nCob++; } }); });
    var tel = dig(g.tel);
    var eventos = [];
    if (g.leadCriado) eventos.push({ em: g.leadCriado, t: 'Lead entrou no funil' + (g.origem ? ' · ' + g.origem : '') });
    (g.leadHistorico || []).forEach(function (x) { if (x && x.texto) eventos.push({ em: x.data || '', t: x.texto }); });
    g.contratos.forEach(function (c) {
      (c.jornada || []).forEach(function (j) { eventos.push({ em: j.em ? new Date(j.em).toLocaleDateString('pt-BR') : '', t: j.texto }); });
      c.historico.forEach(function (x) { if (x.status === 'pago' || x.status === 'vencido') eventos.push({ em: MC[x.mes] + '/' + String(x.ano).slice(2), t: (x.status === 'pago' ? 'Pagou ' : 'Venceu ') + MESES[x.mes] + ' · ' + c.modRot + (x.nf ? ' · NF ' + x.nf : '') }); });
    });
    var obsC = g.contratos[0];
    pg.innerHTML =
      '<div class="cli2-ficha"><main>' +
      '<button type="button" class="cli2-voltar" data-cli2="voltar">‹ Clientes</button>' +
      '<header class="cli2-cab"><div><h2>' + esc(g.nome) + '</h2><span class="cli2-sub">' + esc([g.razao, g.cnpj ? 'CNPJ ' + g.cnpj : 'sem CNPJ no cadastro', g.origem ? 'veio por ' + g.origem.toLowerCase() : ''].filter(Boolean).join(' · ')) + '</span>' +
        '<div class="cli2-tags">' + g.modulos.map(function (m) { return pill(m, 'acao'); }).join('') + (g.vencidos ? pill(g.vencidos === 1 ? '1 mês vencido' : g.vencidos + ' meses vencidos', 'erro') : '') + '</div></div>' +
        '<div class="cli2-acoes">' + (tel ? '<a class="cli2-btn2" href="https://wa.me/55' + tel + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
          '<button type="button" class="cli2-btn2" data-cli2="contratos">Novo contrato</button>' + (g.leadId ? '<button type="button" class="cli2-btn2" data-cli2="lead:' + g.leadId + '">Ver no funil</button>' : '') + '</div></header>' +
      '<div class="cli2-nums">' +
        '<div><span>Paga por mês</span><b>' + brl(g.pagaPorMes) + '</b><small>' + esc(g.contratos.length === 1 ? g.contratos[0].modRot : g.contratos.length + ' contratos') + '</small></div>' +
        '<div><span>Em aberto</span><b class="' + (g.emAberto ? 'cli2-vermelho' : '') + '">' + brl(g.emAberto) + '</b><small>' + (g.vencidos ? 'boleto vencido' : 'nada vencido') + '</small></div>' +
        '<div><span>Recebido nos últimos 4 meses</span><b>' + brl(recebidoAno) + '</b><small>' + nCob + (nCob === 1 ? ' cobrança paga' : ' cobranças pagas') + ' em ' + anoAtual + '</small></div></div>' +
      '<section class="cli2-bloco"><h3>Contratos</h3>' + g.contratos.map(function (c) {
        return '<div class="cli2-item"><div class="cli2-item-txt"><b>' + esc(c.modRot) + (c.item !== g.nome ? ' · ' + esc(c.item) : '') + '</b><span>' +
          esc([brl(c.valor) + '/mês', vigencia(c), c.telas.length ? c.telas.join(', ') : '', c.issRetido ? 'ISS retido pelo cliente' : ''].filter(Boolean).join(' · ')) + '</span></div>' +
          pillFim(c) +
          (c.assinadoEm ? pill('Assinado em ' + new Date(c.assinadoEm).toLocaleDateString('pt-BR'), 'ok') : c.assinafy ? pill('Aguardando assinatura', 'atencao') : pill('Sem assinatura no hub', 'neutro')) +
          (c.aditivoPendente ? pill('Aditivo aguardando assinatura', 'atencao') : podeRenovar(c) ? '<button type="button" class="cli2-btn cli2-peq" data-cli2="renovar:' + esc(c.mod) + '|' + esc(c.item) + '">Renovar (aditivo)</button>' : '') +
          '<button type="button" class="cli2-btn2 cli2-peq" data-cli2="modulo:' + esc(c.mod) + '|' + esc(c.item) + '">Abrir no módulo</button></div>';
      }).join('') + '</section>' +
      '<section class="cli2-bloco"><h3>Faturamento</h3>' + g.contratos.map(function (c) {
        return (g.contratos.length > 1 ? '<h4>' + esc(c.modRot) + '</h4>' : '') + c.historico.map(function (x) {
          return '<div class="cli2-mes"><span class="cli2-ponto" style="background:' + COR[x.status] + '"></span><b>' + esc(MESES[x.mes].charAt(0).toUpperCase() + MESES[x.mes].slice(1)) + '</b>' +
            '<span class="cli2-sub">' + esc(x.status) + (x.nf ? ' · NF ' + esc(x.nf) : x.semNota ? ' · <b class="cli2-laranja">nota sem número</b>' : '') + '</span>' +
            (x.boletoUrl && /^https:\/\//.test(x.boletoUrl) && x.status !== 'pago' ? '<a class="cli2-link" href="' + esc(x.boletoUrl) + '" target="_blank" rel="noopener">boleto</a>' : '<span></span>') +
            '<span class="cli2-mono">' + (x.valor ? brl(x.valor) : '—') + '</span></div>';
        }).join('');
      }).join('') + '<div class="cli2-acoes"><button type="button" class="cli2-btn" data-cli2="faturamento:' + esc(g.contratos[0] ? g.contratos[0].item : g.nome) + '">Ver no Faturamento</button></div></section>' +
      '</main><aside>' +
      (editContato
        // 27/11 (usabilidade): o contato era só leitura; corrigir telefone ou e-mail obrigava a ir ao Faturamento
        ? '<section><h3>Contato</h3><form class="cli2-contato" data-cli2-form="contato">' +
            '<label>Responsável<input id="cli2-c-resp" value="' + esc(g.responsavel) + '" autocomplete="off"></label>' +
            '<label>WhatsApp<input id="cli2-c-tel" type="tel" inputmode="tel" value="' + esc(g.tel) + '" placeholder="(43) 99999-0000" autocomplete="off"></label>' +
            '<label>E-mail de cobrança<input id="cli2-c-email" type="email" inputmode="email" autocapitalize="none" value="' + esc(g.email) + '" autocomplete="off"></label>' +
            '<p class="cli2-erro" id="cli2-c-erro" role="alert"></p>' +
            '<div class="cli2-acoes"><button type="button" class="cli2-btn" data-cli2="salvar-contato">Salvar contato</button><button type="button" class="cli2-btn2" data-cli2="cancelar-contato">Cancelar</button></div>' +
            '<p class="cli2-sub">Vale para a nota, o boleto e o WhatsApp de cobrança.</p></form></section>'
        : '<section><h3>Contato</h3><dl><dt>Responsável</dt><dd>' + esc(g.responsavel || '—') + (g.cargo ? ' · ' + esc(g.cargo) : '') + '</dd><dt>WhatsApp</dt><dd>' + esc(g.tel || '—') + '</dd><dt>E-mail</dt><dd>' + esc(g.email || '—') + '</dd></dl>' +
            '<button type="button" class="cli2-btn2 cli2-peq" data-cli2="editar-contato">Editar contato</button></section>') +
      '<section><h3>Histórico</h3>' + (eventos.length ? eventos.slice(-12).reverse().map(function (e) { return '<div class="cli2-ev"><b>' + esc(e.t) + '</b><span>' + esc(e.em) + '</span></div>'; }).join('') : '<p class="cli2-sub">Sem eventos registrados.</p>') + '</section>' +
      '<section><h3><label for="cli2-obs">Observações</label></h3><textarea id="cli2-obs" placeholder="Ex.: prefere receber o boleto pelo WhatsApp">' + esc(obsC ? obsC.obs : '') + '</textarea>' +
        '<button type="button" class="cli2-btn2" data-cli2="salvar-obs">Salvar observação</button><span class="cli2-sub" id="cli2-obs-st" role="status"></span></section>' +
      '</aside></div>';
  }

  function clique(ev) {
    var b = ev.target.closest('[data-cli2]');
    if (!b) return;
    var a = b.getAttribute('data-cli2'), i = a.indexOf(':'), acao = i < 0 ? a : a.slice(0, i), arg = i < 0 ? '' : a.slice(i + 1);
    try {
      if (acao === 'abrir') { aberto = arg; editContato = false; desenharFicha(); global.scrollTo(0, 0); }
      else if (acao === 'voltar') { aberto = null; editContato = false; desenharLista(); }
      else if (acao === 'editar-contato') { editContato = true; desenharFicha(); var ic = doc.getElementById('cli2-c-tel'); if (ic) ic.focus(); }
      else if (acao === 'cancelar-contato') { editContato = false; desenharFicha(); }
      else if (acao === 'salvar-contato') salvarContato();
      else if (acao === 'filtro') { filtro = arg; desenharLista(); }
      else if (acao === 'contratos') global.goOperacional('contratos');
      else if (acao === 'novo') global.MGBNovo.abrir();
      else if (acao === 'lead') { global.goPage('leads'); setTimeout(function () { try { global.openLeadModal('edit', isNaN(+arg) ? arg : +arg); } catch (e) {} }, 150); }
      else if (acao === 'modulo') abrirNoModulo(arg);
      else if (acao === 'faturamento') { global.fatAbrirFaturamento(); buscarNoFaturamento(arg); }
      else if (acao === 'salvar-obs') salvarObs();
      else if (acao === 'renovar') renovar(arg);
    } catch (e) { console.error('clientes:', acao, e); }
  }
  // "Ver no Faturamento" já filtrado no cliente: espera a lista nova aparecer e preenche a busca
  function buscarNoFaturamento(nome, tentativas) {
    if (!nome) return;
    var n = tentativas == null ? 25 : tentativas, el = doc.getElementById('fat2-busca');
    if (el) { el.value = nome; el.dispatchEvent(new global.Event('input', { bubbles: true })); return; }
    if (n > 0) setTimeout(function () { buscarNoFaturamento(nome, n - 1); }, 200);
  }
  function pillFim(c) {
    var f = fimContrato(c); if (!f) return '';
    var d = diasAte(f.data), txt = f.data.split('-').reverse().join('/');
    if (d < 0) return pill('Terminou em ' + txt, 'erro');
    return pill('Termina em ' + txt, d <= 60 ? 'atencao' : 'neutro');
  }
  // "Abrir no módulo" já no cliente (27/11): antes caía no painel do módulo, na primeira unidade
  function abrirNoModulo(arg) {
    var p = arg.split('|'), mod = p[0], item = p.slice(1).join('|');
    if (mod === 'elev') { global.goOperacional('telavertical', 'tvanunc'); return; }    // anunciante: aba Anunciantes
    global.drillMod(mod);
    if (!item || mod === 'radioops') return;
    try { if (typeof global.switchItem === 'function') global.switchItem(item); } catch (e) {}
    setTimeout(function () { try { if (global.MGBFinanceiro && global.MGBFinanceiro.abrirCliente) global.MGBFinanceiro.abrirCliente(item); } catch (e) {} }, 150);
  }
  // Renovar pela ficha: contrato que termina em até 60 dias (ou terminou há menos de 30) gera o aditivo
  function podeRenovar(c) {
    if (!global.MGBFluxos || !global.MGBFluxos.abrirAditivo) return false;
    var f = fimContrato(c); if (!f) return false;
    var d = diasAte(f.data); return d <= 60 && d >= -30;
  }
  function renovar(arg) {
    var p = arg.split('|'), mod = p[0], item = p.slice(1).join('|');
    var g = dados().filter(function (x) { return x.chave === aberto; })[0]; if (!g) return;
    var c = g.contratos.filter(function (x) { return x.mod === mod && x.item === item; })[0]; if (!c) return;
    var f = fimContrato(c), info = ((ler('clientesInfo', {}) || {})[mod] || {})[item] || {};
    var origem = mod === 'elev' ? 'Tela Vertical' : c.modLabel;
    global.MGBFluxos.abrirAditivo({ origem: origem, nome: item, valor: c.valor, inicio: c.inicio, meses: c.meses, fimKey: f.ref, fimData: f.data },
      { contato: Object.assign({}, info, { email: info.email || g.email, responsavel: info.responsavel || g.responsavel }), aoEnviar: function () { setTimeout(desenharFicha, 300); } });
  }
  // Abre a ficha pelo nome do item (vindo do funil, do Faturamento…)
  function abrirPorNome(nome) {
    var n = norm(nome), g = dados().filter(function (x) { return norm(x.nome) === n || x.contratos.some(function (c) { return norm(c.item) === n; }); })[0];
    aberto = g ? g.chave : null; global.goPage('clientes');
  }
  function salvarContato() {
    var g = dados().filter(function (x) { return x.chave === aberto; })[0], ci = ler('clientesInfo', null);
    if (!g || !ci || !g.contratos.length) return;
    var v = function (id) { return String((doc.getElementById(id) || {}).value || '').trim(); };
    var resp = v('cli2-c-resp'), tel = v('cli2-c-tel'), email = v('cli2-c-email').toLowerCase(), erro = doc.getElementById('cli2-c-erro');
    if (tel && dig(tel).length < 10) { erro.textContent = 'O WhatsApp precisa ter DDD e número, por exemplo (43) 99999-0000.'; return; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { erro.textContent = 'O e-mail parece incompleto. Confira, por exemplo nome@empresa.com.br.'; return; }
    g.contratos.forEach(function (c) {
      ci[c.mod] = ci[c.mod] || {}; var i = ci[c.mod][c.item] = ci[c.mod][c.item] || {};
      i.responsavel = resp; i.tel = tel; i.email = email;
    });
    if (typeof global.mgbAcao === 'function') global.mgbAcao('Contato de ' + g.nome + ' atualizado');
    try { global.scheduleSave(); } catch (e) {}
    editContato = false; desenharFicha();
  }
  function salvarObs() {
    var g = dados().filter(function (x) { return x.chave === aberto; })[0], ci = ler('clientesInfo', null);
    if (!g || !ci || !g.contratos.length) return;
    var c = g.contratos[0], txt = (doc.getElementById('cli2-obs') || {}).value || '';
    ci[c.mod] = ci[c.mod] || {}; ci[c.mod][c.item] = ci[c.mod][c.item] || {};
    ci[c.mod][c.item].obsFicha = txt.slice(0, 2000);
    if (typeof global.mgbAcao === 'function') global.mgbAcao('Observação de ' + g.nome + ' salva');
    try { global.scheduleSave(); } catch (e) {}
    var st = doc.getElementById('cli2-obs-st'); if (st) st.textContent = 'Salvo.';
  }

  function estilos() {
    if (doc.getElementById('cli2-css')) return;
    var s = doc.createElement('style');
    s.id = 'cli2-css';
    s.textContent =
      '.cli2{font-family:"DM Sans",system-ui,sans-serif;color:#241A38}' +
      '#page-clientes>header,#page-clientes>.cli2-filtros,#page-clientes>.cli2-bloco{max-width:1100px;margin-left:auto;margin-right:auto}' +
      '#page-clientes{padding:28px 28px 40px;box-sizing:border-box}#page-clientes>*+*{margin-top:16px}' +
      '.cli2 h2{margin:0;font-size:28px;font-weight:700}.cli2 h3{margin:0 0 6px;font-size:19px;font-weight:700}.cli2 h4{margin:12px 0 2px;font-size:14px;color:#5D5868}' +
      '.cli2-sub{font-size:14px;color:#5D5868}.cli2-cab{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:14px}.cli2-cab>div:first-child{display:flex;flex-direction:column;gap:4px}' +
      '.cli2-acoes{display:flex;flex-wrap:wrap;gap:10px;align-items:center}' +
      '.cli2-btn,.cli2-btn2{min-height:44px;padding:0 16px;border-radius:10px;font:700 14px "DM Sans",system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;white-space:nowrap;box-sizing:border-box}' +
      '.cli2-btn{border:0;background:#4E38B2;color:#fff}.cli2-btn:hover{background:#2A1760}.cli2-btn2{border:1px solid #CFC7E6;background:#fff;color:#2A1760;font-weight:600}.cli2-btn2:hover{background:#ECE8FA}.cli2-peq{min-height:36px;font-size:13px}' +
      '.cli2-filtros{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '#cli2-busca{min-height:42px;width:min(320px,100%);border:1px solid #CFC7E6;border-radius:999px;padding:0 16px;font:15px "DM Sans",system-ui,sans-serif;box-sizing:border-box}' +
      '.cli2-chip{min-height:40px;padding:0 14px;border:1px solid #CFC7E6;border-radius:999px;background:#fff;color:#3A3446;font:600 14px "DM Sans",system-ui,sans-serif;cursor:pointer}.cli2-chip.cli2-on{background:#4E38B2;border-color:#4E38B2;color:#fff}' +
      '.cli2-bloco{background:#fff;border:1px solid #E4DFF0;border-radius:18px;padding:20px 22px}.cli2-sem-pad{padding:0;overflow:hidden}' +
      '.cli2-rolar{overflow-x:auto;position:relative}.cli2-tab{width:100%;border-collapse:collapse;min-width:620px;font-size:14.5px}' +
      '.cli2-tab th{text-align:left;padding:12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#5D5868!important;background:#fff!important}.cli2-tab th:first-child,.cli2-tab td:first-child{padding-left:20px!important}' +
      '.cli2-tab td{padding:12px!important;border-top:1px solid #EFEBF7;white-space:normal!important}.cli2-n{text-align:right!important;font-family:"DM Mono",ui-monospace,monospace;white-space:nowrap!important}' +
      '.cli2-linha{cursor:pointer}.cli2-linha:hover td{background:#FBFAFE}.cli2-linha:focus-visible{outline:3px solid #6C55DB;outline-offset:-3px}.cli2-vazio{padding:18px 20px!important;color:#5D5868}' +
      '.cli2-pill{display:inline-block;font-size:12.5px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap}' +
      '.cli2-ok{color:#15803D;background:#E8F6EE}.cli2-erro{color:#B42318;background:#FDECEA}.cli2-atencao{color:#8A4B08;background:#FDF2E3}.cli2-acao{color:#4E38B2;background:#ECE8FA}.cli2-neutro{color:#5D5868;background:#EFEBF7}' +
      '.cli2-ficha{display:flex;flex-wrap:wrap;gap:0;max-width:1240px;margin:-28px auto 0}.cli2-ficha>main{flex:999 1 600px;min-width:0;padding:28px 24px 28px 0;display:flex;flex-direction:column;gap:16px}' +
      '.cli2-ficha>aside{flex:1 1 320px;max-width:100%;background:#fff;border-left:1px solid #E4DFF0;padding:28px;box-sizing:border-box;display:flex;flex-direction:column;gap:22px;margin-right:-28px}' +
      '.cli2-voltar{align-self:flex-start;background:none;border:0;padding:0;color:#4E38B2;font:600 14px "DM Sans",system-ui,sans-serif;cursor:pointer;min-height:32px}' +
      '.cli2-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}' +
      '.cli2-nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.cli2-nums>div{background:#fff;border:1px solid #E4DFF0;border-radius:18px;padding:18px 20px;display:flex;flex-direction:column;gap:4px}' +
      '.cli2-nums span{font-size:14px;color:#5D5868}.cli2-nums b{font:600 26px "DM Mono",ui-monospace,monospace}.cli2-nums small{font-size:13.5px;color:#5D5868}.cli2-vermelho{color:#B42318}.cli2-laranja{color:#B45309;font-weight:700}' +
      '.cli2-item{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:13px 0;border-top:1px solid #EFEBF7}.cli2-item-txt{flex:1 1 320px;display:flex;flex-direction:column;gap:3px}.cli2-item-txt b{font-size:16px}.cli2-item-txt span{font-size:14px;color:#5D5868}' +
      '.cli2-mes{display:grid;grid-template-columns:10px 110px minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:11px 0;border-top:1px solid #EFEBF7;font-size:15px}' +
      '.cli2-ponto{width:10px;height:10px;border-radius:50%}.cli2-mono{font-family:"DM Mono",ui-monospace,monospace;font-size:14px}.cli2-link{color:#4E38B2;font-weight:600;font-size:14px}' +
      '.cli2-ficha aside h3{font-size:18px}.cli2-ficha dl{margin:0;display:grid;grid-template-columns:100px 1fr;gap:8px 12px;font-size:14px}.cli2-ficha dt{color:#5D5868}.cli2-ficha dd{margin:0;word-break:break-word}' +
      '.cli2-ev{display:flex;flex-direction:column;gap:2px;padding:10px 0;border-top:1px solid #EFEBF7}.cli2-ev b{font-size:14px}.cli2-ev span{font-size:13px;color:#5D5868}' +
      '#cli2-obs{width:100%;min-height:90px;border:1px solid #CFC7E6;border-radius:10px;padding:10px 12px;font:14px "DM Sans",system-ui,sans-serif;box-sizing:border-box;margin-bottom:8px}' +
      '.cli2-oculto{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}' +
      '.cli2-btn:focus-visible,.cli2-btn2:focus-visible,.cli2-chip:focus-visible,.cli2-voltar:focus-visible{outline:3px solid #6C55DB;outline-offset:2px}' +
      '.cli2-contato{display:flex;flex-direction:column;gap:10px}.cli2-contato label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#5D5868;font-weight:600}' +
      '.cli2-contato input{height:44px;border:1px solid #CFC7E6;border-radius:10px;padding:0 12px;font:16px "DM Sans",system-ui,sans-serif;color:#241A38;box-sizing:border-box;width:100%}' +
      '.cli2-erro:empty{display:none}.cli2-erro{margin:0;color:#B42318;background:#FDECEA;border-radius:8px;padding:8px 10px;font-size:14px}' +
      // celular: cada cliente vira um cartão (a tabela de 620 px cortava "Paga por mês" e "Situação")
      '@media (max-width:700px){.cli2-tab{min-width:0}.cli2-tab thead{display:none}.cli2-tab,.cli2-tab tbody,.cli2-tab tr,.cli2-tab td{display:block;width:auto}' +
        '.cli2-tab tr.cli2-linha{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:12px 14px;border-top:1px solid #EFEBF7}' +
        '.cli2-tab tr.cli2-linha td{padding:0;border:0}.cli2-tab tr.cli2-linha td:nth-child(2){grid-column:1;color:#5D5868;font-size:13.5px}.cli2-tab tr.cli2-linha td:nth-child(3){grid-column:2;grid-row:1;text-align:right}' +
        '.cli2-tab tr.cli2-linha td:nth-child(4){grid-column:1/-1}}' +
      '@media (max-width:760px){#page-clientes{padding:18px 16px 32px}.cli2-nums{grid-template-columns:1fr}.cli2-ficha{margin-top:-18px}.cli2-ficha>main{padding:18px 0}.cli2-ficha>aside{margin:0 -16px;border-left:0;border-top:1px solid #E4DFF0;padding:20px 16px}.cli2-mes{grid-template-columns:10px 90px minmax(0,1fr) auto;}.cli2-mes>a,.cli2-mes>span:nth-child(4){display:none}}';
    doc.head.appendChild(s);
  }

  // Item "Clientes" no menu, na área Clientes e contratos
  function menu() {
    if (doc.getElementById('nav-clientes')) return;
    var ct = doc.getElementById('nav-contratos');
    if (!ct) return;
    var n = doc.createElement('div');
    n.className = 'sb-nav-item'; n.id = 'nav-clientes'; n.title = 'Clientes';
    n.setAttribute('onclick', "goPage('clientes')");
    n.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/></svg>Clientes';
    ct.parentNode.insertBefore(n, ct);
  }

  function ligar() {
    estilos(); menu(); pagina();
    var gp = global.goPage;
    if (typeof gp === 'function' && !gp.__cli2) {
      var ng = function (p) {
        var r = gp.apply(this, arguments);
        var pg = doc.getElementById('page-clientes'), nav = doc.getElementById('nav-clientes');
        if (p === 'clientes') { if (pg) pg.style.display = 'block'; if (nav) nav.classList.add('on'); desenhar(); }
        else { if (pg) pg.style.display = 'none'; if (nav) nav.classList.remove('on'); }
        return r;
      };
      ng.__cli2 = true; global.goPage = ng;
    }
    doc.addEventListener('keydown', function (ev) { var t = ev.target; if (ev.key === 'Enter' && t && t.classList && t.classList.contains('cli2-linha')) t.click(); });
  }

  global.MGBClientes = Object.assign({ desenhar: desenhar, abrir: function (chave) { aberto = chave; global.goPage('clientes'); },
    fichaAberta: function () { return aberto; }, fechar: function () { aberto = null; }, abrirPorNome: abrirPorNome, dados: function () { try { return dados(); } catch (e) { return []; } } }, regras);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
