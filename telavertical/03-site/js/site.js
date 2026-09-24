/* Tela Vertical · site — JS compartilhado (sem dependências) */
(function(){
  'use strict';
  var WA = '5543996960078';
  var EMAIL = 'contato@telavertical.com.br'; // provisório — domínio ainda será comprado
  var $ = function(id){ return document.getElementById(id); };
  var fmtN = function(n){ return Math.round(n).toLocaleString('pt-BR'); };
  var fmtR = function(n){ return 'R$ ' + n.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}); };
  window.TV = { WA: WA, EMAIL: EMAIL, fmtN: fmtN, fmtR: fmtR };

  /* ---------- menu mobile ---------- */
  var burger = document.querySelector('.burger'), mm = $('mm');
  if (burger && mm) {
    burger.addEventListener('click', function(){
      var open = mm.classList.toggle('open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    mm.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ mm.classList.remove('open'); burger.classList.remove('open'); }); });
  }

  /* ---------- link ativo no menu ---------- */
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('.nav-links a').forEach(function(a){
    var href = (a.getAttribute('href') || '').toLowerCase();
    if (href === page) a.classList.add('active');
  });

  /* ---------- reveal ao rolar ---------- */
  if ('IntersectionObserver' in window) {
    var rv = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) { e.target.classList.add('in'); rv.unobserve(e.target); } }); }, {threshold:.1});
    document.querySelectorAll('.rv').forEach(function(el){ rv.observe(el); });
    var co = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) { animateCounter(e.target); co.unobserve(e.target); } }); }, {threshold:.5});
    document.querySelectorAll('[data-count]').forEach(function(el){ co.observe(el); });
  } else {
    document.querySelectorAll('.rv').forEach(function(el){ el.classList.add('in'); });
    document.querySelectorAll('[data-count]').forEach(function(el){ el.textContent = (el.dataset.prefix||'') + fmtN(+el.dataset.count) + (el.dataset.suffix||''); });
  }
  function animateCounter(el){
    var target = +el.dataset.count, suffix = el.dataset.suffix || '', prefix = el.dataset.prefix || '';
    var dur = 1400, start = performance.now();
    function tick(now){
      var p = Math.min((now - start) / dur, 1), eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + fmtN(target * eased) + (p === 1 ? suffix : '');
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- formulários mailto + WhatsApp (sem backend) ---------- */
  // Cada <form data-lead> monta a mensagem a partir dos campos [data-f="Rótulo"]
  function leadMessage(form){
    var intro = form.dataset.intro || 'Olá! Vim pelo site da Tela Vertical.';
    var lines = [];
    form.querySelectorAll('[data-f]').forEach(function(f){
      var v = (f.value || '').trim();
      if (v) lines.push('• ' + f.dataset.f + ': ' + v);
    });
    return intro + '\n\n' + lines.join('\n');
  }
  document.querySelectorAll('form[data-lead]').forEach(function(form){
    var subject = form.dataset.subject || 'Contato pelo site Tela Vertical';
    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      if (!form.reportValidity()) return;
      var msg = leadMessage(form);
      var via = (ev.submitter && ev.submitter.dataset.via) || 'wa';
      if (via === 'mail') {
        location.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(msg);
      } else {
        window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
        // também deixa o e-mail pronto (abre em seguida, se o navegador permitir)
        if (form.dataset.alsoMail === '1') {
          setTimeout(function(){ location.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(msg); }, 600);
        }
      }
      var ok = form.querySelector('.form-ok');
      if (ok) ok.hidden = false;
    });
  });

  /* ---------- simulador de impacto (anunciantes.html) ---------- */
  var simList = $('sim-list');
  if (simList && window.TV_CONDOS) {
    var INSERCOES_DIA = 250;      // inserções do anúncio por tela/dia
    var DIAS = 30;                // mês
    var FREQ_MES = 3;             // cada pessoa impactada ~3× por mês (padrão DOOH)
    var PRECO_TELA_SEMANA = 279.90; // tabela cheia (mídia kit MGB)
    var SEM_POR_MES = 4;
    var REDE = window.TV_REDE || { telas: 35, pessoas: 80000, condominios: 11, mensal: 4000 };
    // Rede completa usa a tabela padrão da proposta MGB (R$ 4.000/mês pelas 35 telas); seleção avulsa usa R$/tela/semana do mídia kit
    var state = { sel: {}, semanas: 4, rede: false };

    simList.innerHTML = window.TV_CONDOS.map(function(c){
      return '<label class="sim-item" data-id="' + c.id + '"><input type="checkbox" aria-label="' + c.nome + '"><span><b>' + c.nome + '</b><small>' + c.bairro + ' · ' + (c.tipo === 'comercial' ? 'comercial' : 'residencial') + '</small></span><span class="n"><b>' + c.telas + ' telas</b><br>' + fmtN(c.pessoas) + (c.tipo === 'comercial' ? ' pessoas/mês' : ' moradores') + '</span></label>';
    }).join('');

    simList.querySelectorAll('.sim-item').forEach(function(item){
      var cb = item.querySelector('input');
      cb.addEventListener('change', function(){
        state.rede = false;
        state.sel[item.dataset.id] = cb.checked;
        item.classList.toggle('on', cb.checked);
        var all = $('sim-all'); if (all) all.classList.remove('on');
        calc();
      });
    });
    var btnAll = $('sim-all'), btnNone = $('sim-none');
    if (btnAll) btnAll.addEventListener('click', function(){
      state.rede = true; // rede completa usa os números oficiais (35 telas · +80 mil pessoas)
      simList.querySelectorAll('.sim-item').forEach(function(item){ item.querySelector('input').checked = true; item.classList.add('on'); state.sel[item.dataset.id] = true; });
      calc();
    });
    if (btnNone) btnNone.addEventListener('click', function(){
      state.rede = false; state.sel = {};
      simList.querySelectorAll('.sim-item').forEach(function(item){ item.querySelector('input').checked = false; item.classList.remove('on'); });
      calc();
    });
    document.querySelectorAll('#per-chips button').forEach(function(b){
      b.addEventListener('click', function(){
        document.querySelectorAll('#per-chips button').forEach(function(x){ x.classList.remove('on'); });
        b.classList.add('on'); state.semanas = +b.dataset.sem; calc();
      });
    });

    function calc(){
      var sel = window.TV_CONDOS.filter(function(c){ return state.sel[c.id]; });
      var telas, pessoas, nCond;
      if (state.rede) { telas = REDE.telas; pessoas = REDE.pessoas; nCond = REDE.condominios; }
      else {
        telas = sel.reduce(function(a,c){ return a + c.telas; }, 0);
        pessoas = sel.reduce(function(a,c){ return a + c.pessoas; }, 0);
        nCond = sel.length;
      }
      var insMes = telas * INSERCOES_DIA * DIAS;
      var impactos = pessoas * FREQ_MES;
      var invSem = state.rede && REDE.mensal ? REDE.mensal / SEM_POR_MES : telas * PRECO_TELA_SEMANA;
      var total = invSem * state.semanas;
      var cpp = pessoas ? (invSem * SEM_POR_MES) / pessoas : 0;
      $('s-cond').textContent = nCond;
      $('s-telas').textContent = telas;
      $('s-pess').textContent = pessoas ? fmtN(pessoas) : '0';
      $('s-ins').textContent = fmtN(insMes);
      $('s-imp').textContent = fmtN(impactos);
      $('s-cpp').textContent = pessoas ? fmtR(cpp) : '—';
      $('s-sem').textContent = fmtR(invSem);
      $('s-per').textContent = state.semanas + ' semanas';
      $('s-total').textContent = fmtR(total);
      var empty = $('sim-empty'); if (empty) empty.hidden = telas > 0;
      var msg = 'Olá! Montei uma simulação no site da Tela Vertical:\n' +
        '• Condomínios: ' + (state.rede ? 'rede completa (' + nCond + ')' : (sel.map(function(c){ return c.nome; }).join(', ') || '—')) + '\n' +
        '• ' + telas + ' telas · ' + fmtN(pessoas) + ' pessoas/mês · ' + fmtN(impactos) + ' impactos/mês\n' +
        '• ' + fmtN(insMes) + ' inserções/mês\n' +
        '• Período: ' + state.semanas + ' semanas · investimento de tabela ' + fmtR(total) + '\n\n' +
        'Quero uma proposta personalizada!';
      var lbl = $('s-sem-l'); if (lbl) lbl.textContent = state.rede ? 'Investimento / semana (tabela padrão rede completa)' : 'Investimento / semana (tabela)';
      var wa = $('s-wa'); if (wa) wa.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(msg);
      var ml = $('s-mail'); if (ml) ml.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Simulação de campanha — Tela Vertical') + '&body=' + encodeURIComponent(msg);
      window.TV_SIM = { telas: telas, pessoas: pessoas, insMes: insMes, impactos: impactos, invSem: invSem, total: total, semanas: state.semanas };
    }
    calc();
  }
})();
