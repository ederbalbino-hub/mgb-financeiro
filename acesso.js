/* Hub MGB — acesso por pessoa (login, menu por papel, modos do admin).
 *
 * Papéis e o que cada um vê vêm da decisão de 10/10/2026 (fluxo operacional aprovado):
 *   admin        Eder     Meu dia (só as coisas dele) ou Visão geral (tudo) + "Ver como"
 *   financeiro   Karen    sucesso do cliente e financeiro (sem CRM, propostas, Plano de Caixa e Pessoal)
 *   bureau       Guina    Rádio Ops (sem o Resumo financeiro da MGB)
 *   programacao  Cleiton  Estúdio, Blocos Rádio, monitoramento
 *
 * IMPORTANTE: este arquivo organiza o que cada pessoa VÊ. A proteção de verdade dos dados
 * vem das fases seguintes, quando cada endpoint passar a exigir o token (bot/lib/auth.js).
 *
 * Login validado no servidor: bot/api/auth.js. Enquanto HUB_USERS/HUB_AUTH_SECRET não
 * estiverem no Vercel, o hub funciona como antes (sem login).
 */
(function (global) {
  'use strict';

  var API = 'https://mgb-financeiro.vercel.app/api/auth';
  var K_SESSAO = 'mgb_sessao';
  var K_MODO = 'mgb_modo';
  var K_ULTIMO = 'mgb_ultimo_usuario';

  var TODAS = ['home', 'overview', 'custos', 'pessoal', 'contabilidade', 'operacional:contratos', 'operacional:estudio',
    'relatorios', 'ferramentas', 'gerador', 'midiakit', 'apresmgb', 'sindicos', 'leads', 'propvaapty', 'radioops', 'planocaixa'];

  // extras: partes da tela que não são uma página
  //   valores   métricas e rodapé de Receita/Despesa/Lucro
  //   pessoal   cartão de saldo pessoal
  //   ropsResumo aba "Resumo financeiro" do Rádio Ops (valores da MGB)
  //   ropsAlerta aviso de nota a emitir do Rádio Ops na Home
  //   ropsPainel painel completo do Rádio Ops (pipeline, PIs, rádios)
  //   renovacao aviso na Home dos contratos que encerram no mês
  // abas: limita as abas de Ferramentas e do Estúdio (ausente = todas)
  var PERFIS = {
    'admin-geral': {
      rotulo: 'Visão geral',
      paginas: TODAS,
      extras: ['valores', 'pessoal', 'ropsResumo', 'ropsPainel', 'ropsAlerta', 'renovacao']
    },
    'admin-meudia': {
      rotulo: 'Meu dia',
      paginas: ['home', 'leads', 'midiakit', 'apresmgb', 'sindicos', 'propvaapty', 'overview', 'custos',
        'contabilidade', 'radioops', 'planocaixa', 'pessoal'],
      extras: ['valores', 'pessoal', 'ropsResumo', 'ropsPainel', 'ropsAlerta', 'renovacao']
    },
    // Revisão do Eder (10/10): Rádio Ops só o resumo do mês; Ferramentas só o Backup;
    // aviso de contratos que encerram para renovar.
    financeiro: {
      rotulo: 'Karen',
      paginas: ['home', 'overview', 'custos', 'contabilidade', 'operacional:contratos', 'relatorios', 'gerador',
        'radioops', 'ferramentas'],
      extras: ['valores', 'ropsResumo', 'ropsAlerta', 'renovacao'],
      abas: { ferramentas: ['backup'] }
    },
    // Guina só participa do Rádio Ops.
    bureau: {
      rotulo: 'Guina',
      paginas: ['home', 'radioops'],
      extras: ['ropsPainel']
    },
    // Cleiton: Gerador de Spots e Blocos Rádio no Estúdio, e as Ferramentas.
    programacao: {
      rotulo: 'Cleiton',
      paginas: ['home', 'operacional:estudio', 'ferramentas'],
      extras: [],
      abas: { estudio: ['gerador', 'blocos'] }
    }
  };

  var DESCRICAO = {
    admin: 'comercial e direção',
    financeiro: 'sucesso do cliente e financeiro',
    bureau: 'bureau de rádio',
    programacao: 'programação'
  };

  // ── Regras puras (testadas em bot/test/acesso.test.js) ─────────────────
  function perfilEfetivo(papel, modo, verComo) {
    if (papel === 'admin') {
      if (verComo && PERFIS[verComo]) return verComo;
      return modo === 'geral' ? 'admin-geral' : 'admin-meudia';
    }
    return PERFIS[papel] ? papel : null;
  }

  function pode(perfil, alvo) {
    var p = PERFIS[perfil];
    if (!p) return false;
    if (!alvo) return true;
    if (alvo === 'operacional') {
      return p.paginas.some(function (x) { return x.indexOf('operacional:') === 0; });
    }
    return p.paginas.indexOf(alvo) !== -1;
  }

  function temExtra(perfil, extra) {
    var p = PERFIS[perfil];
    return !!p && p.extras.indexOf(extra) !== -1;
  }

  function podeAba(perfil, area, aba) {
    var p = PERFIS[perfil];
    if (!p) return false;
    var lista = p.abas && p.abas[area];
    return !lista || lista.indexOf(aba) !== -1;
  }

  function primeiraAba(perfil, area, padrao) {
    var p = PERFIS[perfil];
    var lista = p && p.abas && p.abas[area];
    return lista ? lista[0] : padrao;
  }

  // Descobre para onde um onclick leva: "goPage('leads')" → "leads".
  function alvoDoOnclick(txt) {
    txt = String(txt || '');
    var m = txt.match(/goPage\(\s*['"](\w+)['"]/);
    if (m) return m[1];
    m = txt.match(/goOperacional\(\s*['"](\w+)['"]/);
    if (m) return 'operacional:' + m[1];
    if (/openGerador\(/.test(txt)) return 'gerador';
    if (/drillMod\(/.test(txt)) return 'custos';
    return null;
  }

  function decodificarToken(token) {
    try {
      var corpo = String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      while (corpo.length % 4) corpo += '=';
      return JSON.parse(decodeURIComponent(escape(atob(corpo))));
    } catch (e) { return null; }
  }

  var api = {
    PERFIS: PERFIS,
    perfilEfetivo: perfilEfetivo,
    pode: pode,
    temExtra: temExtra,
    podeAba: podeAba,
    primeiraAba: primeiraAba,
    alvoDoOnclick: alvoDoOnclick
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (!global.document) return; // ambiente de teste

  // ── Estado ─────────────────────────────────────────────────────────────
  var doc = global.document;
  var sessao = null;   // {token, usuario:{login,nome,papel}}
  var verComo = '';
  var perfilAtual = null;
  var originais = {};

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function gravar(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function modo() { return ler(K_MODO) === 'geral' ? 'geral' : 'meudia'; }

  // ── Estilos ────────────────────────────────────────────────────────────
  function injetarEstilos() {
    if (doc.getElementById('mgb-acesso-css')) return;
    var css =
      '[data-mgb-bloq]{display:none!important}' +
      'body.mgb-sem-valores .home-metrics,body.mgb-sem-valores .sb-footer,body.mgb-sem-valores #home-eye-btn{display:none!important}' +
      'body.mgb-sem-pessoal .home-pessoal-card{display:none!important}' +
      'body.mgb-sem-ropsResumo #rops-tab-resumo,body.mgb-sem-ropsResumo #rops-resumo-wrap,body.mgb-sem-ropsResumo #nav-rops-badge{display:none!important}' +
      'body.mgb-sem-ropsAlerta #home-rops-alert{display:none!important}' +
      'body.mgb-sem-ropsPainel #rops-tab-painel,body.mgb-sem-ropsPainel #rops-painel-wrap{display:none!important}' +
      '#mgb-renov{cursor:pointer;margin:0 0 14px;padding:12px 16px;border-radius:14px;background:#fff7ed;border:1.5px solid #f2b880;color:#7a3e00;font:14px "DM Sans",system-ui,sans-serif;text-align:left;max-width:640px;width:100%;box-sizing:border-box}' +
      '#mgb-renov b{display:block;font-size:14px;margin-bottom:4px}#mgb-renov span{display:block;font-size:13px;color:#5d3a12}' +
      '#mgb-login{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;background:#f3f1ec;font-family:"DM Sans",system-ui,sans-serif}' +
      '#mgb-login form{width:100%;max-width:360px;background:#fff;border:1px solid #ddd8ce;border-radius:16px;padding:28px 24px;display:flex;flex-direction:column;gap:14px;box-shadow:0 10px 40px rgba(36,26,56,.08)}' +
      '#mgb-login h1{margin:0;font-size:22px;color:#241a38}#mgb-login p{margin:0;font-size:14px;color:#5d5868}' +
      '#mgb-login label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;color:#3a3446}' +
      '#mgb-login input{height:44px;border:1px solid #cfc9bd;border-radius:10px;padding:0 12px;font-size:15px;font-family:inherit}' +
      '#mgb-login input:focus{outline:2px solid #6C55DB;outline-offset:1px;border-color:#6C55DB}' +
      '#mgb-login button{height:46px;border:0;border-radius:10px;background:#4E38B2;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}' +
      '#mgb-login button[disabled]{opacity:.6;cursor:wait}#mgb-login .erro{color:#b42318;font-size:13px;min-height:18px}' +
      '#mgb-pill{position:fixed;right:16px;bottom:16px;z-index:9000;font-family:"DM Sans",system-ui,sans-serif}' +
      '@media (max-width:768px){#mgb-pill{bottom:84px;right:12px}}' +
      '#mgb-pill>button{display:flex;align-items:center;gap:8px;height:40px;padding:0 14px 0 6px;border-radius:999px;border:1px solid #ddd8ce;background:#fff;box-shadow:0 4px 16px rgba(36,26,56,.12);cursor:pointer;font-weight:600;font-size:13px;font-family:inherit;color:#241a38}' +
      '#mgb-pill .av{width:28px;height:28px;border-radius:50%;background:#4E38B2;color:#fff;display:grid;place-items:center;font-weight:700;font-size:12px}' +
      '#mgb-painel{position:absolute;right:0;bottom:48px;width:260px;background:#fff;border:1px solid #ddd8ce;border-radius:14px;box-shadow:0 12px 40px rgba(36,26,56,.16);padding:14px;display:flex;flex-direction:column;gap:12px}' +
      '#mgb-painel .t{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b6578;font-weight:700}' +
      '#mgb-painel .seg{display:flex;border:1px solid #ddd8ce;border-radius:10px;padding:3px;gap:3px}' +
      '#mgb-painel .seg button{flex:1;height:34px;border:0;border-radius:8px;background:transparent;font-weight:600;font-size:13px;font-family:inherit;cursor:pointer;color:#3a3446}' +
      '#mgb-painel .seg button.on{background:#4E38B2;color:#fff}' +
      '#mgb-painel select{height:38px;border:1px solid #cfc9bd;border-radius:9px;padding:0 8px;font-size:14px;font-family:inherit}' +
      '#mgb-painel .sair{height:38px;border:1px solid #ddd8ce;border-radius:9px;background:#fff;font-weight:600;font-size:13px;font-family:inherit;cursor:pointer;color:#b42318}' +
      '#mgb-vercomo{position:fixed;top:0;left:0;right:0;z-index:9500;background:#7a3e00;color:#fff;font:600 13px "DM Sans",system-ui,sans-serif;padding:8px 16px;display:flex;justify-content:center;gap:12px;align-items:center;flex-wrap:wrap}' +
      '#mgb-vercomo button{background:#fff;color:#7a3e00;border:0;border-radius:7px;padding:5px 10px;font-weight:700;font-size:12px;font-family:inherit;cursor:pointer}';
    var st = doc.createElement('style');
    st.id = 'mgb-acesso-css';
    st.textContent = css;
    doc.head.appendChild(st);
  }

  // ── Aplicar o perfil na tela ───────────────────────────────────────────
  function aplicar() {
    if (!perfilAtual) return;
    var body = doc.body;
    ['valores', 'pessoal', 'ropsResumo', 'ropsPainel', 'ropsAlerta'].forEach(function (x) {
      body.classList.toggle('mgb-sem-' + x, !temExtra(perfilAtual, x));
    });

    doc.querySelectorAll('[onclick]').forEach(function (el) {
      var alvo = alvoDoOnclick(el.getAttribute('onclick'));
      if (!alvo) return;
      if (pode(perfilAtual, alvo)) el.removeAttribute('data-mgb-bloq');
      else el.setAttribute('data-mgb-bloq', '');
    });

    // Lista de módulos e seu título só para quem vê os módulos
    var mods = doc.getElementById('sb-modules');
    if (mods) {
      if (pode(perfilAtual, 'custos')) mods.removeAttribute('data-mgb-bloq');
      else mods.setAttribute('data-mgb-bloq', '');
    }

    // Títulos de seção do menu que ficaram vazios
    var sc = doc.querySelector('.sb-scroll');
    if (sc) {
      var filhos = Array.prototype.slice.call(sc.children);
      filhos.forEach(function (el, i) {
        if (!el.classList.contains('sb-lbl')) return;
        var algum = false;
        for (var j = i + 1; j < filhos.length && !filhos[j].classList.contains('sb-lbl'); j++) {
          if (!filhos[j].hasAttribute('data-mgb-bloq')) { algum = true; break; }
        }
        if (algum) el.removeAttribute('data-mgb-bloq'); else el.setAttribute('data-mgb-bloq', '');
      });
    }

    // Abas de Ferramentas e do Estúdio
    doc.querySelectorAll('.ferr-tab[onclick]').forEach(function (el) {
      var m = el.getAttribute('onclick').match(/showFerrTab\(\s*['"](\w+)['"]/);
      if (!m) return;
      if (podeAba(perfilAtual, 'ferramentas', m[1])) el.removeAttribute('data-mgb-bloq');
      else el.setAttribute('data-mgb-bloq', '');
    });
    doc.querySelectorAll('#page-operacional .hub-tab[data-tab]').forEach(function (el) {
      var estudio = (global.OP_GROUPS && global.OP_GROUPS.estudio) || [];
      if (estudio.indexOf(el.dataset.tab) === -1) return;
      if (podeAba(perfilAtual, 'estudio', el.dataset.tab)) el.removeAttribute('data-mgb-bloq');
      else el.setAttribute('data-mgb-bloq', '');
    });

    // Botões do cabeçalho do Rádio Ops que abrem o painel completo
    doc.querySelectorAll('#page-radioops .rops-tabs button[onclick]').forEach(function (el) {
      var oc = el.getAttribute('onclick');
      var soAdmin = /ropsAbrirGuina|portal=/.test(oc);
      var dePainel = /ropsAbrirPainel|ajuda=/.test(oc);
      var ok = soAdmin ? perfilAtual.indexOf('admin') === 0 : (dePainel ? temExtra(perfilAtual, 'ropsPainel') : true);
      if (ok) el.removeAttribute('data-mgb-bloq'); else el.setAttribute('data-mgb-bloq', '');
    });
    filtrarResumoRops();

    var w = doc.querySelector('.home-welcome');
    if (w && sessao) w.textContent = 'Olá, ' + sessao.usuario.nome + '! 👋';
    montarAvisoRenovacao();

    montarPill();
    montarFaixaVerComo();
  }

  // Quem não vê o painel completo do Rádio Ops (Karen) vê só a campanha do mês no resumo.
  function mesAtualStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function filtrarResumoRops() {
    var tb = doc.getElementById('rops-tabela');
    if (!tb) return;
    var soMes = perfilAtual && !temExtra(perfilAtual, 'ropsPainel');
    var mes = mesAtualStr();
    tb.querySelectorAll('tr').forEach(function (tr, i) {
      if (i === 0) return; // cabeçalho
      var b = tr.querySelector('[onclick*="ropsAbrirRelatorio"]');
      var m = b && b.getAttribute('onclick').match(/'(\d{4}-\d{2})'/);
      var mostrar = !soMes || (m && m[1] === mes);
      if (mostrar) tr.removeAttribute('data-mgb-bloq'); else tr.setAttribute('data-mgb-bloq', '');
    });
    if (!filtrarResumoRops.obs && global.MutationObserver) {
      filtrarResumoRops.obs = new MutationObserver(function () { filtrarResumoRops(); });
      filtrarResumoRops.obs.observe(tb, { childList: true, subtree: true });
    }
  }

  // Aviso na Home: contratos que encerram neste mês (para renovar).
  function montarAvisoRenovacao() {
    var el = doc.getElementById('mgb-renov');
    var hubs = doc.querySelector('.home-hubs');
    var lista = [];
    if (temExtra(perfilAtual, 'renovacao') && typeof global.contratosLista === 'function') {
      try {
        var d = new Date(), ref = d.getFullYear() * 12 + d.getMonth();
        lista = global.contratosLista().filter(function (c) { return c.fimKey === ref; });
      } catch (e) { lista = []; }
    }
    if (!lista.length || !hubs) { if (el) el.remove(); return; }
    if (!el) {
      el = doc.createElement('button');
      el.type = 'button';
      el.id = 'mgb-renov';
      el.setAttribute('onclick', "goPage('overview')");
      hubs.parentNode.insertBefore(el, hubs);
    }
    el.innerHTML = '<b>' + lista.length + (lista.length === 1 ? ' contrato encerra' : ' contratos encerram') + ' este mês. Hora de renovar.</b>' +
      '<span>' + lista.map(function (c) { return esc(c.nome) + ' (' + esc(c.origem) + ')'; }).join(' · ') + '</span>';
  }

  function envolverNavegacao() {
    if (originais.goPage) return;
    ['goPage', 'goOperacional', 'openGerador', 'drillMod', 'ropsSetTab', 'showFerrTab'].forEach(function (nome) {
      if (typeof global[nome] === 'function') originais[nome] = global[nome];
    });
    if (originais.goPage) {
      global.goPage = function (p) {
        if (perfilAtual && !pode(perfilAtual, p)) p = 'home';
        var r = originais.goPage.apply(this, [p].concat([].slice.call(arguments, 1)));
        aplicar();
        if (p === 'ferramentas' && perfilAtual && !podeAba(perfilAtual, 'ferramentas', 'pdf')) {
          global.showFerrTab(primeiraAba(perfilAtual, 'ferramentas', 'pdf'));
        }
        return r;
      };
    }
    if (originais.goOperacional) {
      global.goOperacional = function (g) {
        if (perfilAtual && !pode(perfilAtual, 'operacional:' + (g || 'contratos'))) return global.goPage('home');
        return originais.goOperacional.apply(this, arguments);
      };
    }
    if (originais.openGerador) {
      global.openGerador = function () {
        if (perfilAtual && !pode(perfilAtual, 'gerador')) return global.goPage('home');
        return originais.openGerador.apply(this, arguments);
      };
    }
    if (originais.drillMod) {
      global.drillMod = function () {
        if (perfilAtual && !pode(perfilAtual, 'custos')) return global.goPage('home');
        return originais.drillMod.apply(this, arguments);
      };
    }
    if (originais.ropsSetTab) {
      global.ropsSetTab = function (t) {
        if (perfilAtual && t === 'resumo' && !temExtra(perfilAtual, 'ropsResumo')) t = 'painel';
        if (perfilAtual && t !== 'resumo' && !temExtra(perfilAtual, 'ropsPainel')) t = 'resumo';
        return originais.ropsSetTab.call(this, t);
      };
    }
    if (originais.showFerrTab) {
      global.showFerrTab = function (t, el) {
        if (perfilAtual && !podeAba(perfilAtual, 'ferramentas', t)) {
          t = primeiraAba(perfilAtual, 'ferramentas', 'pdf');
          el = null;
        }
        if (!el) el = doc.querySelector('.ferr-tab[onclick*="showFerrTab(\'' + t + '\'"]');
        return originais.showFerrTab.call(this, t, el);
      };
    }
  }

  function definirPerfil() {
    if (!sessao) return;
    perfilAtual = perfilEfetivo(sessao.usuario.papel, modo(), verComo);
    aplicar();
    if (typeof global.curPage === 'string' && !pode(perfilAtual, global.curPage)) global.goPage('home');
  }

  // ── Pílula do usuário (canto inferior direito) ─────────────────────────
  function montarPill() {
    if (!sessao) return;
    var u = sessao.usuario;
    var pill = doc.getElementById('mgb-pill');
    if (!pill) {
      pill = doc.createElement('div');
      pill.id = 'mgb-pill';
      doc.body.appendChild(pill);
    }
    var aberto = pill.getAttribute('data-aberto') === '1';
    var admin = u.papel === 'admin';
    var sub = admin ? (verComo ? 'vendo como ' + PERFIS[verComo].rotulo : PERFIS[perfilAtual].rotulo) : DESCRICAO[u.papel];
    var h = '<button type="button" aria-expanded="' + aberto + '" aria-controls="mgb-painel" data-acao="alternar">' +
      '<span class="av" aria-hidden="true">' + esc(u.nome.charAt(0).toUpperCase()) + '</span>' +
      '<span>' + esc(u.nome) + ' · ' + esc(sub) + '</span></button>';
    if (aberto) {
      h += '<div id="mgb-painel" role="dialog" aria-label="Sua conta">';
      h += '<div><div style="font-weight:700;font-size:15px">' + esc(u.nome) + '</div><div style="font-size:13px;color:#6b6578">' + DESCRICAO[u.papel] + '</div></div>';
      if (admin) {
        var m = modo();
        h += '<div class="t">Modo</div><div class="seg" role="group" aria-label="Modo">' +
          '<button type="button" data-acao="modo" data-v="meudia" class="' + (m === 'meudia' ? 'on' : '') + '">Meu dia</button>' +
          '<button type="button" data-acao="modo" data-v="geral" class="' + (m === 'geral' ? 'on' : '') + '">Visão geral</button></div>';
        h += '<label class="t" for="mgb-vercomo-sel">Ver como</label><select id="mgb-vercomo-sel" data-acao="vercomo">' +
          '<option value="">Eu mesmo</option>' +
          ['financeiro', 'bureau', 'programacao'].map(function (p) {
            return '<option value="' + p + '"' + (verComo === p ? ' selected' : '') + '>' + PERFIS[p].rotulo + '</option>';
          }).join('') + '</select>';
      }
      h += '<button type="button" class="sair" data-acao="sair">Sair</button></div>';
    }
    pill.innerHTML = h;
  }

  function montarFaixaVerComo() {
    var f = doc.getElementById('mgb-vercomo');
    if (!verComo) { if (f) f.remove(); return; }
    if (!f) { f = doc.createElement('div'); f.id = 'mgb-vercomo'; doc.body.appendChild(f); }
    f.innerHTML = '<span>Você está vendo o hub como ' + PERFIS[verComo].rotulo + '. O que você mudar aqui vale de verdade.</span>' +
      '<button type="button" data-acao="voltar">Voltar para mim</button>';
  }

  doc.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-acao]');
    if (!b || b.tagName === 'SELECT') return;
    var a = b.getAttribute('data-acao');
    var pill = doc.getElementById('mgb-pill');
    if (a === 'alternar' && pill) { pill.setAttribute('data-aberto', pill.getAttribute('data-aberto') === '1' ? '0' : '1'); montarPill(); }
    if (a === 'modo') { gravar(K_MODO, b.getAttribute('data-v')); verComo = ''; definirPerfil(); }
    if (a === 'voltar') { verComo = ''; definirPerfil(); }
    if (a === 'sair') sair();
  });
  doc.addEventListener('change', function (e) {
    if (e.target && e.target.getAttribute('data-acao') === 'vercomo') { verComo = e.target.value; definirPerfil(); }
  });

  // ── Login ──────────────────────────────────────────────────────────────
  function mostrarLogin(aviso) {
    injetarEstilos();
    var el = doc.getElementById('mgb-login');
    if (!el) { el = doc.createElement('div'); el.id = 'mgb-login'; doc.body.appendChild(el); }
    el.innerHTML =
      '<form novalidate>' +
      '<h1>MGB Hub</h1><p>Entre com o seu usuário para ver a sua área de trabalho.</p>' +
      '<label for="mgb-usuario">Usuário<input id="mgb-usuario" name="usuario" autocomplete="username" autocapitalize="none" required></label>' +
      '<label for="mgb-senha">Senha<input id="mgb-senha" name="senha" type="password" autocomplete="current-password" required></label>' +
      '<div class="erro" role="alert" id="mgb-erro">' + (aviso || '') + '</div>' +
      '<button type="submit">Entrar</button></form>';
    var u = doc.getElementById('mgb-usuario');
    u.value = ler(K_ULTIMO) || '';
    (u.value ? doc.getElementById('mgb-senha') : u).focus();
    el.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      entrar(u.value, doc.getElementById('mgb-senha').value, el.querySelector('button'));
    });
  }

  function entrar(usuario, senha, btn) {
    var erro = doc.getElementById('mgb-erro');
    if (!usuario || !senha) { erro.textContent = 'Preencha usuário e senha.'; return; }
    btn.disabled = true; btn.textContent = 'Entrando…'; erro.textContent = '';
    fetch(API + '?action=login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuario, senha: senha })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'Não foi possível entrar.');
        gravar(K_ULTIMO, usuario.trim().toLowerCase());
        iniciarSessao({ token: res.j.token, usuario: res.j.usuario });
        var el = doc.getElementById('mgb-login'); if (el) el.remove();
        global.goPage('home');
      })
      .catch(function (e) {
        erro.textContent = e.message === 'Failed to fetch' ? 'Sem conexão com o servidor. Tente de novo.' : e.message;
        btn.disabled = false; btn.textContent = 'Entrar';
      });
  }

  function iniciarSessao(s) {
    sessao = s;
    gravar(K_SESSAO, JSON.stringify(s));
    injetarEstilos();
    envolverNavegacao();
    definirPerfil();
  }

  function sair() {
    gravar(K_SESSAO, null);
    sessao = null; perfilAtual = null; verComo = '';
    var p = doc.getElementById('mgb-pill'); if (p) p.remove();
    var f = doc.getElementById('mgb-vercomo'); if (f) f.remove();
    mostrarLogin();
  }

  function verificarEmSegundoPlano() {
    fetch(API + '?action=me', { headers: { Authorization: 'Bearer ' + sessao.token } })
      .then(function (r) {
        if (r.status === 401 || r.status === 503) { sair(); return null; }
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        if (j && j.usuario && sessao) {
          sessao.usuario = j.usuario; // papel pode ter mudado no cadastro
          gravar(K_SESSAO, JSON.stringify(sessao));
          definirPerfil();
        }
      })
      .catch(function () { /* sem rede: mantém a sessão local até expirar */ });
  }

  function iniciar() {
    var s = null;
    try { s = JSON.parse(ler(K_SESSAO) || 'null'); } catch (e) {}
    var dados = s && decodificarToken(s.token);
    if (s && dados && dados.exp > Date.now()) {
      iniciarSessao(s);
      verificarEmSegundoPlano();
      return;
    }
    gravar(K_SESSAO, null);
    fetch(API + '?action=config')
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ativo) mostrarLogin(); /* inativo: hub segue como antes */ })
      .catch(function () { mostrarLogin('Sem conexão com o servidor de login. Tente de novo em instantes.'); });
  }

  global.MGBAcesso = Object.assign(api, { sair: sair });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
