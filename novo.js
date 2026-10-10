/* Hub MGB — botão "Novo": ponto de partida da Karen para lançar um cliente.
 *
 * Decisão de 10/10/2026 (desenho aprovado no canvas "Áreas de Trabalho do Hub MGB"):
 *  - no topo, os leads que o Eder fechou no CRM e que ainda não foram cadastrados;
 *  - abaixo, os produtos. Esta primeira entrega faz o "Novo condomínio" de ponta a ponta;
 *    os demais levam ao fluxo que já existe no hub ou aparecem como "em breve".
 *
 * Novo condomínio (parceria): condomínio paga R$ 0; custo de R$ 70 por torre ao mês.
 * Ao criar: tela no módulo Elevadores + despesa recorrente + lead marcado como cadastrado
 * + contrato de parceria enviado pelo Assinafy + aviso ao Cleiton pelo WhatsApp.
 *
 * Reaproveita o que o hub já tem (index.html): mgbCriarUnidadeModulo, applyToFin, db,
 * leads, scheduleSave, parcGerar. Não altera nenhum cálculo existente.
 */
(function (global) {
  'use strict';

  var CUSTO_POR_TORRE = 70;
  var ASSINAFY_API_URL = 'https://script.google.com/macros/s/AKfycbwG-31A0O10zru2-klj4EbtiD5rg22R-kNG2TLE4Gkd_ZBStE-QNqsbkq-vwSf6vgf3/exec';

  // ── Regras puras (testadas em bot/test/novo.test.js) ───────────────────
  function custoCondominio(torres) {
    var t = parseInt(torres, 10);
    return t > 0 ? t * CUSTO_POR_TORRE : 0;
  }

  function leadsPendentes(lista) {
    return (lista || []).filter(function (l) { return l && l.estagio === 'fechado' && !l.itemCriado; });
  }

  function normalizar(s) {
    return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  }

  function jaExiste(nome, existentes) {
    var n = normalizar(nome);
    return (existentes || []).some(function (x) { return normalizar(x) === n; });
  }

  function validarCondominio(d, existentes) {
    var erros = [];
    if (!String(d.nome || '').trim()) erros.push('Informe o nome do condomínio.');
    else if (jaExiste(d.nome, existentes)) erros.push('Já existe um condomínio com esse nome no módulo Elevadores.');
    if (!(parseInt(d.torres, 10) > 0)) erros.push('Informe o número de torres.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio || '')) erros.push('Informe a data de início.');
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) erros.push('O e-mail do síndico parece incompleto.');
    return erros;
  }

  // Lançamento no mesmo formato do addItem do hub (recorrente, mês a mês).
  function despesaLicenca(torres, inicio, meses) {
    var t = parseInt(torres, 10) || 0;
    return {
      t: 'Recorrente', tipo: 'Licença',
      d: 'Licença das telas · ' + t + (t === 1 ? ' torre' : ' torres') + ' × R$ ' + CUSTO_POR_TORRE,
      f: '4YouSee', q: t, u: CUSTO_POR_TORRE, cc: '', venc: '', pago: false, dataPago: '',
      mesesRec: parseInt(meses, 10) || 36, dataInicio: String(inicio || '').slice(0, 7)
    };
  }

  var api = {
    CUSTO_POR_TORRE: CUSTO_POR_TORRE,
    custoCondominio: custoCondominio,
    leadsPendentes: leadsPendentes,
    jaExiste: jaExiste,
    validarCondominio: validarCondominio,
    despesaLicenca: despesaLicenca
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (!global.document) return;

  // ── Tela ───────────────────────────────────────────────────────────────
  var doc = global.document;
  var leadAtual = null;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function brl(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function listaLeads() { try { return leads; } catch (e) { return []; } }          // eslint-disable-line no-undef
  function modulos() { try { return MODULES; } catch (e) { return []; } }            // eslint-disable-line no-undef
  function modulo(id) { return modulos().filter(function (m) { return m.id === id; })[0]; }
  function condominiosExistentes() { var m = modulo('elev'); return m ? m.items : []; }

  function injetarEstilos() {
    if (doc.getElementById('mgb-novo-css')) return;
    var st = doc.createElement('style');
    st.id = 'mgb-novo-css';
    st.textContent =
      'body.mgb-sem-novo #mgb-novo-btn{display:none!important}' +
      '#mgb-novo-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;max-width:640px;margin:0 auto 16px;min-height:52px;border:0;border-radius:14px;background:#4E38B2;color:#fff;font:700 16px "DM Sans",system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(78,56,178,.25)}' +
      '#mgb-novo-btn:focus-visible{outline:3px solid #b9a9f5;outline-offset:2px}' +
      '#mgb-novo{position:fixed;inset:0;z-index:9600;background:rgba(36,26,56,.45);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 16px;font-family:"DM Sans",system-ui,sans-serif;color:#241a38}' +
      '#mgb-novo .box{width:100%;max-width:1040px;background:#f6f4fb;border-radius:18px;box-shadow:0 20px 60px rgba(36,26,56,.3);overflow:hidden}' +
      '#mgb-novo .top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 22px;background:#fff;border-bottom:1px solid #e4def2}' +
      '#mgb-novo .top h2{margin:0;font-size:20px}#mgb-novo .x{border:0;background:#efeaf8;border-radius:9px;height:38px;padding:0 14px;font-weight:600;font-size:14px;font-family:inherit;cursor:pointer;color:#3a2a5e}' +
      '#mgb-novo .corpo{padding:22px;display:flex;flex-direction:column;gap:18px}' +
      '#mgb-novo .card{background:#fff;border:1px solid #e4def2;border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;gap:12px;min-width:0}' +
      '#mgb-novo .card.crm{background:#f1faf7;border-color:#a7dccf}' +
      '#mgb-novo h3{margin:0;font-size:16px}#mgb-novo p.sub{margin:0;font-size:13px;color:#6b6380}' +
      '#mgb-novo .lin{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid #ece7f5;font-size:14px}' +
      '#mgb-novo .lin .acoes{display:flex;gap:8px;flex-wrap:wrap}' +
      '#mgb-novo .grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}' +
      '#mgb-novo .prod{display:flex;flex-direction:column;gap:6px;text-align:left;padding:14px;border:1px solid #e4def2;border-radius:12px;background:#fff;cursor:pointer;font:inherit;color:inherit;min-height:92px}' +
      '#mgb-novo .prod:hover{border-color:#4E38B2}#mgb-novo .prod b{font-size:15px}#mgb-novo .prod span{font-size:13px;color:#6b6380}' +
      '#mgb-novo .prod[disabled]{cursor:not-allowed;background:#f6f4fb;opacity:.75}' +
      '#mgb-novo .tag{font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;background:#efeaf8;color:#4E38B2;align-self:flex-start}' +
      '#mgb-novo .b{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-radius:10px;border:1px solid #d9d1ea;background:#fff;font-weight:600;font-size:14px;font-family:inherit;color:#241a38;cursor:pointer}' +
      '#mgb-novo .b.p{background:#4E38B2;border-color:#4E38B2;color:#fff}#mgb-novo .b[disabled]{opacity:.6;cursor:wait}' +
      '#mgb-novo .duas{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}#mgb-novo .duas>main{flex:999 1 520px;min-width:0;display:flex;flex-direction:column;gap:14px}#mgb-novo .duas>aside{flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:14px}' +
      '#mgb-novo .campos{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}' +
      '#mgb-novo label.f{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:#3a3446}' +
      '#mgb-novo label.f input,#mgb-novo label.f select{height:42px;border:1px solid #cfc6e0;border-radius:9px;padding:0 11px;font-size:14px;font-family:inherit;background:#fff;color:#241a38}' +
      '#mgb-novo label.f input.crm{background:#f1faf7;border-color:#a7dccf}' +
      '#mgb-novo .sec{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b6380}' +
      '#mgb-novo .conta{display:flex;justify-content:space-between;font-size:14px}' +
      '#mgb-novo .passo{display:flex;gap:10px;align-items:flex-start;font-size:14px}#mgb-novo .passo i{flex:none;width:22px;height:22px;border-radius:50%;background:#efeaf8;color:#4E38B2;font-style:normal;font-size:12px;font-weight:700;display:grid;place-items:center}' +
      '#mgb-novo .passo.ok i{background:#dcefe4;color:#14583a}#mgb-novo .passo.erro i{background:#fde3dc;color:#a33a1a}#mgb-novo .passo.vai i{background:#4E38B2;color:#fff}' +
      '#mgb-novo .erros{color:#a33a1a;font-size:13px;display:flex;flex-direction:column;gap:4px}';
    doc.head.appendChild(st);
  }

  function inserirBotaoHome() {
    if (doc.getElementById('mgb-novo-btn')) return;
    var hubs = doc.querySelector('.home-hubs');
    if (!hubs) return;
    var b = doc.createElement('button');
    b.type = 'button';
    b.id = 'mgb-novo-btn';
    b.innerHTML = '<span aria-hidden="true" style="font-size:20px;line-height:1">＋</span> Novo cliente';
    b.addEventListener('click', function () { abrir(); });
    hubs.parentNode.insertBefore(b, hubs);
  }

  function fechar() { var el = doc.getElementById('mgb-novo'); if (el) el.remove(); doc.removeEventListener('keydown', escFecha); }
  function escFecha(e) { if (e.key === 'Escape') fechar(); }

  function moldura(titulo, corpo, voltar) {
    var el = doc.getElementById('mgb-novo');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'mgb-novo';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      doc.body.appendChild(el);
      el.addEventListener('click', function (e) { if (e.target === el) fechar(); });
      doc.addEventListener('keydown', escFecha);
    }
    el.setAttribute('aria-label', titulo);
    el.innerHTML = '<div class="box"><div class="top"><h2>' + esc(titulo) + '</h2><div style="display:flex;gap:8px">' +
      (voltar ? '<button type="button" class="x" data-novo="inicio">Voltar</button>' : '') +
      '<button type="button" class="x" data-novo="fechar">Fechar</button></div></div><div class="corpo">' + corpo + '</div></div>';
    el.querySelectorAll('[data-novo]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-novo');
        if (a === 'fechar') fechar();
        if (a === 'inicio') abrir();
      });
    });
    el.scrollTop = 0;
    return el;
  }

  // ── Início: CRM + produtos ─────────────────────────────────────────────
  function abrir() {
    injetarEstilos();
    leadAtual = null;
    var pend = leadsPendentes(listaLeads());
    var crm = pend.length ? pend.map(function (l) {
      var m = modulo(l.produto);
      var rot = m ? m.label.split('—')[0].trim() : 'Sem produto';
      var acoes = '';
      if (l.produto === 'elev') {
        acoes = '<button type="button" class="b p" data-lead="' + l.id + '" data-acao="condominio">Cadastrar condomínio</button>' +
          '<button type="button" class="b" data-acao="anunciante">É anunciante</button>';
      } else if (l.produto === 'vaapty') {
        acoes = '<button type="button" class="b p" data-acao="vaapty">Abrir contrato Vaapty</button>';
      } else if (m) {
        acoes = '<button type="button" class="b" data-acao="modulo" data-mod="' + esc(l.produto) + '">Abrir ' + esc(rot) + '</button>';
      }
      return '<div class="lin"><div><div style="font-weight:700">' + esc(l.nome) + '</div><div style="font-size:13px;color:#6b6380">' +
        esc(rot) + (l.valor ? ' · ' + brl(l.valor) + '/mês' : '') + (l.cnpj ? ' · CNPJ ' + esc(l.cnpj) : '') + '</div></div><div class="acoes">' + acoes + '</div></div>';
    }).join('') : '<p class="sub">Nenhum cliente fechado esperando cadastro. Quando o Eder marcar um lead como Fechado no CRM, ele aparece aqui.</p>';

    var produtos = [
      ['condominio', 'Condomínio', 'Tela no elevador. Parceria: condomínio paga R$ 0, custo de R$ 70 por torre ao mês.', ''],
      ['anunciante', 'Anunciante · telas do elevador', 'Abre o contrato Tela Vertical, que já lança o anunciante nas telas escolhidas.', ''],
      ['vaapty', 'Unidade Vaapty', 'Abre o contrato Vaapty, que já cria a unidade no módulo.', ''],
      ['', 'Anunciante · Rádio Mercadão', 'Loja no Mercadão Prochet. Próxima entrega.', 'em breve'],
      ['', 'Rádio interna', 'Uma unidade por vez, com contrato padrão. Próxima entrega.', 'em breve'],
      ['modulo:tv', 'TV interna', 'Abre o módulo TV Interna.', ''],
      ['modulo:taroba', 'Comissão Tarobá', 'Abre o módulo Tarobá para lançar o valor do mês.', ''],
      ['', 'Portal Londrina · Cascavel', 'Ainda não existe no hub.', 'em breve']
    ].map(function (p) {
      var dis = p[3] ? ' disabled' : '';
      var acao = p[0].indexOf('modulo:') === 0 ? ' data-acao="modulo" data-mod="' + p[0].split(':')[1] + '"' : (p[0] ? ' data-acao="' + p[0] + '"' : '');
      return '<button type="button" class="prod"' + acao + dis + '>' + (p[3] ? '<span class="tag">' + p[3] + '</span>' : '') +
        '<b>' + p[1] + '</b><span>' + p[2] + '</span></button>';
    }).join('');

    var el = moldura('Novo cliente',
      '<section class="card crm"><h3>Fechados no CRM, esperando cadastro' + (pend.length ? ' · ' + pend.length : '') + '</h3>' +
      '<p class="sub">Os dados do lead vêm preenchidos. Você só confere e completa.</p>' + crm + '</section>' +
      '<section class="card"><h3>Ou escolha o que vai lançar</h3><div class="grade">' + produtos + '</div></section>', false);

    el.querySelectorAll('[data-acao]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-acao');
        if (a === 'condominio') {
          var id = b.getAttribute('data-lead');
          var lead = id ? listaLeads().filter(function (l) { return String(l.id) === id; })[0] : null;
          formCondominio(lead);
        }
        if (a === 'anunciante') irPara('contratos', 'elevador');
        if (a === 'vaapty') irPara('contratos', 'vaapty');
        if (a === 'modulo') { fechar(); try { global.drillMod(b.getAttribute('data-mod')); } catch (e) {} }
      });
    });
  }

  function irPara(grupo, aba) {
    fechar();
    try {
      global.goOperacional(grupo);
      var t = doc.querySelector('#page-operacional .hub-tab[data-tab="' + aba + '"]');
      if (t && typeof global.showOpPanel === 'function') global.showOpPanel(aba, t);
    } catch (e) {}
  }

  // ── Novo condomínio ────────────────────────────────────────────────────
  function formCondominio(lead) {
    leadAtual = lead || null;
    var L = lead || {};
    var hoje = new Date();
    var proxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    var ini = proxMes.toISOString().slice(0, 10);
    function campo(id, rotulo, valor, tipo, extra) {
      var crm = valor && lead ? ' class="crm"' : '';
      return '<label class="f" for="nv-' + id + '">' + rotulo + '<input id="nv-' + id + '"' + crm + ' type="' + (tipo || 'text') + '" value="' + esc(valor || '') + '"' + (extra || '') + '></label>';
    }
    var el = moldura('Novo condomínio',
      '<div class="duas"><main>' +
      '<p class="sub">' + (lead ? 'Campos em verde vieram do CRM. Confira e complete o resto.' : 'Preencha os dados do condomínio. Campos com * são obrigatórios.') + '</p>' +
      '<section class="card"><div class="sec">1 · Condomínio</div><div class="campos">' +
      campo('nome', 'Nome do condomínio *', L.nome) + campo('cnpj', 'CNPJ', L.cnpj) +
      campo('end', 'Endereço completo', '') + campo('bairro', 'Bairro ou região', '') + '</div></section>' +
      '<section class="card"><div class="sec">2 · Síndico</div><div class="campos">' +
      campo('sindico', 'Nome', L.responsavel) + campo('cpf', 'CPF', '') +
      campo('email', 'E-mail (recebe o contrato no Assinafy)', '', 'email') + campo('wpp', 'WhatsApp', L.tel) + '</div></section>' +
      '<section class="card"><div class="sec">3 · Estrutura e contrato</div><div class="campos">' +
      campo('torres', 'Número de torres *', '1', 'number', ' min="1"') + campo('telas', 'Número de telas', '1', 'number', ' min="1"') +
      campo('apts', 'Número de apartamentos', '', 'number', ' min="0"') + campo('inicio', 'Início *', ini, 'date') +
      '<label class="f" for="nv-vig">Vigência<select id="nv-vig"><option value="36">36 meses (renovação automática)</option><option value="24">24 meses (renovação automática)</option><option value="12">12 meses (renovação automática)</option></select></label>' +
      '</div></section></main>' +
      '<aside><section class="card"><div class="sec">Conta do mês</div>' +
      '<div class="conta"><span>Condomínio paga</span><b>R$ 0</b></div>' +
      '<div class="conta"><span id="nv-custo-rot">Custo · 1 torre × R$ 70</span><b id="nv-custo" style="color:#a33a1a">R$ 70/mês</b></div>' +
      '<p class="sub">A receita vem dos anunciantes que você colocar nestas telas.</p></section>' +
      '<section class="card"><div class="sec">Ao criar, o hub faz</div>' +
      '<div class="passo" id="nv-p1"><i>1</i><span>Cria a tela do condomínio no módulo Elevadores.</span></div>' +
      '<div class="passo" id="nv-p2"><i>2</i><span>Lança a despesa recorrente da licença das telas.</span></div>' +
      '<div class="passo" id="nv-p3"><i>3</i><span>' + (lead ? 'Marca o lead do CRM como cadastrado.' : 'Sem lead do CRM: nada a marcar.') + '</span></div>' +
      '<div class="passo" id="nv-p4"><i>4</i><span>Gera o contrato de parceria e envia ao síndico pelo Assinafy.</span></div>' +
      '<div class="passo" id="nv-p5"><i>5</i><span>Prepara o aviso ao Cleiton para instalar e programar.</span></div>' +
      '<div class="erros" id="nv-erros" role="alert"></div>' +
      '<button type="button" class="b p" id="nv-criar">Criar condomínio e enviar contrato</button>' +
      '</section></aside></div>', true);

    var torres = el.querySelector('#nv-torres');
    function atualizarConta() {
      var t = parseInt(torres.value, 10) || 0;
      el.querySelector('#nv-custo-rot').textContent = 'Custo · ' + t + (t === 1 ? ' torre' : ' torres') + ' × R$ ' + CUSTO_POR_TORRE;
      el.querySelector('#nv-custo').textContent = brl(custoCondominio(t)) + '/mês';
    }
    torres.addEventListener('input', atualizarConta);
    el.querySelector('#nv-criar').addEventListener('click', criarCondominio);
    el.querySelector('#nv-nome').focus();
  }

  function val(id) { var e = doc.getElementById('nv-' + id); return e ? String(e.value).trim() : ''; }
  function marcar(n, estado, texto) {
    var p = doc.getElementById('nv-p' + n);
    if (!p) return;
    p.className = 'passo ' + estado;
    p.querySelector('i').textContent = estado === 'ok' ? '✓' : estado === 'erro' ? '!' : n;
    if (texto) p.querySelector('span').innerHTML = texto;
  }

  function criarCondominio() {
    var d = {
      nome: val('nome'), cnpj: val('cnpj'), end: val('end'), bairro: val('bairro'), sindico: val('sindico'),
      cpf: val('cpf'), email: val('email'), wpp: val('wpp'), torres: val('torres'), telas: val('telas'),
      apts: val('apts'), inicio: val('inicio'), vig: (doc.getElementById('nv-vig') || {}).value || '36'
    };
    var errosEl = doc.getElementById('nv-erros');
    var erros = validarCondominio(d, condominiosExistentes());
    if (erros.length) { errosEl.innerHTML = erros.map(esc).join('<br>'); return; }
    errosEl.textContent = '';
    var btn = doc.getElementById('nv-criar');
    btn.disabled = true; btn.textContent = 'Criando…';

    // 1. tela no módulo Elevadores
    try {
      var cliente = { cnpj: d.cnpj, fantasia: d.nome, responsavel: d.sindico, cargo: 'Síndico(a)', tel: d.wpp, email: d.email,
        endereco: d.end, bairro: d.bairro, torres: parseInt(d.torres, 10), telas: parseInt(d.telas, 10) || '', apartamentos: parseInt(d.apts, 10) || '' };
      var criado = global.mgbCriarUnidadeModulo('elev', d.nome, { valor: 0, inicio: d.inicio.slice(0, 7), meses: parseInt(d.vig, 10), cliente: cliente });
      if (!criado) throw new Error('o módulo Elevadores não foi encontrado');
      marcar(1, 'ok', 'Tela <b>' + esc(d.nome) + '</b> criada no módulo Elevadores.');
    } catch (e) {
      marcar(1, 'erro', 'Não consegui criar a tela: ' + esc(e.message) + '. Nada foi lançado.');
      btn.disabled = false; btn.textContent = 'Tentar de novo';
      return;
    }

    // 2. despesa recorrente da licença
    try {
      var desp = despesaLicenca(d.torres, d.inicio, d.vig);
      applyToFin(desp, +1);                                   // eslint-disable-line no-undef
      if (!db.elev[d.nome]) db.elev[d.nome] = [];             // eslint-disable-line no-undef
      db.elev[d.nome].push(desp);                             // eslint-disable-line no-undef
      marcar(2, 'ok', 'Despesa de <b>' + brl(custoCondominio(d.torres)) + '/mês</b> lançada por ' + desp.mesesRec + ' meses a partir de ' + desp.dataInicio.split('-').reverse().join('/') + '.');
    } catch (e) {
      marcar(2, 'erro', 'A tela foi criada, mas a despesa não: ' + esc(e.message) + '. Lance a licença à mão no módulo Elevadores.');
    }

    // 3. lead do CRM
    if (leadAtual) {
      leadAtual.itemCriado = d.nome;
      marcar(3, 'ok', 'Lead <b>' + esc(leadAtual.nome) + '</b> marcado como cadastrado.');
    } else {
      marcar(3, 'ok', 'Sem lead do CRM para marcar.');
    }
    try { scheduleSave(); } catch (e) {}                     // eslint-disable-line no-undef
    try { global.buildSidebar(); } catch (e) {}
    try { global.buildHome(); } catch (e) {}

    // 4. contrato de parceria + Assinafy
    enviarContrato(d).then(function (r) {
      marcar(4, r.ok ? 'ok' : 'erro', r.msg);
    }).finally(function () {
      // 5. aviso ao Cleiton (WhatsApp: o hub não manda mensagem sozinho)
      var txt = 'Novo condomínio fechado: ' + d.nome + (d.bairro ? ' (' + d.bairro + ')' : '') + '. ' +
        d.torres + ' torre(s), ' + (d.telas || d.torres) + ' tela(s). Início ' + d.inicio.split('-').reverse().join('/') +
        '. Programar a instalação.';
      marcar(5, 'ok', 'Aviso pronto: <a href="https://wa.me/?text=' + encodeURIComponent(txt) + '" target="_blank" rel="noopener">enviar ao Cleiton no WhatsApp</a>.');
      btn.textContent = 'Condomínio criado';
      var fim = doc.createElement('button');
      fim.type = 'button'; fim.className = 'b'; fim.textContent = 'Lançar outro';
      fim.addEventListener('click', function () { abrir(); });
      btn.parentNode.appendChild(fim);
    });
  }

  function enviarContrato(d) {
    function set(id, v) { var e = doc.getElementById(id); if (e) e.value = v; }
    try {
      set('p-razao', d.nome); set('p-cnpj', d.cnpj); set('p-end', d.end); set('p-sindico', d.sindico);
      set('p-cpf', d.cpf); set('p-email', d.email); set('p-wpp', d.wpp); set('p-torres', d.torres);
      set('p-apts', d.apts); set('p-telas', d.telas); set('p-bairro', d.bairro); set('p-vigencia', d.vig); set('p-inicio', d.inicio);
      global.parcGerar();
    } catch (e) {
      return Promise.resolve({ ok: false, msg: 'Não consegui gerar o contrato: ' + esc(e.message) + '. Gere pela aba Contratos › Parceria Cond.' });
    }
    var out = doc.getElementById('parc-output');
    if (!out || !out.innerHTML.trim()) return Promise.resolve({ ok: false, msg: 'Contrato não gerado. Gere pela aba Contratos › Parceria Cond.' });
    if (!d.email) return Promise.resolve({ ok: false, msg: 'Contrato gerado, mas sem e-mail do síndico. Envie pela aba Contratos › Parceria Cond. quando tiver o e-mail.' });
    var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>body{padding:24px;background:#fff;font-family:Arial,sans-serif}</style></head><body>' + out.innerHTML + '</body></html>';
    return fetch(ASSINAFY_API_URL + '?action=enviar', {
      method: 'POST',
      body: JSON.stringify({
        nomeDoc: 'Contrato de Parceria - ' + d.nome,
        html: html,
        signatarios: [{ nome: d.sindico || d.nome, email: d.email }, { nome: 'Eder Balbino — MGB Mídia', email: 'ederbalbino@gmail.com' }],
        mensagem: 'Segue o contrato de parceria das telas digitais nos elevadores para assinatura eletrônica.'
      })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.erro) throw new Error(j.erro);
      try {
        var info = clientesInfo.elev && clientesInfo.elev[d.nome];  // eslint-disable-line no-undef
        if (info) { info.assinafyDocId = j.docId; scheduleSave(); } // eslint-disable-line no-undef
      } catch (e) {}
      return { ok: true, msg: 'Contrato enviado ao síndico (' + esc(d.email) + ') e a você pelo Assinafy.' };
    }).catch(function (e) {
      return { ok: false, msg: 'Contrato gerado, mas o envio ao Assinafy falhou: ' + esc(e.message) + '. Envie pela aba Contratos › Parceria Cond.' };
    });
  }

  global.MGBNovo = Object.assign(api, { abrir: abrir });
  function iniciar() { injetarEstilos(); inserirBotaoHome(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
