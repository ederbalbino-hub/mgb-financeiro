/* Hub MGB — correções de usabilidade aprovadas pelo Diego em 27/11/2026 (teste tela a tela, Karen e Eder).
 *
 * Carregado por último. Só embrulha funções que já existem no index.html e nos módulos, sem mudar regra:
 *  - aviso de "salvo" visível em qualquer tela (antes ficava no pé do menu, 10 px, fora da tela no celular);
 *  - global.mgbAcao(texto): registra a ação (log no banco, via log.js) e usa o texto no aviso de salvo;
 *  - confirmação antes de remover anunciante e despesa compartilhada (antes apagava direto);
 *  - Funil: o Salvar grava junto a anotação digitada (antes ela se perdia sem aviso);
 *  - celular do Eder: a barra de baixo troca "Caixa" por "Funil".
 * As demais correções de cada tela ficam nos módulos delas (faturamento.js, financeiro.js, clientes.js…).
 */
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc) return;

  function brl(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function papel() { try { var u = global.MGBAcesso && global.MGBAcesso.usuario && global.MGBAcesso.usuario(); return (u && u.papel) || ''; } catch (e) { return ''; } }
  global.mgbBRL = brl;

  // Valor digitado do jeito brasileiro: "1.500,50", "85,5", "85.50" → número (NaN se não for número).
  function numBR(t) {
    t = String(t == null ? '' : t).trim().replace(/^R\$\s*/i, '');
    if (!t) return NaN;
    if (t.indexOf(',') !== -1) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    var n = Number(t);
    return isFinite(n) ? n : NaN;
  }
  global.mgbNumBR = numBR;

  // ── Aviso de "salvo" ─────────────────────────────────────────────────────
  var ultimaAcao = '';
  global.mgbAcao = function (texto) {
    texto = String(texto || '').trim();
    if (!texto) return;
    ultimaAcao = texto;
    try { if (typeof global.mgbLog === 'function') global.mgbLog(texto); } catch (e) {}
  };

  function estilos() {
    if (doc.getElementById('usab-css')) return;
    var s = doc.createElement('style');
    s.id = 'usab-css';
    s.textContent =
      '#usab-salvo{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translate(-50%,12px);z-index:10050;' +
        'display:flex;align-items:center;gap:10px;max-width:min(560px,calc(100vw - 32px));padding:11px 16px;border-radius:12px;' +
        'background:#241A38;color:#fff;font:600 14px/1.35 Inter,"DM Sans",system-ui,sans-serif;box-shadow:0 8px 24px rgba(20,10,40,.25);' +
        'opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}' +
      '#usab-salvo.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}' +
      '#usab-salvo.ok{background:#14532D}#usab-salvo.erro{background:#9F1D1D}' +
      '#usab-salvo button{font:inherit;font-size:13px;background:rgba(255,255,255,.16);color:#fff;border:0;border-radius:8px;padding:8px 12px;min-height:36px;cursor:pointer;white-space:nowrap}' +
      '#usab-salvo span{overflow:hidden;text-overflow:ellipsis}' +
      '@media (max-width:760px){#usab-salvo{bottom:calc(76px + env(safe-area-inset-bottom,0px))}}' +
      '@media (prefers-reduced-motion:reduce){#usab-salvo{transition:none}}' +
      // Tela Vertical › Investimento e despesas: no celular o formulário estourava a largura (551 px) e cortava o botão
      '@media (max-width:760px){#acc-hdr-einvest,#acc-hdr-einvest>div{flex-wrap:wrap;gap:8px!important}' +
        '#einvest-form .anunc-form-row{flex-wrap:wrap}#einvest-form .anunc-form-field{width:100%!important;min-width:0!important;flex:1 1 100%!important}' +
        '#einvest-form .anunc-form-inp{width:100%!important;min-height:44px;font-size:16px}#elev-invest-section{max-width:100%;overflow-x:hidden}}' +
      // Visão Receita: botão "Recebi" no lugar do link de 9 px, busca e filtro
      '.usab-recebi{font:600 13px/1.2 Inter,"DM Sans",system-ui,sans-serif;margin:4px 0 0 6px;padding:7px 12px;min-height:34px;border-radius:8px;cursor:pointer;' +
        'background:#EEEAFB;color:#3E2B9E;border:1px solid #CFC5F3;white-space:nowrap}.usab-recebi:hover{background:#E2DBFA}' +
      '.usab-recebi.desfazer{background:transparent;color:#625A75;border-color:#DDD8E8;font-weight:500}' +
      '.usab-filtro{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 18px;border-bottom:1px solid var(--border,#E4DFF0)}' +
      '.usab-filtro input{flex:1 1 200px;min-width:0;font:14px Inter,"DM Sans",system-ui,sans-serif;padding:9px 12px;min-height:40px;border:1px solid #CFC7E6;border-radius:10px;background:#fff;color:#241A38}' +
      '.usab-filtro button{font:600 13px Inter,"DM Sans",system-ui,sans-serif;padding:8px 12px;min-height:40px;border-radius:999px;border:1px solid #CFC7E6;background:#fff;color:#3B3350;cursor:pointer}' +
      '.usab-filtro button[aria-pressed="true"]{background:#4E38B2;border-color:#4E38B2;color:#fff}' +
      // celular: o selo da pessoa e o botão Zuma cobriam o conteúdo; viram só bolinhas no canto
      '@media (max-width:768px){#mgb-pill>button>span:not(.av){display:none}#mgb-pill>button{padding:4px!important;min-height:0!important}' +
        '#mgb-ass-btn{font-size:0!important;width:48px;height:48px;padding:0!important;border-radius:50%!important}#mgb-ass-btn::before{content:"💬";font-size:20px}' +
        '.fin2-conta>input[type=checkbox]{width:26px;height:26px}}' +
      '@media (max-width:760px){.usab-recebi{min-height:44px;margin:6px 0 0;display:inline-block;max-width:100%;white-space:normal}}';
    (doc.head || doc.body).appendChild(s);
  }

  var caixa, tempo, salvando = false, mexeuEm = 0;
  ['pointerdown', 'keydown', 'change'].forEach(function (ev) { doc.addEventListener(ev, function () { mexeuEm = Date.now(); }, true); });
  function mexeuAgora() { return Date.now() - mexeuEm < 90000; } // salvamento automático da carga (migrações) não mostra aviso
  function mostrar(tipo, texto, botao) {
    estilos();
    if (!caixa) {
      caixa = doc.createElement('div');
      caixa.id = 'usab-salvo';
      caixa.setAttribute('role', 'status');
      caixa.setAttribute('aria-live', 'polite');
      doc.body.appendChild(caixa);
    }
    caixa.className = 'on ' + tipo;
    caixa.innerHTML = '<span></span>';
    caixa.firstChild.textContent = texto;
    if (botao) {
      var b = doc.createElement('button');
      b.type = 'button'; b.textContent = botao.rotulo;
      b.addEventListener('click', botao.acao);
      caixa.appendChild(b);
    }
    clearTimeout(tempo);
    if (tipo !== 'erro' && tipo !== 'salvando') tempo = setTimeout(esconder, tipo === 'aviso' ? 6000 : 3000);
  }
  function esconder() { if (caixa) caixa.className = ''; }
  var avisoAte = 0; // aviso com "Desfazer" na tela: o "Salvo" entra nele em vez de tomar o lugar
  global.mgbAviso = function (texto, botao) { mostrar('aviso', texto, botao); avisoAte = Date.now() + 6000; };
  function avisoAberto() { return Date.now() < avisoAte && caixa && /\baviso\b/.test(caixa.className); }

  function embrulharSync() {
    var orig = global.setSyncStatus;
    if (typeof orig !== 'function' || orig.__usab) return;
    var novo = function (s, msg) {
      var r = orig.apply(this, arguments);
      try {
        if (s === 'saving' && !mexeuAgora() && !ultimaAcao) {
          salvando = false;
        } else if (s === 'saving') {
          // só mostra "Salvando…" se demorar; salvamento rápido aparece direto como "Salvo"
          salvando = true;
          if (avisoAberto()) return r;
          clearTimeout(tempo);
          tempo = setTimeout(function () { if (salvando && !avisoAberto()) mostrar('salvando', 'Salvando…'); }, 700);
        } else if (s === 'saved' && salvando && avisoAberto()) {
          salvando = false; ultimaAcao = '';
          var sp = caixa.firstChild; if (sp && !/salvo/.test(sp.textContent)) sp.textContent += ' · ✓ salvo';
        } else if (s === 'saved' && salvando) {
          salvando = false;
          var hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          mostrar('ok', '✓ Salvo' + (ultimaAcao ? ': ' + ultimaAcao : '') + ' · ' + hora);
          ultimaAcao = '';
        } else if (s === 'error') {
          salvando = false;
          var t = String(msg || '').replace(/^⚠\s*/, '');
          mostrar('erro', '⚠ ' + (t || 'Não salvei.'), typeof global.saveToSheets === 'function' && !/não carregados/i.test(t)
            ? { rotulo: 'Tentar agora', acao: function () { esconder(); try { global.saveToSheets(); } catch (e) {} } }
            : { rotulo: 'Recarregar', acao: function () { global.location.reload(); } });
        } else if (s === 'idle' && caixa && /\bsalvando\b/.test(caixa.className)) {
          salvando = false; esconder(); // nada mudou: não chegou a ir à rede
        }
      } catch (e) {}
      return r;
    };
    novo.__usab = true;
    global.setSyncStatus = novo;
  }

  // ── Confirmação antes de remover ─────────────────────────────────────────
  // listas que o index.html declara com let (ficam no escopo global, mas não em window)
  function lista(nome) {
    try {
      if (nome === 'anunciantes') return anunciantes || [];
      if (nome === 'despesasComp') return despesasComp || [];
      if (nome === 'leads') return leads || [];
    } catch (e) {}
    return [];
  }
  function embrulharRemover(nomeFn, nomeLista, pergunta, acao) {
    var orig = global[nomeFn];
    if (typeof orig !== 'function' || orig.__usab) return;
    var novo = function (id) {
      var x = lista(nomeLista).find(function (a) { return a.id === id; });
      if (x && !global.confirm(pergunta(x))) return;
      if (x) global.mgbAcao(acao(x));
      return orig.apply(this, arguments);
    };
    novo.__usab = true;
    global[nomeFn] = novo;
  }

  // ── Funil: o Salvar leva junto a anotação digitada ───────────────────────
  function embrulharLead() {
    var orig = global.saveLeadModal;
    if (typeof orig !== 'function' || orig.__usab) return;
    var novo = function () {
      var inp = doc.getElementById('lead-nota');
      var texto = inp ? inp.value.trim() : '';
      var idAntes = null;
      try { idAntes = curLeadId; } catch (e) {} // let global do index.html
      if (texto && idAntes != null && typeof global.addLeadNota === 'function') { global.addLeadNota(); texto = ''; }
      var nAntes = lista('leads').length;
      var r = orig.apply(this, arguments);
      // lead novo: a nota digitada entra no histórico do lead que acabou de ser criado
      if (texto) {
        var ls = lista('leads');
        if (ls.length > nAntes) {
          var l = ls[ls.length - 1], agora = new Date();
          (l.historico = l.historico || []).push({ data: agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), texto: texto });
          if (inp) inp.value = '';
          try { global.scheduleSave(); } catch (e) {}
        }
      }
      return r;
    };
    novo.__usab = true;
    global.saveLeadModal = novo;
  }

  // ── Funil: "Perdido" pede o motivo; mudar de etapa mostra o que fez e deixa desfazer ──
  var ROT_ETAPA = { novo: 'Novo', contatado: 'Contatado', negociando: 'Negociando', fechado: 'Fechado', perdido: 'Perdido' };
  function embrulharEtapa() {
    var orig = global.leadChangeStage;
    if (typeof orig !== 'function' || orig.__usab) return;
    var novo = function (id, etapa) {
      var l = lista('leads').find(function (x) { return x.id === id; });
      if (!l || l.estagio === etapa) return orig.apply(this, arguments);
      var antes = l.estagio, motivo = '';
      if (etapa === 'perdido') {
        motivo = global.prompt('Por que "' + l.nome + '" foi perdido?\n(ex.: achou caro, fechou com outro, não respondeu)', '');
        if (motivo === null) { try { global.buildLeads(); } catch (e) {} return; } // cancelou: continua onde estava
      }
      var r = orig.apply(this, arguments);
      if (l.estagio !== etapa) return r; // a regra do hub barrou (ex.: fechar sem dados da nota)
      if (motivo && motivo.trim()) {
        var agora = new Date();
        (l.historico = l.historico || []).push({ data: agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), texto: 'Motivo da perda: ' + motivo.trim().slice(0, 300) });
        try { global.scheduleSave(); } catch (e) {}
      }
      global.mgbAcao(l.nome + ': ' + (ROT_ETAPA[antes] || antes) + ' → ' + (ROT_ETAPA[etapa] || etapa));
      if (etapa !== 'fechado') global.mgbAviso(l.nome + ' foi para "' + (ROT_ETAPA[etapa] || etapa) + '"', { rotulo: 'Desfazer', acao: function () { orig(id, antes); try { global.buildLeads(); } catch (e) {} } });
      return r;
    };
    novo.__usab = true;
    global.leadChangeStage = novo;
  }

  // ── Celular do Eder: Funil no lugar do Caixa ─────────────────────────────
  var ICO_FUNIL = '<svg class="t2-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/></svg>';
  function barraEder() {
    var b = doc.getElementById('mbn-pes');
    if (!b || papel() !== 'admin' || b.getAttribute('data-usab') === 'funil') return;
    b.setAttribute('data-usab', 'funil');
    b.setAttribute('onclick', "goPage('leads')");
    var ic = b.querySelector('.mbn-icon'), lb = b.querySelector('.mbn-lbl');
    if (ic) ic.innerHTML = ICO_FUNIL;
    if (lb) lb.textContent = 'Funil';
  }

  // ── Visão Receita: busca e filtro "falta receber" ────────────────────────
  var filtroRec = { texto: '', modo: 'todos' };
  function aplicarFiltroRec() {
    var corpo = doc.getElementById('lanc-rec-body'); if (!corpo) return;
    var vis = 0;
    Array.prototype.forEach.call(corpo.querySelectorAll('tr[data-pago]'), function (tr) {
      var ok = (!filtroRec.texto || (tr.getAttribute('data-busca') || '').indexOf(filtroRec.texto) !== -1) &&
        (filtroRec.modo === 'todos' || (filtroRec.modo === 'falta') === (tr.getAttribute('data-pago') === '0'));
      tr.style.display = ok ? '' : 'none';
      if (ok) vis++;
    });
    var vazio = doc.getElementById('usab-rec-vazio');
    if (vazio) vazio.hidden = vis > 0;
  }
  function barraRec() {
    var corpo = doc.getElementById('lanc-rec-body'); if (!corpo) return;
    var tabela = corpo.closest('table'), caixaTab = tabela && tabela.parentNode;
    if (!caixaTab) return;
    var linhas = corpo.querySelectorAll('tr[data-pago]');
    var falta = Array.prototype.filter.call(linhas, function (t) { return t.getAttribute('data-pago') === '0'; }).length;
    var barra = doc.getElementById('usab-rec-filtro');
    if (!barra) {
      barra = doc.createElement('div');
      barra.id = 'usab-rec-filtro'; barra.className = 'usab-filtro';
      barra.innerHTML = '<input type="search" id="usab-rec-busca" placeholder="Buscar cliente" aria-label="Buscar cliente">' +
        '<div role="group" aria-label="Mostrar" style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" data-m="falta"></button><button type="button" data-m="recebidos"></button><button type="button" data-m="todos">Todos</button></div>' +
        '<p id="usab-rec-vazio" hidden style="flex-basis:100%;margin:0;color:#625A75;font-size:14px">Nenhum cliente com esse nome neste filtro.</p>';
      caixaTab.parentNode.insertBefore(barra, caixaTab);
      barra.querySelector('input').addEventListener('input', function () { filtroRec.texto = this.value.trim().toLowerCase(); aplicarFiltroRec(); });
      barra.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-m]'); if (!b) return;
        filtroRec.modo = b.getAttribute('data-m'); barraRec();
      });
    }
    var bs = barra.querySelectorAll('button[data-m]');
    bs[0].textContent = 'Falta receber · ' + falta; bs[1].textContent = 'Recebidos · ' + (linhas.length - falta);
    Array.prototype.forEach.call(bs, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-m') === filtroRec.modo)); });
    aplicarFiltroRec();
  }
  function embrulharReceita() {
    var orig = global.buildLancRec;
    if (typeof orig === 'function' && !orig.__usab) {
      var novo = function () { var r = orig.apply(this, arguments); try { barraRec(); } catch (e) {} return r; };
      novo.__usab = true; global.buildLancRec = novo;
    }
    var baixa = global.recBaixaManual;
    if (typeof baixa === 'function' && !baixa.__usab) {
      var nb = function (modId, item, key) {
        var antes = null;
        try { antes = JSON.stringify(((recPagamentos[modId] || {})[item] || {})[key] || null); } catch (e) {}
        var r = baixa.apply(this, arguments);
        try {
          var pg = ((recPagamentos[modId] || {})[item] || {})[key] || {};
          if (JSON.stringify(pg) !== antes) {
            var p = String(key).split('-'), mes = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+p[1]] || '';
            global.mgbAcao((pg.pago ? 'Baixa manual de ' : 'Desfez a baixa manual de ') + item + (mes ? ' (' + mes + '/' + p[0] + ')' : ''));
          }
        } catch (e) {}
        return r;
      };
      nb.__usab = true; global.recBaixaManual = nb;
    }
  }

  function ligar() {
    estilos();
    embrulharReceita();
    embrulharSync();
    embrulharRemover('delAnunc', 'anunciantes',
      function (a) { return 'Remover o anunciante "' + a.nome + '" (' + brl(a.valor) + '/mês)?\n\nA receita dele sai dos meses seguintes da Tela Vertical.'; },
      function (a) { return 'Removeu o anunciante ' + a.nome; });
    embrulharRemover('delDespComp', 'despesasComp',
      function (d) { return 'Remover a despesa "' + d.nome + '" (' + brl(d.valor) + '/mês)?\n\nEla sai das contas de todos os condomínios.'; },
      function (d) { return 'Removeu a despesa compartilhada ' + d.nome; });
    embrulharLead();
    embrulharEtapa();
    barraEder();
    setInterval(barraEder, 2000); // o perfil chega depois do login conferido no servidor
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
