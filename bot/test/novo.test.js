// Regras do botão "Novo" (novo.js, na raiz do repositório).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const N = require("../../novo.js");
const A = require("../../acesso.js");

test("custo do condomínio: R$ 70 por torre", () => {
  assert.equal(N.custoCondominio(1), 70);
  assert.equal(N.custoCondominio(2), 140);
  assert.equal(N.custoCondominio("3"), 210);
  assert.equal(N.custoCondominio(0), 0);
  assert.equal(N.custoCondominio(""), 0);
});

test("despesa da licença sai no formato recorrente do hub", () => {
  const d = N.despesaLicenca(2, "2026-11-01", "36");
  assert.equal(d.t, "Recorrente");
  assert.equal(d.q * d.u, 140);
  assert.equal(d.mesesRec, 36);
  assert.equal(d.dataInicio, "2026-11");
  assert.equal(d.pago, false);
});

test("só leads fechados e ainda não cadastrados aparecem no Novo", () => {
  const leads = [
    { id: 1, estagio: "fechado", itemCriado: null },
    { id: 2, estagio: "fechado", itemCriado: "Cond. X" },
    { id: 3, estagio: "negociando" },
    { id: 4, estagio: "perdido" },
  ];
  assert.deepEqual(N.leadsPendentes(leads).map((l) => l.id), [1]);
  assert.deepEqual(N.leadsPendentes(undefined), []);
});

test("não deixa criar condomínio repetido (ignora acento, caixa e espaços)", () => {
  const existentes = ["Lagoa Dourada", "Residencial Málaga"];
  assert.ok(N.jaExiste("lagoa  dourada", existentes));
  assert.ok(N.jaExiste("Residencial Malaga", existentes));
  assert.ok(!N.jaExiste("Lagoa Azul", existentes));
});

test("validação do formulário de condomínio", () => {
  const ok = { nome: "Cond. Novo", torres: "2", inicio: "2026-11-01", email: "s@x.com" };
  assert.deepEqual(N.validarCondominio(ok, []), []);
  assert.equal(N.validarCondominio({ ...ok, nome: "" }, []).length, 1);
  assert.equal(N.validarCondominio({ ...ok, torres: "0" }, []).length, 1);
  assert.equal(N.validarCondominio({ ...ok, inicio: "" }, []).length, 1);
  assert.equal(N.validarCondominio({ ...ok, email: "sem-arroba" }, []).length, 1);
  assert.equal(N.validarCondominio(ok, ["cond. novo"]).length, 1, "nome repetido");
  assert.deepEqual(N.validarCondominio({ ...ok, email: "" }, []), [], "e-mail é opcional (contrato sai depois)");
});

test("botão Novo: Eder e Karen veem; Guina e Cleiton não", () => {
  assert.ok(A.temExtra("admin-geral", "novo"));
  assert.ok(A.temExtra("admin-meudia", "novo"));
  assert.ok(A.temExtra("financeiro", "novo"));
  assert.ok(!A.temExtra("bureau", "novo"));
  assert.ok(!A.temExtra("programacao", "novo"));
});
