// Lançar despesa e receita (11/10/2026, pedido do Eder): botões "Nova despesa" e "Nova receita" ao lado de
// "Novo cliente" na Home, para a Karen lançar sem precisar saber em que módulo ou aba cada coisa mora.
//
// Regras combinadas com o Eder:
// - Toda despesa responde "para quem é?": um cliente/unidade (vai para db[modulo][unidade], o mesmo lugar
//   do formulário dos módulos) ou "MGB · dia a dia" (empresaAvulsas, novo). Despesa fixa mensal da MGB
//   continua em empresaDespesas.
// - Viagem a serviço de um cliente (ex.: Curitiba para o Moinho) é custo da MGB, sem reembolso do cliente:
//   lança no cliente (Rádio Ops › Moinho Globo), categoria Viagem.
// - O Eder paga com dinheiro transferido da MGB: a despesa é marcada "paga pelo Eder (reembolso)" para a
//   transferência MGB → Eder não ser lida como pró-labore nem a despesa contar em dobro.
// - A Karen lança tudo, sem aprovação.
// - Receita avulsa = locuções e serviços pontuais (receitasAvulsas). Comissões de rádio NÃO entram aqui:
//   vêm do Rádio Ops dentro da Nota MGB.
(function (global) {
  'use strict';

  // ── Regras puras (testadas em bot/test/lancar.test.js) ─────────────────
  var CATEGORIAS = [
    { id: 'combustivel', rotulo: '⛽ Combustível', grupo: 'Viagem', tipo: 'Viagem' },
    { id: 'alimentacao', rotulo: '🍽️ Alimentação', grupo: 'Viagem', tipo: 'Viagem' },
    { id: 'hospedagem', rotulo: '🏨 Hospedagem', grupo: 'Viagem', tipo: 'Viagem' },
    { id: 'pedagio', rotulo: '🛣️ Pedágio e estacionamento', grupo: 'Viagem', tipo: 'Viagem' },
    { id: 'material', rotulo: '🧰 Material de instalação', grupo: 'Operação', tipo: 'Instalação' },
    { id: 'equipamento', rotulo: '📺 Equipamento', grupo: 'Operação', tipo: 'Produto' },
    { id: 'licenca', rotulo: '💻 Licença ou sistema', grupo: 'Operação', tipo: 'Licença' },
    { id: 'servico', rotulo: '🛠️ Serviço de terceiro', grupo: 'Operação', tipo: 'Serviço' },
    { id: 'escritorio', rotulo: '📎 Escritório', grupo: 'MGB', tipo: 'Outros' },
    { id: 'outros', rotulo: '🧾 Taxas', grupo: 'MGB', tipo: 'Taxas' },
    { id: 'outro', rotulo: '✏️ Outro (escrever)', grupo: 'Outro', tipo: 'Outros', livre: true }
  ];
  var SERVICOS_RECEITA = [
    { id: 'locucao', rotulo: '🎙️ Locução' },
    { id: 'spot', rotulo: '🎬 Produção de spot' },
    { id: 'outro', rotulo: '✏️ Outro (escrever)', livre: true }
  ];
  var MGB_DIA = '_mgb';          // destino "MGB · dia a dia"
  var SEM_DESPESA = ['taroba'];  // módulos que não recebem despesa por aqui

  function categoria(id) { return CATEGORIAS.filter(function (c) { return c.id === id; })[0] || null; }
  function servico(id) { return SERVICOS_RECEITA.filter(function (s) { return s.id === id; })[0] || null; }

  // "1.234,56" | "1234.56" | 1234.56 → 1234.56
  function numero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).trim().replace(/[^\d,.-]/g, '');
    if (!s) return 0;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function mesDe(data) { return String(data || '').slice(0, 7); }
  function hojeISO() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

  function validarDespesa(d) {
    var e = [];
    if (!d.destino) e.push('Escolha para quem é a despesa.');
    else if (d.destino !== MGB_DIA && !d.item) e.push('Escolha a unidade ou o cliente.');
    if (!categoria(d.categoria)) e.push('Escolha o que foi (categoria).');
    else if (categoria(d.categoria).livre && !String(d.categoriaTxt || '').trim()) e.push('Escreva o que foi em "Outro".');
    if (!String(d.descricao || '').trim()) e.push('Escreva uma descrição curta.');
    if (!(numero(d.valor) > 0)) e.push('Informe o valor.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.data || ''))) e.push('Informe a data.');
    if (d.forma === 'parcelado' && !(parseInt(d.parcelas, 10) >= 2)) e.push('Parcelado precisa de 2 parcelas ou mais.');
    if (d.forma === 'mensal' && !(parseInt(d.meses, 10) >= 1)) e.push('Informe por quantos meses.');
    if (d.destino === MGB_DIA && d.forma === 'parcelado') e.push('Despesa da MGB parcelada: lance cada parcela no mês dela, ou lance num cliente.');
    return e;
  }

  // Linha no formato de db[modulo][unidade] (mesmo formato do formulário dos módulos e do bot do WhatsApp).
  // Parcelado: valor = TOTAL (o hub divide pelas parcelas). Mensal: valor = por mês.
  function linhaDespesa(d) {
    var c = categoria(d.categoria) || { tipo: 'Outros', rotulo: '' };
    var valor = Math.round(numero(d.valor) * 100) / 100;
    var mes = mesDe(d.data);
    var t = d.forma === 'parcelado' ? 'Parcelado' : d.forma === 'mensal' ? 'Recorrente' : 'À vista';
    var r = {
      t: t, tipo: c.livre ? String(d.categoriaTxt || '').trim() || 'Outros' : c.tipo, d: String(d.descricao).trim(), f: String(d.fornecedor || '').trim(), q: 1, u: valor,
      cc: d.item || '', venc: t === 'À vista' ? mes : '', pago: false, dataPago: '',
      data: d.data, cat: d.categoria, catTxt: c.livre ? String(d.categoriaTxt || '').trim() : '', origem: 'lancar', reembolso: d.quemPagou === 'eder',
      lancadoPor: d.lancadoPor || '', lid: d.lid || ('L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      criadoEm: d.criadoEm || new Date().toISOString()
    };
    if (t === 'Parcelado') { r.nparc = parseInt(d.parcelas, 10); r.paga = 0; r.dataInicio = mes; }
    if (t === 'Recorrente') { r.mesesRec = parseInt(d.meses, 10); r.dataInicio = mes; }
    return r;
  }

  // "MGB · dia a dia", à vista (a fixa mensal vai para empresaDespesas).
  function avulsaEmpresa(d, id) {
    return {
      id: id, data: d.data, mes: mesDe(d.data), desc: String(d.descricao).trim(), forn: String(d.fornecedor || '').trim(),
      cat: d.categoria, catTxt: (categoria(d.categoria) || {}).livre ? String(d.categoriaTxt || '').trim() : '', valor: Math.round(numero(d.valor) * 100) / 100, reembolso: d.quemPagou === 'eder',
      lancadoPor: d.lancadoPor || '', criadoEm: d.criadoEm || new Date().toISOString()
    };
  }
  function chaveMes(ano, mes0) { return ano + '-' + String(mes0 + 1).padStart(2, '0'); }
  function avulsasDoMes(lista, ano, mes0) {
    var k = chaveMes(ano, mes0);
    return (lista || []).filter(function (x) { return x && x.mes === k && x.valor > 0; });
  }

  function validarReceita(r) {
    var e = [];
    if (!String(r.cliente || '').trim()) e.push('Escolha o cliente (do CRM ou já cadastrado).');
    if (!servico(r.servico)) e.push('Escolha o serviço.');
    else if (servico(r.servico).livre && !String(r.servicoTxt || '').trim()) e.push('Escreva qual é o serviço em "Outro".');
    if (!(numero(r.valor) > 0)) e.push('Informe o valor.');
    if (!/^\d{4}-\d{2}$/.test(String(r.mes || ''))) e.push('Informe o mês de competência.');
    return e;
  }
  function receitaAvulsa(r, id) {
    var s = servico(r.servico);
    return {
      id: id, cliente: String(r.cliente).trim(), servico: r.servico, servicoTxt: s.livre ? String(r.servicoTxt || '').trim() : '',
      clienteInfo: r.clienteInfo || null,   // {cnpj, razao, email, tel, responsavel, endereco, origem, mod, item, leadId}
      desc: String(r.descricao || '').trim() || (s.livre ? String(r.servicoTxt || '').trim() : s.rotulo.replace(/^\S+\s/, '')),
      valor: Math.round(numero(r.valor) * 100) / 100, mes: r.mes, lancadoPor: r.lancadoPor || '',
      criadoEm: r.criadoEm || new Date().toISOString()
    };
  }
  function receitasDoMes(lista, ano, mes0) {
    var k = chaveMes(ano, mes0);
    return (lista || []).filter(function (x) { return x && x.mes === k && x.valor > 0; });
  }
  function itemReceita(x) {
    var s = servico(x.servico) || { rotulo: 'Serviço' };
    return (s.livre && x.servicoTxt ? x.servicoTxt : s.rotulo.replace(/^\S+\s/, '').replace(/ \(escrever\)$/, '')) + ' · ' + x.cliente + ' #' + x.id;
  }

  // ── Cliente padrão: CRM + já cadastrados no hub, num lugar só (pedido do Eder, 11/10) ──
  // Toda entrada que tem cliente usa esta lista: assim o CNPJ, a razão e o e-mail já vêm para a nota.
  function normaliza(s) { return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); }
  function digitos(s) { return String(s || '').replace(/\D/g, ''); }
  // fontes = { leads, clientesInfo, modulos:[{id,label,items}], anunciantes }
  function unirClientes(fontes) {
    fontes = fontes || {};
    var porChave = {}, lista = [];
    function chave(c) { var d = digitos(c.cnpj); return d.length >= 11 ? 'd' + d : 'n' + normaliza(c.nome); }
    function juntar(c) {
      var k = chave(c), ja = porChave[k] || porChave['n' + normaliza(c.nome)];
      if (!ja) { porChave[k] = c; if (k[0] === 'd') porChave['n' + normaliza(c.nome)] = c; lista.push(c); return; }
      ['cnpj', 'razao', 'email', 'tel', 'responsavel', 'cargo', 'endereco'].forEach(function (f) { if (!ja[f] && c[f]) ja[f] = c[f]; });
      if (c.origem === 'crm') { ja.crm = true; ja.leadId = ja.leadId || c.leadId; ja.estagio = ja.estagio || c.estagio; }
      if (!porChave[chave(ja)]) porChave[chave(ja)] = ja;
    }
    var info = fontes.clientesInfo || {};
    (fontes.modulos || []).forEach(function (m) {
      var itens = m.id === 'elev' ? (fontes.anunciantes || []).map(function (a) { return a.nome; }) : (m.items || []);
      itens.forEach(function (item) {
        if (!item || /^(Outros|Expansão|Cliente Piloto|Franqueado Piloto)$/.test(item)) return;
        var i = (info[m.id] || {})[item] || {};
        juntar({ nome: item, razao: i.razao || i.fantasia || '', cnpj: i.cnpj || '', email: i.email || '', tel: i.tel || '', responsavel: i.responsavel || '', cargo: i.cargo || '',
          endereco: i.endereco || '', origem: 'hub', mod: m.id, modRot: String(m.label || m.id).split('—').pop().trim(), item: item });
      });
    });
    (fontes.leads || []).forEach(function (l) {
      if (!l || !l.nome || l.estagio === 'perdido') return;
      juntar({ nome: l.nome, razao: l.razao || '', cnpj: l.cnpj || '', email: l.email || '', tel: l.tel || '', responsavel: l.responsavel || '', cargo: l.funcao || l.cargo || '',
        endereco: l.endereco || '', origem: 'crm', crm: true, leadId: l.id, estagio: l.estagio || '' });
    });
    return lista;
  }
  function buscarClientes(lista, termo, max) {
    var t = normaliza(termo), d = digitos(termo);
    var r = (lista || []).filter(function (c) { return !t || normaliza(c.nome).indexOf(t) >= 0 || normaliza(c.razao).indexOf(t) >= 0 || (d.length >= 3 && digitos(c.cnpj).indexOf(d) >= 0); });
    r.sort(function (a, b) { return (a.origem === 'hub' ? 0 : 1) - (b.origem === 'hub' ? 0 : 1) || normaliza(a.nome).localeCompare(normaliza(b.nome)); });
    return r.slice(0, max || 8);
  }
  function origemCliente(c) {
    if (!c) return '';
    if (c.origem === 'hub') return 'Cadastrado no hub · ' + (c.modRot || c.mod) + (c.crm ? ' · está no CRM' : '');
    if (c.origem === 'crm') return 'CRM' + (c.estagio ? ' · ' + c.estagio : '');
    return 'Fora do CRM (sem cadastro)';
  }

  // Sugestões tiradas do que já foi lançado: descrição → último fornecedor, valor e categoria.
  function sugestoes(db, avulsas) {
    var desc = {}, forn = {};
    Object.keys(db || {}).forEach(function (m) {
      Object.keys(db[m] || {}).forEach(function (it) {
        (db[m][it] || []).forEach(function (r) {
          if (!r || !r.d) return;
          desc[r.d] = { f: r.f || '', u: r.u || 0, cat: r.cat || '' };
          if (r.f && r.f !== '—') forn[r.f] = 1;
        });
      });
    });
    (avulsas || []).forEach(function (a) { if (a && a.desc) { desc[a.desc] = { f: a.forn || '', u: a.valor, cat: a.cat }; if (a.forn) forn[a.forn] = 1; } });
    return { descricoes: desc, fornecedores: Object.keys(forn).sort() };
  }

  var api = {
    CATEGORIAS: CATEGORIAS, SERVICOS_RECEITA: SERVICOS_RECEITA, MGB_DIA: MGB_DIA,
    numero: numero, validarDespesa: validarDespesa, linhaDespesa: linhaDespesa, avulsaEmpresa: avulsaEmpresa,
    avulsasDoMes: avulsasDoMes, validarReceita: validarReceita, receitaAvulsa: receitaAvulsa,
    receitasDoMes: receitasDoMes, itemReceita: itemReceita, sugestoes: sugestoes,
    unirClientes: unirClientes, buscarClientes: buscarClientes, origemCliente: origemCliente
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ── Interface ──────────────────────────────────────────────────────────
  var doc = document;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(v) { return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function quem() { try { var u = global.MGBAcesso && global.MGBAcesso.usuario && global.MGBAcesso.usuario(); return u ? (u.nome || u.login || '') : ''; } catch (e) { return ''; } }
  function modulos() { try { return MODULES; } catch (e) { return []; } }                 // eslint-disable-line no-undef
  function rotMod(m) { return m.id === 'radioops' ? 'Rádio Ops (Moinho)' : m.label.split('—').pop().trim(); }
  function fmtMes(k) { var p = String(k).split('-'); var n = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return n[(+p[1] || 1) - 1] + '/' + String(p[0]).slice(2); }
  function salvar() { try { scheduleSave(); } catch (e) {} try { global.buildSidebar(); } catch (e) {} try { global.buildHome(); } catch (e) {} } // eslint-disable-line no-undef

  function moldura(titulo, corpo) {
    var el = doc.getElementById('mgb-novo');
    if (el) el.remove();
    el = doc.createElement('div');
    el.id = 'mgb-novo'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', titulo);
    el.innerHTML = '<div class="box"><div class="top"><h2>' + esc(titulo) + '</h2><button type="button" class="x" data-fechar>Fechar</button></div><div class="corpo">' + corpo + '</div></div>';
    doc.body.appendChild(el);
    el.addEventListener('click', function (e) { if (e.target === el || e.target.hasAttribute('data-fechar')) fechar(); });
    doc.addEventListener('keydown', escFecha);
    return el;
  }
  function fechar() { var el = doc.getElementById('mgb-novo'); if (el) el.remove(); doc.removeEventListener('keydown', escFecha); }
  function escFecha(e) { if (e.key === 'Escape') fechar(); }

  function injetarEstilos(d) {
    d = d || doc;                                  // também injeta dentro dos contratos (iframes)
    if (d.getElementById('mgb-lancar-css')) return;
    var st = d.createElement('style'); st.id = 'mgb-lancar-css';
    st.textContent =
      '#mgb-novo [hidden]{display:none!important}' +
      '#mgb-novo .chips{display:flex;flex-wrap:wrap;gap:8px}' +
      '#mgb-novo .chip{min-height:40px;padding:0 14px;border-radius:999px;border:1px solid #d9d1ea;background:#fff;font:600 14px "DM Sans",system-ui,sans-serif;color:#241a38;cursor:pointer}' +
      '#mgb-novo .chip[aria-pressed="true"]{background:#4E38B2;border-color:#4E38B2;color:#fff}' +
      '#mgb-novo .chip:focus-visible{outline:3px solid #b9a9f5;outline-offset:2px}' +
      '#mgb-novo .grupo{font-size:12px;color:#6b6380;margin:4px 0 -2px}' +
      '#mgb-novo .resumo{font-size:15px;line-height:1.5}#mgb-novo .resumo b{color:#2a1760}' +
      '#mgb-novo .ok-box{background:#dcefe4;border:1px solid #a7dccf;border-radius:12px;padding:12px 14px;font-size:14px;color:#14583a}' +
      '#mgb-novo .rec{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #ece7f5;font-size:13px}' +
      '#mgb-novo .rec small{color:#6b6380;display:block}' +
      '#mgb-novo .hint{font-size:12px;color:#6b6380;font-weight:500}' +
      '.mgb-cp label.f{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:#3a3446}' +
      '.mgb-cp label.f input{height:42px;border:1px solid #cfc6e0;border-radius:9px;padding:0 11px;font-size:14px;font-family:inherit;background:#fff;color:#241a38}' +
      '.mgb-cp .hint{font-size:12px;color:#6b6380;font-weight:500}.mgb-cp [hidden]{display:none!important}.mgb-cp .sub{margin:0;font-size:13px;color:#6b6380}' +
      '.mgb-cp .cp-lista{display:flex;flex-direction:column;border:1px solid #e4def2;border-radius:10px;overflow:hidden;margin-top:6px}' +
      '.mgb-cp .cp-op{display:flex;justify-content:space-between;gap:10px;align-items:center;text-align:left;padding:9px 12px;border:0;border-top:1px solid #ece7f5;background:#fff;font:inherit;color:inherit;cursor:pointer}' +
      '.mgb-cp .cp-op:first-child{border-top:0}#mgb-novo .cp-op:hover,.mgb-cp .cp-op:focus-visible{background:#f3effd;outline:none}' +
      '.mgb-cp .cp-op small{display:block;color:#6b6380;font-size:12px}' +
      '.mgb-cp .cp-tag{font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;white-space:nowrap}' +
      '.mgb-cp .cp-tag.hub{background:#e6f4ec;color:#14583a}#mgb-novo .cp-tag.crm{background:#efeaf8;color:#4E38B2}#mgb-novo .cp-tag.fora{background:#fde3dc;color:#a33a1a}' +
      '.mgb-cp .cp-card{border:1px solid #a7dccf;background:#f1faf7;border-radius:12px;padding:12px 14px;font-size:14px;display:flex;flex-direction:column;gap:4px}' +
      '.mgb-cp .cp-card.aviso{border-color:#f3c0b0;background:#fff5f1}' +
      '#mgb-novo .origem{font-size:13px;color:#3a3446;background:#f6f4fb;border-radius:9px;padding:8px 10px}';
    d.head.appendChild(st);
  }

  // ── Seletor de cliente padrão (CRM + cadastrados) ──────────────────────
  // Uso: seletorCliente(caixa, { aoEscolher: function (c) {}, rotulo: 'Cliente' }). Devolve { valor: function () }.
  function clientesDoHub() {
    var f = {};
    try { f.leads = leads; } catch (e) {}                                                     // eslint-disable-line no-undef
    try { f.clientesInfo = clientesInfo; } catch (e) {}                                       // eslint-disable-line no-undef
    try { f.anunciantes = anunciantes; } catch (e) {}                                         // eslint-disable-line no-undef
    f.modulos = modulos().filter(function (m) { return m.id !== 'taroba'; });
    return unirClientes(f);
  }
  function seletorCliente(caixa, opts) {
    opts = opts || {};
    var D = caixa.ownerDocument || doc;
    injetarEstilos(D); caixa.classList.add('mgb-cp');
    var todos = clientesDoHub(), escolhido = null, id = 'cp' + Math.random().toString(36).slice(2, 7);
    caixa.innerHTML = '<label class="f" for="' + id + '">' + esc(opts.rotulo || 'Cliente') +
      ' <span class="hint">· busca no CRM e nos clientes já cadastrados (nome ou CNPJ)</span>' +
      '<input id="' + id + '" autocomplete="off" placeholder="Digite o nome ou o CNPJ" role="combobox" aria-expanded="false" aria-controls="' + id + '-l"></label>' +
      '<div class="cp-lista" id="' + id + '-l" role="listbox" hidden></div><div class="cp-sel" aria-live="polite"></div>';
    var inp = caixa.querySelector('input'), lista = caixa.querySelector('.cp-lista'), sel = caixa.querySelector('.cp-sel');
    function tag(c) { return c.origem === 'hub' ? '<span class="cp-tag hub">Cadastrado</span>' : c.origem === 'crm' ? '<span class="cp-tag crm">CRM</span>' : '<span class="cp-tag fora">Fora do CRM</span>'; }
    function mostrar() {
      var t = inp.value, r = buscarClientes(todos, t, 8);
      var html = r.map(function (c, i) {
        return '<button type="button" class="cp-op" role="option" data-i="' + i + '"><span><b>' + esc(c.nome) + '</b><small>' + esc(origemCliente(c)) +
          (c.cnpj ? ' · CNPJ ' + esc(c.cnpj) : ' · sem CNPJ') + '</small></span>' + tag(c) + '</button>';
      }).join('');
      if (String(t).trim().length >= 3 && opts.permitirFora !== false)
        html += '<button type="button" class="cp-op" data-fora="1"><span><b>Usar “' + esc(t.trim()) + '”</b><small>Cliente fora do CRM: a nota sai sem CNPJ. Melhor cadastrar no CRM antes.</small></span><span class="cp-tag fora">Fora do CRM</span></button>';
      lista.innerHTML = html || '<p class="sub" style="padding:10px 12px">Nenhum cliente com esse nome. Cadastre no CRM.</p>';
      lista.hidden = false; inp.setAttribute('aria-expanded', 'true');
      lista.querySelectorAll('[data-i]').forEach(function (b) { b.addEventListener('click', function () { escolher(r[+b.getAttribute('data-i')]); }); });
      var fora = lista.querySelector('[data-fora]');
      if (fora) fora.addEventListener('click', function () { escolher({ nome: inp.value.trim(), origem: 'fora', cnpj: '' }); });
    }
    function escolher(c) {
      escolhido = c; lista.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.value = c.nome;
      sel.innerHTML = '<div class="cp-card' + (c.cnpj ? '' : ' aviso') + '" style="margin-top:8px"><b>' + esc(c.nome) + '</b>' +
        (c.razao && c.razao !== c.nome ? '<span>' + esc(c.razao) + '</span>' : '') +
        '<span>' + (c.cnpj ? 'CNPJ ' + esc(c.cnpj) : '⚠️ Sem CNPJ: complete no CRM para a nota sair certa.') + '</span>' +
        (c.email ? '<span>' + esc(c.email) + '</span>' : '') +
        '<span class="hint">De onde vem: ' + esc(origemCliente(c)) + '</span></div>';
      if (opts.aoEscolher) opts.aoEscolher(c);
    }
    inp.addEventListener('input', function () { escolhido = null; sel.innerHTML = ''; if (opts.aoEscolher) opts.aoEscolher(null); mostrar(); });
    inp.addEventListener('focus', function () { todos = clientesDoHub(); mostrar(); });
    D.addEventListener('click', function (e) { if (!caixa.contains(e.target)) { lista.hidden = true; inp.setAttribute('aria-expanded', 'false'); } });
    inp.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { var p = lista.querySelector('.cp-op'); if (p) { e.preventDefault(); p.focus(); } } if (e.key === 'Escape') { lista.hidden = true; } });
    lista.addEventListener('keydown', function (e) {
      var ops = [].slice.call(lista.querySelectorAll('.cp-op')), i = ops.indexOf(D.activeElement);
      if (e.key === 'ArrowDown' && i < ops.length - 1) { e.preventDefault(); ops[i + 1].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) ops[i - 1].focus(); else inp.focus(); }
    });
    return {
      valor: function () { return escolhido; }, foco: function () { inp.focus(); },
      limpar: function () { escolhido = null; inp.value = ''; sel.innerHTML = ''; lista.hidden = true; },
      definir: function (nome) {           // mostra um cliente já salvo (ex.: editar recibo) sem disparar aoEscolher
        todos = clientesDoHub();
        var c = todos.filter(function (x) { return normaliza(x.nome) === normaliza(nome); })[0];
        escolhido = c || (nome ? { nome: nome, origem: 'fora', cnpj: '' } : null); inp.value = nome || ''; sel.innerHTML = ''; lista.hidden = true;
      }
    };
  }

  // ── Nova despesa ───────────────────────────────────────────────────────
  var estado = {};
  function novaDespesa(manter) {
    injetarEstilos();
    var base = manter || {};
    estado = { destino: base.destino || '', item: base.item || '', categoria: '', data: base.data || hojeISO(), forma: 'avista', quemPagou: base.quemPagou || 'mgb', jaPaga: base.jaPaga !== false };
    var areas = [{ id: MGB_DIA, rot: '🏢 MGB · dia a dia' }].concat(modulos().filter(function (m) { return SEM_DESPESA.indexOf(m.id) < 0; }).map(function (m) { return { id: m.id, rot: (m.icon || '') + ' ' + rotMod(m) }; }));
    var sug = sugestoes(typeof db !== 'undefined' ? db : {}, typeof empresaAvulsas !== 'undefined' ? empresaAvulsas : []); // eslint-disable-line no-undef
    var grupos = {};
    CATEGORIAS.forEach(function (c) { (grupos[c.grupo] = grupos[c.grupo] || []).push(c); });
    var el = moldura('Nova despesa',
      '<div class="duas"><main>' +
      '<section class="card"><div class="sec">1 · Para quem é a despesa?</div>' +
      '<div class="chips" id="lz-areas">' + areas.map(function (a) { return '<button type="button" class="chip" data-area="' + a.id + '" aria-pressed="false">' + esc(a.rot) + '</button>'; }).join('') + '</div>' +
      '<label class="f" for="lz-item" id="lz-item-w" hidden>Unidade, condomínio ou cliente <span class="hint">· já cadastrados no hub</span><select id="lz-item"></select></label>' +
      '<div class="origem" id="lz-origem" hidden></div>' +
      '<p class="sub" id="lz-area-dica">MGB · dia a dia é o que não é de um cliente: combustível do dia a dia, almoço, escritório. Viagem a serviço de um cliente vai no cliente.</p></section>' +
      '<section class="card"><div class="sec">2 · O que foi?</div>' +
      Object.keys(grupos).map(function (gname) { return '<div class="grupo">' + esc(gname) + '</div><div class="chips">' + grupos[gname].map(function (c) { return '<button type="button" class="chip" data-cat="' + c.id + '" aria-pressed="false">' + esc(c.rotulo) + '</button>'; }).join('') + '</div>'; }).join('') +
      '<label class="f" for="lz-cat-txt" id="lz-cat-txt-w" hidden>O que foi?<input id="lz-cat-txt" placeholder="ex.: Conserto do carro, curso, brinde de cliente" autocomplete="off"></label>' +
      '</section>' +
      '<section class="card"><div class="sec">3 · Detalhes</div><div class="campos">' +
      '<label class="f" for="lz-desc">Descrição<input id="lz-desc" list="lz-desc-l" placeholder="ex.: Gasolina ida a Curitiba" autocomplete="off"></label>' +
      '<datalist id="lz-desc-l">' + Object.keys(sug.descricoes).sort().map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>' +
      '<label class="f" for="lz-forn">Fornecedor ou lugar<input id="lz-forn" list="lz-forn-l" placeholder="ex.: Posto Graal" autocomplete="off"></label>' +
      '<datalist id="lz-forn-l">' + sug.fornecedores.map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>' +
      '<label class="f" for="lz-valor">Valor (R$)<input id="lz-valor" inputmode="decimal" placeholder="0,00"></label>' +
      '<label class="f" for="lz-data">Data<input id="lz-data" type="date" value="' + esc(estado.data) + '"></label>' +
      '<label class="f" for="lz-forma">Como foi pago<select id="lz-forma"><option value="avista">À vista (uma vez)</option><option value="parcelado">Parcelado</option><option value="mensal">Todo mês</option></select></label>' +
      '<label class="f" for="lz-parc" id="lz-parc-w" hidden>Parcelas<input id="lz-parc" type="number" min="2" value="2"></label>' +
      '<label class="f" for="lz-meses" id="lz-meses-w" hidden>Por quantos meses<input id="lz-meses" type="number" min="1" value="12"></label>' +
      '</div><p class="sub" id="lz-forma-dica">À vista: o valor cai no mês da data.</p></section>' +
      '<section class="card"><div class="sec">4 · Pagamento</div>' +
      '<div class="chips" role="group" aria-label="Situação"><button type="button" class="chip" data-paga="1" aria-pressed="true">✔ Já paga</button><button type="button" class="chip" data-paga="0" aria-pressed="false">A pagar</button></div>' +
      '<div class="chips" role="group" aria-label="Quem pagou" id="lz-quem"><button type="button" class="chip" data-quem="mgb" aria-pressed="true">Conta da MGB</button><button type="button" class="chip" data-quem="eder" aria-pressed="false">Eder pagou (reembolso)</button></div>' +
      '<p class="sub">Eder pagou: a MGB transfere para o Eder e a transferência fica marcada como reembolso, não como pró-labore.</p></section>' +
      '</main><aside><section class="card"><div class="sec">Vai entrar assim</div><div class="resumo" id="lz-resumo">Escolha para quem é e o que foi.</div>' +
      '<div class="erros" id="lz-erros" role="alert"></div>' +
      '<button type="button" class="b p" id="lz-ok">Lançar despesa</button><div id="lz-feito" aria-live="polite"></div></section>' +
      '<section class="card"><div class="sec">Últimos lançamentos</div><div id="lz-recentes"></div></section></aside></div>');

    function marcar(attr, val) { el.querySelectorAll('[' + attr + ']').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(val))); }); }
    function itensDe(area) { var m = modulos().filter(function (x) { return x.id === area; })[0]; return m ? m.items.slice() : []; }
    function escolherArea(area) {
      estado.destino = area; marcar('data-area', area);
      var w = el.querySelector('#lz-item-w'), s = el.querySelector('#lz-item');
      if (area === MGB_DIA) { w.hidden = true; estado.item = ''; }
      else {
        var it = itensDe(area);
        s.innerHTML = (it.length > 1 ? '<option value="">Escolha…</option>' : '') + it.map(function (i) { return '<option>' + esc(i) + '</option>'; }).join('');
        if (estado.item && it.indexOf(estado.item) >= 0) s.value = estado.item;
        estado.item = s.value; w.hidden = false;
      }
      origemUnidade();
      var parc = el.querySelector('#lz-forma option[value="parcelado"]'); parc.disabled = area === MGB_DIA;
      if (area === MGB_DIA && estado.forma === 'parcelado') { el.querySelector('#lz-forma').value = 'avista'; estado.forma = 'avista'; formaMudou(); }
      resumo();
    }
    // De onde vem a unidade escolhida: cadastrada no hub (pelo Novo cliente, com dados do CRM) e o CNPJ, quando houver.
    function origemUnidade() {
      var o = el.querySelector('#lz-origem'), area = estado.destino, it = el.querySelector('#lz-item').value;
      if (area === MGB_DIA || !area) { o.hidden = true; return; }
      if (!it) { o.hidden = false; o.innerHTML = 'A lista mostra as unidades já cadastradas no hub. Cliente novo? Feche em <b>Novo cliente</b>, que puxa do CRM, e ele aparece aqui.'; return; }
      var info = {}; try { info = (clientesInfo[area] || {})[it] || {}; } catch (e) {}       // eslint-disable-line no-undef
      var c = clientesDoHub().filter(function (x) { return normaliza(x.nome) === normaliza(info.fantasia || it) || normaliza(x.nome) === normaliza(it); })[0];
      var cnpj = info.cnpj || (c && c.cnpj) || '';
      o.hidden = false;
      o.innerHTML = '<b>' + esc(it) + '</b> · cadastrado no hub' + (c && c.crm ? ' · está no CRM' : '') + (cnpj ? ' · CNPJ ' + esc(cnpj) : ' · sem CNPJ no cadastro');
    }
    function formaMudou() {
      estado.forma = el.querySelector('#lz-forma').value;
      el.querySelector('#lz-parc-w').hidden = estado.forma !== 'parcelado';
      el.querySelector('#lz-meses-w').hidden = estado.forma !== 'mensal';
      el.querySelector('#lz-forma-dica').textContent = estado.forma === 'parcelado' ? 'Parcelado: informe o valor TOTAL; o hub divide pelas parcelas a partir do mês da data.' :
        estado.forma === 'mensal' ? 'Todo mês: informe o valor de UM mês; repete a partir do mês da data.' : 'À vista: o valor cai no mês da data.';
      resumo();
    }
    function dados() {
      return { destino: estado.destino, item: estado.destino === MGB_DIA ? '' : el.querySelector('#lz-item').value, categoria: estado.categoria, categoriaTxt: el.querySelector('#lz-cat-txt').value,
        descricao: el.querySelector('#lz-desc').value, fornecedor: el.querySelector('#lz-forn').value, valor: el.querySelector('#lz-valor').value,
        data: el.querySelector('#lz-data').value, forma: estado.forma, parcelas: el.querySelector('#lz-parc').value, meses: el.querySelector('#lz-meses').value,
        quemPagou: estado.quemPagou, jaPaga: estado.jaPaga, lancadoPor: quem() };
    }
    function resumo() {
      var d = dados(), v = numero(d.valor), m = mesDe(d.data), alvo;
      if (!d.destino) { el.querySelector('#lz-resumo').textContent = 'Escolha para quem é e o que foi.'; return; }
      var mod = modulos().filter(function (x) { return x.id === d.destino; })[0];
      alvo = d.destino === MGB_DIA ? 'MGB · dia a dia' : (mod ? rotMod(mod) : '') + (d.item ? ' › ' + d.item : '');
      var c = categoria(d.categoria), txt = '<b>' + esc(alvo) + '</b>' + (c ? '<br>' + esc(c.livre ? '✏️ ' + (d.categoriaTxt || 'Outro') : c.rotulo) : '');
      if (v > 0 && m) {
        if (d.forma === 'parcelado') { var n = parseInt(d.parcelas, 10) || 2; txt += '<br>' + n + 'x de ' + brl(v / n) + ' a partir de ' + fmtMes(m) + ' (total ' + brl(v) + ')'; }
        else if (d.forma === 'mensal') txt += '<br>' + brl(v) + ' por mês, ' + (parseInt(d.meses, 10) || 1) + ' meses a partir de ' + fmtMes(m);
        else txt += '<br>' + brl(v) + ' em ' + fmtMes(m);
      }
      txt += '<br><span class="hint">' + (d.jaPaga ? 'Já paga' : 'A pagar') + ' · ' + (d.quemPagou === 'eder' ? 'Eder pagou (reembolso)' : 'conta da MGB') + '</span>';
      el.querySelector('#lz-resumo').innerHTML = txt;
    }

    el.querySelectorAll('[data-area]').forEach(function (b) { b.addEventListener('click', function () { escolherArea(b.getAttribute('data-area')); }); });
    el.querySelector('#lz-item').addEventListener('change', function (e) { estado.item = e.target.value; origemUnidade(); resumo(); });
    el.querySelectorAll('[data-cat]').forEach(function (b) { b.addEventListener('click', function () {
      estado.categoria = b.getAttribute('data-cat'); marcar('data-cat', estado.categoria);
      var livre = !!(categoria(estado.categoria) || {}).livre, w = el.querySelector('#lz-cat-txt-w');
      w.hidden = !livre; if (livre) el.querySelector('#lz-cat-txt').focus();
      resumo();
    }); });
    el.querySelector('#lz-cat-txt').addEventListener('input', resumo);
    el.querySelectorAll('[data-paga]').forEach(function (b) { b.addEventListener('click', function () { estado.jaPaga = b.getAttribute('data-paga') === '1'; marcar('data-paga', b.getAttribute('data-paga')); resumo(); }); });
    el.querySelectorAll('[data-quem]').forEach(function (b) { b.addEventListener('click', function () { estado.quemPagou = b.getAttribute('data-quem'); marcar('data-quem', estado.quemPagou); resumo(); }); });
    el.querySelector('#lz-forma').addEventListener('change', formaMudou);
    ['#lz-valor', '#lz-data', '#lz-parc', '#lz-meses', '#lz-desc'].forEach(function (s) { el.querySelector(s).addEventListener('input', resumo); });
    el.querySelector('#lz-desc').addEventListener('change', function (e) {   // descrição já usada: completa fornecedor, valor e categoria
      var s = sug.descricoes[e.target.value]; if (!s) return;
      var fo = el.querySelector('#lz-forn'), va = el.querySelector('#lz-valor');
      if (!fo.value && s.f && s.f !== '—') fo.value = s.f;
      if (!va.value && s.u) va.value = String(s.u).replace('.', ',');
      if (!estado.categoria && categoria(s.cat)) { estado.categoria = s.cat; marcar('data-cat', s.cat); }
      resumo();
    });
    el.querySelector('#lz-ok').addEventListener('click', function () { gravarDespesa(el, dados()); });
    marcar('data-paga', estado.jaPaga ? '1' : '0'); marcar('data-quem', estado.quemPagou);
    if (estado.destino) escolherArea(estado.destino);
    recentes(el);
    var foco = el.querySelector(estado.destino ? '[data-cat]' : '[data-area]'); if (foco) foco.focus();
  }

  function marcarPaga(modId, item, idx, ano, mes0, obs) {
    if (typeof despPagamentos === 'undefined') return;                                      // eslint-disable-line no-undef
    var P = despPagamentos;                                                                   // eslint-disable-line no-undef
    P[modId] = P[modId] || {}; P[modId][item] = P[modId][item] || {}; P[modId][item][idx] = P[modId][item][idx] || {};
    P[modId][item][idx][ano + '-' + mes0] = { pago: true, obs: obs || '', dataPago: new Date().toLocaleDateString('pt-BR') };
  }

  function gravarDespesa(el, d) {
    var erros = validarDespesa(d), errEl = el.querySelector('#lz-erros');
    if (erros.length) { errEl.innerHTML = erros.map(esc).join('<br>'); return; }
    errEl.textContent = '';
    var ano = +d.data.slice(0, 4), mes0 = +d.data.slice(5, 7) - 1, onde;
    var obs = d.reembolso || d.quemPagou === 'eder' ? 'Eder pagou · reembolso' : '';
    try {
      if (d.destino === MGB_DIA && d.forma === 'mensal') {
        empresaDespesas.push({ id: empresaDespId++, nome: d.descricao.trim(), valor: Math.round(numero(d.valor) * 100) / 100, inicio: mesDe(d.data), ativo: true, cat: d.categoria, lancadoPor: d.lancadoPor }); // eslint-disable-line no-undef
        onde = 'Despesas fixas da MGB, todo mês a partir de ' + fmtMes(mesDe(d.data));
      } else if (d.destino === MGB_DIA) {
        var a = avulsaEmpresa(d, empresaAvulsaId++);                                         // eslint-disable-line no-undef
        empresaAvulsas.push(a);                                                              // eslint-disable-line no-undef
        if (d.jaPaga) marcarPaga('_empresa', 'Empresa', '_av_' + a.id, ano, mes0, obs);
        onde = 'MGB · dia a dia, ' + fmtMes(a.mes);
      } else {
        var r = linhaDespesa(d);
        if (!db[d.destino]) db[d.destino] = {};                                             // eslint-disable-line no-undef
        if (!db[d.destino][d.item]) db[d.destino][d.item] = [];                             // eslint-disable-line no-undef
        db[d.destino][d.item].push(r);                                                      // eslint-disable-line no-undef
        try { applyToFin(r, +1); } catch (e) {}                                              // eslint-disable-line no-undef
        if (d.jaPaga && r.t === 'À vista') marcarPaga(d.destino, d.item, db[d.destino][d.item].length - 1, ano, mes0, obs); // eslint-disable-line no-undef
        var mod = modulos().filter(function (x) { return x.id === d.destino; })[0];
        onde = (mod ? rotMod(mod) : d.destino) + ' › ' + d.item + ', ' + fmtMes(mesDe(d.data));
      }
    } catch (e) {
      errEl.textContent = 'Não consegui lançar: ' + e.message + '. Nada foi gravado.'; return;
    }
    salvar();
    var feito = el.querySelector('#lz-feito');
    feito.innerHTML = '<div class="ok-box" style="margin-top:10px">✔ ' + esc(d.descricao.trim()) + ' · ' + brl(numero(d.valor)) + '<br>Entrou em <b>' + esc(onde) + '</b>.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="b p" id="lz-outra">Lançar outra (mesmo destino e data)</button><button type="button" class="b" data-fechar>Pronto</button></div>';
    el.querySelector('#lz-ok').disabled = true;
    feito.querySelector('#lz-outra').addEventListener('click', function () { novaDespesa({ destino: d.destino, item: d.item, data: d.data, quemPagou: d.quemPagou, jaPaga: d.jaPaga }); });
    recentes(el);
  }

  // Últimos lançamentos feitos por aqui (db com origem 'lancar' + MGB dia a dia), com Remover.
  function listaRecentes() {
    var out = [];
    try {
      Object.keys(db).forEach(function (m) { Object.keys(db[m] || {}).forEach(function (it) { (db[m][it] || []).forEach(function (r) { // eslint-disable-line no-undef
        if (r && r.origem === 'lancar') out.push({ tipo: 'db', mod: m, item: it, lid: r.lid, desc: r.d, valor: r.u, em: r.criadoEm, onde: it }); }); }); });
    } catch (e) {}
    try { empresaAvulsas.forEach(function (a) { out.push({ tipo: 'emp', id: a.id, desc: a.desc, valor: a.valor, em: a.criadoEm, onde: 'MGB · dia a dia' }); }); } catch (e) {} // eslint-disable-line no-undef
    return out.sort(function (a, b) { return String(b.em).localeCompare(String(a.em)); }).slice(0, 8);
  }
  function recentes(el) {
    var box = el.querySelector('#lz-recentes'); if (!box) return;
    var l = listaRecentes();
    box.innerHTML = l.length ? l.map(function (x, i) {
      return '<div class="rec"><div>' + esc(x.desc) + ' · ' + brl(x.valor) + '<small>' + esc(x.onde) + (x.em ? ' · ' + new Date(x.em).toLocaleDateString('pt-BR') : '') + '</small></div>' +
        '<button type="button" class="b" data-rm="' + i + '" aria-label="Remover ' + esc(x.desc) + '">Remover</button></div>';
    }).join('') : '<p class="sub">Nada lançado por aqui ainda.</p>';
    box.querySelectorAll('[data-rm]').forEach(function (b) { b.addEventListener('click', function () { remover(l[+b.getAttribute('data-rm')]); recentes(el); }); });
  }
  function remover(x) {
    if (!x || !global.confirm('Remover "' + x.desc + '"?')) return;
    if (x.tipo === 'emp') {
      empresaAvulsas = empresaAvulsas.filter(function (a) { return a.id !== x.id; });       // eslint-disable-line no-undef
      try { delete despPagamentos._empresa.Empresa['_av_' + x.id]; } catch (e) {}           // eslint-disable-line no-undef
    } else {
      var rows = db[x.mod][x.item], i = rows.findIndex(function (r) { return r.lid === x.lid; }); // eslint-disable-line no-undef
      if (i < 0) return;
      try { applyToFin(rows[i], -1); } catch (e) {}                                          // eslint-disable-line no-undef
      rows.splice(i, 1);
      try {                                                                                   // pagamentos marcados andam junto com o índice das linhas
        var P = despPagamentos[x.mod] && despPagamentos[x.mod][x.item];                    // eslint-disable-line no-undef
        if (P) { var novo = {}; Object.keys(P).forEach(function (k) { var n = Number(k); if (isNaN(n)) novo[k] = P[k]; else if (n < i) novo[n] = P[k]; else if (n > i) novo[n - 1] = P[k]; }); despPagamentos[x.mod][x.item] = novo; } // eslint-disable-line no-undef
      } catch (e) {}
    }
    salvar();
  }

  // ── Nova receita (locuções e serviços pontuais) ────────────────────────
  function novaReceita() {
    injetarEstilos();
    var srv = 'locucao', recebida = false;
    var hoje = hojeISO().slice(0, 7);
    var cli = null, picker = null;
    var el = moldura('Nova receita',
      '<div class="duas"><main>' +
      '<section class="card"><div class="sec">1 · Que serviço?</div><div class="chips">' +
      SERVICOS_RECEITA.map(function (s) { return '<button type="button" class="chip" data-srv="' + s.id + '" aria-pressed="' + (s.id === srv) + '">' + esc(s.rotulo) + '</button>'; }).join('') + '</div>' +
      '<label class="f" for="lr-srv-txt" id="lr-srv-txt-w" hidden>Qual serviço?<input id="lr-srv-txt" placeholder="ex.: Edição de vídeo, jingle" autocomplete="off"></label>' +
      '<p class="sub">Para serviço pontual. Contratos mensais entram pelo Novo cliente, e as comissões das rádios vêm do Rádio Ops.</p></section>' +
      '<section class="card"><div class="sec">2 · Cliente</div><div id="lr-cli-box"></div></section>' +
      '<section class="card"><div class="sec">3 · Detalhes</div><div class="campos">' +
      '<label class="f" for="lr-desc">Descrição (opcional)<input id="lr-desc" placeholder="ex.: Locução spot Dia das Crianças"></label>' +
      '<label class="f" for="lr-valor">Valor (R$)<input id="lr-valor" inputmode="decimal" placeholder="0,00"></label>' +
      '<label class="f" for="lr-mes">Mês da nota (competência)<input id="lr-mes" type="month" value="' + hoje + '"></label>' +
      '</div></section>' +
      '<section class="card"><div class="sec">4 · Recebimento</div><div class="chips"><button type="button" class="chip" data-rcb="0" aria-pressed="true">A receber</button><button type="button" class="chip" data-rcb="1" aria-pressed="false">✔ Já recebido</button></div>' +
      '<p class="sub">Entra na receita do mês e no imposto (Simples). Lembre de emitir a nota.</p></section>' +
      '</main><aside><section class="card"><div class="sec">Vai entrar assim</div><div class="resumo" id="lr-resumo"></div><div class="erros" id="lr-erros" role="alert"></div>' +
      '<button type="button" class="b p" id="lr-ok">Lançar receita</button><div id="lr-feito" aria-live="polite"></div></section>' +
      '<section class="card"><div class="sec">Últimas receitas avulsas</div><div id="lr-recentes"></div></section></aside></div>');
    function marcar(attr, val) { el.querySelectorAll('[' + attr + ']').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(val))); }); }
    function dados() {
      return { servico: srv, servicoTxt: el.querySelector('#lr-srv-txt').value, cliente: cli ? cli.nome : '', clienteInfo: cli ? { cnpj: cli.cnpj || '', razao: cli.razao || '', email: cli.email || '', tel: cli.tel || '',
        responsavel: cli.responsavel || '', endereco: cli.endereco || '', origem: cli.origem, mod: cli.mod || '', item: cli.item || '', leadId: cli.leadId || null } : null,
        descricao: el.querySelector('#lr-desc').value, valor: el.querySelector('#lr-valor').value, mes: el.querySelector('#lr-mes').value, lancadoPor: quem() };
    }
    function resumo() {
      var d = dados(), s = servico(d.servico), v = numero(d.valor);
      var imp = 0; try { imp = v * impostoAliq(); } catch (e) {}                              // eslint-disable-line no-undef
      el.querySelector('#lr-resumo').innerHTML = '<b>' + esc(s.livre ? '✏️ ' + (d.servicoTxt || 'Outro serviço') : s.rotulo) + '</b>' + (d.cliente ? ' · ' + esc(d.cliente) : '') +
        (cli ? '<br><span class="hint">' + (cli.cnpj ? 'CNPJ ' + esc(cli.cnpj) + ' · pronto para a nota' : '⚠️ sem CNPJ para a nota') + '</span>' : '') +
        (v > 0 ? '<br>' + brl(v) + (d.mes ? ' em ' + fmtMes(d.mes) : '') + (imp ? '<br><span class="hint">Simples sobre ela: ' + brl(imp) + '</span>' : '') : '') +
        '<br><span class="hint">' + (recebida ? 'Já recebido' : 'A receber') + '</span>';
    }
    function lista() {
      var box = el.querySelector('#lr-recentes'), l = [];
      try { l = receitasAvulsas.slice().sort(function (a, b) { return String(b.criadoEm).localeCompare(String(a.criadoEm)); }).slice(0, 8); } catch (e) {} // eslint-disable-line no-undef
      box.innerHTML = l.length ? l.map(function (x) {
        return '<div class="rec"><div>' + esc(x.desc) + ' · ' + brl(x.valor) + '<small>' + esc(x.cliente) + ' · ' + fmtMes(x.mes) + '</small></div><button type="button" class="b" data-rm="' + x.id + '" aria-label="Remover ' + esc(x.desc) + '">Remover</button></div>';
      }).join('') : '<p class="sub">Nenhuma receita avulsa ainda.</p>';
      box.querySelectorAll('[data-rm]').forEach(function (b) { b.addEventListener('click', function () {
        var id = +b.getAttribute('data-rm'), x = receitasAvulsas.filter(function (r) { return r.id === id; })[0]; // eslint-disable-line no-undef
        if (!x || !global.confirm('Remover "' + x.desc + '"?')) return;
        receitasAvulsas = receitasAvulsas.filter(function (r) { return r.id !== id; });     // eslint-disable-line no-undef
        try { delete recPagamentos._avulsa[itemReceita(x)]; } catch (e) {}                    // eslint-disable-line no-undef
        salvar(); lista();
      }); });
    }
    el.querySelectorAll('[data-srv]').forEach(function (b) { b.addEventListener('click', function () {
      srv = b.getAttribute('data-srv'); marcar('data-srv', srv);
      var livre = !!(servico(srv) || {}).livre; el.querySelector('#lr-srv-txt-w').hidden = !livre; if (livre) el.querySelector('#lr-srv-txt').focus();
      resumo();
    }); });
    el.querySelector('#lr-srv-txt').addEventListener('input', resumo);
    picker = seletorCliente(el.querySelector('#lr-cli-box'), { rotulo: 'Cliente da nota', aoEscolher: function (c) { cli = c; resumo(); } });
    el.querySelectorAll('[data-rcb]').forEach(function (b) { b.addEventListener('click', function () { recebida = b.getAttribute('data-rcb') === '1'; marcar('data-rcb', b.getAttribute('data-rcb')); resumo(); }); });
    ['#lr-valor', '#lr-mes'].forEach(function (s) { el.querySelector(s).addEventListener('input', resumo); });
    el.querySelector('#lr-ok').addEventListener('click', function () {
      var d = dados(), erros = validarReceita(d), errEl = el.querySelector('#lr-erros');
      if (erros.length) { errEl.innerHTML = erros.map(esc).join('<br>'); return; }
      errEl.textContent = '';
      var x = receitaAvulsa(d, receitaAvulsaId++);                                            // eslint-disable-line no-undef
      receitasAvulsas.push(x);                                                                // eslint-disable-line no-undef
      try {                                                                                   // dados do tomador para a Nota avulsa (Contabilidade › Nota)
        clientesInfo._avulsa = clientesInfo._avulsa || {};                                    // eslint-disable-line no-undef
        var ci = x.clienteInfo || {};
        clientesInfo._avulsa[itemReceita(x)] = { cnpj: ci.cnpj || '', razao: ci.razao || x.cliente, fantasia: x.cliente, email: ci.email || '', tel: ci.tel || '', responsavel: ci.responsavel || '', endereco: ci.endereco || '' }; // eslint-disable-line no-undef
      } catch (e) {}
      if (recebida) {
        var k = (+x.mes.slice(0, 4)) + '-' + (+x.mes.slice(5, 7) - 1), it = itemReceita(x);
        recPagamentos._avulsa = recPagamentos._avulsa || {}; recPagamentos._avulsa[it] = recPagamentos._avulsa[it] || {}; // eslint-disable-line no-undef
        recPagamentos._avulsa[it][k] = { pago: true, obs: '' };                               // eslint-disable-line no-undef
      }
      salvar();
      el.querySelector('#lr-feito').innerHTML = '<div class="ok-box" style="margin-top:10px">✔ ' + esc(x.desc) + ' · ' + esc(x.cliente) + ' · ' + brl(x.valor) + '<br>Entrou na receita de <b>' + fmtMes(x.mes) + '</b>.</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="b p" id="lr-outra">Lançar outra</button><button type="button" class="b" data-fechar>Pronto</button></div>';
      el.querySelector('#lr-ok').disabled = true;
      el.querySelector('#lr-outra').addEventListener('click', novaReceita);
      lista();
    });
    resumo(); lista();
    picker.foco();
  }

  // ── Ficha do cliente: a jornada inteira num clique (12/10, pedido do Eder) ──
  // CRM (estágio e histórico), cadastro (CNPJ/contato), contrato, equipamento (patrimônio da etiqueta),
  // receita e despesas da unidade (inclusive custo de envio) e a linha do tempo.
  function fichaCliente(modId, item) {
    injetarEstilos();
    var mod = modulos().filter(function (m) { return m.id === modId; })[0] || { label: modId, icon: '' };
    var info = {}; try { info = (clientesInfo[modId] || {})[item] || {}; } catch (e) {}                 // eslint-disable-line no-undef
    var todos = clientesDoHub();
    var c = todos.filter(function (x) { return x.mod === modId && x.item === item; })[0] || {};
    var lead = null;
    try {
      lead = leads.filter(function (l) { return (info.leadId && l.id === info.leadId) || l.itemCriado === item; })[0] ||   // eslint-disable-line no-undef
        leads.filter(function (l) { return c.leadId && l.id === c.leadId; })[0] || null;                               // eslint-disable-line no-undef
    } catch (e) {}
    var hoje = new Date(), ano = hoje.getFullYear(), mes = hoje.getMonth();
    var contrato = {}; try { contrato = (rec[modId] || {})[item] || {}; } catch (e) {}                   // eslint-disable-line no-undef
    var receitaMes = 0; try { receitaMes = recOfMes(modId, item, ano, mes) || 0; } catch (e) {}           // eslint-disable-line no-undef
    var despMes = []; try { despMes = coletaDespesasMes(ano, mes).filter(function (d) { return d.m.id === modId && d.item === item; }); } catch (e) {} // eslint-disable-line no-undef
    var linhas = []; try { linhas = (db[modId] || {})[item] || []; } catch (e) {}                          // eslint-disable-line no-undef
    var investido = linhas.filter(function (r) { return r.t !== 'Recorrente'; }).reduce(function (a, r) { return a + (r.q || 0) * (r.u || 0); }, 0);
    var envio = linhas.filter(function (r) { return r.cat === 'envio' || /envio|frete/i.test(r.d || ''); });
    var etq = null; try { etq = (etiquetas || []).filter(function (e) { return (info.etiquetaId && e.id === info.etiquetaId) || (info.patrimonio && e.patCode === info.patrimonio); })[0] || null; } catch (e) {} // eslint-disable-line no-undef
    var custoMes = despMes.reduce(function (a, d) { return a + d.vlrMes; }, 0);
    function fim() { if (!contrato.inicio) return ''; var p = contrato.inicio.split('-').map(Number), t = p[0] * 12 + p[1] - 1 + (contrato.meses || 12) - 1; return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][t % 12] + '/' + String(Math.floor(t / 12)).slice(2); }
    var linha = function (rot, val) { return val ? '<div class="rec"><div><small>' + esc(rot) + '</small>' + val + '</div></div>' : ''; };
    var eventos = [];
    if (lead) {
      if (lead.criado) eventos.push({ em: lead.criado, t: 'Lead criado no CRM' + (lead.origem ? ' · ' + lead.origem : '') });
      (lead.historico || []).forEach(function (h) { eventos.push({ em: h.data, t: h.texto }); });
    }
    (info.jornada || []).forEach(function (j) { eventos.push({ em: new Date(j.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }), t: j.texto }); });
    if (etq) eventos.push({ em: (etq.data || '').split('-').reverse().join('/'), t: 'Etiqueta ' + etq.patCode + ' gerada para ' + (etq.franqueado || '') + (etq.destCidadeUf ? ' (' + etq.destCidadeUf + ')' : '') });
    function chave(t) {                                                     // ordena: aceita dd/mm/aaaa [hh:mm] e aaaa-mm-dd
      var m = String(t || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?:,?\s*(\d{2}):(\d{2}))?/);
      if (m) return m[3] + m[2] + m[1] + (m[4] || '00') + (m[5] || '00');
      m = String(t || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? m[1] + m[2] + m[3] + '0000' : '0';
    }
    eventos.sort(function (a, b) { return chave(a.em).localeCompare(chave(b.em)); });
    var el = moldura('Ficha · ' + item,
      '<div class="duas"><main>' +
      '<section class="card"><div class="sec">' + esc((mod.icon || '') + ' ' + String(mod.label).split('—').pop().trim()) + '</div>' +
      '<div style="font-size:20px;font-weight:700">' + esc(item) + '</div>' +
      '<div class="sub">' + esc(info.razao || c.razao || '') + (info.cnpj || c.cnpj ? ' · CNPJ ' + esc(info.cnpj || c.cnpj) : ' · sem CNPJ no cadastro') + '</div>' +
      '<div class="sub">' + esc([info.responsavel || c.responsavel, info.cargo || c.cargo].filter(Boolean).join(' · ')) + (info.tel || c.tel ? ' · ' + esc(info.tel || c.tel) : '') + (info.email || c.email ? ' · ' + esc(info.email || c.email) : '') + '</div>' +
      '</section>' +
      '<section class="card"><div class="sec">Linha do tempo</div>' +
      (eventos.length ? eventos.map(function (e) { return '<div class="rec"><div>' + esc(e.t) + '<small>' + esc(e.em || '') + '</small></div></div>'; }).join('') : '<p class="sub">Sem eventos registrados ainda. A partir de agora, CRM, contrato e envio entram aqui sozinhos.</p>') +
      '</section></main><aside>' +
      '<section class="card"><div class="sec">CRM</div>' +
      (lead ? '<div class="resumo"><b>' + esc(lead.nome) + '</b><br>Estágio: ' + esc(lead.estagio || '') + (lead.valor ? '<br>Valor estimado: ' + brl(lead.valor) + '/mês' : '') + '</div>' +
        '<button type="button" class="b p" id="fc-crm">Abrir no CRM</button>' : '<p class="sub">Não achei o lead deste cliente no CRM.</p>') +
      '</section>' +
      '<section class="card"><div class="sec">Contrato e receita</div>' +
      linha('Valor', contrato.valor ? brl(contrato.valor) + '/mês' : '') + linha('Vigência', contrato.inicio ? fmtMes(contrato.inicio.slice(0, 7)) + ' → ' + fim() + ' (' + (contrato.meses || 12) + ' meses)' : '') +
      linha('Receita deste mês', brl(receitaMes)) + '</section>' +
      '<section class="card"><div class="sec">Equipamento</div>' +
      (info.patrimonio || etq ? linha('Patrimônio', '<b>' + esc(info.patrimonio || etq.patCode) + '</b>') + linha('Player', esc(info.player || (etq && etq.player) || '')) +
        linha('Enviado para', etq ? esc([etq.destNome, etq.destCidadeUf].filter(Boolean).join(' · ')) : '') : '<p class="sub">Sem patrimônio vinculado.</p>') +
      linha('Custo de envio', envio.length ? brl(envio.reduce(function (a, r) { return a + r.q * r.u; }, 0)) : '') + '</section>' +
      '<section class="card"><div class="sec">Custos</div>' + linha('Despesas deste mês', brl(custoMes)) +
      despMes.map(function (d) { return '<div class="rec"><div>' + esc(d.r.d || '') + '<small>' + esc(d.tipoLbl || '') + '</small></div><b>' + brl(d.vlrMes) + '</b></div>'; }).join('') +
      linha('Investido (à vista e parcelado)', brl(investido)) + linha('Sobra do mês', '<b>' + brl(receitaMes - custoMes) + '</b>') + '</section>' +
      '</aside></div>');
    var b = el.querySelector('#fc-crm');
    if (b) b.addEventListener('click', function () { fechar(); try { global.goPage('leads'); setTimeout(function () { global.openLeadModal('edit', lead.id); }, 150); } catch (e) {} });
  }

  global.MGBLancar = Object.assign(api, { ficha: fichaCliente, despesa: novaDespesa, receita: novaReceita, fechar: fechar, seletorCliente: seletorCliente, clientesDoHub: clientesDoHub });
})(typeof window !== 'undefined' ? window : globalThis);
