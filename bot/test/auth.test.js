import test from "node:test";
import assert from "node:assert/strict";
import { hashSenha, verificarSenha, assinarToken, verificarToken, carregarUsuarios, usuarioDaRequisicao } from "../lib/auth.js";

const SEGREDO = "segredo-de-teste";

test("senha certa confere, errada não", () => {
  const h = hashSenha("senha-forte-123");
  assert.ok(h.startsWith("scrypt$"));
  assert.equal(verificarSenha("senha-forte-123", h), true);
  assert.equal(verificarSenha("outra", h), false);
  assert.equal(verificarSenha("qualquer", "lixo"), false);
});

test("hash usa sal: mesma senha gera hashes diferentes", () => {
  assert.notEqual(hashSenha("abc12345"), hashSenha("abc12345"));
});

test("token válido volta os dados; adulterado ou com outro segredo é recusado", () => {
  const t = assinarToken({ login: "karen", papel: "financeiro" }, SEGREDO);
  assert.equal(verificarToken(t, SEGREDO).papel, "financeiro");
  assert.equal(verificarToken(t, "outro-segredo"), null);
  const [corpo, ass] = t.split(".");
  const falso = Buffer.from(JSON.stringify({ login: "karen", papel: "admin", exp: Date.now() + 1e9 })).toString("base64url");
  assert.equal(verificarToken(`${falso}.${ass}`, SEGREDO), null, "trocar o papel no corpo invalida a assinatura");
  assert.equal(verificarToken(corpo, SEGREDO), null);
  assert.equal(verificarToken("", SEGREDO), null);
});

test("token expirado é recusado", () => {
  const agora = Date.now();
  const t = assinarToken({ login: "guina", papel: "bureau" }, SEGREDO, agora - 31 * 24 * 3600 * 1000);
  assert.equal(verificarToken(t, SEGREDO, agora), null);
});

test("sem variáveis no ambiente, o login fica desativado", () => {
  assert.equal(carregarUsuarios({}), null);
});

test("carrega usuários e ignora papel desconhecido", () => {
  const env = {
    HUB_AUTH_SECRET: SEGREDO,
    HUB_USERS: JSON.stringify({
      Eder: { nome: "Eder", papel: "admin", senha: hashSenha("12345678") },
      x: { nome: "X", papel: "dono-do-mundo", senha: hashSenha("12345678") },
    }),
  };
  const u = carregarUsuarios(env);
  assert.deepEqual(Object.keys(u), ["eder"]);
  assert.equal(u.eder.papel, "admin");
  assert.throws(() => carregarUsuarios({ HUB_AUTH_SECRET: "s", HUB_USERS: "{quebrado" }));
});

test("lê o usuário do cabeçalho Authorization", () => {
  const env = { HUB_AUTH_SECRET: SEGREDO };
  const t = assinarToken({ login: "cleiton", papel: "programacao" }, SEGREDO);
  assert.equal(usuarioDaRequisicao({ headers: { authorization: `Bearer ${t}` } }, env).login, "cleiton");
  assert.equal(usuarioDaRequisicao({ headers: {} }, env), null);
});
