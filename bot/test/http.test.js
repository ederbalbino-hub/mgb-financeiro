// Trava dos endpoints (lib/http.js): CORS só pro hub + login obrigatório por papel.
import test from "node:test";
import assert from "node:assert/strict";
import { cors, exigirLogin, origensPermitidas, PAPEIS_FINANCEIRO } from "../lib/http.js";
import { assinarToken, hashSenha } from "../lib/auth.js";

const SEGREDO = "segredo-de-teste";
const ENV = {
  HUB_AUTH_SECRET: SEGREDO,
  HUB_USERS: JSON.stringify({
    eder: { nome: "Eder", papel: "admin", senha: hashSenha("x") },
    karen: { nome: "Karen", papel: "financeiro", senha: hashSenha("x") },
    guina: { nome: "Guina", papel: "bureau", senha: hashSenha("x") },
  }),
};
const HUB = "https://ederbalbino-hub.github.io";

function resFalsa() {
  return {
    headers: {}, statusCode: null, corpo: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.corpo = b; return this; },
    end() { return this; },
  };
}
const req = ({ origin, method = "GET", token } = {}) => ({
  method,
  headers: { ...(origin ? { origin } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
});
const tokenDe = (login, papel) => assinarToken({ login, papel }, SEGREDO);

test("CORS: libera o hub e recusa outros sites", () => {
  const r1 = resFalsa();
  assert.equal(cors(req({ origin: HUB }), r1, { env: {} }), false);
  assert.equal(r1.headers["Access-Control-Allow-Origin"], HUB);

  const r2 = resFalsa();
  cors(req({ origin: "https://site-malicioso.com" }), r2, { env: {} });
  assert.equal(r2.headers["Access-Control-Allow-Origin"], undefined, "não pode refletir origem desconhecida");
});

test("CORS: preflight de origem estranha leva 403; do hub, 204", () => {
  const r1 = resFalsa();
  assert.equal(cors(req({ origin: "https://evil.example", method: "OPTIONS" }), r1, { env: {} }), true);
  assert.equal(r1.statusCode, 403);
  const r2 = resFalsa();
  assert.equal(cors(req({ origin: HUB, method: "OPTIONS" }), r2, { env: {} }), true);
  assert.equal(r2.statusCode, 204);
});

test("HUB_ORIGINS substitui a lista padrão", () => {
  assert.deepEqual(origensPermitidas({ HUB_ORIGINS: "https://hub.mgb.com.br/, https://x.dev" }), ["https://hub.mgb.com.br", "https://x.dev"]);
  assert.deepEqual(origensPermitidas({}), [HUB]);
});

test("sem token: 401", () => {
  const r = resFalsa();
  assert.equal(exigirLogin(req(), r, null, ENV), null);
  assert.equal(r.statusCode, 401);
});

test("token forjado ou de outro segredo: 401", () => {
  const r = resFalsa();
  const falso = assinarToken({ login: "eder", papel: "admin" }, "outro-segredo");
  assert.equal(exigirLogin(req({ token: falso }), r, null, ENV), null);
  assert.equal(r.statusCode, 401);
});

test("login não configurado no servidor: 503 (fail-closed)", () => {
  const r = resFalsa();
  assert.equal(exigirLogin(req({ token: tokenDe("eder", "admin") }), r, null, {}), null);
  assert.equal(r.statusCode, 503);
});

test("financeiro: admin e Karen passam, Guina (bureau) leva 403", () => {
  assert.equal(exigirLogin(req({ token: tokenDe("eder", "admin") }), resFalsa(), PAPEIS_FINANCEIRO, ENV).login, "eder");
  assert.equal(exigirLogin(req({ token: tokenDe("karen", "financeiro") }), resFalsa(), PAPEIS_FINANCEIRO, ENV).login, "karen");
  const r = resFalsa();
  assert.equal(exigirLogin(req({ token: tokenDe("guina", "bureau") }), r, PAPEIS_FINANCEIRO, ENV), null);
  assert.equal(r.statusCode, 403);
});

test("o papel vale o do cadastro atual, não o do token", () => {
  // token antigo dizendo "admin", mas no cadastro a Guina é bureau
  const r = resFalsa();
  assert.equal(exigirLogin(req({ token: tokenDe("guina", "admin") }), r, PAPEIS_FINANCEIRO, ENV), null);
  assert.equal(r.statusCode, 403);
});

test("usuário removido do HUB_USERS perde o acesso na hora", () => {
  const r = resFalsa();
  assert.equal(exigirLogin(req({ token: tokenDe("cleiton", "programacao") }), r, null, ENV), null);
  assert.equal(r.statusCode, 401);
});
