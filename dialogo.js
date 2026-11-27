/* Hub MGB — janelas do próprio hub no lugar das do navegador (confirm, prompt, alert) — 27/11/2026.
 *
 * Pedido da Usabilidade: as caixinhas cinzas do navegador assustam, cortam texto no celular e não
 * mostram valores com destaque. Estas funções abrem um painel do hub e devolvem uma Promise:
 *   mgbConfirmar({titulo, texto, linhas:[[rótulo, valor]], botao, perigo})  → true / false
 *   mgbFormulario({titulo, texto, campos:[{nome, rotulo, tipo, valor, opcoes}], botao}) → {valores} ou null
 *   mgbAviso(texto, titulo)                                                 → (fecha no OK)
 * Esc ou clicar fora cancela. O foco vai para o primeiro campo (ou para o botão) e volta ao fechar.
 */
(function (global) {
  'use strict';
  var doc = global.document;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var CSS =
    '.mgbd-fundo{position:fixed;inset:0;z-index:100500;background:rgba(36,26,56,.45);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:"DM Sans",system-ui,sans-serif}' +
    '.mgbd{width:min(460px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:#241A38;border-radius:18px;box-shadow:0 20px 60px rgba(42,23,96,.3);padding:22px 22px 18px;display:flex;flex-direction:column;gap:14px;box-sizing:border-box}' +
    '.mgbd h2{margin:0;font-size:20px;font-weight:700;line-height:1.25}.mgbd p{margin:0;font-size:15px;line-height:1.5;color:#3A3446;white-space:pre-line}' +
    '.mgbd-linhas{display:flex;flex-direction:column;background:#F6F4FA;border-radius:12px;padding:4px 12px}.mgbd-linhas div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #E9E5F3;font-size:14px}.mgbd-linhas div:first-child{border-top:0}' +
    '.mgbd-linhas span{color:#5D5868}.mgbd-linhas b{font-weight:600;text-align:right}.mgbd-mono{font-family:"DM Mono",ui-monospace,monospace;font-weight:500!important}' +
    '.mgbd-campos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mgbd-campos label{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:#3A3446}.mgbd-campos .mgbd-largo{grid-column:1/-1}' +
    '.mgbd-campos input,.mgbd-campos select,.mgbd-campos textarea{min-height:42px;border:1px solid #CFC7E6;border-radius:10px;padding:8px 12px;font:15px "DM Sans",system-ui,sans-serif;color:#241A38;background:#fff;box-sizing:border-box;width:100%}' +
    '.mgbd-campos input:focus,.mgbd-campos select:focus,.mgbd-campos textarea:focus{outline:2px solid #ECE8FA;border-color:#4E38B2}' +
    '.mgbd-erro{color:#B42318;font-size:14px;margin:0}' +
    '.mgbd-acoes{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:2px}.mgbd-acoes button{min-height:44px;padding:0 18px;border-radius:10px;font:700 14px "DM Sans",system-ui,sans-serif;cursor:pointer}' +
    '.mgbd-sim{border:0;background:#4E38B2;color:#fff}.mgbd-sim:hover{background:#2A1760}.mgbd-sim.mgbd-perigo{background:#B42318}.mgbd-sim.mgbd-perigo:hover{background:#8E1B12}' +
    '.mgbd-nao{border:1px solid #CFC7E6;background:#fff;color:#2A1760;font-weight:600!important}.mgbd-nao:hover{background:#ECE8FA}' +
    '.mgbd button:focus-visible,.mgbd input:focus-visible,.mgbd select:focus-visible{outline:3px solid #6C55DB;outline-offset:2px}' +
    '@media (max-width:520px){.mgbd-fundo{align-items:flex-end;padding:0}.mgbd{border-radius:18px 18px 0 0;max-height:92vh;padding:20px 18px calc(16px + env(safe-area-inset-bottom,0px))}.mgbd-campos{grid-template-columns:minmax(0,1fr)}.mgbd-acoes button{flex:1}}';

  function estilos() { if (!doc.getElementById('mgbd-css')) { var s = doc.createElement('style'); s.id = 'mgbd-css'; s.textContent = CSS; (doc.head || doc.body).appendChild(s); } }

  function abrir(o, montar) {
    estilos();
    return new Promise(function (resolve) {
      var antes = doc.activeElement, fundo = doc.createElement('div');
      fundo.className = 'mgbd-fundo';
      fundo.innerHTML = '<div class="mgbd" role="dialog" aria-modal="true" aria-labelledby="mgbd-t"><h2 id="mgbd-t">' + esc(o.titulo || 'Confirmar') + '</h2>' + montar() +
        '<div class="mgbd-acoes">' + (o.semCancelar ? '' : '<button type="button" class="mgbd-nao">' + esc(o.cancelar || 'Cancelar') + '</button>') +
        '<button type="button" class="mgbd-sim' + (o.perigo ? ' mgbd-perigo' : '') + '">' + esc(o.botao || 'Confirmar') + '</button></div></div>';
      doc.body.appendChild(fundo);
      var caixa = fundo.querySelector('.mgbd');
      function fechar(v) { doc.removeEventListener('keydown', tecla, true); fundo.remove(); try { if (antes && antes.focus) antes.focus(); } catch (e) {} resolve(v); }
      function tecla(ev) {
        if (ev.key === 'Escape') { ev.preventDefault(); fechar(o.semCancelar ? true : null); }
        else if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA' && ev.target.tagName !== 'BUTTON') { ev.preventDefault(); sim(); }
        else if (ev.key === 'Tab') {
          var f = caixa.querySelectorAll('button,input,select,textarea'); if (!f.length) return;
          if (ev.shiftKey && doc.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
          else if (!ev.shiftKey && doc.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
        }
      }
      function sim() { var r = o.coletar ? o.coletar(caixa) : true; if (r === undefined) return; fechar(r); }
      fundo.addEventListener('mousedown', function (ev) { if (ev.target === fundo && !o.semCancelar) fechar(null); });
      caixa.querySelector('.mgbd-sim').addEventListener('click', sim);
      var nao = caixa.querySelector('.mgbd-nao'); if (nao) nao.addEventListener('click', function () { fechar(null); });
      doc.addEventListener('keydown', tecla, true);
      var primeiro = caixa.querySelector('input,select,textarea') || (o.focoCancelar && nao) || caixa.querySelector('.mgbd-sim'); // ação de verdade (dinheiro): foco no Cancelar, Enter sem querer não dispara
      setTimeout(function () { try { primeiro.focus(); if (primeiro.select && primeiro.tagName === 'INPUT') primeiro.select(); } catch (e) {} }, 30);
    });
  }
  function linhasHtml(l) {
    return l && l.length ? '<div class="mgbd-linhas">' + l.map(function (x) { return '<div><span>' + esc(x[0]) + '</span><b' + (x[2] ? ' class="mgbd-mono"' : '') + '>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>' : '';
  }

  global.mgbConfirmar = function (o) {
    if (typeof o === 'string') o = { texto: o };
    return abrir(o, function () { return (o.texto ? '<p>' + esc(o.texto) + '</p>' : '') + linhasHtml(o.linhas) + (o.nota ? '<p style="font-size:13px;color:#5D5868">' + esc(o.nota) + '</p>' : ''); }).then(function (v) { return v === true; });
  };
  global.mgbAviso = function (texto, titulo) {
    return abrir({ titulo: titulo || 'Atenção', botao: 'OK', semCancelar: true }, function () { return '<p>' + esc(texto) + '</p>'; });
  };
  global.mgbFormulario = function (o) {
    o.coletar = function (caixa) {
      var v = {}, erro = caixa.querySelector('.mgbd-erro');
      Array.prototype.forEach.call(caixa.querySelectorAll('[data-mgbd]'), function (el) { v[el.getAttribute('data-mgbd')] = el.value; });
      var msg = o.validar ? o.validar(v) : '';
      if (msg) { erro.textContent = msg; erro.hidden = false; return undefined; }
      return v;
    };
    return abrir(o, function () {
      return (o.texto ? '<p>' + esc(o.texto) + '</p>' : '') + linhasHtml(o.linhas) + '<div class="mgbd-campos">' + o.campos.map(function (c, i) {
        var id = 'mgbd-c' + i, attr = ' id="' + id + '" data-mgbd="' + esc(c.nome) + '"';
        var campo = c.tipo === 'select' ? '<select' + attr + '>' + c.opcoes.map(function (op) { var val = Array.isArray(op) ? op[0] : op, rot = Array.isArray(op) ? op[1] : op; return '<option value="' + esc(val) + '"' + (String(val) === String(c.valor) ? ' selected' : '') + '>' + esc(rot) + '</option>'; }).join('') + '</select>'
          : c.tipo === 'textarea' ? '<textarea' + attr + ' rows="3">' + esc(c.valor || '') + '</textarea>'
          : '<input' + attr + ' type="' + (c.tipo || 'text') + '"' + (c.inputmode ? ' inputmode="' + c.inputmode + '"' : '') + ' value="' + esc(c.valor == null ? '' : c.valor) + '"' + (c.placeholder ? ' placeholder="' + esc(c.placeholder) + '"' : '') + '>';
        return '<label for="' + id + '"' + (c.largo ? ' class="mgbd-largo"' : '') + '>' + esc(c.rotulo) + campo + '</label>';
      }).join('') + '</div><p class="mgbd-erro" role="alert" hidden></p>';
    });
  };
})(window);
