// Regras de quem vê o quê no hub (acesso.js, na raiz do repositório).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const A = require("../../acesso.js");

test("admin: Meu dia por padrão, Visão geral mostra tudo", () => {
  assert.equal(A.perfilEfetivo("admin", "meudia", ""), "admin-meudia");
  assert.equal(A.perfilEfetivo("admin", "geral", ""), "admin-geral");
  for (const p of ["home", "leads", "planocaixa", "pessoal", "radioops", "operacional:estudio", "ferramentas"]) {
    assert.ok(A.pode("admin-geral", p), p);
  }
  assert.ok(A.pode("admin-meudia", "planocaixa"));
  assert.ok(!A.pode("admin-meudia", "operacional:estudio"), "Estúdio é do Cleiton");
});

test("admin pode ver como outra pessoa; outros papéis não", () => {
  assert.equal(A.perfilEfetivo("admin", "meudia", "financeiro"), "financeiro");
  assert.equal(A.perfilEfetivo("financeiro", "geral", "admin-geral"), "financeiro");
  assert.equal(A.perfilEfetivo("desconhecido", "geral", ""), null);
});

test("Karen: financeiro e contratos, sem CRM, propostas, Plano de Caixa e Pessoal", () => {
  for (const p of ["overview", "contabilidade", "relatorios", "radioops", "operacional:contratos", "operacional"]) assert.ok(A.pode("financeiro", p), p);
  for (const p of ["leads", "planocaixa", "pessoal", "midiakit", "sindicos", "propvaapty", "apresmgb", "operacional:estudio"]) assert.ok(!A.pode("financeiro", p), p);
  assert.ok(A.temExtra("financeiro", "valores"));
  assert.ok(!A.temExtra("financeiro", "pessoal"));
});

test("Guina: só Rádio Ops, sem o resumo financeiro da MGB nem valores", () => {
  assert.ok(A.pode("bureau", "radioops"));
  for (const p of ["overview", "contabilidade", "planocaixa", "leads", "custos", "operacional"]) assert.ok(!A.pode("bureau", p), p);
  assert.ok(!A.temExtra("bureau", "ropsResumo"));
  assert.ok(!A.temExtra("bureau", "valores"));
});

test("Cleiton: Estúdio e ferramentas, sem financeiro", () => {
  assert.ok(A.pode("programacao", "operacional:estudio"));
  assert.ok(A.pode("programacao", "operacional"));
  for (const p of ["operacional:contratos", "overview", "radioops", "contabilidade"]) assert.ok(!A.pode("programacao", p), p);
});

test("todo papel acessa a Home", () => {
  for (const p of Object.keys(A.PERFIS)) assert.ok(A.pode(p, "home"), p);
});

test("lê o destino de cada botão do hub", () => {
  assert.equal(A.alvoDoOnclick("goPage('leads')"), "leads");
  assert.equal(A.alvoDoOnclick("goOperacional('estudio')"), "operacional:estudio");
  assert.equal(A.alvoDoOnclick("openGerador()"), "gerador");
  assert.equal(A.alvoDoOnclick("drillMod(MODULES[0].id)"), "custos");
  assert.equal(A.alvoDoOnclick("togglePrivate()"), null);
});

test("revisão do Eder: Karen só Backup nas Ferramentas e só o resumo do Rádio Ops", () => {
  assert.ok(A.podeAba("financeiro", "ferramentas", "backup"));
  assert.ok(!A.podeAba("financeiro", "ferramentas", "etq"));
  assert.equal(A.primeiraAba("financeiro", "ferramentas", "pdf"), "backup");
  assert.ok(A.temExtra("financeiro", "ropsResumo"));
  assert.ok(!A.temExtra("financeiro", "ropsPainel"));
  assert.ok(A.temExtra("financeiro", "renovacao"));
});

test("revisão do Eder: Guina só Rádio Ops (painel), sem Ferramentas", () => {
  assert.ok(!A.pode("bureau", "ferramentas"));
  assert.ok(A.temExtra("bureau", "ropsPainel"));
});

test("revisão do Eder: Cleiton só Gerador de Spots e Blocos Rádio no Estúdio", () => {
  assert.ok(A.podeAba("programacao", "estudio", "gerador"));
  assert.ok(A.podeAba("programacao", "estudio", "blocos"));
  assert.ok(!A.podeAba("programacao", "estudio", "linkedin-gerar"));
  assert.ok(!A.podeAba("programacao", "estudio", "linkedin-plano"));
  assert.ok(A.podeAba("programacao", "ferramentas", "etq"), "Ferramentas completas para o Cleiton");
});

test("admin vê tudo nas abas", () => {
  assert.ok(A.podeAba("admin-geral", "ferramentas", "etq"));
  assert.ok(A.podeAba("admin-geral", "estudio", "linkedin-plano"));
  assert.ok(A.temExtra("admin-geral", "ropsPainel"));
});
