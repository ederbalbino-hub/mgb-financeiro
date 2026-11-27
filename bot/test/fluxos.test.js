// Regras dos fluxos entre telas (fluxos.js e funil.js, na raiz do repositório).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const X = require("../../fluxos.js");
const F = require("../../funil.js");
const I = require("../../inicio.js");
const N = require("../../novo.js");

test("apagar a linha 1: as marcações de pago das linhas de baixo sobem junto", () => {
  const P = { 0: { "2026-10": { pago: true } }, 1: { "2026-10": { pago: false } }, 2: { "2026-10": { pago: true, obs: "pix" } }, _x: 1 };
  assert.deepEqual(X.reindexarPagamentos(P, 1), { 0: { "2026-10": { pago: true } }, 1: { "2026-10": { pago: true, obs: "pix" } }, _x: 1 });
  assert.deepEqual(X.reindexarPagamentos(P, 5), P);
  assert.deepEqual(X.reindexarPagamentos({}, 0), {});
  assert.equal(X.reindexarPagamentos(undefined, 0), undefined);
});

test("cadastro do lead: condomínio está na Tela Vertical, rádio pode estar no Mercadão", () => {
  const info = {
    elev: { "Ed. Aurora": { assinafyDocId: "d1" } },
    mercadao: { "Loja do Zé": { assinadoEm: "2026-11-20T10:00:00Z" } },
    radio: { "Loja do Zé": { cnpj: "1" } },
    _rascunhos: { "Loja do Zé": { lixo: true } },
  };
  assert.equal(F.cadastroDoLead({ produto: "condo", itemCriado: "Ed. Aurora" }, info).assinafyDocId, "d1");
  assert.equal(F.cadastroDoLead({ produto: "radio", itemCriado: "Loja do Zé" }, info).assinadoEm, "2026-11-20T10:00:00Z");
  assert.equal(F.cadastroDoLead({ produto: "radio", itemCriado: "None", nome: "Loja do Zé" }, info).assinadoEm, "2026-11-20T10:00:00Z");
  assert.equal(F.cadastroDoLead({ produto: "vaapty", nome: "Ninguém" }, info), null);
});

test('"None" é lead sem cadastro em todas as telas (funil, Início, Novo cliente)', () => {
  const leads = [{ estagio: "fechado", itemCriado: "None" }, { estagio: "fechado", itemCriado: "X" }, { estagio: "fechado" }];
  assert.equal(F.situacaoLead(leads[0]).txt, "esperando cadastro");
  assert.equal(I.contarFunil(leads).semCadastro, 2);
  assert.equal(N.leadsPendentes(leads).length, 2);
});
