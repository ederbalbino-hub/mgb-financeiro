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

// ── Rádio interna ──────────────────────────────────────────────────────
test("rádio interna: custo fixo de R$ 70 e sobra calculada", () => {
  assert.equal(N.CUSTO_RADIO, 70);
  assert.equal(N.sobraRadio(250), 180);
  assert.equal(N.sobraRadio("199,90"), 129.9);
  assert.equal(N.sobraRadio(50), -20);
});

test("rádio interna: custo sai no formato recorrente do hub", () => {
  const d = N.despesaRadio("2026-11-01", "24");
  assert.equal(d.t, "Recorrente");
  assert.equal(d.q * d.u, 70);
  assert.equal(d.mesesRec, 24);
  assert.equal(d.dataInicio, "2026-11");
});

test("rádio interna: validação de nome, duplicidade, valor e e-mail", () => {
  const ok = { nome: "Ótica Visão · Centro", valor: "250", inicio: "2026-11-01", email: "a@b.com" };
  assert.deepEqual(N.validarRadio(ok, ["Mercadão Prochet"]), []);
  assert.match(N.validarRadio({ ...ok, nome: "mercadao prochet" }, ["Mercadão Prochet"]).join(), /Já existe/);
  assert.match(N.validarRadio({ ...ok, valor: "" }, []).join(), /valor mensal/);
  assert.match(N.validarRadio({ ...ok, inicio: "" }, []).join(), /início/);
  assert.match(N.validarRadio({ ...ok, email: "a@b" }, []).join(), /e-mail/);
});

test("datas do contrato sem erro de fuso e virando o ano", () => {
  assert.equal(N.dataMais("2026-11-01", 0), "01/11/2026");
  assert.equal(N.dataMais("2026-11-01", 12), "01/11/2027");
  assert.equal(N.dataMais("2026-12-15", 6), "15/06/2027");
  assert.equal(N.dataMais("", 12), "");
});

test("contrato padrão de rádio interna traz partes, valor, vigência e nota", () => {
  const html = N.contratoRadioInterna(
    { nome: "Ótica Visão · Centro", razao: "Visão Ótica Ltda", cnpj: "12.345.678/0001-90", valor: "250", inicio: "2026-11-01", meses: "12", nf: "nota", responsavel: "Ana" },
    { extenso: () => "Duzentos e cinquenta reais", hoje: "10 de outubro de 2026", numero: "MGB-RAD-1" }
  );
  assert.match(html, /CONTRATO DE PRESTAÇÃO DE SERVIÇOS/);
  assert.match(html, /Visão Ótica Ltda/);
  assert.match(html, /R\$ 250,00 \(Duzentos e cinquenta reais\)/);
  assert.match(html, /12 \(doze\) meses/);
  assert.match(html, /01\/11\/2026 a 01\/11\/2027/);
  assert.match(html, /nota fiscal de serviço/);
  assert.match(html, /IPCA\/IBGE[^<]*negativa ou igual a zero[^<]*IGP-M\/FGV/);
  assert.doesNotMatch(html, /torre/i);
  const semNota = N.contratoRadioInterna({ nome: "X", valor: 100, inicio: "2026-11-01", meses: 6, nf: "boleto" });
  assert.doesNotMatch(semNota, /nota fiscal/);
  const xss = N.contratoRadioInterna({ nome: "<script>x</script>", valor: 1, inicio: "2026-11-01" });
  assert.doesNotMatch(xss, /<script>/);
});
