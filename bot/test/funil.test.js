// Regras do Funil novo (funil.js, na raiz do repositório).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const F = require("../../funil.js");

test("situação do cartão: retorno, atrasado, esperando cadastro, cliente", () => {
  assert.deepEqual(F.situacaoLead({ estagio: "novo", lembrete: "2026-10-16T10:00" }, true), { txt: "Retorno 16/10", tom: "erro" });
  assert.deepEqual(F.situacaoLead({ estagio: "contatado", lembrete: "2026-12-01" }, false), { txt: "Retorno 01/12", tom: "neutro" });
  assert.equal(F.situacaoLead({ estagio: "novo" }, false).txt, "sem retorno marcado");
  assert.equal(F.situacaoLead({ estagio: "fechado", itemCriado: "None" }).txt, "esperando cadastro");
  assert.equal(F.situacaoLead({ estagio: "fechado", itemCriado: "DM Auto Center" }).txt, "cliente");
  assert.equal(F.situacaoLead({ estagio: "perdido" }), null);
});

test("resumo: conta por produto, soma o que está em negociação e os fechados", () => {
  const r = F.resumoFunil([
    { produto: "elev", estagio: "negociando", valor: 500 },
    { produto: "vaapty", estagio: "negociando", valor: "315" },
    { produto: "elev", estagio: "fechado", valor: 100 },
    { produto: "radio", estagio: "novo" },
  ]);
  assert.deepEqual(r, { total: 4, porProduto: { elev: 2, vaapty: 1, radio: 1 }, negociando: 815, fechados: 1 });
});
