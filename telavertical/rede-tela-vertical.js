/* Rede Tela Vertical — fonte única dos dados de cada condomínio (11/10/2026).
 * Usada pelo hub (Contrato Anunciante, painel do mês) e pelas páginas de proposta.
 * Dados de público vêm da Proposta Elevadores (a versão mais atualizada, conferida pelo Eder).
 * O número de TELAS que vale é o do hub (módulo Tela Vertical, linha "Sistema TV" de cada
 * condomínio); o "telas" daqui é só o valor de partida quando o hub não estiver disponível.
 *
 *   hub     nome do condomínio no módulo Tela Vertical do hub
 *   pessoas público do mês (moradores; nos comerciais, circulação mensal)
 *   torres  nº de torres/elevadores (quando não informado, conta 1 por tela)
 *   breve   ainda não está no ar: fica fora da rede, do contrato e das contagens (Liberty, 11/10/2026)
 */
(function (global) {
  'use strict';
  var REDE = {
    insercoesDia: 150,          // entrega por tela/dia (Eder, 11/10/2026: 150; 100 é pouco)
    exposicoesDia: 3.5,         // exposições diárias por pessoa nos residenciais (mesmo da proposta)
    condos: [
      { id: 'lagoa',       hub: 'Lagoa Dourada',      nome: 'Lagoa Dourada',      bairro: 'Aquaville',             zona: 'Leste',  tipo: 'residencial', pessoas: 1344,  telas: 7, torres: 5 },
      { id: 'louvre',      hub: 'Spazio Louvre',      nome: 'Spazio Louvre',      bairro: 'Gleba Palhano',         zona: 'Sul',    tipo: 'residencial', pessoas: 1650,  telas: 5, torres: 5 },
      { id: 'portinari',   hub: 'Lake Portinari',     nome: 'Lake Portinari',     bairro: 'Pioneiros',             zona: 'Leste',  tipo: 'residencial', pessoas: 865,   telas: 3, torres: 2 },
      { id: 'malaga',      hub: 'Residencial Málaga', nome: 'Residencial Málaga', bairro: 'Aquaville',             zona: 'Leste',  tipo: 'residencial', pessoas: 803,   telas: 3, torres: 3 },
      { id: 'terra',       hub: 'Terra Parque',       nome: 'Terra Parque',       bairro: 'Champagnat',            zona: 'Oeste',  tipo: 'residencial', pessoas: 450,   telas: 2, torres: 2 },
      { id: 'bella',       hub: 'Bella Fiori',        nome: 'Resid. Bella Fiori', bairro: 'Vale dos Tucanos',      zona: 'Sul',    tipo: 'residencial', pessoas: 156,   telas: 2, torres: 2 },
      { id: 'spot',        hub: 'Spot',               nome: 'Spot',               bairro: 'Centro',                zona: 'Centro', tipo: 'comercial',   pessoas: 1200,  telas: 2, torres: 2 },
      { id: 'as1',         hub: 'Ayrton Senna 1',     nome: 'Ed. Ayrton Senna 1', bairro: 'Gleba Palhano',         zona: 'Sul',    tipo: 'comercial',   pessoas: 35000, telas: 2, torres: 2 },
      { id: 'as2',         hub: 'Ayrton Senna 2',     nome: 'Ed. Ayrton Senna 2', bairro: 'Gleba Palhano',         zona: 'Sul',    tipo: 'comercial',   pessoas: 35000, telas: 2, torres: 2 },
      { id: 'tay',         hub: 'Tay',                nome: 'Cond. Tay',          bairro: 'Gleba Palhano',         zona: 'Sul',    tipo: 'residencial', pessoas: 424,   telas: 2, torres: 2 },
      { id: 'uptown',      hub: 'Uptown',             nome: 'Cond. Uptown',       bairro: 'Gleba Palhano',         zona: 'Sul',    tipo: 'residencial', pessoas: 419,   telas: 2, torres: 2 },
      { id: 'ever',        hub: 'Ever',               nome: 'Cond. Ever',         bairro: 'Norte',                 zona: 'Norte',  tipo: 'residencial', pessoas: 800,   telas: 2 },
      { id: 'dampezzo',    hub: 'Ampezzo',            nome: "Resid. D'Ampezzo",   bairro: 'Centro',                zona: 'Centro', tipo: 'residencial', pessoas: 200,   telas: 1, torres: 1 },
      { id: 'itamaraty',   hub: 'Itamaraty',          nome: 'Ed. Itamaraty',      bairro: 'Centro',                zona: 'Centro', tipo: 'comercial',   pessoas: 11000, telas: 1, torres: 1 },
      { id: 'liberty',     hub: 'Liberty',            nome: 'Liberty Residence',  bairro: 'Nossa Sra. de Lourdes', zona: 'Centro', tipo: 'residencial', pessoas: 78,    telas: 1, torres: 1, breve: true },
      { id: 'villasolare', hub: 'Villa Solare',       nome: 'Villa Solare',       bairro: 'Gleba Palhano',         zona: 'Sul',    tipo: 'residencial', pessoas: 234,   telas: 2, torres: 2 }
    ]
  };

  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^(resid\.|residencial|cond\.|condominio|ed\.|edificio)\s+/, '').replace(/[^a-z0-9]/g, ''); }

  // Impactos do mês (mesma conta da Proposta Elevadores).
  function impactos(c) { return c.tipo === 'comercial' ? Math.round(c.pessoas * 2) : Math.round(c.pessoas * 1.2 * REDE.exposicoesDia * 30); }

  // Lista viva: condomínios do módulo do hub (com as telas lançadas lá) + dados de público daqui.
  // hub = { itens: ['Lagoa Dourada', ...], telas: function(item){...}, info: function(item){...} }
  function lista(hub) {
    var base = REDE.condos.slice();
    var noAr = base.filter(function (c) { return !c.breve; });
    if (!hub || !hub.itens || !hub.itens.length) return noAr.map(function (c) { return Object.assign({}, c); });
    return hub.itens.map(function (item) {
      var ref = base.filter(function (c) { return norm(c.hub) === norm(item) || norm(c.nome) === norm(item); })[0];
      var info = (hub.info && hub.info(item)) || {};
      var t = hub.telas ? hub.telas(item) : 0;
      return {
        breve: !!(ref && ref.breve),
        id: ref ? ref.id : norm(item),
        hub: item,
        nome: ref ? ref.nome : item,
        bairro: ref ? ref.bairro : (info.bairro || ''),
        zona: ref ? ref.zona : '',
        tipo: ref ? ref.tipo : (info.tipo || 'residencial'),
        pessoas: ref ? ref.pessoas : (Number(info.moradores || info.pessoas) || 0),
        telas: t || (ref ? ref.telas : 0),
        torres: ref && ref.torres ? ref.torres : (Number(info.torres) || 0),
        semDados: !ref
      };
    }).filter(function (c) { return c.telas > 0 && !c.breve; });
  }

  var api = { REDE: REDE, lista: lista, impactos: impactos, norm: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TV_REDE = api;
})(typeof window !== 'undefined' ? window : globalThis);
