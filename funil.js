/* Hub MGB — Funil de vendas no desenho do Hub v2 (aprovado em 23/11/2026).
 *
 * Só apresentação. O funil continua o mesmo do index.html: buildLeads, leadsFiltrados, leadChangeStage,
 * arrastar entre colunas (leadColDrop), a janela do lead (openLeadModal) e os filtros #leads-f-*.
 * Aqui: cabeçalho, faixa compacta de retornos atrasados, filtro por produto em botões, cartões no
 * desenho novo e os filtros antigos recolhidos em "Mais filtros".
 */
(function (global) {
  'use strict';
  var doc = global.document;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  var PROD = { elev: ['Tela Vertical', '#16294F', '#E7EBF3'], vaapty: ['Vaapty', '#9D174D', '#FCE7F3'], radio: ['Rádio', '#8A4B08', '#FDF2E3'], tv: ['TV Interna', '#1E40AF', '#E0E7FF'], mercadao: ['Rádio Mercadão', '#9A3412', '#FFEDD5'], condo: ['Condomínio', '#0E7490', '#CFFAFE'] };

  // ── Regras puras (testadas em bot/test/funil.test.js) ────────────────────
  function situacaoLead(l, vencido) {
    if (l.estagio === 'fechado') return (l.itemCriado && l.itemCriado !== 'None') ? { txt: 'cliente', tom: 'ok' } : { txt: 'esperando cadastro', tom: 'atencao' };
    if (l.estagio === 'perdido') return null;
    if (!l.lembrete) return { txt: 'sem retorno marcado', tom: 'neutro' };
    var dia = String(l.lembrete).slice(0, 10), d = dia.split('-').reverse().slice(0, 2).join('/');
    // 27/11 (usabilidade): retorno de hoje aparecia como "Retorno era 27/11" (atrasado) no próprio dia
    if (dia === hojeISO()) return { txt: 'Retorno hoje', tom: 'atencao' };
    return { txt: 'Retorno ' + d, tom: vencido ? 'erro' : 'neutro' };
  }
  function hojeISO() { var h = new Date(); return h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0') + '-' + String(h.getDate()).padStart(2, '0'); }
  function resumoFunil(leads) {
    var r = { total: leads.length, porProduto: {}, negociando: 0, fechados: 0 };
    leads.forEach(function (l) {
      r.porProduto[l.produto] = (r.porProduto[l.produto] || 0) + 1;
      if (l.estagio === 'negociando') r.negociando += Number(l.valor) || 0;
      if (l.estagio === 'fechado') r.fechados++;
    });
    return r;
  }
  // Cadastro (clientesInfo) do cliente que veio deste lead. O módulo nem sempre é o produto do lead:
  // lead de condomínio vira cadastro na Tela Vertical (elev), lead de rádio pode virar Mercadão. Procura
  // primeiro no módulo esperado e depois nos outros; entre vários, prefere o que tem contrato na Assinafy.
  function cadastroDoLead(l, info) {
    if (!l || !info) return null;
    var nome = (l.itemCriado && l.itemCriado !== 'None') ? l.itemCriado : l.nome;
    if (!nome) return null;
    var primeiro = l.produto === 'condo' ? 'elev' : l.produto;
    var mods = [primeiro].concat(Object.keys(info).filter(function (m) { return m !== primeiro && m.charAt(0) !== '_'; }));
    var achados = mods.map(function (m) { return info[m] && info[m][nome]; }).filter(function (x) { return x && typeof x === 'object'; });
    return achados.filter(function (x) { return x.assinadoEm || x.assinafyDocId; })[0] || achados[0] || null;
  }

  var regras = { situacaoLead: situacaoLead, resumoFunil: resumoFunil, cadastroDoLead: cadastroDoLead };
  if (typeof module !== 'undefined' && module.exports) module.exports = regras;
  if (!doc) return;

  function ler(nome, padrao) { try { var v = global.eval('typeof ' + nome + "!=='undefined'?" + nome + ':undefined'); return v === undefined ? padrao : v; } catch (e) { return padrao; } }
  function pill(p) { var x = PROD[p] || [p || '—', '#5D5868', '#EFEBF7']; return '<span class="fun2-pill" style="color:' + x[1] + ';background:' + x[2] + '">' + esc(x[0]) + '</span>'; }
  var verLista = false;

  // Ícones de linha do Design System (situação vira chip com ícone + palavra, nunca só cor)
  var ICO_SIT = {
    erro: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    atencao: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>'
  };
  // Cartão novo (substitui leadCardHtml; mesmos gatilhos de arrastar e abrir)
  function cartao(l) {
    var venc = false; try { venc = global.leadLembreteVencido(l); } catch (e) {}
    var s = situacaoLead(l, venc);
    var avisos = '';
    try {
      var inf = l.estagio === 'fechado' ? cadastroDoLead(l, ler('clientesInfo', {})) : null;
      if (inf && inf.assinadoEm) avisos += '<span class="fun2-av fun2-ok">Contrato assinado em ' + new Date(inf.assinadoEm).toLocaleDateString('pt-BR') + '</span>';
      else if (inf && inf.assinafyDocId) avisos += '<span class="fun2-av">Aguardando assinatura</span>';
    } catch (e) {}
    if (l.estagio === 'fechado' && !String(l.email || '').trim()) avisos += '<span class="fun2-av fun2-erro">Sem e-mail: o contrato não pode ser enviado</span>';
    try { if (l.estagio === 'fechado' && l.produto !== 'condo' && (l.criado || '') >= '2026-11-03' && !global.leadFiscalCompleto(l)) avisos += '<span class="fun2-av fun2-erro">Endereço da nota incompleto</span>'; } catch (e) {}
    var etapas = (ler('LEAD_STAGES', []) || []).map(function (st) { return '<option value="' + st.id + '"' + (st.id === l.estagio ? ' selected' : '') + '>' + esc(String(st.label).replace(/\s*[✅❌]/g, '')) + '</option>'; }).join('');
    var tel = String(l.tel || '').replace(/\D/g, '');
    // Próxima etapa (27/11): fechado sem cadastro → Novo cliente já com este lead; cadastrado → ficha do cliente
    var prox = '';
    if (l.estagio === 'fechado' && (l.produto !== 'condo' || (s && s.txt === 'esperando cadastro'))) prox = s && s.txt === 'esperando cadastro'
      ? '<button type="button" class="fun2-prox" onclick="event.stopPropagation();MGBNovo.abrirLead(' + l.id + ')">Cadastrar cliente</button>'
      : l.produto === 'radioops' ? '<button type="button" class="fun2-prox fun2-prox2" onclick="event.stopPropagation();goPage(\'radioops\')">Abrir Rádio Ops</button>'
      : '<button type="button" class="fun2-prox fun2-prox2" onclick="event.stopPropagation();MGBClientes.abrirPorNome(' + esc(JSON.stringify(String(l.itemCriado || l.nome))) + ')">Ver ficha</button>';
    return '<div class="lead-card fun2-card' + (venc ? ' overdue' : '') + '" draggable="true" ondragstart="leadCardDragStart(event,' + l.id + ')" ondragend="leadCardDragEnd(event)" ' +
      'onclick="if(!event.target.closest(\'select,a\')) openLeadModal(\'edit\',' + l.id + ')" tabindex="0" role="button" aria-label="Abrir ' + esc(l.nome) + '">' +
      '<b class="fun2-nome">' + esc(l.nome) + '</b>' +
      (l.responsavel ? '<span class="fun2-resp">' + esc(l.responsavel) + (l.funcao ? ' · ' + esc(l.funcao) : '') + '</span>' : '') +
      '<div class="fun2-linha">' + pill(l.produto) + '<span class="fun2-valor">' + (l.valor ? brl(l.valor) : '—') + (l.formaPg === 'permuta' ? ' · permuta' : '') + '</span></div>' +
      (s ? '<span class="fun2-sit fun2-' + s.tom + '">' + (ICO_SIT[s.tom] || '') + esc(s.tom === 'erro' ? s.txt.replace(/^Retorno /, 'Retorno era ') : s.txt) + (l.lembrete && String(l.lembrete).indexOf('T') > 0 && s.txt.indexOf('Retorno') === 0 ? ' às ' + esc(String(l.lembrete).slice(11, 16)) : '') + '</span>' : '') +
      avisos + prox +
      '<div class="fun2-acoes"><label class="fun2-oculto" for="fun2-st-' + l.id + '">Mover ' + esc(l.nome) + '</label><select id="fun2-st-' + l.id + '" class="fun2-mover" onclick="event.stopPropagation()" onchange="leadChangeStage(' + l.id + ',this.value)">' + etapas + '</select>' +
      (tel ? '<a class="fun2-wa" href="https://wa.me/55' + tel + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">WhatsApp</a>' : '') + '</div></div>';
  }

  function decorar() {
    var pg = doc.getElementById('page-leads');
    if (!pg) return;
    pg.classList.add('fun2');
    var titulo = pg.querySelector('.page-title'), sub = pg.querySelector('.page-sub');
    if (titulo) titulo.textContent = 'Funil de vendas';
    if (sub) sub.textContent = 'Do primeiro contato até o contrato assinado';
    var novo = pg.querySelector('.page-hdr button[onclick*="openLeadModal"]');
    if (novo) { novo.className = 'fun2-btn'; novo.textContent = 'Novo lead'; novo.removeAttribute('style'); }
    var planilha = doc.getElementById('leads-sheet-link');
    if (planilha) { planilha.className = 'fun2-btn2'; planilha.textContent = 'Abrir planilha'; }

    var todos = ler('leads', []) || [];
    var R = resumoFunil(todos);
    var prodSel = doc.getElementById('leads-f-prod'), atual = prodSel ? prodSel.value : '';
    var barra = doc.getElementById('fun2-barra');
    if (!barra) {
      barra = doc.createElement('div'); barra.id = 'fun2-barra';
      var filtros = doc.getElementById('leads-filtros');
      filtros.parentNode.insertBefore(barra, filtros);
      barra.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-fun2]'); if (!b) return;
        var a = b.getAttribute('data-fun2');
        if (a === 'mais') { pg.classList.toggle('fun2-filtros-abertos'); b.setAttribute('aria-expanded', String(pg.classList.contains('fun2-filtros-abertos'))); return; }
        if (prodSel) { prodSel.value = a === 'todos' ? '' : a.slice(5); global.buildLeads(); }
      });
    }
    var chips = [['todos', 'Todos', R.total]].concat(Object.keys(R.porProduto).sort(function (a, b) { return R.porProduto[b] - R.porProduto[a]; }).map(function (p) { return ['prod:' + p, (PROD[p] || [p])[0], R.porProduto[p]]; }));
    barra.innerHTML = chips.map(function (c) {
      var on = c[0] === 'todos' ? !atual : c[0] === 'prod:' + atual;
      return '<button type="button" class="fun2-chip' + (on ? ' fun2-on' : '') + '" aria-pressed="' + on + '" data-fun2="' + esc(c[0]) + '">' + esc(c[1]) + ' · ' + c[2] + '</button>';
    }).join('') +
      '<button type="button" class="fun2-chip fun2-mais" data-fun2="mais" aria-expanded="' + pg.classList.contains('fun2-filtros-abertos') + '">Mais filtros</button>' +
      '<span class="fun2-resumo">Em negociação: R$ ' + brl(R.negociando) + '/mês · fechados: ' + R.fechados + '</span>';

    // Retornos atrasados: faixa compacta com a lista recolhida
    var hoje = doc.getElementById('leads-hoje');
    if (hoje) {
      var pend = []; try { pend = global.leadsPendentes(); } catch (e) {}
      if (!pend.length) hoje.innerHTML = '';
      else {
        var datas = pend.map(function (l) { return String(l.lembrete || '').slice(0, 10); }).filter(Boolean).sort();
        var antigo = datas.length ? datas[0].split('-').reverse().slice(0, 2).join('/') : '';
        var hj = hojeISO(), nHoje = datas.filter(function (x) { return x === hj; }).length, nAtr = pend.length - nHoje;
        var titulo = [nHoje ? nHoje + (nHoje === 1 ? ' retorno para hoje' : ' retornos para hoje') : '', nAtr ? nAtr + (nAtr === 1 ? ' atrasado' : ' atrasados') + (antigo && antigo !== hj.split('-').reverse().slice(0, 2).join('/') ? ' (o mais antigo é de ' + antigo + ')' : '') : ''].filter(Boolean).join(' · ');
        hoje.innerHTML = '<section class="fun2-retornos"><div class="fun2-ret-cab"><b>' + titulo + '</b>' +
          '<button type="button" class="fun2-btn" id="fun2-ver-lista" aria-expanded="' + verLista + '">' + (verLista ? 'Esconder a lista' : 'Ver a lista de retornos') + '</button></div>' +
          (verLista ? '<ul>' + pend.map(function (l) {
            var tel = String(l.tel || '').replace(/\D/g, ''), q = ''; try { q = global.leadFmtLembrete(l); } catch (e) {}
            return '<li><span class="fun2-ret-nome">' + esc(l.nome) + '</span>' + pill(l.produto) + '<span class="fun2-ret-data">' + esc(q) + '</span>' +
              (tel ? '<a class="fun2-btn2" href="https://wa.me/55' + tel + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
              '<button type="button" class="fun2-btn2" onclick="openLeadModal(\'edit\',' + l.id + ')">Abrir</button></li>';
          }).join('') + '</ul>' : '') + '</section>';
        var b = doc.getElementById('fun2-ver-lista');
        if (b) b.addEventListener('click', function () { verLista = !verLista; decorar(); });
      }
    }
    // Rótulos das colunas sem emoji e com o total da coluna
    pg.querySelectorAll('.lead-col-hdr').forEach(function (h) {
      Array.prototype.forEach.call(h.childNodes, function (n) { if (n.nodeType === 3) n.textContent = n.textContent.replace(/\s*[✅❌]/g, ''); });
    });
  }

  function estilos() {
    if (doc.getElementById('fun2-css')) return;
    var s = doc.createElement('style');
    s.id = 'fun2-css';
    s.textContent =
      '#page-leads.fun2{font-family:"DM Sans",system-ui,sans-serif;color:#241A38}' +
      '#page-leads.fun2 #leads-filtros,#page-leads.fun2 #leads-filtros+div{display:none!important}' +
      '#page-leads.fun2.fun2-filtros-abertos #leads-filtros{display:flex!important;padding:4px 28px 10px!important}' +
      '#page-leads.fun2.fun2-filtros-abertos #leads-filtros+div{display:block!important;padding:0 28px 6px!important}' +
      '.fun2-btn,.fun2-btn2{min-height:44px;padding:0 16px;border-radius:10px;font:700 14px "DM Sans",system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;white-space:nowrap;box-sizing:border-box}' +
      '.fun2-btn{border:0;background:#4E38B2;color:#fff}.fun2-btn:hover{background:#2A1760}.fun2-btn2{border:1px solid #CFC7E6;background:#fff;color:#2A1760;font-weight:600}.fun2-btn2:hover{background:#ECE8FA}' +
      '#fun2-barra{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 28px 4px}' +
      '.fun2-chip{min-height:40px;padding:0 14px;border:1px solid #CFC7E6;border-radius:999px;background:#fff;color:#3A3446;font:600 14px "DM Sans",system-ui,sans-serif;cursor:pointer}' +
      '.fun2-chip.fun2-on{background:#4E38B2;border-color:#4E38B2;color:#fff}.fun2-mais{border-style:dashed}' +
      '.fun2-resumo{margin-left:auto;font-size:14px;color:#5D5868}' +
      '#page-leads.fun2 #leads-hoje{margin:12px 28px!important}' +
      '.fun2-retornos{background:#FDECEA;border-radius:14px;padding:12px 16px;display:flex;flex-direction:column;gap:8px}' +
      '.fun2-ret-cab{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.fun2-ret-cab b{flex:1 1 300px;color:#7A1A12;font-size:16px}' +
      '.fun2-retornos ul{list-style:none;margin:0;padding:0;background:#fff;border-radius:12px}' +
      '.fun2-retornos li{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid #F6E3E1}.fun2-retornos li:first-child{border-top:0}' +
      '.fun2-ret-nome{flex:1 1 220px;font-weight:600;font-size:15px}.fun2-ret-data{font-size:13.5px;color:#B42318;min-width:130px}.fun2-retornos li .fun2-btn2{min-height:36px}' +
      '#page-leads.fun2 .leads-board{padding:8px 28px 28px!important;gap:10px!important;display:flex!important;overflow-x:auto!important;max-width:100%;box-sizing:border-box;position:relative}' +
      '#page-leads.fun2{min-width:0;max-width:100%;overflow-x:hidden}' +
      '#page-leads.fun2 .lead-col{flex:1 1 0!important;min-width:190px!important;background:#EFEBF7!important;border:0!important;border-radius:14px!important;padding:12px!important}' +
      '#page-leads.fun2 .lead-col.drag-over{outline:2px dashed #4E38B2;outline-offset:-2px}' +
      '#page-leads.fun2 .lead-col-hdr{font-size:15px!important;font-weight:700!important;padding:0 2px 10px!important;color:#241A38!important}' +
      '#page-leads.fun2 .lead-col-count{margin-left:auto;font-size:13px!important;color:#5D5868!important;background:none!important;font-weight:600}' +
      '#page-leads.fun2 .lead-col>div[title]{font-size:13px!important;color:#5D5868!important;margin:-4px 2px 10px!important;font-weight:600!important}' +
      '.fun2-card{background:#fff!important;border:1px solid #E4DFF0!important;border-radius:12px!important;padding:12px!important;margin-bottom:8px!important;display:flex;flex-direction:column;gap:6px;box-shadow:none!important}' +
      '.fun2-card:hover{border-color:#CFC7E6!important}.fun2-card:focus-visible{outline:3px solid #6C55DB;outline-offset:2px}' +
      '.fun2-card.overdue{box-shadow:none!important}' +
      '.fun2-nome{font-size:14.5px;line-height:1.25}.fun2-resp{font-size:12.5px;color:#5D5868}' +
      '.fun2-linha{display:flex;justify-content:space-between;align-items:center;gap:6px}.fun2-valor{font:13px "DM Mono",ui-monospace,monospace;white-space:nowrap}' +
      '.fun2-pill{display:inline-block;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}' +
      '.fun2-sit{font-size:12.5px;font-weight:600;color:#5D5868}' +
      '.fun2-sit.fun2-erro,.fun2-sit.fun2-atencao,.fun2-sit.fun2-ok{align-self:flex-start;display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;line-height:16px}' +
      '.fun2-sit svg{width:14px;height:14px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
      '.fun2-sit.fun2-erro{color:#B42318;background:#FDECEA}.fun2-sit.fun2-atencao{color:#8A4B08;background:#FDF2E3}.fun2-sit.fun2-ok{color:#15803D;background:#E8F6EE}' +
      '.fun2-av{font-size:12px;color:#5D5868}.fun2-av.fun2-ok{color:#15803D;font-weight:600}.fun2-av.fun2-erro{color:#B42318;font-weight:600}' +
      '.fun2-acoes{display:flex;gap:6px;align-items:center;margin-top:2px}' +
      '.fun2-mover{flex:1;min-width:0;height:32px!important;min-height:32px!important;padding:0 6px!important;font-size:12.5px!important;border:1px solid #E4DFF0!important;border-radius:8px!important;color:#5D5868!important;background:#fff!important}' +
      '.fun2-wa{font-size:12.5px;font-weight:600;color:#15803D;text-decoration:none;padding:6px 8px;border-radius:8px}.fun2-wa:hover{background:#E8F6EE}' +
      '.fun2-prox{display:block;width:100%;margin-top:8px;min-height:34px;border:0;border-radius:8px;background:#4E38B2;color:#fff;font:700 13px "DM Sans",system-ui,sans-serif;cursor:pointer}' +
      '.fun2-prox2{background:#fff;color:#4E38B2;border:1px solid #CFC7E6}.fun2-prox:focus-visible{outline:2px solid #2A1760;outline-offset:2px}' +
      '.fun2-oculto{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}' +
      // 27/11 (usabilidade): o seletor de etapa ficava invisível até passar o mouse; agora fica sempre à vista

      '@media (max-width:760px){#fun2-barra,#page-leads.fun2 #leads-hoje{padding-left:16px;padding-right:16px;margin-left:0!important;margin-right:0!important}#page-leads.fun2 .leads-board{padding:8px 16px 24px!important}.fun2-resumo{margin-left:0;width:100%}}';
    doc.head.appendChild(s);
  }

  function ligar() {
    estilos();
    if (typeof global.leadCardHtml === 'function' && !global.leadCardHtml.__v2) { cartao.__v2 = true; global.leadCardHtml = cartao; }
    var b = global.buildLeads;
    if (typeof b === 'function' && !b.__v2) {
      var nb = function () { var r = b.apply(this, arguments); try { decorar(); } catch (e) { console.error('funil:', e); } return r; };
      nb.__v2 = true; global.buildLeads = nb;
    }
    doc.addEventListener('keydown', function (ev) { var t = ev.target; if (ev.key === 'Enter' && t && t.classList && t.classList.contains('fun2-card')) t.click(); });
  }

  global.MGBFunil = regras;
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
