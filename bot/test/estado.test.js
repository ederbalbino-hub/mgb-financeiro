// Estado do hub atrás do login (api/estado.js + lib/appsScript.js), faturamento e plano de caixa.
import test from "node:test";
import assert from "node:assert/strict";
import estado from "../api/estado.js";
import faturamento from "../lib/pontes/faturamento.js";
import planoCaixa from "../lib/pontes/plano-caixa.js";
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

// ── api/estado.js (Supabase) ─────────────────────────────────────────────────────
const ENV_SB = { ...ENV, SUPABASE_URL: "https://ref.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_teste" };
// Supabase falso: guarda {dados, versao} e implementa as regras principais de salvar_estado.
function supabaseFalso(inicial = null, { appsScript } = {}) {
  let linha = inicial;
  return fetchFalso((url, opts) => {
    if (url.startsWith("https://script.example")) return { texto: appsScript ?? "forbidden" };
    assert.equal(opts.headers.apikey, "sb_secret_teste");
    const corpo = JSON.parse(opts.body || "{}");
    if (url.endsWith("/rpc/carregar_estado")) return { texto: JSON.stringify(linha ? [{ dados: linha.dados, versao: linha.versao }] : []) };
    if (url.endsWith("/rpc/salvar_estado")) {
      if (!linha) { linha = { dados: corpo.p_dados, versao: 1, login: corpo.p_login }; return { texto: '{"ok":true,"v":1}' }; }
      if (corpo.p_versao_esperada !== null && corpo.p_versao_esperada !== linha.versao) return { texto: JSON.stringify({ ok: false, conflito: true, v: linha.versao }) };
      linha = { dados: corpo.p_dados, versao: linha.versao + 1, login: corpo.p_login };
      return { texto: JSON.stringify({ ok: true, v: linha.versao }) };
    }
    return { status: 404, texto: "{}" };
  });
}

test("estado: sem login não chega no banco", async () => {
  const f = supabaseFalso({ dados: '{"db":{}}', versao: 1 });
  const r = resFalsa();
  await estado(req(), r, { env: ENV_SB, fetchFn: f });
  assert.equal(r.statusCode, 401);
  assert.equal(f.chamadas.length, 0);
});

test("estado: GET logado devolve o estado com _v = versão do banco", async () => {
  const r = resFalsa();
  await estado(req({ token: tk("eder", "admin") }), r, { env: ENV_SB, fetchFn: supabaseFalso({ dados: '{"db":{"x":1},"_v":99}', versao: 3 }) });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(r.corpo), { db: { x: 1 }, _v: 3 });
});

test("estado: banco vazio importa uma vez do Apps Script", async () => {
  const f = supabaseFalso(null, { appsScript: '{"db":{"antigo":1},"_v":40}' });
  const r = resFalsa();
  await estado(req({ token: tk("eder", "admin") }), r, { env: ENV_SB, fetchFn: f });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(r.corpo).db, { antigo: 1 });
  const salvou = f.chamadas.find((c) => c.url.endsWith("/rpc/salvar_estado"));
  assert.equal(JSON.parse(salvou.opts.body).p_login, "importacao");
});

test("estado: Apps Script recusando na importação vira 502 (o hub não carrega lixo)", async () => {
  const r = resFalsa();
  await estado(req({ token: tk("eder", "admin") }), r, { env: ENV_SB, fetchFn: supabaseFalso(null, { appsScript: "forbidden" }) });
  assert.equal(r.statusCode, 502);
});

test("estado: sem SUPABASE_* configurado, 503", async () => {
  const r = resFalsa();
  await estado(req({ token: tk("eder", "admin") }), r, { env: ENV, fetchFn: supabaseFalso() });
  assert.equal(r.statusCode, 503);
});

test("estado: POST grava com a versão lida e quem salvou vem do login", async () => {
  const f = supabaseFalso({ dados: '{"db":{}}', versao: 4 });
  const r = resFalsa();
  const corpo = JSON.stringify({ db: { novo: 1 }, _v: 5, _salvoPor: "Mentira" });
  await estado(req({ method: "POST", token: tk("karen", "financeiro"), query: { v: "4" }, body: corpo }), r, { env: ENV_SB, fetchFn: f });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.corpo, { ok: true, v: 5 });
  const enviado = JSON.parse(f.chamadas.at(-1).opts.body);
  assert.equal(enviado.p_versao_esperada, 4);
  assert.equal(enviado.p_login, "karen");
  const dados = JSON.parse(enviado.p_dados);
  assert.equal(dados._salvoPor, "Karen");
  assert.equal(dados._v, 5);
});

test("estado: POST com versão velha devolve 409", async () => {
  const r = resFalsa();
  await estado(req({ method: "POST", token: tk("eder", "admin"), query: { v: "1" }, body: '{"db":{}}' }), r, {
    env: ENV_SB, fetchFn: supabaseFalso({ dados: '{"db":{}}', versao: 2 }),
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

test("plano-caixa: na troca de token tenta o NOVO e cai no antigo se o script ainda não conhecer", async () => {
  const env = { ...ENV, PLANO_CAIXA_TOKEN_NOVO: "token-novo" };
  const vistos = [];
  const f = fetchFalso((url) => { const t = new URL(url).searchParams.get("token"); vistos.push(t); return { texto: t === "token-plano" ? '{"hub_1":"pago"}' : "forbidden" }; });
  const r = resFalsa();
  await planoCaixa(req({ token: tk("eder", "admin"), query: { acao: "statusDespesasEmpresa" } }), r, { env, fetchFn: f });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(vistos, ["token-novo", "token-plano"]);

  const f2 = fetchFalso((url) => ({ texto: new URL(url).searchParams.get("token") === "token-novo" ? '{"ok":true}' : "forbidden" }));
  const r2 = resFalsa();
  await planoCaixa(req({ token: tk("eder", "admin"), query: { acao: "statusDespesasEmpresa" } }), r2, { env, fetchFn: f2 });
  assert.equal(r2.statusCode, 200);
  assert.equal(f2.chamadas.length, 1, "token novo aceito: não tenta o antigo");
});

// ── Visibilidade por papel (lib/visibilidade.js + api/estado.js) ─────────────────
const ESTADO_CHEIO = JSON.stringify({ migracoes: { a: 1 }, db: { elev: { x: [1] } }, leads: [{ n: "L" }], etiquetas: [{ id: 1 }], pessoalDesp: [{ v: 9 }], pessoalRegras: [1] });
const ENV_PAPEIS = {
  ...ENV, SUPABASE_URL: "https://ref.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_teste",
  HUB_USERS: JSON.stringify({
    eder: { nome: "Eder", papel: "admin", senha: hashSenha("x") }, karen: { nome: "Karen", papel: "financeiro", senha: hashSenha("x") },
    guina: { nome: "Guina", papel: "bureau", senha: hashSenha("x") }, cleiton: { nome: "Cleiton", papel: "programacao", senha: hashSenha("x") },
  }),
};
async function lerComo(login, papel) {
  const r = resFalsa();
  await estado(req({ token: tk(login, papel) }), r, { env: ENV_PAPEIS, fetchFn: supabaseFalso({ dados: ESTADO_CHEIO, versao: 7 }) });
  assert.equal(r.statusCode, 200);
  return Object.keys(JSON.parse(r.corpo)).filter((k) => k !== "_v");
}

test("visibilidade: admin vê tudo; Karen tudo menos o Pessoal; Guina e Cleiton só o que usam", async () => {
  assert.deepEqual(await lerComo("eder", "admin"), ["migracoes", "db", "leads", "etiquetas", "pessoalDesp", "pessoalRegras"]);
  assert.deepEqual(await lerComo("karen", "financeiro"), ["migracoes", "db", "leads", "etiquetas"]);
  assert.deepEqual(await lerComo("guina", "bureau"), ["migracoes"]);
  assert.deepEqual(await lerComo("cleiton", "programacao"), ["migracoes", "etiquetas"]);
});

async function gravarComo(login, papel, enviado, v = 7) {
  const f = supabaseFalso({ dados: ESTADO_CHEIO, versao: 7 });
  const r = resFalsa();
  await estado(req({ method: "POST", token: tk(login, papel), query: { v: String(v) }, body: JSON.stringify(enviado) }), r, { env: ENV_PAPEIS, fetchFn: f });
  const salvou = f.chamadas.find((c) => c.url.endsWith("/rpc/salvar_estado"));
  return { r, gravado: salvou ? JSON.parse(JSON.parse(salvou.opts.body).p_dados) : null };
}

test("visibilidade: Karen não apaga nem altera o Pessoal, mesmo mandando vazio", async () => {
  const { r, gravado } = await gravarComo("karen", "financeiro", { migracoes: { a: 1 }, db: { elev: { x: [2] } }, leads: [{ n: "L" }], etiquetas: [{ id: 1 }], pessoalDesp: [], pessoalRegras: [] });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(gravado.db, { elev: { x: [2] } }, "a mudança dela entra");
  assert.deepEqual(gravado.pessoalDesp, [{ v: 9 }], "o Pessoal fica como estava");
  assert.deepEqual(gravado.pessoalRegras, [1]);
});

test("visibilidade: Cleiton só grava Etiquetas; o resto que ele mandar é ignorado", async () => {
  const { r, gravado } = await gravarComo("cleiton", "programacao", { migracoes: { z: 1 }, etiquetas: [{ id: 2 }], db: {}, leads: [] });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(gravado.etiquetas, [{ id: 2 }]);
  assert.deepEqual(gravado.db, { elev: { x: [1] } });
  assert.deepEqual(gravado.leads, [{ n: "L" }]);
  assert.deepEqual(gravado.migracoes, { a: 1 });
  assert.equal(gravado._salvoPor, "Cleiton");
});

test("visibilidade: Guina não grava nada (responde ok sem tocar no banco)", async () => {
  const { r, gravado } = await gravarComo("guina", "bureau", { migracoes: { a: 1 }, db: {}, pessoalDesp: [] });
  assert.equal(r.statusCode, 200);
  assert.equal(r.corpo.semMudanca, true);
  assert.equal(gravado, null);
});

test("visibilidade: visão parcial também respeita a trava de versão", async () => {
  const { r } = await gravarComo("cleiton", "programacao", { etiquetas: [{ id: 3 }] }, 6);
  assert.equal(r.statusCode, 409);
});
