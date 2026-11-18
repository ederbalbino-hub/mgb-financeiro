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

  // O token vai nas chamadas para a API pelo api-token.js (carregado no <head>).

  var TODAS = ['home', 'overview', 'custos', 'pessoal', 'contabilidade', 'operacional:contratos', 'operacional:estudio',
    'relatorios', 'ferramentas', 'gerador', 'midiakit', 'apresmgb', 'sindicos', 'leads', 'propvaapty', 'planotaroba', 'radioops', 'planocaixa',
    'operacional:telavertical'];

  // extras: partes da tela que não são uma página
  //   valores   métricas e rodapé de Receita/Despesa/Lucro
  //   pessoal   cartão de saldo pessoal
  //   ropsResumo aba "Resumo financeiro" do Rádio Ops (valores da MGB)
  //   ropsAlerta aviso de nota a emitir do Rádio Ops na Home
  //   ropsPainel painel completo do Rádio Ops (pipeline, PIs, rádios)
  //   renovacao aviso na Home dos contratos que encerram no mês
  //   novo       botão "Novo cliente" na Home (novo.js)
  // abas: limita as abas de Ferramentas e do Estúdio (ausente = todas)
  var PERFIS = {
    'admin-geral': {
      rotulo: 'Visão geral',
      paginas: TODAS,
      extras: ['valores', 'pessoal', 'ropsResumo', 'ropsPainel', 'ropsAlerta', 'renovacao', 'novo']
    },
    'admin-meudia': {
      rotulo: 'Meu dia',
      // 11/10: Cobrança Mensal (aba Tela Vertical = relatório ao sócio) e Contratos voltam ao Meu dia.
      paginas: ['home', 'leads', 'midiakit', 'apresmgb', 'sindicos', 'propvaapty', 'planotaroba', 'overview', 'custos',
        'contabilidade', 'operacional:contratos', 'operacional:telavertical', 'relatorios', 'radioops', 'planocaixa', 'pessoal'],
      extras: ['valores', 'pessoal', 'ropsResumo', 'ropsPainel', 'ropsAlerta', 'renovacao', 'novo']
    },
    // Revisão do Eder (10/10): Rádio Ops só o resumo do mês; Ferramentas só o Backup;
    // aviso de contratos que encerram para renovar.
    financeiro: {
      rotulo: 'Karen',
      // 11/10: módulo Tela Vertical inteiro para a Karen (operação, propostas e síndicos).
      paginas: ['home', 'overview', 'custos', 'contabilidade', 'operacional:contratos', 'operacional:telavertical',
        'relatorios', 'gerador', 'radioops', 'ferramentas', 'midiakit', 'sindicos'],
      extras: ['valores', 'ropsResumo', 'ropsAlerta', 'renovacao', 'novo'],
      abas: { ferramentas: ['backup'] },
      // Revisão de 11/10: Rádio Ops e "Rádio Moinho (Bureau)" abriam a mesma tela. Fica só o módulo Moinho.
      ocultar: ['#nav-radioops', '#home-rops-card']
    },
    // Guina só participa do Rádio Ops.
    bureau: {
      rotulo: 'Guina',
      paginas: ['home', 'radioops'],
      extras: ['ropsPainel']
    },
    // Cleiton (decisão de 18/11/2026): não entra no hub. "Modo Estúdio": só Gerador de Spots e
    // Blocos Rádio (Estúdio) e as Etiquetas (Ferramentas), sem menu lateral nem Home.
    programacao: {
      rotulo: 'Cleiton',
      paginas: ['operacional:estudio', 'ferramentas'],
      extras: [],
      abas: { estudio: ['gerador', 'blocos'], ferramentas: ['etq'] },
      inicio: 'operacional:estudio',
      modoEstudio: true
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

  // ── Renovação por telefone (revisão de 11/10) ──────────────────────────
  // A Karen vê os contratos que vencem neste mês e no próximo e encaminha ao Eder.
  // O Eder liga, marca "Renovado com o cliente" e o contrato ganha o mesmo prazo de novo
  // (sem Assinafy). Cada contrato some da lista assim que é encaminhado ou resolvido.
  // Anunciantes da Tela Vertical (antes "Elevadores"). A chave guardada em _renovacoes continua
  // com "Elevadores" para os encaminhamentos já feitos não voltarem à lista da Karen após a troca de nome.
  function ehTelaVertical(origem) { return origem === 'Elevadores' || origem === 'Tela Vertical'; }
  function chaveRenov(c) { return [ehTelaVertical(c.origem) ? 'Elevadores' : c.origem, c.nome, c.fimKey].join('|'); }

  function contratosParaRenovar(lista, ref, renov, modoEder) {
    renov = renov || {};
    return (lista || []).filter(function (c) {
      if (c.fimKey == null || c.fimKey < ref || c.fimKey > ref + 1) return false;
      var r = renov[chaveRenov(c)];
      if (!r) return true;
      return modoEder && r.s === 'eder';
    }).sort(function (a, b) { return a.fimKey - b.fimKey || String(a.nome).localeCompare(String(b.nome)); });
  }

  // Estende o contrato pelo mesmo prazo (ou pelo prazo informado). Funciona para rec[mod][item] e anunciantes.
  function estenderContrato(obj, meses) {
    if (!obj) return null;
    var atual = parseInt(obj.meses, 10) || 12;
    var mais = parseInt(meses, 10) || atual;
    obj.meses = atual + mais;
    return obj.meses;
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
    alvoDoOnclick: alvoDoOnclick,
    chaveRenov: chaveRenov,
    contratosParaRenovar: contratosParaRenovar,
    estenderContrato: estenderContrato
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
      '#mgb-renov{margin:0 auto 14px;padding:12px 16px;border-radius:14px;background:#fff7ed;border:1.5px solid #f2b880;color:#7a3e00;font-family:"DM Sans",system-ui,sans-serif;font-size:14px;text-align:left;max-width:640px;width:100%;box-sizing:border-box}' +
      '#mgb-renov>b{display:block;font-size:14px;margin-bottom:4px}#mgb-renov>span{display:block;font-size:13px;color:#5d3a12;margin-bottom:6px}' +
      '#mgb-renov .rv-lin{border-top:1px solid #f6d3ad;padding:6px 0}' +
      '#mgb-renov .rv-nome{all:unset;cursor:pointer;display:block;width:100%;font-size:13.5px;color:#5d3a12;padding:4px 0}#mgb-renov .rv-nome:focus-visible{outline:2px solid #c2410c}' +
      '#mgb-renov .rv-caixa{margin:6px 0 4px;padding:10px 12px;background:#fff;border:1px solid #f2b880;border-radius:10px;font-size:13px;color:#3a2a14;display:flex;flex-direction:column;gap:4px}' +
      '#mgb-renov .rv-caixa[hidden]{display:none}#mgb-renov .rv-bts{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}' +
      '#mgb-renov .rv-bts button{min-height:38px;padding:0 12px;border-radius:9px;font-weight:700;font-size:13px;font-family:inherit;cursor:pointer}' +
      '#mgb-renov .rv-ok{background:#c2410c;border:1px solid #c2410c;color:#fff}#mgb-renov .rv-nao{background:#fff;border:1px solid #f2b880;color:#7a3e00}' +
      'body.mgb-modo-estudio #sidebar,body.mgb-modo-estudio .mobile-bottom-nav,body.mgb-modo-estudio .sb-toggle,body.mgb-modo-estudio #mgb-pill{display:none!important}' +
      'body.mgb-modo-estudio .shell{grid-template-columns:1fr!important}body.mgb-modo-estudio .main{margin-left:0!important}body.mgb-modo-estudio .ferr-tabs{display:none!important}' +
      '#mgb-estudio-bar{position:sticky;top:0;z-index:9000;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 16px;background:#241a38;color:#fff;font-family:"DM Sans",system-ui,sans-serif}' +
      '#mgb-estudio-bar b{margin-right:auto;font-size:15px}#mgb-estudio-bar button{min-height:38px;padding:0 14px;border-radius:9px;border:1px solid #6C55DB;background:#4E38B2;color:#fff;font-weight:700;font-size:13px;font-family:inherit;cursor:pointer}' +
      '#mgb-estudio-bar button.sair{background:transparent;border-color:#8b80a8}' +
      // Tela de entrar (desenho aprovado em 18/11/2026): painel roxo com o logo + formulário.
      '#mgb-login{position:fixed;inset:0;z-index:100000;display:flex;flex-wrap:wrap;overflow:auto;background:#F6F4FA;font-family:"DM Sans",system-ui,sans-serif;color:#241A38}' +
      '#mgb-login .mgb-marca{flex:1 1 420px;min-height:280px;box-sizing:border-box;padding:56px;background:#2A1760;color:#fff;display:flex;flex-direction:column;justify-content:space-between;gap:32px}' +
      '#mgb-login .mgb-marca h2{margin:0;font-size:36px;line-height:1.15;font-weight:700}#mgb-login .mgb-marca p{margin:10px 0 0;font-size:17px;line-height:1.5;color:#D9D2F2;max-width:420px}' +
      '#mgb-login .mgb-marca small{font-size:13px;color:#B7ABDE}' +
      '#mgb-login .mgb-lado{flex:999 1 480px;display:flex;align-items:center;justify-content:center;padding:40px 20px;box-sizing:border-box}' +
      '#mgb-login form{width:100%;max-width:400px;box-sizing:border-box;background:#fff;border:1px solid #E4DFF0;border-radius:18px;padding:36px 32px;display:flex;flex-direction:column;gap:18px}' +
      '#mgb-login h1{margin:0;font-size:24px;color:#241A38}#mgb-login form p{margin:0;font-size:15px;color:#5D5868}' +
      '#mgb-login label{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600;color:#3A3446}' +
      '#mgb-login input{height:48px;border:1px solid #CFC7E6;border-radius:10px;padding:0 14px;font-size:16px;font-family:inherit;color:#241A38}' +
      '#mgb-login input:focus{outline:2px solid #6C55DB;outline-offset:1px;border-color:#6C55DB}' +
      '#mgb-login button{min-height:48px;border:0;border-radius:10px;background:#4E38B2;color:#fff;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit}#mgb-login button:hover{background:#2A1760}' +
      '#mgb-login button[disabled]{opacity:.6;cursor:wait}#mgb-login .erro:not(:empty){color:#B42318;background:#FDECEA;border-radius:10px;padding:10px 12px;font-size:14px}' +
      '@media (max-width:640px){#mgb-login .mgb-marca{padding:28px 24px;min-height:0}#mgb-login .mgb-marca h2{font-size:28px}#mgb-login form{padding:28px 22px}}' +
      '#mgb-login .ok{color:#15803D;background:#E8F6EE;border-radius:10px;padding:10px 12px;font-size:14px}#mgb-login .link{background:none;border:0;min-height:0;height:auto;padding:0;color:#4E38B2;font-weight:600;font-size:13px;text-decoration:underline;cursor:pointer;align-self:flex-start}' +
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
    ['valores', 'pessoal', 'ropsResumo', 'ropsPainel', 'ropsAlerta', 'novo'].forEach(function (x) {
      body.classList.toggle('mgb-sem-' + x, !temExtra(perfilAtual, x));
    });

    doc.querySelectorAll('[onclick]').forEach(function (el) {
      var alvo = alvoDoOnclick(el.getAttribute('onclick'));
      if (!alvo) return;
      if (pode(perfilAtual, alvo)) el.removeAttribute('data-mgb-bloq');
      else el.setAttribute('data-mgb-bloq', '');
    });

    // Itens escondidos de propósito para o perfil (ex.: Rádio Ops duplicado da Karen)
    ((PERFIS[perfilAtual] && PERFIS[perfilAtual].ocultar) || []).forEach(function (sel) {
      doc.querySelectorAll(sel).forEach(function (el) { el.setAttribute('data-mgb-bloq', ''); });
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

    // Menu em seções: some a seção inteira quando o perfil não vê nenhum item dela.
    doc.querySelectorAll('#sidebar .sb-grupo').forEach(function (g) {
      var itens = g.querySelectorAll('.sb-nav-item');
      var algum = Array.prototype.some.call(itens, function (i) { return !i.hasAttribute('data-mgb-bloq'); });
      g.style.display = itens.length && !algum ? 'none' : '';
    });

    var w = doc.querySelector('.home-welcome');
    if (w && sessao) w.textContent = 'Olá, ' + sessao.usuario.nome + '! 👋';
    montarAvisoRenovacao();
    aplicarModoEstudio();

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

  // Aviso na Home: contratos que vencem (este mês e o próximo) para renovar por telefone.
  function renovacoes() {
    try {
      var ci = global.clientesInfo || (typeof clientesInfo !== 'undefined' ? clientesInfo : null);  // eslint-disable-line no-undef
      if (!ci) return {};
      if (!ci._renovacoes) ci._renovacoes = {};
      return ci._renovacoes;
    } catch (e) { return {}; }
  }
  function salvar() { try { global.scheduleSave(); } catch (e) { try { scheduleSave(); } catch (e2) {} } }  // eslint-disable-line no-undef
  function nomeMes(k) { var M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return M[k % 12] + '/' + String(Math.floor(k / 12)).slice(2); }
  function contatoDe(c) {
    var info = null;
    try {
      var mods = global.MODULES || MODULES;                         // eslint-disable-line no-undef
      var m = mods.filter(function (x) { return x.label === c.origem; })[0];
      var ci = global.clientesInfo || clientesInfo;                 // eslint-disable-line no-undef
      info = (m && ci[m.id] && ci[m.id][c.nome]) || (ehTelaVertical(c.origem) && ci.elev && ci.elev[c.nome]) || null;
    } catch (e) {}
    return info || {};
  }
  function objetoDoContrato(c) {
    try {
      if (ehTelaVertical(c.origem)) {
        var an = (global.anunciantes || anunciantes);               // eslint-disable-line no-undef
        return an.filter(function (a) { return a.nome === c.nome && (a.inicio || '') === c.inicio; })[0] || null;
      }
      var mods = global.MODULES || MODULES;                         // eslint-disable-line no-undef
      var m = mods.filter(function (x) { return x.label === c.origem; })[0];
      var r = global.rec || rec;                                    // eslint-disable-line no-undef
      return m && r[m.id] ? r[m.id][c.nome] || null : null;
    } catch (e) { return null; }
  }

  // Custos recorrentes da unidade que acabavam junto com o contrato (licença) acompanham a renovação.
  function estenderCustos(c) {
    try {
      if (ehTelaVertical(c.origem)) return;
      var mods = global.MODULES || MODULES;                         // eslint-disable-line no-undef
      var m = mods.filter(function (x) { return x.label === c.origem; })[0];
      var base = global.db || db;                                   // eslint-disable-line no-undef
      var lista = m && base[m.id] && base[m.id][c.nome];
      (lista || []).forEach(function (row) {
        if (row.t !== 'Recorrente' || !row.dataInicio) return;
        var p = row.dataInicio.split('-').map(Number);
        var fim = p[0] * 12 + (p[1] - 1) + (parseInt(row.mesesRec, 10) || 0) - 1;
        if (fim !== c.fimKey) return;
        global.applyToFin(row, -1);
        row.mesesRec = (parseInt(row.mesesRec, 10) || 0) + (c.meses || 12);
        global.applyToFin(row, +1);
      });
    } catch (e) {}
  }

  function montarAvisoRenovacao() {
    var el = doc.getElementById('mgb-renov');
    var hubs = doc.querySelector('.home-hubs');
    var eder = !!perfilAtual && perfilAtual.indexOf('admin') === 0;
    var lista = [];
    if (temExtra(perfilAtual, 'renovacao') && typeof global.contratosLista === 'function') {
      try {
        var d = new Date(), ref = d.getFullYear() * 12 + d.getMonth();
        lista = contratosParaRenovar(global.contratosLista(), ref, renovacoes(), eder);
      } catch (e) { lista = []; }
    }
    if (!lista.length || !hubs) { if (el) el.remove(); return; }
    if (!el) {
      el = doc.createElement('section');
      el.id = 'mgb-renov';
      hubs.parentNode.insertBefore(el, hubs);
    }
    var renov = renovacoes();
    el.innerHTML = '<b>' + (eder ? 'Renovar por telefone · ' : 'Contratos vencendo · ') + lista.length + '</b>' +
      '<span>' + (eder ? 'Ligue para o cliente e marque o resultado. Renovado não precisa de Assinafy.' : 'Clique no cliente para encaminhar ao Eder. Ele renova por telefone.') + '</span>' +
      lista.map(function (c, i) {
        var info = contatoDe(c);
        var tel = String(info.tel || '').replace(/\D/g, '');
        var r = renov[chaveRenov(c)];
        var linha = '<div class="rv-lin" data-i="' + i + '"><button type="button" class="rv-nome" data-abre="' + i + '"><b>' + esc(c.nome) + '</b> · ' + esc(c.origem) +
          ' · vence ' + nomeMes(c.fimKey) + (r && r.s === 'eder' ? ' · <em>a Karen encaminhou</em>' : '') + '</button>' +
          '<div class="rv-caixa" id="rv-caixa-' + i + '" hidden>' +
          (info.responsavel ? '<div>Responsável: ' + esc(info.responsavel) + '</div>' : '') +
          (tel ? '<div>Telefone: <a href="tel:+55' + tel + '">' + esc(info.tel) + '</a> · <a href="https://wa.me/55' + tel + '" target="_blank" rel="noopener">WhatsApp</a></div>' : '') +
          '<div>Contrato de ' + (c.meses || 12) + ' meses' + (c.valor ? ', ' + esc('R$ ' + Number(c.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })) + '/mês' : '') + '.</div>' +
          (eder
            ? '<div class="rv-bts"><button type="button" class="rv-ok" data-renova="' + i + '">✓ Renovado com o cliente (+' + (c.meses || 12) + ' meses)</button><button type="button" class="rv-nao" data-nao="' + i + '">Não renovou</button></div>'
            : '<div class="rv-bts"><button type="button" class="rv-ok" data-enc="' + i + '">Encaminhar ao Eder para renovar por telefone</button></div>') +
          '</div></div>';
        return linha;
      }).join('');
    function marcarR(i, s, extra) {
      var c = lista[i];
      var r = renovacoes();
      r[chaveRenov(c)] = Object.assign({ s: s, em: new Date().toISOString().slice(0, 10), por: sessao ? sessao.usuario.login : '' }, extra || {});
      salvar();
      montarAvisoRenovacao();
    }
    el.querySelectorAll('[data-abre]').forEach(function (b) {
      b.addEventListener('click', function () { var cx = doc.getElementById('rv-caixa-' + b.getAttribute('data-abre')); if (cx) cx.hidden = !cx.hidden; });
    });
    el.querySelectorAll('[data-enc]').forEach(function (b) { b.addEventListener('click', function () { marcarR(+b.getAttribute('data-enc'), 'eder'); }); });
    el.querySelectorAll('[data-nao]').forEach(function (b) { b.addEventListener('click', function () { marcarR(+b.getAttribute('data-nao'), 'nao'); }); });
    el.querySelectorAll('[data-renova]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-renova'), c = lista[i];
        var obj = objetoDoContrato(c);
        var novo = estenderContrato(obj, c.meses);
        if (!novo) { b.textContent = 'Não achei o contrato no hub'; return; }
        estenderCustos(c);
        try { if (ehTelaVertical(c.origem)) global.syncAnuncReceita(); } catch (e) {}
        try { global.buildAll(); } catch (e) {}
        marcarR(i, 'renovado', { meses: c.meses || 12 });
      });
    });
  }

  function envolverNavegacao() {
    if (originais.goPage) return;
    ['goPage', 'goOperacional', 'openGerador', 'drillMod', 'ropsSetTab', 'showFerrTab'].forEach(function (nome) {
      if (typeof global[nome] === 'function') originais[nome] = global[nome];
    });
    if (originais.goPage) {
      global.goPage = function (p) {
        if (typeof p === 'string' && p.indexOf('operacional:') === 0) return global.goOperacional(p.slice(12));
        if (perfilAtual && !pode(perfilAtual, p)) {
          var ini = paginaInicial(perfilAtual);
          if (ini.indexOf('operacional:') === 0) return global.goOperacional(ini.slice(12));
          p = ini;
        }
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
        if (perfilAtual && !pode(perfilAtual, 'operacional:' + (g || 'contratos'))) {
          var ini = paginaInicial(perfilAtual);
          if (ini === 'operacional:' + (g || 'contratos')) return undefined; // evita laço
          return global.goPage(ini);
        }
        var r = originais.goOperacional.apply(this, arguments);
        aplicar();
        return r;
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

  function paginaInicial(perfil) { return (PERFIS[perfil] && PERFIS[perfil].inicio) || 'home'; }

  function definirPerfil() {
    if (!sessao) return;
    perfilAtual = perfilEfetivo(sessao.usuario.papel, modo(), verComo);
    aplicar();
    // Avisa quem monta tela por perfil (inicio.js) que o usuário/perfil ficou conhecido ou mudou.
    try { doc.dispatchEvent(new global.CustomEvent('mgb:perfil', { detail: { perfil: perfilAtual, usuario: sessao.usuario } })); } catch (e) {}
    if (typeof global.curPage === 'string' && !pode(perfilAtual, global.curPage)) global.goPage('home');
  }

  // ── Modo Estúdio (Cleiton) ─────────────────────────────────────────────
  function aplicarModoEstudio() {
    var ligado = !!(PERFIS[perfilAtual] && PERFIS[perfilAtual].modoEstudio);
    doc.body.classList.toggle('mgb-modo-estudio', ligado);
    var bar = doc.getElementById('mgb-estudio-bar');
    if (!ligado) { if (bar) bar.remove(); return; }
    if (bar) return;
    bar = doc.createElement('nav');
    bar.id = 'mgb-estudio-bar';
    bar.innerHTML = '<b>🎙️ Estúdio MGB</b>' +
      '<button type="button" data-ir="estudio">Spots e Blocos</button>' +
      '<button type="button" data-ir="etq">Etiquetas</button>' +
      '<button type="button" data-ir="sair" class="sair">Sair</button>';
    doc.body.insertBefore(bar, doc.body.firstChild);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ir]'); if (!b) return;
      var ir = b.getAttribute('data-ir');
      if (ir === 'estudio') global.goOperacional('estudio');
      else if (ir === 'etq') { global.goPage('ferramentas'); global.showFerrTab('etq'); }
      else sair();
    });
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
  // ── Login ──────────────────────────────────────────────────────────────
  // Novo (11/2026): e-mail e senha pelo Supabase Auth (global.MGBSupabase, criado no api-token.js).
  // O login antigo por usuário (HUB_USERS) continua aceito até o servidor desligar (LOGIN_ANTIGO=desligado).
  var sb = function () { return global.MGBSupabase || null; };

  function formulario(html) {
    injetarEstilos();
    var el = doc.getElementById('mgb-login');
    if (!el) { el = doc.createElement('div'); el.id = 'mgb-login'; doc.body.appendChild(el); }
    el.innerHTML = '<section class="mgb-marca"><img src="marca/mgb-logo-branco.svg" alt="MGB Mídia" width="140" height="72">' +
      '<div><h2>Hub MGB</h2><p>Faturamento, financeiro, clientes e Tela Vertical num lugar só.</p></div>' +
      '<small>Acesso só para a equipe MGB. Sessão de 12 horas.</small></section>' +
      '<div class="mgb-lado"><form novalidate>' + html + '</form></div>';
    return el;
  }

  function mostrarLogin(aviso) {
    var el = formulario(
      '<div style="display:flex;flex-direction:column;gap:6px"><h1>Entrar</h1><p>Use o e-mail e a senha do seu convite.</p></div>' +
      '<label for="mgb-usuario">E-mail<input id="mgb-usuario" name="email" type="email" autocomplete="username" autocapitalize="none" required></label>' +
      '<label for="mgb-senha">Senha<input id="mgb-senha" name="senha" type="password" autocomplete="current-password" required></label>' +
      '<div class="erro" role="alert" id="mgb-erro">' + esc(aviso || '') + '</div>' +
      '<button type="submit">Entrar</button>' +
      '<button type="button" class="link" id="mgb-esqueci">Esqueci minha senha</button>');
    var u = doc.getElementById('mgb-usuario');
    u.value = ler(K_ULTIMO) || '';
    (u.value ? doc.getElementById('mgb-senha') : u).focus();
    el.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      entrar(u.value, doc.getElementById('mgb-senha').value, el.querySelector('button[type=submit]'));
    });
    doc.getElementById('mgb-esqueci').addEventListener('click', function () { mostrarEsqueci(u.value); });
  }

  function entrar(usuario, senha, btn) {
    var erro = doc.getElementById('mgb-erro');
    usuario = String(usuario || '').trim().toLowerCase();
    if (!usuario || !senha) { erro.textContent = 'Preencha e-mail e senha.'; return; }
    btn.disabled = true; btn.textContent = 'Entrando…'; erro.textContent = '';
    var falhou = function (msg) { erro.textContent = msg; btn.disabled = false; btn.textContent = 'Entrar'; };

    if (usuario.indexOf('@') !== -1 && sb()) {
      sb().auth.signInWithPassword({ email: usuario, password: senha }).then(function (r) {
        if (r.error) return falhou(/invalid/i.test(r.error.message) ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar: ' + r.error.message);
        gravar(K_ULTIMO, usuario);
        global.location.reload(); // recarrega para buscar os dados já com o login
      }).catch(function () { falhou('Sem conexão com o servidor. Tente de novo.'); });
      return;
    }

    // login antigo (usuário sem @), enquanto o servidor aceitar
    fetch(API + '?action=login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuario, senha: senha })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'Não foi possível entrar.');
        gravar(K_ULTIMO, usuario);
        gravar(K_SESSAO, JSON.stringify({ token: res.j.token, usuario: res.j.usuario }));
        global.location.reload();
      })
      .catch(function (e) { falhou(e.message === 'Failed to fetch' ? 'Sem conexão com o servidor. Tente de novo.' : e.message); });
  }

  function mostrarEsqueci(email) {
    var el = formulario(
      '<h1>Trocar a senha</h1><p>Digite o seu e-mail. Se ele tiver acesso ao hub, você recebe um link para escolher uma senha nova.</p>' +
      '<label for="mgb-email-rec">E-mail<input id="mgb-email-rec" type="email" autocomplete="username" autocapitalize="none" required></label>' +
      '<div class="erro" role="alert" id="mgb-erro"></div>' +
      '<button type="submit">Enviar link</button><button type="button" class="link" id="mgb-voltar">Voltar</button>');
    var inp = doc.getElementById('mgb-email-rec');
    inp.value = String(email || '').indexOf('@') !== -1 ? email : ''; inp.focus();
    doc.getElementById('mgb-voltar').addEventListener('click', function () { mostrarLogin(); });
    el.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var erro = doc.getElementById('mgb-erro'), btn = el.querySelector('button[type=submit]');
      var em = inp.value.trim().toLowerCase();
      if (em.indexOf('@') === -1) { erro.textContent = 'Digite um e-mail válido.'; return; }
      if (!sb()) { erro.textContent = 'Serviço de login indisponível. Tente de novo.'; return; }
      btn.disabled = true; btn.textContent = 'Enviando…';
      sb().auth.resetPasswordForEmail(em, { redirectTo: global.location.origin + global.location.pathname }).then(function () {
        erro.className = 'ok';
        erro.textContent = 'Pronto. Se esse e-mail tiver acesso, o link chega em alguns minutos (olhe também o spam).';
        btn.textContent = 'Enviado';
      });
    });
  }

  // Link do e-mail de convite ou de troca de senha: o Supabase já abriu a sessão; falta escolher a senha.
  function mostrarCriarSenha(tipo) {
    var el = formulario(
      '<h1>' + (tipo === 'invite' ? 'Crie a sua senha' : 'Escolha a senha nova') + '</h1><p>Use pelo menos 10 caracteres.</p>' +
      '<label for="mgb-s1">Senha<input id="mgb-s1" type="password" autocomplete="new-password" required></label>' +
      '<label for="mgb-s2">Repita a senha<input id="mgb-s2" type="password" autocomplete="new-password" required></label>' +
      '<div class="erro" role="alert" id="mgb-erro"></div><button type="submit">Salvar e entrar</button>');
    doc.getElementById('mgb-s1').focus();
    el.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var s1 = doc.getElementById('mgb-s1').value, s2 = doc.getElementById('mgb-s2').value;
      var erro = doc.getElementById('mgb-erro'), btn = el.querySelector('button[type=submit]');
      if (s1.length < 10) { erro.textContent = 'A senha precisa ter pelo menos 10 caracteres.'; return; }
      if (s1 !== s2) { erro.textContent = 'As duas senhas não são iguais.'; return; }
      btn.disabled = true; btn.textContent = 'Salvando…';
      sb().auth.updateUser({ password: s1 }).then(function (r) {
        if (r.error) { erro.textContent = 'Não consegui salvar: ' + r.error.message; btn.disabled = false; btn.textContent = 'Salvar e entrar'; return; }
        global.MGB_AUTH_LINK = '';
        try { global.history.replaceState(null, '', global.location.pathname); } catch (e2) {}
        global.location.reload();
      });
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
    var fim = function () { mostrarLogin(); };
    if (sb()) sb().auth.signOut().then(fim, fim); else fim();
  }

  // Confere com o servidor quem é o usuário (o papel vale sempre o do cadastro atual).
  function confirmarUsuario(aoConfirmar) {
    fetch(API + '?action=me')
      .then(function (r) {
        if (r.status === 401 || r.status === 503 || r.status === 410) { sair(); return null; }
        return r.ok ? r.json() : null;
      })
      .then(function (j) { if (j && j.usuario) aoConfirmar(j.usuario); })
      .catch(function () { /* sem rede: mantém a sessão local */ });
  }

  // Cleiton (programação) não navega pelo hub: o perfil dele abre direto no modo Estúdio.
  function irParaPaginaDoPapel(usuario) {
    if (usuario && PERFIS[usuario.papel] && PERFIS[usuario.papel].inicio && global.goPage) {
      setTimeout(function () { global.goPage(paginaInicial(usuario.papel)); }, 0);
    }
    return false;
  }

  function iniciarSessaoNova() {
    var guardada = null;
    try { guardada = JSON.parse(ler(K_SESSAO) || 'null'); } catch (e) {}
    if (guardada && guardada.novo && guardada.usuario && !irParaPaginaDoPapel(guardada.usuario)) iniciarSessao(guardada);
    confirmarUsuario(function (u) {
      if (irParaPaginaDoPapel(u)) return;
      if (!sessao) iniciarSessao({ novo: true, usuario: u });
      else { sessao.usuario = u; gravar(K_SESSAO, JSON.stringify(sessao)); definirPerfil(); }
    });
  }

  function iniciarAntigo() {
    var s = null;
    try { s = JSON.parse(ler(K_SESSAO) || 'null'); } catch (e) {}
    var dados = s && !s.novo && decodificarToken(s.token);
    if (s && dados && dados.exp > Date.now()) {
      iniciarSessao(s);
      confirmarUsuario(function (u) { sessao.usuario = u; gravar(K_SESSAO, JSON.stringify(sessao)); definirPerfil(); });
      return;
    }
    gravar(K_SESSAO, null);
    mostrarLogin();
  }

  function iniciar() {
    if (!sb()) { iniciarAntigo(); return; }
    sb().auth.getSession().then(function (r) {
      var sess = r && r.data && r.data.session;
      if (sess && global.MGB_AUTH_LINK) { mostrarCriarSenha(global.MGB_AUTH_LINK); return; }
      if (sess) { iniciarSessaoNova(); return; }
      iniciarAntigo();
    }, iniciarAntigo);
  }

  global.MGBAcesso = Object.assign(api, { sair: sair, usuario: function () { return sessao && sessao.usuario ? sessao.usuario : null; }, perfil: function () { return perfilAtual; } });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
