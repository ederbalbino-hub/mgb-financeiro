// Estado do hub atrás do login (api/estado.js + lib/appsScript.js), faturamento e plano de caixa.
import test from "node:test";
import assert from "node:assert/strict";
import estado from "../api/estado.js";
import faturamento from "../api/faturamento.js";
import planoCaixa from "../api/plano-caixa.js";
import { lerEstado, gravarEstado } from "../lib/appsScript.js";
import { assinarToken, hashSenha } from "../lib/auth.js";

const SEGREDO = "seg";
const ENV = {
  HUB_AUTH_SECRET: SEGREDO,
  HUB_USERS: JSON.stringify({
    eder: { nome: "Eder", papel: "admin", senha: hashSenha("x") },
    karen: { nome: "Karen", papel: "financeiro", senha: hashSenha("x") },
    guina: { nome: "Guina", papel: "bureau", senha: hashSenha("x") },
  }),
  APPS_SCRIPT_URL: "https://script.example/exec",
  HUB_STATE_SECRET: "segredo-estado",
  FATURAMENTO_API_URL: "https://fat.example/exec",
  FATURAMENTO_SECRET: "segredo-fat",
  PLANO_CAIXA_URL: "https://plano.example/exec",
  PLANO_CAIXA_TOKEN: "token-plano",
};
const tk = (login, papel) => assinarToken({ login, papel }, SEGREDO);

function resFalsa() {
  return {
    headers: {}, statusCode: null, corpo: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.corpo = b; return this; },
    send(b) { this.corpo = b; return this; },
    end() { return this; },
  };
}
const req = ({ method = "GET", token, query = {}, body } = {}) => ({
  method, query, body,
  headers: { origin: "https://ederbalbino-hub.github.io", ...(token ? { authorization: `Bearer ${token}` } : {}) },
});
// fetch falso: guarda as chamadas e responde com `resposta(url, opts)`
function fetchFalso(resposta) {
  const chamadas = [];
  const fn = async (url, opts = {}) => {
    chamadas.push({ url, opts });
    const { status = 200, texto } = resposta(url, opts);
    return { ok: status < 400, status, text: async () => texto };
  };
  fn.chamadas = chamadas;
  return fn;
}

// ── lib/appsScript.js ──────────────────────────────────────────────────────────────
test("lerEstado manda o segredo e devolve texto + versão", async () => {
  const f = fetchFalso(() => ({ texto: '{"db":{},"_v":7}' }));
  const r = await lerEstado(ENV, f);
  assert.equal(r.versao, 7);
  assert.equal(new URL(f.chamadas[0].url).searchParams.get("s"), "segredo-estado");
});

test("lerEstado NUNCA devolve {} em silêncio (antes o bot gravava {} por cima de tudo)", async () => {
  for (const texto of ["forbidden", "{}", "erro: Drive fora", "[]", "<html>"]) {
    await assert.rejects(lerEstado(ENV, fetchFalso(() => ({ texto }))), undefined, texto);
  }
});

test("sem APPS_SCRIPT_URL/HUB_STATE_SECRET: erro 503, nenhuma chamada", async () => {
  const f = fetchFalso(() => ({ texto: "{}" }));
  await assert.rejects(lerEstado({}, f), (e) => e.status === 503);
  assert.equal(f.chamadas.length, 0);
});

test("gravarEstado recusa vazio e repassa conflito de versão", async () => {
  await assert.rejects(gravarEstado({}, 1, ENV, fetchFalso(() => ({ texto: '{"ok":true}' }))), (e) => e.status === 400);
  const f = fetchFalso(() => ({ texto: '{"ok":false,"conflito":true,"v":9}' }));
  await assert.rejects(gravarEstado({ a: 1 }, 8, ENV, f), (e) => e.conflito && e.versao === 9 && e.status === 409);
  assert.equal(new URL(f.chamadas[0].url).searchParams.get("v"), "8");
});

// ── api/estado.js ──────────────────────────────────────────────────────────────────
test("estado: sem login não chega no Apps Script", async () => {
  const f = fetchFalso(() => ({ texto: '{"db":{}}' }));
  const r = resFalsa();
  await estado(req(), r, { env: ENV, fetchFn: f });
  assert.equal(r.statusCode, 401);
  assert.equal(f.chamadas.length, 0);
});

test("estado: GET logado devolve o estado cru", async () => {
  const r = resFalsa();
  await estado(req({ token: tk("guina", "bureau") }), r, { env: ENV, fetchFn: fetchFalso(() => ({ texto: '{"db":{"x":1},"_v":3}' })) });
  assert.equal(r.statusCode, 200);
  assert.equal(r.corpo, '{"db":{"x":1},"_v":3}');
});

test("estado: GET com Apps Script recusando vira 502 (o hub não carrega lixo)", async () => {
  const r = resFalsa();
  await estado(req({ token: tk("eder", "admin") }), r, { env: ENV, fetchFn: fetchFalso(() => ({ texto: "forbidden" })) });
  assert.equal(r.statusCode, 502);
});

test("estado: POST grava com a versão lida e carimba quem salvou pelo login", async () => {
  const f = fetchFalso(() => ({ texto: '{"ok":true,"v":5}' }));
  const r = resFalsa();
  const corpo = JSON.stringify({ db: {}, _v: 5, _salvoPor: "Mentira" });
  await estado(req({ method: "POST", token: tk("karen", "financeiro"), query: { v: "4" }, body: corpo }), r, { env: ENV, fetchFn: f });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.corpo, { ok: true, v: 5 });
  assert.equal(new URL(f.chamadas[0].url).searchParams.get("v"), "4");
  const enviado = JSON.parse(f.chamadas[0].opts.body);
  assert.equal(enviado._salvoPor, "Karen");
  assert.equal(enviado._salvoLogin, "karen");
});

test("estado: POST em conflito devolve 409", async () => {
  const r = resFalsa();
  await estado(req({ method: "POST", token: tk("eder", "admin"), query: { v: "1" }, body: '{"db":{}}' }), r, {
    env: ENV, fetchFn: fetchFalso(() => ({ texto: '{"ok":false,"conflito":true,"v":2}' })),
  });
  assert.equal(r.statusCode, 409);
  assert.equal(r.corpo.conflito, true);
});

// ── api/faturamento.js ─────────────────────────────────────────────────────────────
test("faturamento: só admin/financeiro, e o segredo vai pelo servidor", async () => {
  const f = fetchFalso(() => ({ texto: '{"rows":[]}' }));
  const r1 = resFalsa();
  await faturamento(req({ token: tk("guina", "bureau"), query: { action: "listar" } }), r1, { env: ENV, fetchFn: f });
  assert.equal(r1.statusCode, 403);
  assert.equal(f.chamadas.length, 0);

  const r2 = resFalsa();
  await faturamento(req({ token: tk("karen", "financeiro"), query: { action: "listar", mesRef: "2026-11", s: "injetado" } }), r2, { env: ENV, fetchFn: f });
  assert.equal(r2.statusCode, 200);
  const u = new URL(f.chamadas[0].url);
  assert.equal(u.searchParams.get("s"), "segredo-fat", "segredo do navegador é ignorado");
  assert.equal(u.searchParams.get("mesRef"), "2026-11");
});

test("faturamento: ação fora da lista é recusada", async () => {
  const r = resFalsa();
  await faturamento(req({ token: tk("eder", "admin"), query: { action: "atualizar-status-pagamento" } }), r, { env: ENV, fetchFn: fetchFalso(() => ({ texto: "{}" })) });
  assert.equal(r.statusCode, 400);
});

// ── api/plano-caixa.js ─────────────────────────────────────────────────────────────
test("plano-caixa: token vai pelo servidor; avisos pessoais só pro admin", async () => {
  const f = fetchFalso(() => ({ texto: "ok" }));
  const r1 = resFalsa();
  await planoCaixa(req({ method: "POST", token: tk("karen", "financeiro"), query: { acao: "avisosPessoal" }, body: { avisos: [] } }), r1, { env: ENV, fetchFn: f });
  assert.equal(r1.statusCode, 403);

  const r2 = resFalsa();
  await planoCaixa(req({ method: "POST", token: tk("karen", "financeiro"), query: { acao: "resumoEmpresa" }, body: { mesRef: "2026-11", receita: 10, despesa: 4, despesas: [{ id: "hub_1" }] } }), r2, { env: ENV, fetchFn: f });
  assert.equal(r2.statusCode, 200);
  const enviado = JSON.parse(f.chamadas[0].opts.body);
  assert.equal(enviado.token, "token-plano");
  assert.equal(enviado.receita, 10);
  assert.deepEqual(enviado.despesas, [{ id: "hub_1" }]);
});

test("plano-caixa: token recusado pelo Apps Script vira 502 claro", async () => {
  const r = resFalsa();
  await planoCaixa(req({ token: tk("eder", "admin"), query: { acao: "statusDespesasEmpresa" } }), r, {
    env: ENV, fetchFn: fetchFalso(() => ({ texto: '{"erro":"forbidden"}' })),
  });
  assert.equal(r.statusCode, 502);
});
