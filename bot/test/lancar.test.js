// Regras do "Nova despesa" e "Nova receita" (lancar.js, na raiz do repositório).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("../../lancar.js");

const base = { destino: "radioops", item: "Moinho Globo", categoria: "combustivel", descricao: "Gasolina ida Curitiba", fornecedor: "Posto", valor: "250,00", data: "2026-10-21", forma: "avista", quemPagou: "eder" };

test("valor em reais aceita vírgula e ponto de milhar", () => {
  assert.equal(L.numero("1.234,56"), 1234.56);
  assert.equal(L.numero("250"), 250);
  assert.equal(L.numero("R$ 89,90"), 89.9);
  assert.equal(L.numero(""), 0);
});

test("viagem do Moinho vira linha à vista no mês da data, marcada como reembolso ao Eder", () => {
  const r = L.linhaDespesa(base);
  assert.equal(r.t, "À vista");
  assert.equal(r.venc, "2026-10");
  assert.equal(r.u, 250);
  assert.equal(r.q, 1);
  assert.equal(r.tipo, "Viagem");
  assert.equal(r.cc, "Moinho Globo");
  assert.equal(r.reembolso, true);
  assert.equal(r.origem, "lancar");
  assert.ok(r.lid);
});

test("parcelado guarda o total e o número de parcelas; mensal guarda o valor do mês", () => {
  const p = L.linhaDespesa({ ...base, forma: "parcelado", parcelas: "3", valor: "900" });
  assert.equal(p.t, "Parcelado"); assert.equal(p.u, 900); assert.equal(p.nparc, 3); assert.equal(p.dataInicio, "2026-10"); assert.equal(p.venc, "");
  const m = L.linhaDespesa({ ...base, forma: "mensal", meses: "12", valor: "39,56", categoria: "licenca" });
  assert.equal(m.t, "Recorrente"); assert.equal(m.u, 39.56); assert.equal(m.mesesRec, 12); assert.equal(m.tipo, "Licença");
});

test("validação pede destino, unidade, categoria, descrição, valor e data", () => {
  assert.deepEqual(L.validarDespesa(base), []);
  assert.equal(L.validarDespesa({}).length, 5);
  assert.ok(L.validarDespesa({ ...base, item: "" }).some((e) => /unidade/.test(e)));
  assert.ok(L.validarDespesa({ ...base, valor: "0" }).some((e) => /valor/.test(e)));
  assert.ok(L.validarDespesa({ ...base, forma: "parcelado", parcelas: "1" }).some((e) => /2 parcelas/.test(e)));
  assert.ok(L.validarDespesa({ ...base, destino: L.MGB_DIA, item: "", forma: "parcelado", parcelas: "3" }).some((e) => /MGB parcelada/.test(e)));
  assert.deepEqual(L.validarDespesa({ ...base, destino: L.MGB_DIA, item: "" }), []);
});

test("despesa do dia a dia da MGB entra só no mês da data", () => {
  const a = L.avulsaEmpresa({ ...base, destino: L.MGB_DIA, categoria: "alimentacao", valor: "62,50" }, 7);
  assert.equal(a.id, 7); assert.equal(a.mes, "2026-10"); assert.equal(a.valor, 62.5); assert.equal(a.reembolso, true);
  assert.equal(L.avulsasDoMes([a], 2026, 9).length, 1);
  assert.equal(L.avulsasDoMes([a], 2026, 10).length, 0);
});

test("receita avulsa (locução) entra na competência informada", () => {
  const d = { servico: "locucao", cliente: "Santarém", descricao: "", valor: "300", mes: "2026-11" };
  assert.deepEqual(L.validarReceita(d), []);
  const x = L.receitaAvulsa(d, 3);
  assert.equal(x.desc, "Locução");
  assert.equal(L.receitasDoMes([x], 2026, 10).length, 1);
  assert.equal(L.receitasDoMes([x], 2026, 9).length, 0);
  assert.equal(L.itemReceita(x), "Locução · Santarém #3");
  assert.equal(L.validarReceita({ servico: "x", cliente: "", valor: 0, mes: "" }).length, 4);
});

test("sugestões vêm do que já foi lançado", () => {
  const s = L.sugestoes({ mb: { Benjamin: [{ d: "Cabo HDMI 3m", f: "Tecmax", u: 18.9 }] } }, [{ desc: "Almoço", forn: "Restaurante X", valor: 45, cat: "alimentacao" }]);
  assert.deepEqual(s.descricoes["Cabo HDMI 3m"], { f: "Tecmax", u: 18.9, cat: "" });
  assert.equal(s.descricoes["Almoço"].cat, "alimentacao");
  assert.deepEqual(s.fornecedores, ["Restaurante X", "Tecmax"]);
});
