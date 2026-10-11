/* Hub MGB — regras financeiras da empresa (revisão do especialista em finanças, 11/10/2026).
 *
 * Retirada do dono (Eder), todo dia 21 — depois que os clientes pagaram (boletos vencem dia 15,
 * a Léo paga dia 20):
 *   1. Pró-labore fixo (padrão: 1 salário mínimo). Entra como despesa da empresa do mês.
 *      Sobre ele há retenção de INSS de 11% (se o Eder já não contribui no teto por outra fonte).
 *   2. Distribuição de lucros: até 70% do resultado do MÊS ANTERIOR (já fechado, pelas notas),
 *      depois de descontado o pró-labore. Os outros 30% ficam na conta como reserva, até a reserva
 *      chegar a 3 meses de despesas.
 * Valores e percentuais são sugestão do comitê para o Eder confirmar com o contador.
 */
(function (global) {
  'use strict';

  var PADRAO = { proLabore: 1621, pctDistribuicao: 70, dia: 21, inssPct: 11, mesesReserva: 3, inicio: '2026-10' };

  function arred(v) { return Math.round((Number(v) || 0) * 100) / 100; }

  function config(c) {
    c = c || {};
    return {
      proLabore: c.proLabore != null && c.proLabore !== '' ? Number(c.proLabore) || 0 : PADRAO.proLabore,
      pctDistribuicao: c.pctDistribuicao != null && c.pctDistribuicao !== '' ? Number(c.pctDistribuicao) || 0 : PADRAO.pctDistribuicao,
      dia: PADRAO.dia,
      inssPct: PADRAO.inssPct,
      mesesReserva: PADRAO.mesesReserva,
      inicio: c.proLaboreInicio || PADRAO.inicio
    };
  }

  // O pró-labore vale para o mês (ano, mes 0-11) a partir do início configurado?
  function proLaboreNoMes(c, ano, mes) {
    var k = config(c);
    if (!(k.proLabore > 0)) return 0;
    var p = String(k.inicio).split('-').map(Number);
    if (ano * 12 + mes < p[0] * 12 + (p[1] - 1)) return 0;
    return k.proLabore;
  }

  // Plano de retirada do dia 21 do mês M, olhando o mês M-1 já fechado.
  function planoRetirada(d, c) {
    var k = config(c);
    var resultado = Number(d.resultadoAnterior) || 0;          // já com o pró-labore descontado
    var base = Math.max(0, resultado);
    var lucros = arred(base * k.pctDistribuicao / 100);
    var reserva = arred(base - lucros);
    return {
      dia: k.dia,
      proLabore: arred(k.proLabore),
      inss: arred(k.proLabore * k.inssPct / 100),
      proLaboreLiquido: arred(k.proLabore - k.proLabore * k.inssPct / 100),
      lucros: lucros,
      reserva: reserva,
      metaReserva: arred((Number(d.despesaMensal) || 0) * k.mesesReserva),
      semLucro: resultado <= 0
    };
  }

  var api = { PADRAO: PADRAO, config: config, proLaboreNoMes: proLaboreNoMes, planoRetirada: planoRetirada };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.MGBFinancas = api;
})(typeof window !== 'undefined' ? window : globalThis);
