/* Rede Tela Vertical ao vivo — carrega os condomínios cadastrados pelo CRM do hub (lead "Condomínio" fechado)
 * e entrega aos materiais (mídia kits, proposta, apresentações, site) só os que a página ainda não conhece.
 * Falhou a leitura? Nada acontece: a página continua com a lista que já tem.
 *
 *   mgbRedeViva(nomesConhecidos, function(novos, extra){ ... })
 *     novos : [{id,nome,bairro,zona,tipo,torres,telas,pessoas,foto}]   (foto sempre preenchida: URL ou placeholder)
 *     extra : {condos, telas, pessoas} somados dos novos
 *   Elementos [data-rede="condos|telas|pessoas"] têm o número somado automaticamente (ex.: <span data-rede="telas">38</span>).
 */
(function (global) {
  'use strict';
  var BASE = 'https://mgb-financeiro.vercel.app';
  var PH = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16294F"/><stop offset="1" stop-color="#2B4A86"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><g fill="none" stroke="#C0A062" stroke-width="10" opacity=".85"><rect x="300" y="170" width="200" height="260" rx="6"/><path d="M340 230h30M430 230h30M340 290h30M430 290h30M340 350h30M430 350h30"/></g></svg>');
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^(resid\.|residencial|cond\.|condominio|ed\.|edificio)\s+/, '').replace(/[^a-z0-9]/g, ''); }

  function somar(extra) {
    ['condos', 'telas', 'pessoas'].forEach(function (k) {
      [].forEach.call(document.querySelectorAll('[data-rede="' + k + '"]'), function (el) {
        if (el.getAttribute('data-base') == null) el.setAttribute('data-base', String(parseInt(String(el.textContent).replace(/\D/g, ''), 10) || 0));
        var n = (parseInt(el.getAttribute('data-base'), 10) || 0) + extra[k];
        el.textContent = k === 'pessoas' ? n.toLocaleString('pt-BR') : String(n);
      });
    });
  }

  function mgbRedeViva(conhecidos, cb) {
    try {
      var known = {};
      (conhecidos || []).forEach(function (n) { known[norm(n)] = 1; });
      fetch(BASE + '/api/rede').then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.ok || !d.condos || !d.condos.length) return;
        var novos = d.condos.filter(function (c) { return !known[norm(c.hub)] && !known[norm(c.nome)]; });
        if (!novos.length) return;
        novos.forEach(function (c) { c.foto = c.foto ? (c.foto.charAt(0) === '/' ? BASE + c.foto : c.foto) : PH; });
        var extra = { condos: novos.length, telas: 0, pessoas: 0 };
        novos.forEach(function (c) { extra.telas += c.telas || 0; extra.pessoas += c.pessoas || 0; });
        somar(extra);
        if (cb) cb(novos, extra);
      }).catch(function () {});
    } catch (e) {}
  }
  global.mgbRedeViva = mgbRedeViva;
  global.MGB_REDE_PH = PH;
})(typeof window !== 'undefined' ? window : globalThis);
