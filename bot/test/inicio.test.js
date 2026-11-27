// Regras do Início novo (inicio.js, na raiz do repositório).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const I = require("../../inicio.js");

test("faturamento do mês: conta só a competência pedida e separa por situação", () => {
  const emissoes = {
    "a|2026-11": { valor: 100, pg: "pago", modo: "boleto", paymentId: "p1" },
    "b|2026-11": { valor: 200, pg: "vencido", cliente: "Loja B", modo: "boleto", paymentId: "p2" },
    "c|2026-11": { valor: 300, pg: "pendente", modo: "ambos", paymentId: "p3", nf: "77" },
    "d|2026-11": { valor: 400, modo: "ambos", paymentId: "p4", cliente: "Arfix", status: "boleto-emitido" },
    "e|2026-11": { valor: 50, pg: "vencido", pgManual: true, modo: "boleto", paymentId: "p5" },
    "x|2026-10": { valor: 999, pg: "vencido" },
  };
  const r = I.resumoFaturamento(emissoes, "2026-11");
  assert.equal(r.total, 5);
  assert.equal(r.valor, 1050);
  assert.deepEqual([r.pagos, r.pendentes, r.vencidos, r.semStatus], [2, 1, 1, 1], "baixa manual conta como pago");
  assert.deepEqual(r.vencidosNomes, ["Loja B"]);
  assert.deepEqual(r.semNota, ["Arfix"], "só quem pediu nota e ainda não tem número");
});

test("próximo faturamento: dia 5 deste mês ou do próximo", () => {
  const a = I.proximoFaturamento(new Date(2026, 10, 18));
  assert.equal(a.comp, "2026-12");
  assert.equal(a.dias, 17);
  const b = I.proximoFaturamento(new Date(2026, 11, 5));
  assert.equal(b.comp, "2026-12");
  assert.equal(b.dias, 0);
  const c = I.proximoFaturamento(new Date(2026, 11, 20));
  assert.equal(c.comp, "2027-01");
});

test("funil: conta por etapa e os fechados sem cadastro", () => {
  const c = I.contarFunil([{ estagio: "novo" }, { estagio: "fechado" }, { estagio: "fechado", itemCriado: "X" }, { estagio: "perdido" }, null]);
  assert.deepEqual(c, { novo: 1, contatado: 0, negociando: 0, fechado: 2, perdido: 1, semCadastro: 1 });
});

test("saudação pela hora", () => {
  assert.equal(I.saudacao(8), "Bom dia");
  assert.equal(I.saudacao(14), "Boa tarde");
  assert.equal(I.saudacao(20), "Boa noite");
});

test("faturamento do mês: cobrança com erro vira pendência, não 'sem status'", () => {
  const r = I.resumoFaturamento({ "a|2026-11": { valor: 100, status: "erro", cliente: "Loja A" }, "b|2026-11": { valor: 50, pg: "pago" } }, "2026-11");
  assert.deepEqual(r.erros, ["Loja A"]);
  assert.equal(r.total, 1);
  assert.equal(r.semStatus, 0);
});

test("promessas de pagamento: lembra no dia e depois, some quando paga", () => {
  const prom = { "a|2026-11": { data: "2026-11-27", cliente: "Loja A" }, "b|2026-11": { data: "2026-11-25", cliente: "Loja B" }, "c|2026-11": { data: "2026-11-30" }, "d|2026-10": { data: "2026-11-20" } };
  const em = { "d|2026-10": { pg: "pago" } };
  const r = I.promessasDoDia(prom, em, "2026-11-27");
  assert.deepEqual(r.map((x) => [x.cliente, x.atrasada]), [["Loja B", true], ["Loja A", false]]);
});
