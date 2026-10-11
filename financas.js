/* Hub MGB — regras financeiras da empresa (revisão do especialista em finanças, 11/10/2026).
 *
 * Retirada do dono (Eder), todo dia 21 — depois que os clientes pagaram (boletos vencem dia 15,
 * a Léo paga dia 20):
 *   1. Pró-labore fixo de 1 salário mínimo (confirmado pelo contador em 11/10/2026: MGB no Anexo III,
 *      CNAE 90.01-9/06, sem Fator R). Entra como despesa da empresa do mês.
 *      INSS: o recolhimento principal é na Câmara; o contador emite a declaração de múltiplos vínculos
 *      para a MGB não reter em duplicidade → padrão 0% (editável se o teto não for atingido).
 *   2. Distribuição de lucros: até 70% do resultado do MÊS ANTERIOR (já fechado, pelas notas),
 *      depois de descontado o pró-labore. Os outros 30% ficam na conta como reserva, até a reserva
 *      chegar a 3 meses de despesas.
 *   Cada retirada é registrada como "Antecipação de Lucros", com memória de cálculo e o saldo
 *   livre da conta C6 no dia (orientação do contador), sem valores arredondados.
 * Valores e percentuais editáveis na aba Empresa.
 */
(function (global) {
  'use strict';

  var PADRAO = { proLabore: 1621, pctDistribuicao: 70, dia: 21, inssPct: 0, mesesReserva: 3, inicio: '2026-10' };

  function arred(v) { return Math.round((Number(v) || 0) * 100) / 100; }

  function config(c) {
    c = c || {};
    return {
      proLabore: c.proLabore != null && c.proLabore !== '' ? Number(c.proLabore) || 0 : PADRAO.proLabore,
      pctDistribuicao: c.pctDistribuicao != null && c.pctDistribuicao !== '' ? Number(c.pctDistribuicao) || 0 : PADRAO.pctDistribuicao,
      dia: PADRAO.dia,
      inssPct: c.inssPct != null && c.inssPct !== '' ? Number(c.inssPct) || 0 : PADRAO.inssPct,
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

  function brl(v) { return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Confere uma antecipação antes de registrar: precisa de resultado positivo e saldo livre na conta.
  function validarAntecipacao(a) {
    var erros = [];
    var valor = Number(a.valor) || 0, saldo = Number(a.saldoConta), resultado = Number(a.resultado) || 0;
    if (!(valor > 0)) erros.push('Informe o valor da antecipação.');
    if (resultado <= 0) erros.push('O mês de referência não teve lucro: não há o que distribuir.');
    else if (valor > resultado) erros.push('O valor passa do resultado do mês de referência.');
    if (!(saldo >= 0) || String(a.saldoConta) === '') erros.push('Informe o saldo da conta C6 hoje (comprova o caixa livre).');
    else if (valor > saldo) erros.push('O valor passa do saldo da conta C6.');
    return erros;
  }

  // Memória de cálculo da "Antecipação de Lucros" (anexar ao comprovante da transferência).
  function memoriaAntecipacao(a) {
    var R = function (l, v, forte) { return '<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e1ee">' + l + '</td><td style="padding:6px 10px;border-bottom:1px solid #e5e1ee;text-align:right' + (forte ? ';font-weight:700' : '') + '">' + v + '</td></tr>'; };
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Antecipação de Lucros ' + esc(a.mesRef) + '</title>' +
      '<style>body{font-family:Arial,sans-serif;color:#241a38;max-width:720px;margin:24px auto;padding:0 16px}h1{font-size:18px;margin:12px 0 4px}p{font-size:13px;line-height:1.5}table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}</style></head><body>' +
      (a.logo ? '<img src="' + esc(a.logo) + '" alt="MGB Mídia" style="height:48px">' : '<b>MGB Comunicação e Marketing Ltda.</b>') +
      '<h1>Memória de cálculo — Antecipação de Lucros</h1>' +
      '<p>MGB Comunicação e Marketing Ltda. · CNPJ 23.770.170/0001-50<br>Sócio: Eder Balbino · Data da transferência: ' + esc(a.data) + '</p>' +
      '<table>' +
      R('Mês de referência (fechado pelas notas emitidas)', esc(a.mesRef)) +
      R('Receita do mês', brl(a.receita)) +
      R('Despesas do mês (inclui Simples Nacional e pró-labore)', brl(a.despesas)) +
      R('Resultado do mês', brl(a.resultado), true) +
      R('Percentual da regra de distribuição', esc(a.pct) + '%') +
      R('Valor sugerido pela regra', brl(a.sugerido)) +
      R('Valor antecipado nesta data', brl(a.valor), true) +
      R('Saldo da conta C6 (PJ) antes da transferência', brl(a.saldoConta)) +
      R('Saldo após a transferência', brl((Number(a.saldoConta) || 0) - (Number(a.valor) || 0))) +
      '</table>' +
      '<p>Antecipação de lucros apurados no mês de referência, a ser confrontada com o lucro líquido contábil no fechamento do balanço (escrituração contábil regular). Pró-labore do mês pago à parte, como despesa da empresa.</p>' +
      '<p style="margin-top:40px">______________________________<br>Eder Balbino — sócio administrador</p></body></html>';
  }

  var api = { PADRAO: PADRAO, config: config, proLaboreNoMes: proLaboreNoMes, planoRetirada: planoRetirada,
    validarAntecipacao: validarAntecipacao, memoriaAntecipacao: memoriaAntecipacao };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.MGBFinancas = api;
})(typeof window !== 'undefined' ? window : globalThis);
