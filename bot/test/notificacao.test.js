// Aviso de lead fechado (bot/lib/notificacao.js): o botão do e-mail abre o cadastro do lead.
import test from "node:test";
import assert from "node:assert/strict";
import { montarEmail, linkCadastro } from "../lib/notificacao.js";

test("e-mail de lead fechado leva ao Novo cliente daquele lead", () => {
  assert.equal(linkCadastro({ id: 12 }), "https://ederbalbino-hub.github.io/mgb-financeiro/?cadastrar=12");
  const m = montarEmail({ id: 12, nome: "Padaria <Teste>", valor: 400 }, "Eder");
  assert.match(m.html, /href="https:\/\/ederbalbino-hub\.github\.io\/mgb-financeiro\/\?cadastrar=12"/);
  assert.match(m.html, /Cadastrar Padaria &lt;Teste&gt;/);
  assert.match(m.texto, /\?cadastrar=12/);
});
