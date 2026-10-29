/* Hub MGB — assistente virtual (chat). Só informa e orienta; não executa nada.
 * Backend: bot/api/assistente.js (exige o login do hub). Aparece só para quem está logado.
 * Quem vê valores (admin/financeiro) manda junto um resumo do mês; os outros papéis, não. */
(function (global) {
  'use strict';
  var API = 'https://mgb-financeiro.vercel.app/api/assistente';
  var historico = [];
  var aberto = false, ocupado = false;

  function sessao() {
    try { return JSON.parse(localStorage.getItem('mgb_sessao') || 'null'); } catch (e) { return null; }
  }
  function brl(v) { return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  // Markdown mínimo e seguro: **negrito**, listas "- " e quebras de linha (texto escapado antes)
  function md(s) {
    var t = esc(s).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,;:!?]|$)/g, '$1<i>$2</i>');
    return t.split('\n').map(function (l) {
      var m = /^\s*[-•]\s+(.*)$/.exec(l);
      return m ? '<div style="padding-left:14px;text-indent:-10px">• ' + m[1] + '</div>' : (l.trim() ? '<div>' + l + '</div>' : '<div style="height:6px"></div>');
    }).join('');
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Resumo somente leitura: mês corrente em detalhe (receita por módulo, quem não pagou, despesas, faturamento),
  // o mês seguinte também com a lista de clientes, e uma linha por mês de 3 meses atrás até 8 à frente (para "e novembro? e dezembro?").
  function resumoMes(ano, mes, detalhe) {
    var out = [];
    var nomeMes = (typeof MESES !== 'undefined' ? MESES[mes] : (mes + 1)) + '/' + ano;
    var L = coletaClientesMes(ano, mes);
    var tot = 0, pago = 0, porMod = {};
    L.forEach(function (l) { tot += l.valor; if (l.pago) pago += l.valor; porMod[l.modLabel] = (porMod[l.modLabel] || 0) + l.valor; });
    var desp = 0, nd = 0;
    try { var D = coletaDespesasMes(ano, mes); nd = D.length; desp = D.reduce(function (s, d) { return s + (Number(d.vlrMes) || 0); }, 0); } catch (e) {}
    out.push('Mês: ' + nomeMes + ' | Receita prevista: ' + brl(tot) + ' | Já recebido: ' + brl(pago) + ' | A receber: ' + brl(tot - pago) + ' | Despesas: ' + brl(desp) + ' (' + nd + ' lançamentos) | Resultado previsto: ' + brl(tot - desp));
    out.push('Receita por módulo: ' + Object.keys(porMod).map(function (k) { return k + ' ' + brl(porMod[k]); }).join('; '));
    if (detalhe) {
      var abertos = L.filter(function (l) { return !l.pago; });
      if (abertos.length) {
        out.push('Ainda NÃO recebidos (' + abertos.length + '):');
        abertos.slice(0, 80).forEach(function (l) { out.push('- ' + l.modLabel + ' · ' + l.item + ': ' + brl(l.valor) + (l.asaas && l.asaas.st ? ' (Asaas: ' + l.asaas.st + ')' : '')); });
      }
      var rec = L.filter(function (l) { return l.pago; });
      if (rec.length) out.push('Já recebidos: ' + rec.slice(0, 60).map(function (l) { return l.item + ' ' + brl(l.valor); }).join('; '));
    }
    return out;
  }
  function contexto() {
    var out = [];
    var hoje = new Date(), ano = hoje.getFullYear(), mes = hoje.getMonth();
    try { out = out.concat(['== MÊS ATUAL (detalhe) =='], resumoMes(ano, mes, true)); } catch (e) { out.push('(não consegui montar o resumo de receita)'); }
    try {
      var c = new Date(), key = c.getFullYear() + '-' + String(c.getMonth() + 1).padStart(2, '0');
      var emitidas = Object.keys(fatEmissoes || {}).filter(function (k) { return k.slice(-7) === key && (fatEmissoes[k].status === 'emitida' || fatEmissoes[k].status === 'aguardando-nota'); });
      out.push('Faturamento ' + key + ': ' + emitidas.length + ' cliente(s) com nota/boleto emitidos pelo hub.');
    } catch (e) {}
    try {
      var p = new Date(ano, mes + 1, 1);
      out.push('', '== PRÓXIMO MÊS (detalhe) ==');
      out = out.concat(resumoMes(p.getFullYear(), p.getMonth(), true));
    } catch (e) {}
    try {
      out.push('', '== OUTROS MESES (previsão do hub: contratos + despesas lançadas; meses futuros ainda sem recebimento) ==');
      for (var i = -3; i <= 8; i++) {
        if (i === 0 || i === 1) continue;
        var d = new Date(ano, mes + i, 1);
        out.push(resumoMes(d.getFullYear(), d.getMonth(), false).join(' || '));
      }
    } catch (e) {}
    return out.join('\n');
  }

  function telaAtual() {
    var el = document.querySelector('.sb-nav-item.on');
    return el ? (el.getAttribute('title') || el.textContent || '').trim().slice(0, 60) : '';
  }

  function estilos() {
    if (document.getElementById('mgb-ass-css')) return;
    var s = document.createElement('style'); s.id = 'mgb-ass-css';
    s.textContent =
      '#mgb-ass-btn{position:fixed;right:16px;bottom:68px;z-index:99990;border:0;border-radius:999px;padding:12px 18px;background:#4E38B2;color:#fff;font:600 13.5px "DM Sans",system-ui,sans-serif;box-shadow:0 8px 24px rgba(30,15,80,.3);cursor:pointer}' +
      '#mgb-ass{display:none;position:fixed;right:16px;bottom:120px;width:min(400px,calc(100vw - 24px));height:min(560px,calc(100vh - 150px));z-index:99991;background:var(--surface,#fff);border:1px solid var(--border,#ddd);border-radius:16px;box-shadow:0 16px 48px rgba(30,15,80,.28);flex-direction:column;overflow:hidden;font-family:"DM Sans",system-ui,sans-serif}' +
      '#mgb-ass.on{display:flex}' +
      '@media (max-width:768px){#mgb-ass-btn{bottom:136px;right:12px}#mgb-ass{bottom:188px;right:12px}}' +
      '#mgb-ass header{padding:12px 14px;background:#4E38B2;color:#fff;display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:14px}' +
      '#mgb-ass header button{background:none;border:0;color:#fff;font-size:18px;cursor:pointer}' +
      '#mgb-ass-msgs{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:var(--bg,#f6f4fb)}' +
      '.mgb-ass-m{max-width:88%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.5;word-wrap:break-word}' +
      '.mgb-ass-m.u{align-self:flex-end;background:#4E38B2;color:#fff;border-bottom-right-radius:3px}' +
      '.mgb-ass-m.a{align-self:flex-start;background:var(--surface,#fff);color:var(--text,#1d1430);border:1px solid var(--border,#e4dff0);border-bottom-left-radius:3px}' +
      '.mgb-ass-sug{display:flex;flex-wrap:wrap;gap:6px}' +
      '.mgb-ass-sug button{border:1px solid #4E38B2;background:transparent;color:#4E38B2;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer}' +
      '#mgb-ass form{display:flex;gap:6px;padding:10px;border-top:1px solid var(--border,#e4dff0);background:var(--surface,#fff)}' +
      '#mgb-ass textarea{flex:1;resize:none;height:42px;border:1px solid var(--border,#d6d0e6);border-radius:10px;padding:9px;font:13px "DM Sans",system-ui,sans-serif;background:var(--surface,#fff);color:var(--text,#1d1430)}' +
      '#mgb-ass form button{border:0;border-radius:10px;padding:0 14px;background:#4E38B2;color:#fff;font-weight:700;cursor:pointer}' +
      '#mgb-ass form button:disabled{opacity:.5;cursor:default}';
    document.head.appendChild(s);
  }

  function addMsg(tipo, texto) {
    var box = document.getElementById('mgb-ass-msgs');
    var d = document.createElement('div'); d.className = 'mgb-ass-m ' + tipo; if (tipo === 'a') d.innerHTML = md(texto); else d.textContent = texto;
    box.appendChild(d); box.scrollTop = box.scrollHeight; return d;
  }

  // Feedback 👍/👎: guardado no estado do hub (notaConfig.assistFeedback) — o admin vê pelo botão 📋 no topo do chat
  function guardarFeedback(reg) {
    try {
      notaConfig.assistFeedback = notaConfig.assistFeedback || [];
      notaConfig.assistFeedback.push(reg);
      if (notaConfig.assistFeedback.length > 300) notaConfig.assistFeedback = notaConfig.assistFeedback.slice(-300);
      if (typeof scheduleSave === 'function') scheduleSave();
    } catch (e) {}
  }
  function barraFeedback(elResposta, pergunta, resposta) {
    var bar = document.createElement('div');
    bar.style.cssText = 'align-self:flex-start;display:flex;gap:6px;align-items:center;font-size:12px;color:#7a7390;margin-top:-4px';
    bar.innerHTML = '<span>Isso ajudou?</span>';
    function voto(v) {
      var obs = '';
      if (v === 'ruim') { obs = prompt('O que estava errado ou faltando? (opcional)', '') || ''; }
      var u = (global.MGBAcesso && MGBAcesso.usuario && MGBAcesso.usuario()) || {};
      guardarFeedback({ em: new Date().toISOString(), quem: u.nome || u.login || '', voto: v, pergunta: pergunta, resposta: resposta.slice(0, 1500), obs: obs });
      bar.innerHTML = '<span>' + (v === 'bom' ? 'Obrigada! 💜' : 'Valeu, vou melhorar com isso 🙏') + '</span>';
    }
    ['bom', 'ruim'].forEach(function (v) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = v === 'bom' ? '👍' : '👎';
      b.style.cssText = 'border:1px solid #d6d0e6;background:#fff;border-radius:8px;padding:2px 8px;cursor:pointer;font-size:13px';
      b.onclick = function () { voto(v); }; bar.appendChild(b);
    });
    elResposta.parentNode.insertBefore(bar, elResposta.nextSibling);
    var box = document.getElementById('mgb-ass-msgs'); box.scrollTop = box.scrollHeight;
  }
  function verFeedback() {
    var L = (typeof notaConfig !== 'undefined' && notaConfig.assistFeedback) || [];
    var box = document.getElementById('mgb-ass-msgs');
    var d = document.createElement('div'); d.className = 'mgb-ass-m a';
    var ruins = L.filter(function (x) { return x.voto === 'ruim'; });
    d.innerHTML = '<b>📋 Feedback: ' + L.length + ' voto(s), ' + ruins.length + ' 👎</b><br>' +
      (L.slice(-15).reverse().map(function (x) {
        return (x.voto === 'bom' ? '👍' : '👎') + ' <i>' + esc(x.quem || '') + '</i> · ' + esc(String(x.em).slice(0, 10)) + '<br><b>P:</b> ' + esc(x.pergunta) +
          (x.voto === 'ruim' ? '<br><b>Zuma:</b> ' + esc((x.resposta || '').slice(0, 300)) + (x.obs ? '<br><b>Correção:</b> ' + esc(x.obs) : '') : '');
      }).join('<hr style="border:0;border-top:1px solid #e4dff0;margin:6px 0">') || 'Ainda sem votos.');
    d.style.maxWidth = '100%';
    box.appendChild(d); box.scrollTop = box.scrollHeight;
  }

  function enviar(texto) {
    texto = String(texto || '').trim();
    if (!texto || ocupado) return;
    var s = sessao();
    if (!s || !s.token) { addMsg('a', 'Entre no hub com seu login para usar o assistente.'); return; }
    var sug = document.getElementById('mgb-ass-sug'); if (sug) sug.remove();
    addMsg('u', texto); historico.push({ role: 'user', content: texto });
    var esp = addMsg('a', 'Pensando…'); ocupado = true;
    document.getElementById('mgb-ass-send').disabled = true;
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
      body: JSON.stringify({ mensagens: historico, contexto: contexto(), tela: telaAtual() })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        var t = x.ok ? x.j.resposta : (x.j.error || 'Não consegui responder agora.');
        esp.innerHTML = x.ok ? md(t) : esc(t);
        if (x.ok) { historico.push({ role: 'assistant', content: t }); barraFeedback(esp, texto, t); } else historico.pop();
      })
      .catch(function () { esp.textContent = 'Sem conexão com o servidor. Tente de novo.'; historico.pop(); })
      .then(function () {
        ocupado = false; document.getElementById('mgb-ass-send').disabled = false;
        var box = document.getElementById('mgb-ass-msgs'); box.scrollTop = box.scrollHeight;
      });
  }

  function montar() {
    if (document.getElementById('mgb-ass-btn')) return;
    estilos();
    var b = document.createElement('button'); b.id = 'mgb-ass-btn'; b.type = 'button'; b.textContent = '💬 Zuma';
    var p = document.createElement('div'); p.id = 'mgb-ass';
    p.innerHTML = '<header><span>Zuma · assistente do Hub</span><span><button type="button" id="mgb-ass-fb" title="Ver feedback" style="display:none">📋</button><button type="button" id="mgb-ass-x" aria-label="Fechar">×</button></span></header>' +
      '<div id="mgb-ass-msgs"></div>' +
      '<form id="mgb-ass-form"><textarea id="mgb-ass-in" placeholder="Pergunte para a Zuma…" rows="1"></textarea><button type="submit" id="mgb-ass-send">Enviar</button></form>';
    document.body.appendChild(p); document.body.appendChild(b);
    addMsg('a', 'Oi, eu sou a Zuma! 😉 Vamos lá, no que posso ajudar? Eu tiro dúvidas do hub e mostro o caminho de cada tarefa, mas quem executa é você.');
    var sg = document.createElement('div'); sg.className = 'mgb-ass-sug'; sg.id = 'mgb-ass-sug';
    ['O que ainda falta receber este mês?', 'Como emito nota e boleto do mês?', 'Como marco um pagamento recebido fora do Asaas?', 'Por que a receita do próximo mês aparece menor?'].forEach(function (q) {
      var x = document.createElement('button'); x.type = 'button'; x.textContent = q; x.onclick = function () { enviar(q); }; sg.appendChild(x);
    });
    document.getElementById('mgb-ass-msgs').appendChild(sg);
    function alternar() { aberto = !aberto; p.classList.toggle('on', aberto); if (aberto) document.getElementById('mgb-ass-in').focus(); }
    b.onclick = alternar; document.getElementById('mgb-ass-x').onclick = alternar;
    var fb = document.getElementById('mgb-ass-fb'); fb.onclick = verFeedback;
    try { var uu = sessao() && sessao().usuario; if (uu && uu.papel === 'admin') fb.style.display = ''; } catch (e) {}
    document.getElementById('mgb-ass-form').onsubmit = function (e) {
      e.preventDefault(); var t = document.getElementById('mgb-ass-in'); var v = t.value; t.value = ''; enviar(v);
    };
    document.getElementById('mgb-ass-in').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('mgb-ass-form').requestSubmit(); }
    });
  }

  // aparece só com sessão válida (login do hub); confere de novo quando o login acontece
  function tentar() {
    var s = sessao();
    if (s && s.token) montar();
    else { ['mgb-ass-btn', 'mgb-ass'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); }); historico = []; }
  }
  global.addEventListener('load', function () { tentar(); setInterval(tentar, 4000); });
})(window);
