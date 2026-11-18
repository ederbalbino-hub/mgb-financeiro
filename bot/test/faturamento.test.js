// Regras da tela nova de Faturamento (faturamento.js, na raiz do repositório).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const F = require("../../faturamento.js");

const L = [
  { id: "a", status: "pendente", valor: 600, modo: "ambos" },
  { id: "b", status: "pendente", valor: 0, modo: "nota" },
  { id: "c", status: "aguardando-nota", valor: 300, modo: "ambos" },
  { id: "d", status: "emitida", valor: 950, modo: "ambos", nfNumero: "123", statusPagamento: "pago" },
  { id: "e", status: "erro", valor: 200, modo: "boleto" },
  { id: "f", status: "boleto-emitido", valor: 100, modo: "ambos", statusPagamento: "vencido" },
];
const info = (r) => ({ manual: r.id === "b", anterior: r.id === "a" ? { st: "vencido", mes: "novembro" } : null });

test("situação: rótulo de cada status, e manual sem valor pede o valor", () => {
  assert.equal(F.situacao(L[0], false).rotulo, "A emitir");
  assert.equal(F.situacao(L[1], true).rotulo, "Falta o valor");
  assert.equal(F.situacao(L[2], false).rotulo, "Aguardando nota");
  assert.equal(F.situacao(L[3], false).rotulo, "Emitida · NF 123");
  assert.equal(F.situacao(L[4], false).tom, "erro");
  assert.equal(F.situacao(L[5], false).tom, "atencao");
});

test("filtros: a emitir, aguardando nota e com problema (inclui mês anterior vencido)", () => {
  const ids = (f) => F.filtrar(L, f, info).map((r) => r.id).join("");
  assert.equal(ids("todos"), "abcdef");
  assert.equal(ids("emitir"), "abe");
  assert.equal(ids("nota"), "cf");
  assert.equal(ids("problema"), "abef");
});

test("etapas: conta emitidos, notas com número e recebidos", () => {
  assert.deepEqual(F.etapas(L), { total: 6, emitidos: 3, notas: 1, recebidos: 1 });
});

test("navegação de mês atravessa a virada do ano", () => {
  assert.equal(F.somaMes("2026-12", 1), "2027-01");
  assert.equal(F.somaMes("2027-01", -1), "2026-12");
  assert.equal(F.mesAnterior("2026-01"), "2025-12");
});
