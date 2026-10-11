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
  assert.equal(r.inss, 178.31);
  assert.equal(r.proLaboreLiquido, 1442.69);
});

test("mês com prejuízo não distribui lucro", () => {
  const r = F.planoRetirada({ resultadoAnterior: -500, despesaMensal: 15000 }, { pctDistribuicao: 80 });
  assert.equal(r.lucros, 0);
  assert.equal(r.semLucro, true);
});
