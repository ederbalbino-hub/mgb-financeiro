/* Hub MGB — menu lateral no desenho aprovado em 18/11/2026 (canvas "Hub MGB — proposta visual").
 *
 * Uma lista curta de áreas (Início, Faturamento, Financeiro, Clientes e contratos, Tela Vertical, Comercial,
 * Rádio Moinho, Ferramentas). Área com uma página só vira um item direto; área com várias abre e fecha.
 * Quem vê o quê continua no acesso.js (data-mgb-bloq); este arquivo só reorganiza e estiliza.
 * A conta do usuário (nome, Ver como, Sair) desce para o pé do menu no computador.
 */
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc) return;
  var K_ABERTOS = 'mgb_menu_abertos';
  var NOMES = { 'nav-contratos': 'Clientes e contratos', 'nav-telavertical': 'Tela Vertical', 'nav-radioops': 'Rádio Moinho' };
  var ICONES = {
    'Faturamento': '<path d="M6 3h9l3 3v15H6z"/><path d="M9 11h6M9 15h6"/>',
    'Financeiro': '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    'Comercial': '<path d="M3 11l18-8-8 18-2-8z"/>',
    'Ferramentas': '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    'Clientes e contratos': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 11h6M19 8v6"/>',
    'Rádio Moinho': '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l10-5M16 14h.01M8 14h4"/>',
    'Tela Vertical': '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  };

  function ler() { try { return JSON.parse(global.localStorage.getItem(K_ABERTOS) || '{}') || {}; } catch (e) { return {}; } }
  function gravar(o) { try { global.localStorage.setItem(K_ABERTOS, JSON.stringify(o)); } catch (e) {} }
  function visivel(el) { return el && !el.hasAttribute('data-mgb-bloq') && el.style.display !== 'none'; }
  function svg(nome) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONES[nome] || '') + '</svg>'; }
  function trocarTexto(item, texto) {
    if (!item.hasAttribute('data-menu-orig')) {
      var n = Array.prototype.filter.call(item.childNodes, function (x) { return x.nodeType === 3 && x.textContent.trim(); })[0];
      item.setAttribute('data-menu-orig', n ? n.textContent.trim() : '');
    }
    var alvo = Array.prototype.filter.call(item.childNodes, function (x) { return x.nodeType === 3 && x.textContent.trim(); })[0];
    if (alvo) alvo.textContent = texto;
  }

  function organizar() {
    var sb = doc.getElementById('sidebar');
    if (!sb) return;
    sb.classList.add('menu2');
    var abertos = ler();
    sb.querySelectorAll('.sb-grupo').forEach(function (g) {
      if (g.classList.contains('sb-grupo-inicio')) return;
      var lbl = g.querySelector(':scope > .sb-lbl');
      if (!lbl) return;
      var nome = lbl.getAttribute('data-menu-nome') || lbl.textContent.trim();
      lbl.setAttribute('data-menu-nome', nome);
      var itens = Array.prototype.filter.call(g.querySelectorAll('.sb-nav-item'), visivel);
      var mods = g.querySelector('#sb-modules');
      var nMods = mods && visivel(mods) ? mods.querySelectorAll('.mod-item').length : 0;
      var unico = itens.length === 1 && !nMods;
      g.classList.toggle('menu2-unico', unico);
      g.classList.toggle('menu2-varios', !unico);
      Array.prototype.forEach.call(g.querySelectorAll('.sb-nav-item'), function (it) {
        var orig = it.getAttribute('data-menu-orig');
        if (unico && it === itens[0] && NOMES[it.id]) trocarTexto(it, NOMES[it.id]);
        else if (orig) trocarTexto(it, orig);
      });
      if (unico) return;
      var cab = g.querySelector(':scope > .menu2-cab');
      if (!cab) {
        cab = doc.createElement('button');
        cab.type = 'button';
        cab.className = 'menu2-cab';
        cab.innerHTML = svg(nome) + '<span>' + nome + '</span><svg class="menu2-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
        cab.addEventListener('click', function () {
          var a = ler(), aberto = !g.classList.contains('menu2-aberto');
          a[nome] = aberto; gravar(a);
          g.classList.toggle('menu2-aberto', aberto);
          cab.setAttribute('aria-expanded', String(aberto));
        });
        g.insertBefore(cab, lbl);
      }
      var temAtivo = !!g.querySelector('.sb-nav-item.on,.mod-item.on,.mod-item.active');
      var aberto = abertos[nome] !== undefined ? (abertos[nome] || temAtivo) : temAtivo;
      g.classList.toggle('menu2-aberto', aberto);
      cab.setAttribute('aria-expanded', String(aberto));
    });
    // Faturamento abre direto na tela do Faturamento (Recibos, Nota Fiscal e Léo seguem nas abas de cima)
    var fat = doc.getElementById('nav-contabilidade');
    if (fat && !fat.__menu2) {
      fat.__menu2 = true;
      fat.setAttribute('onclick', "typeof fatAbrirFaturamento==='function'?fatAbrirFaturamento():goPage('contabilidade')");
    }
    levarConta();
  }

  // A pílula da conta (acesso.js) vira o pé do menu no computador; no celular continua flutuando.
  function levarConta() {
    var sb = doc.getElementById('sidebar'), pill = doc.getElementById('mgb-pill');
    if (!sb || !pill) return;
    var pc = !(global.matchMedia && global.matchMedia('(max-width: 768px)').matches);
    if (pc && pill.parentNode !== sb) sb.appendChild(pill);
    else if (!pc && pill.parentNode === sb) doc.body.appendChild(pill);
  }

  function estilos() {
    if (doc.getElementById('menu2-css')) return;
    var s = doc.createElement('style');
    s.id = 'menu2-css';
    s.textContent =
      '#sidebar.menu2{background:#fff;border-right:1px solid #E4DFF0;font-family:"DM Sans",system-ui,sans-serif}' +
      '#sidebar.menu2 .logo-area{padding:22px 20px 14px;border-bottom:0}#sidebar.menu2 .logo-sub{display:none}#sidebar.menu2 .logo-name{font-size:13px;color:#5D5868;font-weight:600}' +
      '#sidebar.menu2 .sb-scroll{padding:6px 12px 12px}' +
      '#sidebar.menu2 .sb-lbl{display:none}' +
      '#sidebar.menu2 .sb-nav-item,#sidebar.menu2 .menu2-cab{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 12px;margin:0 0 2px;border-radius:10px;font:600 15px "DM Sans",system-ui,sans-serif;color:#3A3446;box-shadow:none;cursor:pointer}' +
      '#sidebar.menu2 .sb-nav-item svg,#sidebar.menu2 .menu2-cab svg{width:20px;height:20px;flex:none;opacity:1;color:currentColor}' +
      '#sidebar.menu2 .sb-nav-item:hover,#sidebar.menu2 .menu2-cab:hover{background:#F6F4FA;color:#241A38}' +
      '#sidebar.menu2 .sb-nav-item.on{background:#ECE8FA;color:#2A1760;font-weight:700;box-shadow:none}#sidebar.menu2 .sb-nav-item.on svg{color:#4E38B2}' +
      '#sidebar.menu2 .menu2-cab{width:100%;border:0;background:none;text-align:left}#sidebar.menu2 .menu2-cab span{flex:1}' +
      '#sidebar.menu2 .menu2-seta{width:16px!important;height:16px!important;color:#5D5868!important;transition:transform .15s}' +
      '#sidebar.menu2 .menu2-aberto>.menu2-cab .menu2-seta{transform:rotate(90deg)}' +
      '#sidebar.menu2 .menu2-varios:has(.sb-nav-item.on)>.menu2-cab{color:#2A1760;font-weight:700}' +
      '#sidebar.menu2 .menu2-varios>.sb-nav-item,#sidebar.menu2 .menu2-varios>#sb-modules{display:none}' +
      '#sidebar.menu2 .menu2-varios.menu2-aberto>.sb-nav-item:not([data-mgb-bloq]),#sidebar.menu2 .menu2-varios.menu2-aberto>#sb-modules:not([data-mgb-bloq]){display:block}' +
      '#sidebar.menu2 .menu2-varios.menu2-aberto>.sb-nav-item:not([data-mgb-bloq]){display:flex}' +
      '#sidebar.menu2 .menu2-varios>.sb-nav-item{min-height:38px;padding-left:44px;font-size:14px;font-weight:500}#sidebar.menu2 .menu2-varios>.sb-nav-item svg{display:none}' +
      '#sidebar.menu2 .menu2-varios>#sb-modules{padding-left:32px}#sidebar.menu2 #sb-modules .mod-item{font-size:13.5px;min-height:34px}' +
      '#sidebar.menu2 .sb-footer>*:not(#sync-status){display:none!important}#sidebar.menu2 .menu2-unico>.menu2-cab{display:none!important}#sidebar.menu2 .sb-footer{border-top:0;padding:4px 16px}' +
      '#sidebar.menu2>#mgb-pill{position:relative;right:auto;bottom:auto;margin:0;padding:12px;border-top:1px solid #E4DFF0}' +
      '#sidebar.menu2>#mgb-pill>button{width:100%;height:auto;min-height:48px;border:0;box-shadow:none;border-radius:10px;padding:6px 8px;background:none;text-align:left;font-size:14px}' +
      '#sidebar.menu2>#mgb-pill>button:hover{background:#F6F4FA}#sidebar.menu2>#mgb-pill .av{width:36px;height:36px;background:#2A1760;font-size:14px;flex:none}' +
      '#sidebar.menu2>#mgb-pill #mgb-painel{position:absolute;left:12px;right:12px;bottom:calc(100% + 6px);width:auto}' +
      '@media(min-width:769px){' +
        '.shell.sb-collapsed #sidebar.menu2 .menu2-cab,.shell.sb-collapsed #sidebar.menu2 .sb-footer{display:none}' +
        '.shell.sb-collapsed #sidebar.menu2 .menu2-varios>.sb-nav-item:not([data-mgb-bloq]){display:flex;padding:0;justify-content:center}' +
        '.shell.sb-collapsed #sidebar.menu2 .menu2-varios>.sb-nav-item svg{display:block}' +
        '.shell.sb-collapsed #sidebar.menu2 .sb-nav-item{justify-content:center;padding:0;font-size:0}' +
        '.shell.sb-collapsed #sidebar.menu2>#mgb-pill>button>span:not(.av){display:none}.shell.sb-collapsed #sidebar.menu2>#mgb-pill{padding:8px 4px}' +
        '.shell.sb-collapsed #sidebar.menu2>#mgb-pill #mgb-painel{left:8px;right:auto;width:260px}' +
      '}';
    doc.head.appendChild(s);
  }

  function ligar() {
    estilos();
    organizar();
    doc.addEventListener('mgb:perfil', function () { setTimeout(organizar, 0); });
    // páginas trocam o item ativo: reabre a área do item ativo
    ['goPage', 'goOperacional'].forEach(function (nome) {
      var f = global[nome];
      if (typeof f !== 'function' || f.__menu2) return;
      var g = function () { var r = f.apply(this, arguments); try { setTimeout(organizar, 0); } catch (e) {} return r; };
      g.__menu2 = true;
      global[nome] = g;
    });
    // a pílula é recriada pelo acesso.js: observa o body para trazê-la de volta ao menu
    if (global.MutationObserver) new global.MutationObserver(function () { var p = doc.getElementById('mgb-pill'); if (p && p.parentNode === doc.body) levarConta(); })
      .observe(doc.body, { childList: true });
    if (global.matchMedia) { var mq = global.matchMedia('(max-width: 768px)'); if (mq.addEventListener) mq.addEventListener('change', levarConta); }
  }

  global.MGBMenu = { organizar: organizar };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
