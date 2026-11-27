/* Hub MGB — Design System aplicado às telas antigas (24/11/2026).
 *
 * Vale para: Tela Vertical (Mês e sócio, Condomínios, Anunciantes, Despesas), contratos e propostas,
 * Cobrança mensal, Recibos / Nota Fiscal / Léo, Visão Receita e Empresa, Ferramentas e Estúdio.
 *
 * Não muda nenhum cálculo nem o que os botões fazem. Só:
 *   1. aplica as cores, letras, cantos e botões do Design System aprovado (CSS abaixo);
 *   2. troca os emojis de abas, títulos, botões e rótulos por ícones de linha (ou só tira o emoji);
 *   3. transforma situações escritas com emoji ("⏳ pendente", "✅ pago") em chips com ícone e palavra.
 * Não toca: documentos e prévias de impressão (recibo, etiqueta, contratos, propostas — ficam em iframes
 * ou em .mgb-etq / #rec-prev), nem o texto que as pessoas digitaram.
 */
(function (global) {
  'use strict';
  var doc = global.document;
  var ESCOPO = '#page-overview,#page-operacional,#page-relatorios,#page-ferramentas,#page-contabilidade';

  // ── Ícones de linha (mesmo traço do menu e do Design System) ────────────
  var IC = {
    inicio: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    faturamento: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 11h6M9 15h6"/>',
    financeiro: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    comercial: '<path d="M3 11l18-8-8 18-2-8z"/>',
    clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 11h6M19 8v6"/>',
    radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l10-5M16 14h.01M8 14h4"/>',
    'tela-vertical': '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    empresa: '<path d="M4 21V5l8-3v19M12 9h8v12M2 21h20M8 8h.01M8 12h.01M8 16h.01M16 13h.01M16 17h.01"/>',
    receita: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    despesa: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    recibo: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    contrato: '<path d="M14 2H6v20h12V6z"/><path d="M14 2v4h4"/><path d="M8 17c1.5-2 3-2 3.5 0s2 2 3.5-.5"/>',
    documento: '<path d="M14 2H6v20h12V6z"/><path d="M14 2v4h4M9 13h6M9 17h6"/>',
    calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    estudio: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
    spot: '<path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 10v4"/>',
    etiqueta: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    adicionar: '<path d="M12 5v14M5 12h14"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    apagar: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
    baixar: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    enviar: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
    mensagem: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    ok: '<path d="M20 6L9 17l-5-5"/>',
    atencao: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5h.01"/>',
    erro: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    pendente: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    fechar: '<path d="M18 6L6 18M6 6l12 12"/>',
    ajustes: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    impressora: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    atualizar: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    pasta: '<path d="M3 6h6l2 2h10v11H3z"/>',
    imagem: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 18v3"/>',
    calculadora: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h4"/>',
    sinal: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
    visivel: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    anexo: '<path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
    cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };
  function svg(nome, cls) {
    return '<svg class="' + (cls || 't2-ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[nome] || '') + '</svg>';
  }

  // Emoji → ícone. Emoji sem par aqui só é retirado (o texto fica).
  var EMOJI = {
    '📊': 'financeiro', '📈': 'receita', '📉': 'financeiro', '🏢': 'empresa', '💼': 'empresa', '🧴': 'empresa', '📣': 'comercial', '🎯': 'comercial',
    '💸': 'despesa', '💳': 'despesa', '💰': 'receita', '💵': 'receita', '🪙': 'receita', '📄': 'documento', '📃': 'documento', '📑': 'documento',
    '✍': 'contrato', '🖊': 'contrato', '📝': 'editar', '✎': 'editar', '✏': 'editar', '🛗': 'tela-vertical', '📺': 'tela-vertical', '📱': 'tela-vertical',
    '🤝': 'clientes', '👥': 'clientes', '👤': 'usuario', '🏷': 'etiqueta', '📡': 'sinal', '🧾': 'recibo', '🚀': 'faturamento', '📅': 'calendario',
    '🗓': 'calendario', '📆': 'calendario', '🔍': 'buscar', '🔎': 'buscar', '✅': 'ok', '✓': 'ok', '✔': 'ok', '⚠': 'atencao', '❌': 'fechar', '✕': 'fechar',
    '✖': 'fechar', '⏳': 'pendente', '⏰': 'pendente', '🕐': 'pendente', '🎙': 'estudio', '🎤': 'estudio', '🎧': 'estudio', '📻': 'radio', '🔊': 'spot', '🎵': 'spot',
    '🖨': 'impressora', '🔄': 'atualizar', '🔁': 'atualizar', '♻': 'atualizar', '🔗': 'link', '📋': 'pasta', '📁': 'pasta', '📂': 'pasta', '🗂': 'pasta',
    '📇': 'pasta', '🗑': 'apagar', '⚙': 'ajustes', '🛠': 'ajustes', '🔧': 'ajustes', '⬇': 'baixar', '📥': 'baixar', '💾': 'baixar', '⬆': 'enviar', '📤': 'enviar',
    '📧': 'email', '✉': 'email', '📨': 'email', '📩': 'email', '📲': 'mensagem', '💬': 'mensagem', '📞': 'mensagem', '🏠': 'inicio', '🏪': 'empresa', '🏬': 'empresa',
    '🖼': 'imagem', '📷': 'imagem', '🎬': 'video', '🎞': 'video', '🔳': 'qr', '🧮': 'calculadora', '👁': 'visivel', '📎': 'anexo', '🔒': 'cadeado', '🔐': 'cadeado',
    '➕': 'adicionar', '＋': 'adicionar'
  };
  // Abas sem emoji também ganham ícone (pelo nome)
  var ABA = {
    'contrato mercadão': 'contrato', 'contrato vaapty': 'contrato', 'contratos salvos': 'pasta', 'gerador de spots': 'spot', 'blocos rádio': 'radio',
    'pdf': 'documento', 'imagem': 'imagem', 'vídeo': 'video', 'qr & links': 'qr', 'calculadoras': 'calculadora', 'backup': 'baixar',
    'mercadão': 'radio', 'vaapty': 'contrato', 'tela vertical': 'tela-vertical', 'léo': 'empresa'
  };
  // Situação escrita com emoji → chip
  var SIT = { '⏳': 'atencao', '⏰': 'atencao', '🕐': 'atencao', '✅': 'ok', '✓': 'ok', '✔': 'ok', '🟢': 'ok', '❌': 'erro', '🔴': 'erro', '⛔': 'erro', '⚠': 'atencao', '🟡': 'atencao' };
  var SIT_IC = { ok: 'ok', atencao: 'pendente', erro: 'erro' };

  var RE_EMO = /^[\s‍]*((?:[⌚⌛⏩-⏺☀-➿⬅-⭕＋]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF])(?:️|‍|\uD83C[\uDFFB-\uDFFF])*(?:(?:\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF])️?)*)\s*/;
  function chave(e) { return e.replace(/[️‍]|\uD83C[\uDFFB-\uDFFF]/g, ''); }
  // Setas e sinais que fazem parte do texto (não são decoração): não mexer
  var MANTER = { '→': 1, '←': 1, '↔': 1, '↩': 1, '↪': 1, '↑': 1, '↓': 1, '▶': 1, '▸': 1, '▼': 1, '▾': 1, '◀': 1, '★': 1, '☆': 1, '•': 1, '·': 1 };

  var CROMO = '.hub-tab,.ferr-tab,.rel-tab,.ptab,.ferr-t,.sec-title,.ttitle,.cc-title,.ov-summary,.acc-hdr,.thead3,.page-sub,.ferr-lbl,.anunc-form-lbl,.parc-label,.glabel,.modal-title,' +
    'button,.ferr-btn,.anunc-btn,.badd,.ltab-btn,summary,details>div,label,th,option,[style*="uppercase"],[style*="Syne"],[style*="font-weight:700"],[style*="font-weight:800"],[style*="font:700"],[style*="font:800"],b,strong,h2,h3,h4';
  var FORA = '.mgb-etq,#rec-prev,#rec-preview,.contract-frame,iframe,textarea,[contenteditable],.t2-feito-nunca';

  function primeiroTexto(el) {
    var w = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) { if (n.nodeValue.trim()) return n; }
    return null;
  }

  function tratarEmoji(el) {
    if (el.closest(FORA)) return;
    var n = primeiroTexto(el); if (!n) return;
    // só o começo do elemento (emoji no meio de uma frase fica)
    if (n.parentNode !== el && !el.contains(n)) return;
    var m = RE_EMO.exec(n.nodeValue); if (!m) return;
    var e = m[1], k = Array.from(chave(e))[0] || '';
    if (MANTER[k]) return;
    var resto = n.nodeValue.slice(m[0].length);
    var ehOpcao = el.tagName === 'OPTION';
    // Situação curta numa célula/etiqueta → chip
    var tom = SIT[k];
    var cel = el.tagName === 'TD' || el.tagName === 'SPAN' || el.tagName === 'DIV';
    if (tom && cel && !ehOpcao && el.children.length === 0 && resto.trim().length > 0 && resto.trim().length <= 34) {
      el.classList.add('t2-chip', 't2-' + tom);
      el.innerHTML = svg(SIT_IC[tom], 't2-ico t2-ico-chip') + '<span>' + esc(resto.trim()) + '</span>';
      return;
    }
    n.nodeValue = (n.nodeValue.slice(0, m.index)) + resto;
    if (ehOpcao || !EMOJI[k]) return;
    // Ícone só onde ajuda a reconhecer: abas, títulos e botões
    if (el.matches('.hub-tab,.ferr-tab,.rel-tab,.ptab,.ferr-t,.sec-title,.ttitle,.cc-title,button,.ferr-btn,.anunc-btn,.badd,.ltab-btn,[style*="Syne"],h2,h3') && !el.querySelector(':scope > .t2-ico')) {
      n.parentNode.insertBefore(htmlNo(svg(EMOJI[k])), n);
      el.classList.add('t2-com-ico');
    }
  }
  function htmlNo(h) { var t = doc.createElement('template'); t.innerHTML = h; return t.content.firstChild; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function iconeAba(el) {
    if (el.querySelector('.t2-ico')) return;
    var nome = ABA[(el.textContent || '').trim().toLowerCase()];
    if (!nome) return;
    el.insertBefore(htmlNo(svg(nome)), el.firstChild);
    el.classList.add('t2-com-ico');
  }

  var agendado = false;
  function passar() {
    agendado = false;
    var raizes = doc.querySelectorAll(ESCOPO);
    for (var i = 0; i < raizes.length; i++) {
      var r = raizes[i];
      if (r.offsetParent === null && !r.classList.contains('active')) continue; // só a tela aberta
      var els = r.querySelectorAll(CROMO);
      for (var j = 0; j < els.length; j++) { try { tratarEmoji(els[j]); } catch (e) {} }
      // células de tabela com situação
      var tds = r.querySelectorAll('td,td>span,td>div');
      for (var t = 0; t < tds.length; t++) { if (!tds[t].classList.contains('t2-chip')) { try { tratarEmoji(tds[t]); } catch (e) {} } }
      var infos = r.querySelectorAll('.ferr-info');
      for (var v = 0; v < infos.length; v++) { infos[v].classList.toggle('t2-vazio', !infos[v].textContent.trim() && !infos[v].querySelector('img,svg,canvas,input,button,a')); }
      var abas = r.querySelectorAll('.hub-tab,.ferr-tab,.rel-tab');
      for (var a = 0; a < abas.length; a++) { try { iconeAba(abas[a]); } catch (e) {} }
    }
  }
  function agendar() { if (agendado) return; agendado = true; (global.requestAnimationFrame || setTimeout)(passar, 60); }

  // ── Estilo: Design System sobre as telas antigas ────────────────────────
  var S = ESCOPO.split(',');
  function em(sel) { return S.map(function (p) { return sel.split(',').map(function (x) { return p + ' ' + x; }).join(','); }).join(','); }
  var CSS =
    // ícones e chips
    '.t2-ico{width:18px;height:18px;flex:none;vertical-align:-3px;margin-right:6px}' +
    '.t2-vazio{display:none!important}' +
    '.t2-chip{display:inline-flex!important;align-items:center;gap:5px;font:600 12.5px/16px "DM Sans",system-ui,sans-serif!important;padding:4px 10px!important;border-radius:999px!important;white-space:nowrap;width:auto!important}' +
    '.t2-chip .t2-ico-chip{width:14px;height:14px;margin:0;vertical-align:0}' +
    '.t2-chip.t2-ok{color:#15803D!important;background:#E8F6EE!important}.t2-chip.t2-atencao{color:#8A4B08!important;background:#FDF2E3!important}.t2-chip.t2-erro{color:#B42318!important;background:#FDECEA!important}' +
    // abas com ícone
    em('.hub-tab,.ferr-tab,.rel-tab') + '{font:600 14px "DM Sans",system-ui,sans-serif!important;color:#5D5868!important;padding:13px 14px!important;border-bottom:3px solid transparent!important;background:none!important;white-space:nowrap}' +
    em('.hub-tab .t2-ico,.ferr-tab .t2-ico,.rel-tab .t2-ico') + '{margin-right:8px}' +
    em('.hub-tab:hover,.ferr-tab:hover,.rel-tab:hover') + '{color:#241A38!important}' +
    em('.hub-tab.active,.ferr-tab.on,.ferr-tab.active,.rel-tab.active') + '{color:#4E38B2!important;border-bottom-color:#4E38B2!important}' +
    em('.hub-tabs,.ferr-tabs,.rel-tabs') + '{border-bottom:1px solid #E4DFF0!important;overflow-x:auto;scrollbar-width:none;gap:4px!important}' +
    // cartões: raio 18, sem sombra, contorno da borda
    em('.ferr-card,.tcard,.anunc-section,.parc-section,.cc,.ov-card,.ov-chart-card,.scard,.gen-fs,.parc-fs,.rec-card,.pb-card') + '{border-radius:18px!important;border:1px solid #E4DFF0!important;box-shadow:none!important;background:#fff!important}' +
    em('.ferr-t,.sec-title,.ttitle,.cc-title') + '{font:700 18px/24px "DM Sans",system-ui,sans-serif!important;color:#241A38!important}' +
    em('.ferr-d,.cc-sub') + '{font-size:14px!important;line-height:20px!important;color:#5D5868!important}' +
    em('.ferr-info:not([style*="color"])') + '{background:#ECE8FA!important;color:#2A1760!important;border:0!important;border-radius:12px!important;padding:12px 16px!important;font-size:14px!important;line-height:20px!important}' +
    // números (KPIs)
    em('.kpi,.fstat,.bwstat') + '{border-radius:18px!important;border:1px solid #E4DFF0!important;background:#fff!important;box-shadow:none!important}' +
    em('.kpi-val,.fstat-n,.bwstat-n') + '{font-family:"DM Mono",ui-monospace,monospace!important;font-weight:600!important;color:#241A38}' +
    em('.kpi-lbl,.fstat-l,.bwstat-l') + '{font:600 12px "DM Sans",system-ui,sans-serif!important;letter-spacing:.05em!important;text-transform:uppercase;color:#5D5868!important}' +
    // botões: principal roxo, secundário branco, sem degradê
    em('.badd,.ferr-btn:not([style*="background:transparent"]),.scard-btn,.ci-btn') + '{background:#4E38B2!important;color:#fff!important;border:0!important;border-radius:10px!important;min-height:40px;font:700 14px "DM Sans",system-ui,sans-serif!important;box-shadow:none!important}' +
    em('.badd:hover,.ferr-btn:not([style*="background:transparent"]):hover') + '{background:#2A1760!important;filter:none!important}' +
    em('button[style*="gradient"],a[style*="gradient"][onclick],.btn-primary') + '{background:#4E38B2!important;color:#fff!important;border:0!important;border-radius:10px!important;box-shadow:none!important;text-shadow:none!important}' +
    em('button[style*="gradient"]:hover') + '{background:#2A1760!important}' +
    em('.anunc-btn,.ltab-btn') + '{border:1px solid #CFC7E6!important;background:#fff!important;color:#2A1760!important;border-radius:10px!important;font:600 13px "DM Sans",system-ui,sans-serif!important;min-height:36px}' +
    em('.anunc-btn.del,button[style*="color:#B42318"][style*="background:#fff"],button[style*="color:var(--red)"]') + '{color:#B42318!important;border-color:#F3C2BD!important}' +
    // botões verdes / rosas soltos viram secundários ou principais
    em('button[style*="background:#16a34a"],button[style*="background:#15803D"],button[style*="background:var(--green)"],button[style*="background:#0F9D58"],button[style*="background:#10b981"],button[style*="background:#059669"]') + '{background:#4E38B2!important;color:#fff!important;border:0!important}' +
    em('button[style*="border:1.5px solid var(--green)"],button[style*="border:1px solid var(--green)"],button[style*="border:2px solid var(--green)"]') + '{border:1px solid #CFC7E6!important;color:#2A1760!important;background:#fff!important}' +
    // campos
    em('.anunc-form-inp,.parc-input,.ferr-in,.gselect,.psearch input,' + ['select', 'input[type=text]', 'input[type=number]', 'input[type=date]', 'input[type=month]', 'input[type=email]', 'input[type=search]', 'input[type=tel]'].map(function (x) { return x + ':not([class*="fat2-"]):not([class*="fin2-"]):not([class*="cli2-"])'; }).join(',')) + '{font-family:"DM Sans",system-ui,sans-serif!important;border:1px solid #CFC7E6!important;border-radius:10px!important;background:#fff;color:#241A38!important;min-height:40px}' +
    em('.anunc-form-inp:focus,.parc-input:focus,.ferr-in:focus,select:focus,input:focus') + '{border-color:#4E38B2!important;outline:2px solid #ECE8FA!important}' +
    em('.anunc-form-lbl,.parc-label,.ferr-lbl,.glabel') + '{font:600 13px/18px "DM Sans",system-ui,sans-serif!important;color:#3A3446!important;text-transform:none!important;letter-spacing:0!important}' +
    em('input[type=file]') + '{font:14px "DM Sans",system-ui,sans-serif;color:#5D5868;border:1px dashed #CFC7E6;border-radius:12px;padding:10px;background:#fff;max-width:100%}' +
    em('input[type=file]::file-selector-button') + '{font:600 13px "DM Sans",system-ui,sans-serif;border:1px solid #CFC7E6;background:#fff;color:#2A1760;border-radius:8px;padding:7px 12px;margin-right:10px;cursor:pointer}' +
    // tabelas
    em('table') + '{font-variant-numeric:tabular-nums}' +
    em('th') + '{font:700 12px/16px "DM Sans",system-ui,sans-serif!important;letter-spacing:.05em!important;text-transform:uppercase;color:#5D5868!important;background:#fff!important}' +
    em('td') + '{border-top-color:#EFEBF7!important}' +
    em('details>summary') + '{cursor:pointer}' +
    // resumos "por que muda" da Visão Receita / Empresa: avisos do Design System
    em('details[style*="background:#FFF7ED"],div[style*="background:#FFF7ED"],details[style*="background:#fff7ed"]') + '{background:#FDF2E3!important;border:0!important;border-radius:12px!important;color:#6B3A06}' +
    em('details[style*="background:#F5F3FF"],div[style*="background:#F5F3FF"],details[style*="background:#f5f3ff"]') + '{background:#ECE8FA!important;border:0!important;border-radius:12px!important;color:#2A1760}' +
    // Tela Vertical: a paleta azul/dourada das telas internas vira a do hub (os documentos e propostas ficam como estão)
    '#page-operacional [style*="Syne"]{font-family:"DM Sans",system-ui,sans-serif!important;font-weight:700!important;font-size:20px!important;letter-spacing:-.01em;color:#241A38!important}' +
    '#page-operacional [style*="color:#16294F"],#page-operacional [style*="color: #16294F"]{color:#241A38!important}' +
    '#page-operacional [style*="color:#6b6380"],#page-operacional [style*="color:#6B6380"]{color:#5D5868!important}' +
    '#page-operacional [style*="color:#118A5D"]{color:#15803D!important}' +
    '#page-operacional [style*="border:1px solid #E3D8BF"],#page-operacional [style*="border: 1px solid #E3D8BF"]{border-color:#E4DFF0!important}' +
    '#page-operacional [style*="border-radius:12px"][style*="#E3D8BF"],#page-operacional [style*="border-radius:14px"][style*="#E3D8BF"]{border-radius:18px!important}' +
    '#page-operacional [style*="background:#F7F3EA"],#page-operacional [style*="background:#FBF6E8"],#page-operacional [style*="background:#FAF6EC"]{background:#F6F4FA!important;border-color:#E4DFF0!important}' +
    '#page-operacional [style*="linear-gradient(135deg,#16294F"],#page-operacional [style*="linear-gradient(135deg, #16294F"]{background:#4E38B2!important;color:#fff!important;border:0!important}' +
    '#page-operacional button[style*="background:#16294F"]{background:#4E38B2!important;color:#fff!important}' +
    '#page-operacional button[style*="color:#16294F"]{color:#2A1760!important;border-color:#CFC7E6!important}' +
    '#page-operacional button[style*="#E3D8BF"]:hover{background:#ECE8FA!important}' +
    '#page-operacional input[style*="#E3D8BF"],#page-operacional select[style*="#E3D8BF"]{border-color:#CFC7E6!important;border-radius:10px!important;min-height:38px}' +
    '#page-operacional .tv-gestao [style*="font-size:10px"][style*="uppercase"],#tvp-root [style*="font-size:10px"][style*="uppercase"],#tvc-root [style*="font-size:10px"]{font-size:12px!important;letter-spacing:.05em!important;color:#5D5868!important}' +
    '#tvp-root [style*="min-width:150px"] > div:nth-child(2),#tvc-root td[style*="text-align:right"]{font-family:"DM Mono",ui-monospace,monospace!important}' +
    '#tvp-root [style*="min-width:150px"]{border-radius:18px!important;padding:16px 18px!important}' +
    // Cobrança mensal: abas e cabeçalho
    '#page-relatorios .rel-tab{min-height:44px}' +
    '#page-relatorios [style*="background:linear-gradient"]:not(button){background:#fff!important;border:1px solid #E4DFF0!important;color:#241A38!important}' +
    // celular
    // barra de baixo do celular: ícones de linha no lugar dos emojis
    '.mbn-icon .t2-ico{width:22px;height:22px;margin:0;vertical-align:0;display:block}' +
    '.mbn-btn .mbn-icon{display:flex;justify-content:center;color:#5D5868;font-size:0}.mbn-btn.on .mbn-icon{color:#4E38B2}' +
    '@media (max-width:760px){' + em('.hub-tabs,.ferr-tabs,.rel-tabs,.hub-nav,div:has(>.ferr-tab),div:has(>.rel-tab)') + '{flex-wrap:nowrap!important;overflow-x:auto!important;white-space:nowrap;scrollbar-width:none;gap:0!important}' +
      em('.hub-nav>.hub-tab,div:has(>.ferr-tab)>.ferr-tab,div:has(>.rel-tab)>.rel-tab') + '{flex:none}' +
      em('.ferr-grid') + '{grid-template-columns:1fr!important}}';

  function barraCelular() {
    var mapa = { 'mbn-home': 'inicio', 'mbn-fin': 'financeiro', 'mbn-pes': 'despesa', 'mbn-op': 'contrato', 'mbn-mais': 'menu' };
    Object.keys(mapa).forEach(function (id) {
      var b = doc.getElementById(id), ic = b && b.querySelector('.mbn-icon');
      if (ic && !ic.querySelector('svg')) ic.innerHTML = svg(mapa[id]);
    });
  }
  IC.menu = '<path d="M4 6h16M4 12h16M4 18h16"/>';

  function ligar() {
    if (!doc.getElementById('telas2-css')) {
      var s = doc.createElement('style'); s.id = 'telas2-css'; s.textContent = '@media screen{' + CSS + '}';
      (doc.body || doc.head).appendChild(s);
    }
    passar(); barraCelular();
    try { new MutationObserver(agendar).observe(doc.body, { childList: true, subtree: true, characterData: false }); } catch (e) {}
    // trocar de tela/aba também refaz a passada
    doc.addEventListener('click', function () { setTimeout(agendar, 30); }, true);
  }

  global.MGBTelas2 = { passar: passar, icones: IC };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ligar); else ligar();
})(window);
