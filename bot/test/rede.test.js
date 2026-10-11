// Rede Tela Vertical (telavertical/rede-tela-vertical.js): fonte única de condomínios para proposta e contrato.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require("../../telavertical/rede-tela-vertical.js");

test("entrega de 100 inserções por tela/dia", () => {
  assert.equal(R.REDE.insercoesDia, 100);
});

test("lista viva usa as telas do hub e o público da rede, casando nomes diferentes", () => {
  const telas = { "Bella Fiori": 3, "Ayrton Senna 1": 2, "Ampezzo": 1, "Cond. Novo": 4, "Sem Tela": 0 };
  const l = R.lista({ itens: Object.keys(telas), telas: (i) => telas[i], info: (i) => (i === "Cond. Novo" ? { bairro: "Centro", moradores: 300 } : null) });
  const por = Object.fromEntries(l.map((c) => [c.hub, c]));
  assert.equal(por["Bella Fiori"].nome, "Resid. Bella Fiori");
  assert.equal(por["Bella Fiori"].telas, 3, "telas vêm do hub");
  assert.equal(por["Bella Fiori"].pessoas, 156, "público vem da proposta");
  assert.equal(por["Ayrton Senna 1"].tipo, "comercial");
  assert.equal(por["Ampezzo"].nome, "Resid. D'Ampezzo");
  assert.equal(por["Cond. Novo"].pessoas, 300);
  assert.ok(por["Cond. Novo"].semDados);
  assert.ok(!por["Sem Tela"], "condomínio sem tela não entra no contrato");
});

test("sem o hub, usa a rede completa (16 condomínios, 39 telas)", () => {
  const l = R.lista();
  assert.equal(l.length, 16);
  assert.equal(l.reduce((a, c) => a + c.telas, 0), 39);
});
