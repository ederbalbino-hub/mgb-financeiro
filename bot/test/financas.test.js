// Regras de retirada do dono (financas.js, na raiz do repositório).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const F = require("../../financas.js");

test("pró-labore padrão vale a partir de out/2026 e pode ser configurado", () => {
  assert.equal(F.proLaboreNoMes({}, 2026, 9), 1621);
  assert.equal(F.proLaboreNoMes({}, 2026, 8), 0);
  assert.equal(F.proLaboreNoMes({ proLabore: 2500 }, 2027, 0), 2500);
  assert.equal(F.proLaboreNoMes({ proLabore: 0 }, 2027, 0), 0);
});

test("retirada do dia 21: 70% do resultado do mês anterior, 30% de reserva", () => {
  const r = F.planoRetirada({ resultadoAnterior: 20000, despesaMensal: 15000 }, {});
  assert.equal(r.dia, 21);
  assert.equal(r.lucros, 14000);
  assert.equal(r.reserva, 6000);
  assert.equal(r.metaReserva, 45000);
  assert.equal(r.inss, 0); // INSS recolhido na Câmara (declaração de múltiplos vínculos)
  assert.equal(r.proLaboreLiquido, 1621);
  assert.equal(F.planoRetirada({ resultadoAnterior: 1 }, { inssPct: 11 }).inss, 178.31);
});

test("mês com prejuízo não distribui lucro", () => {
  const r = F.planoRetirada({ resultadoAnterior: -500, despesaMensal: 15000 }, { pctDistribuicao: 80 });
  assert.equal(r.lucros, 0);
  assert.equal(r.semLucro, true);
});

test("antecipação de lucros: precisa de lucro e de saldo livre na C6", () => {
  const ok = { valor: 14285.07, resultado: 20407.25, saldoConta: 25000 };
  assert.deepEqual(F.validarAntecipacao(ok), []);
  assert.match(F.validarAntecipacao({ ...ok, saldoConta: 10000 }).join(), /saldo da conta C6/);
  assert.match(F.validarAntecipacao({ ...ok, saldoConta: "" }).join(), /Informe o saldo/);
  assert.match(F.validarAntecipacao({ ...ok, resultado: -1 }).join(), /não teve lucro/);
  assert.match(F.validarAntecipacao({ ...ok, valor: 30000, saldoConta: 50000 }).join(), /passa do resultado/);
});

test("memória de cálculo traz os números e o termo Antecipação de Lucros", () => {
  const h = F.memoriaAntecipacao({ mesRef: "out/2026", data: "21/11/2026", receita: 37062.04, despesas: 16654.79, resultado: 20407.25, pct: 70, sugerido: 14285.08, valor: 14285.08, saldoConta: 25000 });
  assert.match(h, /Antecipação de Lucros/);
  assert.match(h, /R\$ 20\.407,25/);
  assert.match(h, /R\$ 10\.714,92/);
  assert.match(h, /23\.770\.170\/0001-50/);
});

test("receita oficial: soma as notas emitidas da competência e mostra o só-boleto à parte", () => {
  const r = F.somaNotasCompetencia({
    comp: "2026-10",
    fatEmissoes: {
      "a|2026-10": { status: "emitida", modo: "nota+boleto", valor: 600 },
      "b|2026-10": { status: "emitida", modo: "nota", valor: 7800 },
      "c|2026-10": { status: "emitida", modo: "boleto", valor: 300 },
      "d|2026-10": { status: "erro", modo: "nota", valor: 999 },
      "a|2026-09": { status: "emitida", modo: "nota", valor: 600 }
    },
    notas: [
      { data: "2026-10-12", valor: 250, status: "AUTHORIZED" },
      { data: "2026-10-13", valor: 100, status: "AUTHORIZED", semNota: true },
      { data: "2026-09-30", valor: 400, status: "AUTHORIZED" }
    ],
    leo: [{ status: "emitida", valor: 264 }, { status: "pendente", valor: 264 }]
  });
  assert.deepEqual(r, { faturamento: 8400, avulsas: 250, leo: 264, notas: 8914, soBoleto: 300, total: 9214, qtd: 4 });
});

test("receita oficial: usa o fechamento pelas notas; sem fechamento, a prevista", () => {
  const fech = { "2026-10": { receitaNotas: 36500.1 } };
  assert.deepEqual(F.receitaOficial(fech, "2026-10", 37062.04), { valor: 36500.1, fonte: "notas" });
  assert.deepEqual(F.receitaOficial(fech, "2026-11", 37062.04), { valor: 37062.04, fonte: "prevista" });
});
