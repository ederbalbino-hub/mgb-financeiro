/* Hub MGB — Início (Home) no desenho aprovado em 18/11/2026 (canvas "Hub MGB — proposta visual").
 *
 * Monta, dentro de #page-home, a tela nova: "Precisa de você hoje", Faturamento do mês, Próximo
 * faturamento, Funil (Eder), Resultado do mês (Eder), Lançar e Carteira. Usa só dados e funções que o
 * hub já tem (fatEmissoes, leads, MODULES, MGBNovo, fatAbrirFaturamento, leadsPendentes, togglePrivate).
 *
 * Os avisos especiais que já existiam (Mercadão, Vaapty, virada do Faturamento, pendências antigas,
 * Rádio Ops e a renovação por telefone do acesso.js) continuam sendo calculados pelas funções de
 * sempre: o bloco só os move para "Outros avisos" e aplica o visual novo.
 */
(function (global) {
  'use strict';
  var doc = global.document;

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var AVISOS_ANTIGOS = ['home-merc-alert', 'home-vaapty-alert', 'home-fat-virada', 'home-fat-pend', 'home-rops-alert'];

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function reais(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function ler(nome, padrao) { try { var v = global.eval('typeof ' + nome + "!=='undefined'?" + nome + ':undefined'); return v === undefined ? padrao : v; } catch (e) { return padrao; } }
  function usuario() { try { return (global.MGBAcesso && global.MGBAcesso.usuario && global.MGBAcesso.usuario()) || null; } catch (e) { return null; } }
  function visiveis() { return !!ler('valuesVisible', false); }

  // ── Regras puras (testadas em bot/test/inicio.test.js) ────────────────────
  function competencia(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

  function resumoFaturamento(emissoes, comp) {
    var r = { total: 0, valor: 0, pagos: 0, pendentes: 0, vencidos: 0, semStatus: 0, vencidosNomes: [], semNota: [], erros: [] };
    Object.keys(emissoes || {}).forEach(function (k) {
      var i = k.lastIndexOf('|');
      if (i < 0 || k.slice(i + 1) !== comp) return;
      var e = emissoes[k] || {};
      if (e.status === 'erro') { r.erros.push(e.cliente || k.slice(0, i)); return; } // não foi cobrado: vira pendência, não "sem status"
      r.total++;
      r.valor += Number(e.valor) || 0;
      var pg = e.pgManual ? 'pago' : e.pg;
      if (pg === 'pago') r.pagos++;
      else if (pg === 'vencido') { r.vencidos++; r.vencidosNomes.push(e.cliente || k.slice(0, i)); }
      else if (pg === 'pendente' || pg === 'aguardando') r.pendentes++;
      else r.semStatus++;
      var esperaNota = e.modo === 'ambos' || e.modo === 'nota';
      if (esperaNota && !e.nf && e.status !== 'cancelada' && (e.paymentId || e.invoiceId)) r.semNota.push(e.cliente || k.slice(0, i));
    });
    return r;
  }

  function proximoFaturamento(hoje) {
    var alvo = new Date(hoje.getFullYear(), hoje.getMonth(), 5);
    if (hoje.getDate() > 5) alvo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 5);
    var dias = Math.round((new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate()) - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 86400000);
    return { data: alvo, dias: dias, comp: competencia(alvo) };
  }

  function contarFunil(lista) {
    var c = { novo: 0, contatado: 0, negociando: 0, fechado: 0, perdido: 0, semCadastro: 0 };
    (lista || []).forEach(function (l) {
      if (!l) return;
      if (c[l.estagio] !== undefined) c[l.estagio]++;
      if (l.estagio === 'fechado' && (!l.itemCriado || l.itemCriado === 'None')) c.semCadastro++;
    });
    return c;
  }

  // Boletos vencidos dos meses anteriores (até 3 meses), que o resumo do mês não mostra (27/11).
  function vencidosAnteriores(emissoes, comp, quantos) {
    var lim = quantos || 3, out = [];
    var mm = /^(\d{4})-(\d{2})$/.exec(comp || ''); if (!mm) return out;
    var ref = +mm[1] * 12 + (+mm[2] - 1);
    Object.keys(emissoes || {}).forEach(function (k) {
      var i = k.lastIndexOf('|'), c = /^(\d{4})-(\d{2})$/.exec(i < 0 ? '' : k.slice(i + 1)); if (!c) return;
      var d = ref - (+c[1] * 12 + (+c[2] - 1)); if (d < 1 || d > lim) return;
      var e = emissoes[k] || {};
      if (!e.pgManual && e.pg === 'vencido' && e.status !== 'cancelada') out.push({ cliente: e.cliente || k.slice(0, i), comp: k.slice(i + 1), valor: Number(e.valor) || 0 });
    });
    return out.sort(function (a, b) { return a.comp < b.comp ? -1 : a.comp > b.comp ? 1 : a.cliente.localeCompare(b.cliente, 'pt-BR'); });
  }

  // Promessas de pagamento (27/11): as que chegaram no dia (ou passaram) e o boleto ainda não foi pago.
  function promessasDoDia(promessas, emissoes, hojeISO) {
    var out = [];
    Object.keys(promessas || {}).forEach(function (k) {
      var p = promessas[k] || {}, e = (emissoes || {})[k] || {};
      if (!p.data || p.data > hojeISO) return;
      if (e.pgManual || e.pg === 'pago' || e.status === 'cancelada') return;
      var i = k.lastIndexOf('|');
      out.push({ cliente: p.cliente || e.cliente || k.slice(0, i), comp: k.slice(i + 1), data: p.data, atrasada: p.data < hojeISO });
    });
    return out.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
  }

  // Contratos enviados à Assinafy que ainda não voltaram assinados (contrato e aditivo de renovação).
  function aguardandoAssinatura(info, agora) {
    var out = [], t = (agora || new Date()).getTime();
    Object.keys(info || {}).forEach(function (mod) {
      if (mod.charAt(0) === '_') return;
      Object.keys(info[mod] || {}).forEach(function (nome) {
        var i = info[mod][nome]; if (!i || typeof i !== 'object') return;
        var pend = [];
        if (i.assinafyDocId && !i.assinadoEm) pend.push({ tipo: 'contrato', em: i.assinafyEnviadoEm });
        if (i.aditivo && i.aditivo.docId && !i.aditivo.assinadoEm) pend.push({ tipo: 'aditivo', em: i.aditivo.enviadoEm });
        pend.forEach(function (p) {
          var dias = p.em ? Math.max(0, Math.floor((t - new Date(p.em).getTime()) / 86400000)) : null;
          out.push({ mod: mod, nome: nome, tipo: p.tipo, dias: dias });
        });
      });
    });
    return out.sort(function (a, b) { return (b.dias || 0) - (a.dias || 0) || a.nome.localeCompare(b.nome, 'pt-BR'); });
  }

  function saudacao(hora) { return hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'; }

  var regras = { resumoFaturamento: resumoFaturamento, proximoFaturamento: proximoFaturamento, contarFunil: contarFunil, saudacao: saudacao,
    vencidosAnteriores: vencidosAnteriores, aguardandoAssinatura: aguardandoAssinatura, promessasDoDia: promessasDoDia };
  if (typeof module !== 'undefined' && module.exports) module.exports = regras;
  if (!doc) return;

  // ── Montagem ─────────────────────────────────────────────────────────────
  function item(cor, titulo, detalhe, botao, acao, primario) {
    return '<div class="ini-item"><span class="ini-ponto" style="background:' + cor + '"></span>' +
      '<div class="ini-txt"><b>' + titulo + '</b>' + (detalhe ? '<span>' + detalhe + '</span>' : '') + '</div>' +
      (botao ? '<button type="button" class="' + (primario ? 'ini-btn' : 'ini-btn ini-btn2') + '" data-ini="' + acao + '">' + botao + '</button>' : '') + '</div>';
  }

  function montar() {
    var raiz = doc.getElementById('inicio');
    var pg = doc.getElementById('page-home');
    if (!pg) return;
    if (!raiz) {
      raiz = doc.createElement('div');
      raiz.id = 'inicio';
      pg.insertBefore(raiz, pg.firstChild);
      raiz.addEventListener('click', clique);
    }
    doc.body.classList.add('inicio-novo');

    var u = usuario() || { nome: '', papel: '' };
    // Segue o perfil efetivo do acesso.js: "Ver como Karen" mostra o Início da Karen.
    var perfil = '';
    try { perfil = (global.MGBAcesso && global.MGBAcesso.perfil && global.MGBAcesso.perfil()) || ''; } catch (e) {}
    var eder = perfil ? perfil.indexOf('admin') === 0 : u.papel === 'admin';
    var hoje = new Date();
    var comp = competencia(hoje);
    var emissoes = ler('fatEmissoes', {});
    var fat = resumoFaturamento(emissoes, comp);
    var prox = proximoFaturamento(hoje);
    var funil = contarFunil(ler('leads', []));
    var retornos = 0;
    try { retornos = eder && typeof global.leadsPendentes === 'function' ? global.leadsPendentes().length : 0; } catch (e) { retornos = 0; }
    var ver = visiveis();
    var nomeMes = MESES[hoje.getMonth()];

    // Precisa de você hoje
    var itens = [];
    if (fat.vencidos) itens.push(item('#B42318', plural(fat.vencidos, 'boleto de ' + nomeMes + ' vencido', 'boletos de ' + nomeMes + ' vencidos'),
      'Cobrar ou dar baixa se o cliente pagou por fora · ' + esc(fat.vencidosNomes.slice(0, 4).join(', ')) + (fat.vencidosNomes.length > 4 ? '…' : ''), 'Cobrar', 'atrasados', true));
    if (fat.erros.length) itens.push(item('#B42318', plural(fat.erros.length, 'cobrança de ' + nomeMes + ' deu erro', 'cobranças de ' + nomeMes + ' deram erro'),
      esc(fat.erros.slice(0, 4).join(', ')) + (fat.erros.length > 4 ? '…' : '') + ' · não foi cobrado; corrija os dados e emita de novo', 'Ver', 'fat', !fat.vencidos));
    var hISO = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
    var prom = promessasDoDia((ler('notaConfig', {}) || {}).promessas, emissoes, hISO);
    if (prom.length) {
      var promAtr = prom.filter(function (p) { return p.atrasada; }).length;
      itens.push(item(promAtr ? '#B42318' : '#B45309', plural(prom.length, 'promessa de pagamento para conferir', 'promessas de pagamento para conferir'),
        esc(prom.slice(0, 4).map(function (p) { return p.cliente + ' (' + (p.atrasada ? 'prometeu ' + p.data.slice(8, 10) + '/' + p.data.slice(5, 7) : 'hoje') + ')'; }).join(', ')) + (prom.length > 4 ? '…' : '') +
        ' · veja se o dinheiro caiu e dê baixa, ou cobre de novo', 'Ver boletos', 'fat:' + prom[0].comp));
    }
    var antes = vencidosAnteriores(emissoes, comp, 3);
    if (antes.length) itens.push(item('#B42318', plural(antes.length, 'boleto vencido de mês anterior', 'boletos vencidos de meses anteriores'),
      esc(antes.slice(0, 4).map(function (v) { return v.cliente + ' (' + MESES[+v.comp.slice(5) - 1] + ')'; }).join(', ')) + (antes.length > 4 ? '…' : '') + ' · ainda sem pagamento no Asaas',
      'Cobrar', 'fatv:' + antes[0].comp, !fat.vencidos));
    var assin = aguardandoAssinatura(ler('clientesInfo', {}), hoje);
    if (assin.length) itens.push(item('#B45309', plural(assin.length, 'contrato aguardando assinatura', 'contratos aguardando assinatura'),
      esc(assin.slice(0, 4).map(function (a) { return a.nome + (a.tipo === 'aditivo' ? ' (aditivo)' : '') + (a.dias != null ? ' · ' + (a.dias === 1 ? '1 dia' : a.dias + ' dias') : ''); }).join(', ')) + (assin.length > 4 ? '…' : '') +
      ' · o hub confere sozinho de tempos em tempos', 'Ver lista', 'assinlista'));
    var contas = []; try { contas = global.MGBFinanceiro && global.MGBFinanceiro.contasAvisar ? global.MGBFinanceiro.contasAvisar(hoje) : []; } catch (e) { contas = []; }
    var contasVenc = contas.filter(function (c) { return c.venc.dias <= 0; });
    if (contas.length) itens.push(item(contasVenc.length ? '#B42318' : '#B45309',
      contasVenc.length ? plural(contasVenc.length, 'conta vencida ou vencendo hoje', 'contas vencidas ou vencendo hoje') + (contas.length > contasVenc.length ? ' e ' + (contas.length - contasVenc.length) + ' na semana' : '')
        : plural(contas.length, 'conta vence esta semana', 'contas vencem esta semana'),
      esc(contas.slice(0, 4).map(function (c) { return c.titulo + ' (' + c.venc.txt + ')'; }).join(', ')) + (contas.length > 4 ? '…' : ''), 'Ver contas', 'ir:contas'));
    // Relatório da Tela Vertical do mês anterior ainda não marcado como enviado ao Jadson (desde nov/2026)
    var mA = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), kA = competencia(mA), rel = ler('relAjustes', {}) || {};
    var rpA = null; try { rpA = eder && global.MGBFluxos && global.MGBFluxos.repasseDoMes ? global.MGBFluxos.repasseDoMes(mA.getFullYear(), mA.getMonth()) : null; } catch (e) { rpA = null; }
    if (rpA && rpA.pendente) itens.push(item('#B42318', 'Tela Vertical fechou ' + MESES[mA.getMonth()] + ' no vermelho: quem cobriu?',
      'Faltaram ' + (ver ? esc(reais(-rpA.resultado)) : 'R$ ••••') + ' · o valor entra no investido de quem cobrir', 'Decidir', 'tvrel:' + kA, true));
    if (eder && kA >= '2026-11' && !((rel.tvEnviado || {})[kA])) itens.push(item('#4E38B2', 'Relatório da Tela Vertical de ' + MESES[mA.getMonth()] + ' para o Jadson',
      'Ainda não marcado como enviado · o painel mostra o repasse de 50% para cada sócio', 'Abrir painel', 'tvrel:' + kA));
    if (fat.semNota.length) itens.push(item('#B45309', plural(fat.semNota.length, 'nota de ' + nomeMes + ' sem número', 'notas de ' + nomeMes + ' sem número'),
      esc(fat.semNota.slice(0, 4).join(', ')) + (fat.semNota.length > 4 ? '…' : '') + ' · o boleto saiu, a nota não voltou da prefeitura', 'Conferir', 'fat'));
    if (funil.semCadastro) itens.push(item('#4E38B2', plural(funil.semCadastro, 'cliente fechado esperando cadastro', 'clientes fechados esperando cadastro'),
      eder ? 'A Karen recebe e-mail e cadastra pelo Novo cliente' : 'Entrar em contato, fechar o contrato e cadastrar pelo Novo cliente', eder ? '' : 'Cadastrar', 'novo'));
    if (retornos) itens.push(item('#4E38B2', plural(retornos, 'retorno do funil para hoje ou atrasado', 'retornos do funil para hoje ou atrasados'), 'Contatos com retorno marcado até hoje', 'Abrir funil', 'funil', !fat.vencidos));

    var h = '';
    h += '<header class="ini-topo"><div><span class="ini-data">' + esc(hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })) + '</span>' +
      '<h1>' + saudacao(hoje.getHours()) + (u.nome ? ', ' + esc(u.nome) : '') + '</h1></div>' +
      '<button type="button" class="ini-btn ini-btn2" data-ini="valores">' + (ver ? 'Ocultar valores' : 'Mostrar valores') + '</button></header>';

    // Acesso rápido (pedido do Eder, 23/11): um cartão por área que o perfil vê, como atalho.
    var atalhos = ATALHOS.filter(function (a) { var n = doc.getElementById(a.nav); return n && !n.hasAttribute('data-mgb-bloq'); });
    if (atalhos.length) {
      h += '<section aria-labelledby="ini-rapido"><h2 class="ini-h2" id="ini-rapido">Acesso rápido</h2><div class="ini-rapido">' +
        atalhos.map(function (a) {
          var n = doc.getElementById(a.nav), ico = n && n.querySelector('svg') ? n.querySelector('svg').outerHTML : '';
          return '<button type="button" data-ini="ir:' + a.id + '"><span class="ini-rapido-ico" aria-hidden="true">' + ico + '</span><b>' + a.nome + '</b><span>' + a.desc + '</span></button>';
        }).join('') + '</div></section>';
    }

    h += '<section class="ini-card" aria-labelledby="ini-pend"><div class="ini-cab"><h2 id="ini-pend">Precisa de você hoje</h2><span>' +
      (itens.length ? plural(itens.length, 'assunto', 'assuntos') : 'tudo em dia') + '</span></div>' +
      (itens.length ? itens.join('') : '<p class="ini-vazio">Nada pendente agora.</p>') +
      '<div id="ini-renov"></div><div id="ini-outros"></div></section>';

    // Faturamento + próximo faturamento
    var barra = fat.total
      ? '<div class="ini-barra" role="img" aria-label="' + fat.pagos + ' pagos, ' + fat.pendentes + ' pendentes, ' + fat.vencidos + ' vencidos, ' + fat.semStatus + ' sem status">' +
        '<span style="flex:' + fat.pagos + ';background:#15803D"></span><span style="flex:' + fat.pendentes + ';background:#E0A458"></span>' +
        '<span style="flex:' + fat.vencidos + ';background:#B42318"></span><span style="flex:' + fat.semStatus + ';background:#CFC7E6"></span></div>' +
        '<div class="ini-legenda"><span><i style="background:#15803D"></i>' + fat.pagos + ' pagos</span><span><i style="background:#E0A458"></i>' + fat.pendentes + ' pendentes</span>' +
        '<span><i style="background:#B42318"></i>' + fat.vencidos + ' vencidos</span><span><i style="background:#CFC7E6"></i>' + fat.semStatus + ' sem status</span></div>'
      : '<p class="ini-vazio">Nada emitido em ' + nomeMes + ' ainda.</p>';
    h += '<section class="ini-duas">' +
      '<div class="ini-card"><div class="ini-cab"><h2>Faturamento de ' + nomeMes + '</h2><span>' + plural(fat.total, 'cobrança', 'cobranças') + '</span></div>' +
      '<div class="ini-valor">' + (ver ? esc(reais(fat.valor)) : 'R$ ••••••') + '</div><span class="ini-sub">Total emitido' + (ver ? '' : ' · toque em Mostrar valores') + '</span>' + barra + '</div>' +
      '<div class="ini-card ini-escuro"><span class="ini-sub">Próximo faturamento</span><div class="ini-valor">' + prox.data.getDate() + ' de ' + MESES[prox.data.getMonth()] + '</div>' +
      '<span class="ini-sub">' + (prox.dias === 0 ? 'é hoje' : prox.dias === 1 ? 'amanhã' : 'daqui a ' + prox.dias + ' dias') + '</span>' +
      '<button type="button" class="ini-btn ini-btn-claro" data-ini="fatprox">Preparar faturamento</button></div></section>';

    // Funil (Eder)
    if (eder) {
      var est = [['Novo', funil.novo, '#8C7BD6'], ['Contatado', funil.contatado, '#6C55DB'], ['Negociando', funil.negociando, '#4E38B2'], ['Fechado', funil.fechado, '#15803D'], ['Perdido', funil.perdido, '#CFC7E6']];
      h += '<section class="ini-card"><div class="ini-cab"><h2>Funil de vendas</h2><button type="button" class="ini-link" data-ini="funil">Abrir o funil</button></div>' +
        '<div class="ini-funil">' + est.map(function (e) { return '<div><span>' + e[0] + '</span><b>' + e[1] + '</b><i style="background:' + e[2] + '"></i></div>'; }).join('') + '</div>' +
        (funil.semCadastro ? '<p class="ini-nota">' + (funil.semCadastro === funil.fechado ? (funil.fechado === 1 ? 'O cliente fechado ainda espera' : 'Os ' + funil.fechado + ' clientes fechados ainda esperam') : funil.semCadastro + ' dos ' + funil.fechado + ' clientes fechados ainda ' + (funil.semCadastro === 1 ? 'espera' : 'esperam')) + ' a Karen cadastrar. Ao marcar um lead como Fechado, a Karen e você recebem e-mail com os dados de contato.</p>' : '') +
        '</section>';

      var a = hoje.getFullYear(), m = hoje.getMonth(), rec = 0, desp = 0, pes = null;
      try { rec = global.finGetRec(a, m) || 0; desp = global.finGetDesp(a, m) || 0; } catch (e) {}
      try { pes = (global.pessoalRecMes(a, m) || 0) - (global.pessoalDespMes(a, m) || 0); } catch (e) { pes = null; }
      var v = function (x) { return ver ? esc(reais(x)) : 'R$ ••••'; };
      h += '<section><h2 class="ini-h2">' + nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1) + ' até agora</h2><div class="ini-numeros">' +
        '<div class="ini-card"><span class="ini-sub">Receita</span><b>' + v(rec) + '</b></div>' +
        '<div class="ini-card"><span class="ini-sub">Despesa</span><b>' + v(desp) + '</b></div>' +
        '<div class="ini-card"><span class="ini-sub">Lucro</span><b>' + v(rec - desp) + '</b></div>' +
        (pes === null ? '' : '<div class="ini-card ini-escuro"><span class="ini-sub">Saldo pessoal (só você)</span><b>' + v(pes) + '</b></div>') +
        '</div></section>';
    }

    // Lançar
    h += '<section><h2 class="ini-h2">Lançar</h2><div class="ini-atalhos">' +
      (eder ? '<button type="button" class="ini-atalho ini-atalho1" data-ini="lead"><b>Novo lead</b><span>entra no funil como Novo</span></button>'
            : '<button type="button" class="ini-atalho ini-atalho1" data-ini="novo"><b>Novo cliente</b><span>fechado no CRM</span></button>') +
      '<button type="button" class="ini-atalho" data-ini="despesa"><b>Nova despesa</b><span>viagem, instalação, sistema</span></button>' +
      '<button type="button" class="ini-atalho" data-ini="receita"><b>Nova receita</b><span>locução e serviço avulso</span></button></div></section>';

    // Carteira
    var mods = ler('MODULES', []) || [];
    if (mods.length) {
      h += '<section><h2 class="ini-h2">Carteira</h2><div class="ini-card ini-carteira">' +
        mods.filter(function (md) { return (md.items || []).length; }).map(function (md) {
          return '<button type="button" data-ini="mod:' + esc(md.id) + '"><b>' + md.items.length + '</b><span>' + esc(md.label) + '</span></button>';
        }).join('') + '</div></section>';
    }

    raiz.innerHTML = h;
    trazerAvisos();
  }

  // Move os avisos que já existiam (e o da renovação, do acesso.js) para dentro do Início novo.
  function trazerAvisos() {
    var outros = doc.getElementById('ini-outros');
    if (!outros) return;
    AVISOS_ANTIGOS.forEach(function (id) {
      var el = doc.getElementById(id);
      if (el && el.parentNode !== outros) outros.appendChild(el);
    });
    var renov = doc.getElementById('mgb-renov');
    var slot = doc.getElementById('ini-renov');
    if (renov && slot && renov.parentNode !== slot) slot.appendChild(renov);
  }

  var ATALHOS = [
    { id: 'fat', nav: 'nav-contabilidade', nome: 'Faturamento', desc: 'dia 5, notas e boletos', ir: function () { global.fatAbrirFaturamento(); } },
    { id: 'cobranca', nav: 'nav-relatorios', nome: 'Repasses e relatórios', desc: 'repasses, prestação de contas', ir: function () { global.goPage('relatorios'); } },
    { id: 'pix', nav: 'nav-contabilidade', nome: 'Caiu um Pix', desc: 'de quem é e dar baixa', ir: function () { if (global.MGBFluxos && global.MGBFluxos.abrirBaixaPix) global.MGBFluxos.abrirBaixaPix(); } },
    { id: 'atrasados', nav: 'nav-contabilidade', nome: 'Cobrar atrasados', desc: 'boletos vencidos', ir: function () { if (global.MGBFaturamento && global.MGBFaturamento.abrirFiltro) global.MGBFaturamento.abrirFiltro('vencido'); else global.fatAbrirFaturamento(); } },
    { id: 'fin', nav: 'nav-custos', nome: 'Financeiro', desc: 'resumo do mês e módulos', ir: function () { global.goPage('overview'); try { global.switchOvTab('visao'); } catch (e) {} } },
    { id: 'contas', nav: 'nav-custos', nome: 'Contas do mês', desc: 'o que pagar e o que já foi pago', ir: function () { global.goPage('overview'); global.switchOvTab('desp'); } },
    { id: 'caixa', nav: 'nav-pessoal', nome: 'Plano de Caixa', desc: 'caixa e pessoal', ir: function () { global.goPage('planocaixa'); } },
    { id: 'funil', nav: 'nav-leads', nome: 'Funil de vendas', desc: 'leads e retornos', ir: function () { global.goPage('leads'); } },
    { id: 'clientes', nav: 'nav-clientes', nome: 'Clientes', desc: 'ficha de cada cliente e contratos', ir: function () { global.goPage('clientes'); } },
    { id: 'tv', nav: 'nav-telavertical', nome: 'Tela Vertical', desc: 'condomínios, anunciantes, sócios', ir: function () { global.goOperacional('telavertical'); } },
    { id: 'moinho', nav: 'nav-radioops', nome: 'Rádio Moinho', desc: 'campanhas e resumo', ir: function () { global.goPage('radioops'); } },
    { id: 'ferr', nav: 'nav-ferramentas', nome: 'Ferramentas', desc: 'PDF, imagem, QR, etiquetas', ir: function () { global.goPage('ferramentas'); } },
  ];

  function clique(ev) {
    var b = ev.target.closest('[data-ini]');
    if (!b) return;
    var acao = b.getAttribute('data-ini');
    var hoje = new Date();
    try {
      if (acao === 'valores') global.togglePrivate();
      else if (acao === 'fat') global.fatAbrirFaturamento(competencia(hoje));
      else if (acao === 'fatprox') global.fatAbrirFaturamento(proximoFaturamento(hoje).comp);
      else if (acao.indexOf('tvrel:') === 0) { try { global.eval("tvpMes='" + acao.slice(6).replace(/[^0-9-]/g, '') + "'"); } catch (e) {} global.goOperacional('telavertical', 'tvpainel'); }
      else if (acao === 'atrasados') { if (global.MGBFaturamento && global.MGBFaturamento.abrirFiltro) global.MGBFaturamento.abrirFiltro('vencido', competencia(hoje)); else global.fatAbrirFaturamento(competencia(hoje)); }
      else if (acao.indexOf('fatv:') === 0) { if (global.MGBFaturamento && global.MGBFaturamento.abrirFiltro) global.MGBFaturamento.abrirFiltro('vencido', acao.slice(5)); else global.fatAbrirFaturamento(acao.slice(5)); }
      else if (acao.indexOf('fat:') === 0) global.fatAbrirFaturamento(acao.slice(4));
      else if (acao === 'novo') {                       // um só esperando cadastro: abre direto o cadastro dele
        var pend = global.MGBNovo.pendentesCadastro ? global.MGBNovo.pendentesCadastro() : [];
        if (pend.length === 1 && global.MGBNovo.abrirLead) global.MGBNovo.abrirLead(pend[0].id); else global.MGBNovo.abrir();
      }
      else if (acao === 'assinlista') { if (global.MGBFluxos && global.MGBFluxos.abrirListaAssinaturas) global.MGBFluxos.abrirListaAssinaturas(); }
      else if (acao === 'assin') {
        b.disabled = true; b.textContent = 'Conferindo…';
        var fim = function (n) { b.disabled = false; b.textContent = n ? (n === 1 ? '1 assinado' : n + ' assinados') : 'Nenhum novo'; setTimeout(function () { try { montar(); } catch (e) {} }, n ? 400 : 2500); };
        Promise.resolve(global.mgbConferirAssinaturas ? global.mgbConferirAssinaturas() : 0).then(fim, function () { fim(0); });
      }
      else if (acao === 'funil') global.goPage('leads');
      else if (acao === 'lead') { global.goPage('leads'); setTimeout(function () { try { global.openLeadModal(); } catch (e) {} }, 150); }
      else if (acao === 'despesa') global.MGBLancar.despesa();
      else if (acao === 'receita') global.MGBLancar.receita();
      else if (acao.indexOf('mod:') === 0) global.drillMod(acao.slice(4));
      else if (acao.indexOf('ir:') === 0) { var at = ATALHOS.filter(function (x) { return x.id === acao.slice(3); })[0]; if (at) at.ir(); }
    } catch (e) { console.error('inicio:', acao, e); }
  }

  function estilos() {
    if (doc.getElementById('inicio-css')) return;
    var s = doc.createElement('style');
    s.id = 'inicio-css';
    s.textContent =
      'body.inicio-novo #page-home .home-page{position:absolute!important;left:-99999px!important;top:0;width:1px;height:1px;overflow:hidden}' +
      '#inicio{box-sizing:border-box;max-width:960px;margin:0 auto;padding:36px 28px 64px;display:flex;flex-direction:column;gap:26px;font-family:"DM Sans",system-ui,sans-serif;color:#241A38}' +
      '#inicio h1{margin:2px 0 0;font-size:32px;font-weight:700;letter-spacing:-.01em}#inicio h2{margin:0;font-size:20px;font-weight:700}' +
      '#inicio .ini-h2{margin:0 0 12px;font-size:18px}' +
      '.ini-topo{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between}.ini-data{font-size:14px;color:#5D5868}' +
      '.ini-card{background:#fff;border:1px solid #E4DFF0;border-radius:18px;padding:22px 24px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box}' +
      '.ini-escuro{background:#2A1760;border-color:#2A1760;color:#fff}.ini-escuro .ini-sub{color:#D9D2F2}' +
      '.ini-cab{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:4px}.ini-cab>span{font-size:14px;color:#5D5868}' +
      '.ini-item{display:flex;align-items:center;gap:16px;padding:14px 0;border-top:1px solid #EFEBF7}' +
      '.ini-ponto{width:10px;height:10px;border-radius:50%;flex:none}.ini-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}' +
      '.ini-txt b{font-size:16px}.ini-txt span{font-size:14px;color:#5D5868}' +
      '.ini-btn{min-height:44px;padding:0 16px;border:0;border-radius:10px;background:#4E38B2;color:#fff;font:700 14px "DM Sans",system-ui,sans-serif;cursor:pointer;flex:none}' +
      '.ini-btn:hover{background:#2A1760}.ini-btn2{background:#fff;color:#2A1760;border:1px solid #CFC7E6}.ini-btn2:hover{background:#ECE8FA}' +
      '.ini-btn-claro{align-self:flex-start;background:#fff;color:#2A1760;margin-top:6px}.ini-btn-claro:hover{background:#ECE8FA}' +
      '.ini-btn:focus-visible,.ini-atalho:focus-visible,.ini-carteira button:focus-visible,.ini-link:focus-visible{outline:3px solid #6C55DB;outline-offset:2px}' +
      '.ini-link{background:none;border:0;color:#4E38B2;font:600 14px "DM Sans",system-ui,sans-serif;cursor:pointer;text-decoration:underline}' +
      '.ini-vazio{margin:0;padding:12px 0 2px;font-size:15px;color:#5D5868}.ini-nota{margin:4px 0 0;font-size:14px;color:#5D5868;background:#F6F4FA;border-radius:10px;padding:12px 14px}' +
      '.ini-duas{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}' +
      '.ini-valor{font-size:30px;font-weight:700;letter-spacing:.02em}.ini-sub{font-size:13px;color:#5D5868}' +
      '.ini-barra{display:flex;height:12px;border-radius:999px;overflow:hidden;gap:2px;margin-top:6px}' +
      '.ini-legenda{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 16px;font-size:14px}.ini-legenda span{display:flex;align-items:center;gap:8px}.ini-legenda i{width:10px;height:10px;border-radius:3px}' +
      '.ini-funil{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.ini-funil div{display:flex;flex-direction:column;gap:6px}' +
      '.ini-funil span{font-size:13px;font-weight:600;color:#5D5868}.ini-funil b{font-size:28px}.ini-funil i{height:8px;border-radius:999px}' +
      '.ini-numeros{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.ini-numeros b{font-size:24px}' +
      '.ini-rapido{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}' +
      '.ini-rapido button{all:unset;box-sizing:border-box;cursor:pointer;min-height:112px;padding:16px;border:1px solid #E4DFF0;border-radius:16px;background:#fff;display:flex;flex-direction:column;gap:4px;color:#241A38;font-family:"DM Sans",system-ui,sans-serif}' +
      '.ini-rapido button:hover{border-color:#CFC7E6;background:#FBFAFE}.ini-rapido button:focus-visible{outline:3px solid #6C55DB;outline-offset:2px}' +
      '.ini-rapido b{font-size:16px}.ini-rapido button>span:last-child{font-size:13.5px;color:#5D5868}' +
      '.ini-rapido-ico{width:40px;height:40px;border-radius:12px;background:#ECE8FA;color:#4E38B2;display:flex;align-items:center;justify-content:center;margin-bottom:6px}.ini-rapido-ico svg{width:22px;height:22px;opacity:1}' +
      '.ini-atalhos{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}' +
      '.ini-atalho{min-height:64px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;padding:10px 18px;border-radius:14px;border:1px solid #E4DFF0;background:#fff;color:#241A38;font-family:"DM Sans",system-ui,sans-serif;cursor:pointer;text-align:left}' +
      '.ini-atalho b{font-size:16px}.ini-atalho span{font-size:13px;color:#5D5868}.ini-atalho:hover{border-color:#4E38B2}' +
      '.ini-atalho1{background:#4E38B2;border-color:#4E38B2;color:#fff}.ini-atalho1 span{color:#D9D2F2}.ini-atalho1:hover{background:#2A1760}' +
      '.ini-carteira{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));padding:0;gap:0}' +
      '.ini-carteira button{all:unset;cursor:pointer;padding:18px 20px;display:flex;flex-direction:column;gap:4px;border-right:1px solid #EFEBF7}' +
      '.ini-carteira b{font-size:26px}.ini-carteira span{font-size:14px;color:#5D5868}.ini-carteira button:hover{background:#F6F4FA}' +
      '#ini-outros>div,#ini-renov>section{margin:10px 0 0!important;background:#fff!important;border:1px solid #E4DFF0!important;border-left:0!important;border-radius:12px!important;color:#241A38!important;box-shadow:none!important;font-family:"DM Sans",system-ui,sans-serif!important}' +
      // 27/11 (usabilidade): no celular, "Precisa de você hoje" e o faturamento vêm antes dos atalhos (antes ficavam abaixo da primeira tela)
      '@media (max-width:640px){#inicio{display:flex;flex-direction:column}#inicio>*{order:4}#inicio>.ini-topo{order:0}#inicio>[aria-labelledby="ini-pend"]{order:1}#inicio>.ini-duas{order:2}#inicio>[aria-labelledby="ini-rapido"]{order:3}}' +
      '@media (max-width:640px){#inicio{padding:22px 16px 48px}#inicio h1{font-size:27px}.ini-item{flex-wrap:wrap}.ini-item .ini-btn{width:100%}.ini-funil{grid-template-columns:repeat(3,minmax(0,1fr))}}';
    doc.head.appendChild(s);
  }

  function ligar() {
    estilos();
    var original = global.buildHome;
    if (typeof original === 'function' && !original.__inicio) {
      var nova = function () {
        var r = original.apply(this, arguments);
        try { montar(); } catch (e) { console.error('inicio:', e); }
        return r;
      };
      nova.__inicio = true;
      global.buildHome = nova;
    }
    // Perfil conhecido ou trocado (login confirmado, "Ver como", "Meu dia"/"Visão geral"): monta de novo.
    doc.addEventListener('mgb:perfil', function () { try { montar(); } catch (e) { console.error('inicio:', e); } });
    // O acesso.js recria o aviso de renovação depois de cada navegação: traz de volta para o Início.
    var pg = doc.getElementById('page-home');
    if (pg && global.MutationObserver) new global.MutationObserver(function () { trazerAvisos(); }).observe(pg, { childList: true, subtree: true });
    try { montar(); } catch (e) { console.error('inicio:', e); }
  }

  global.MGBInicio = Object.assign({ montar: montar }, regras);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
