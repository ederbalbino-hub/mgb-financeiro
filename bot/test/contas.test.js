// Contas do index.html que divergiam entre telas (auditoria de 24/11, corrigidas em 27/11).
// As funções são lidas do próprio index.html (test/apoio/index-funcoes.cjs) e rodam num contexto isolado.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { novoCtx } = require("./apoio/index-funcoes.cjs");
const F = require("../../financeiro.js");

const base = () => ({
  notaConfig: { aliquotaMes: 2.37 },
  rec: { mb: { Benjamin: { valor: 10000, inicio: "2026-01", meses: 12 } } },
  receitasAvulsas: [{ id: 1, cliente: "Loja", valor: 2000, mes: "2026-11" }],
});

test("relatório anual: receita do mês é a mesma da Visão Geral (contratos + avulsas)", () => {
  const c = novoCtx(base());
  const rel = c.relAnualDados(2026);
  assert.equal(c.finGetRec(2026, 10), 12000);
  assert.equal(rel.recPorMes[10], 12000);
  // as linhas continuam somando o total: a avulsa aparece numa linha própria
  const somaLinhas = rel.porModulo.reduce((a, m) => a + m.receitas[10], 0);
  assert.equal(somaLinhas, 12000);
  assert.equal(rel.porModulo.find((m) => m.id === "_outras").receitas[10], 2000);
});

test("relatório anual: mês fechado pelas notas usa o valor das notas", () => {
  const c = novoCtx(base());
  c.notaConfig.fechamentos = { "2026-11": { receitaNotas: 11500 } };
  const rel = c.relAnualDados(2026);
  assert.equal(rel.recPorMes[10], 11500);
  assert.equal(rel.porModulo.find((m) => m.id === "_outras").receitas[10], 1500); // 11.500 − 10.000 de contrato
  assert.equal(rel.recGrandTotal, rel.recPorMes.reduce((a, b) => a + b, 0));
});

test("Resumo do Financeiro: a linha de avulsas fecha a tabela por módulo com o total do topo", () => {
  const linhas = [{ id: "mb", r: 10000, d: 0 }, { id: "", rot: "Empresa", r: 0, d: 740 }];
  const extra = F.linhaOutrasReceitas(12000, linhas);
  assert.equal(extra.r, 2000);
  assert.equal(linhas.reduce((a, l) => a + l.r, 0) + extra.r, 12000);
  assert.equal(F.linhaOutrasReceitas(10000, linhas), null); // nada a mais: sem linha extra
  assert.equal(F.linhaOutrasReceitas(9500, linhas).r, -500); // mês fechado abaixo da previsão
});

test("Tela Vertical: 'Investido' do condomínio não soma despesa; total da CC não desconta despesa sem 'pago por'", () => {
  const c = novoCtx({ elevInvestimentos: [
    { id: 1, item: "Histórico", valor: 25000, pagoPor: "eder" },
    { id: 2, item: "Histórico", valor: 23000, pagoPor: "jadson" },
    { id: 3, item: "Uptown", valor: 120.5, pagoPor: "jadson", data: "2026-11-30", tipo: "despesa" },
    { id: 4, item: "Uptown", valor: 800, pagoPor: "eder", tipo: "investimento" },
  ] });
  assert.equal(c.elevInvestidoDoItem("Uptown"), 800);
  assert.equal(c.elevInvestTotais().total, 48800);
  c.elevInvestimentos.push({ id: 5, item: "Geral", valor: 100, pagoPor: "", tipo: "despesa" });
  assert.equal(c.elevInvestTotais().total, 48800);
});
