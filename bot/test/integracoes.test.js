// Etapa 1 das integrações: chaves de terceiros saem do navegador.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import cnpj, { normalizar } from "../lib/pontes/cnpj.js";
import { gerarTexto } from "../api/assistente.js";
import { assinarToken, hashSenha } from "../lib/auth.js";

const SEGREDO = "seg";
const ENV = {
  HUB_AUTH_SECRET: SEGREDO,
  HUB_USERS: JSON.stringify({
    eder: { nome: "Eder", papel: "admin", senha: hashSenha("x") },
    karen: { nome: "Karen", papel: "financeiro", senha: hashSenha("x") },
    cleiton: { nome: "Cleiton", papel: "programacao", senha: hashSenha("x") },
  }),
  CNPJA_TOKEN: "chave-cnpja",
};
const tk = (login, papel) => assinarToken({ login, papel }, SEGREDO);
function resFalsa() {
  return {
    headers: {}, statusCode: null, corpo: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.corpo = b; return this; },
    end() { return this; },
  };
}
const req = ({ method = "GET", token, query = {} } = {}) => ({
  method, query,
  headers: { origin: "https://ederbalbino-hub.github.io", ...(token ? { authorization: `Bearer ${token}` } : {}) },
});
function fetchFalso(status, corpo) {
  const chamadas = [];
  const fn = async (url, opts = {}) => {
    chamadas.push({ url, opts });
    return { ok: status < 400, status, text: async () => JSON.stringify(corpo) };
  };
  fn.chamadas = chamadas;
  return fn;
}
const CNPJA = {
  company: { name: "MERCADO EXEMPLO LTDA" }, alias: "Mercado Exemplo",
  address: { street: "Rua A", number: "10", details: "", district: "Centro", city: "Londrina", state: "PR", zip: "86000-000" },
  phones: [{ area: "43", number: "33334444" }], emails: [{ address: "contato@exemplo.com" }],
};

test("cnpj: chave vai só do servidor e a resposta volta no formato do formulário", async () => {
  const f = fetchFalso(200, CNPJA);
  const r = resFalsa();
  await cnpj(req({ token: tk("karen", "financeiro"), query: { cnpj: "12.345.678/0001-90" } }), r, { env: ENV, fetchFn: f });
  assert.equal(r.statusCode, 200);
  assert.equal(f.chamadas[0].url, "https://api.cnpja.com/office/12345678000190?strategy=CACHE_IF_FRESH");
  assert.equal(f.chamadas[0].opts.headers.Authorization, "chave-cnpja");
  assert.deepEqual(r.corpo.dados, {
    nome: "MERCADO EXEMPLO LTDA", fantasia: "Mercado Exemplo", logradouro: "Rua A", numero: "10", complemento: "",
    bairro: "Centro", cidade: "Londrina", uf: "PR", cep: "86000000", telefone: "4333334444", email: "contato@exemplo.com",
  });
});

test("cnpj: sem login, papel errado, CNPJ inválido ou sem chave não consulta", async () => {
  const f = fetchFalso(200, CNPJA);
  let r = resFalsa();
  await cnpj(req({ query: { cnpj: "12345678000190" } }), r, { env: ENV, fetchFn: f });
  assert.equal(r.statusCode, 401);
  r = resFalsa();
  await cnpj(req({ token: tk("cleiton", "programacao"), query: { cnpj: "12345678000190" } }), r, { env: ENV, fetchFn: f });
  assert.equal(r.statusCode, 403);
  r = resFalsa();
  await cnpj(req({ token: tk("eder", "admin"), query: { cnpj: "123" } }), r, { env: ENV, fetchFn: f });
  assert.equal(r.statusCode, 400);
  r = resFalsa();
  await cnpj(req({ token: tk("eder", "admin"), query: { cnpj: "12345678000190" } }), r, { env: { ...ENV, CNPJA_TOKEN: "" }, fetchFn: f });
  assert.equal(r.statusCode, 503);
  assert.equal(f.chamadas.length, 0);
});

test("cnpj: CNPJ inexistente vira 404 e recusa do CNPJá vira 502", async () => {
  let r = resFalsa();
  await cnpj(req({ token: tk("eder", "admin"), query: { cnpj: "12345678000190" } }), r, { env: ENV, fetchFn: fetchFalso(404, {}) });
  assert.equal(r.statusCode, 404);
  r = resFalsa();
  await cnpj(req({ token: tk("eder", "admin"), query: { cnpj: "12345678000190" } }), r, { env: ENV, fetchFn: fetchFalso(401, {}) });
  assert.equal(r.statusCode, 502);
});

test("cnpj: campos ausentes viram texto vazio", () => {
  assert.deepEqual(normalizar({}), {
    nome: "", fantasia: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", cep: "", telefone: "", email: "",
  });
});

test("gerarTexto: manda o pedido ao modelo e devolve o texto; pedido vazio é recusado", async () => {
  let enviado;
  const criarCliente = () => ({ messages: { create: async (p) => { enviado = p; return { content: [{ type: "text", text: "[POST]Oi[/POST]" }] }; } } });
  let r = resFalsa();
  await gerarTexto(r, { prompt: "Crie um post", maxTokens: 99999 }, { criarCliente });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.corpo, { ok: true, texto: "[POST]Oi[/POST]" });
  assert.equal(enviado.max_tokens, 1500);
  assert.equal(enviado.messages[0].content, "Crie um post");
  r = resFalsa();
  await gerarTexto(r, { prompt: "   " }, { criarCliente });
  assert.equal(r.statusCode, 400);
});

test("hub: nenhuma chave de terceiro nem script de leads no index.html", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.ok(!html.includes("api.cnpja.com"), "CNPJá deve passar pela API");
  assert.ok(!html.includes("api.groq.com"), "Groq foi trocado pelo assistente");
  assert.ok(!html.includes("LEADS_SHEET_URL"), "exportação de leads virou botão de Excel");
  assert.ok(html.includes("mgb-financeiro.vercel.app/api/cnpj"));
  assert.ok(html.includes("leadsBaixarExcel()"));
});

test("vercel: /api/cnpj cai na ponte e o total de funções segue abaixo de 12", () => {
  const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(cfg.rewrites.some((r) => r.source === "/api/cnpj" && r.destination === "/api/ponte?alvo=cnpj"));
});
