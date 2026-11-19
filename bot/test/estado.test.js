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

test("visibilidade: admin vê tudo; Karen tudo menos o Pessoal; Cleiton só o que usa", async () => {
  assert.deepEqual(await lerComo("eder", "admin"), ["migracoes", "db", "leads", "etiquetas", "pessoalDesp", "pessoalRegras"]);
  assert.deepEqual(await lerComo("karen", "financeiro"), ["migracoes", "db", "leads", "etiquetas"]);
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

test("Guina (bureau) saiu do hub em 19/11: não lê nem grava o estado", async () => {
  const r = resFalsa();
  await estado(req({ token: tk("guina", "bureau") }), r, { env: ENV_PAPEIS, fetchFn: supabaseFalso({ dados: ESTADO_CHEIO, versao: 7 }) });
  assert.equal(r.statusCode, 403);
  const { r: r2, gravado } = await gravarComo("guina", "bureau", { migracoes: { a: 1 } });
  assert.equal(r2.statusCode, 403);
  assert.equal(gravado, null);
});

test("visibilidade: visão parcial também respeita a trava de versão", async () => {
  const { r } = await gravarComo("cleiton", "programacao", { etiquetas: [{ id: 3 }] }, 6);
  assert.equal(r.statusCode, 409);
});

// ── Funil: Karen só vê leads fechados; aviso de fechamento por e-mail ─────────────
const LEADS = [
  { id: 1, nome: "Padaria A", estagio: "negociando", tel: "43 9999-0001" },
  { id: 2, nome: "Loja B", estagio: "fechado", tel: "43 9999-0002", responsavel: "Ana", valor: 900 },
];
const ESTADO_FUNIL = JSON.stringify({ leads: LEADS, clientesInfo: { elev: {} } });
const ENV_AVISO = { ...ENV_PAPEIS, AVISO_FECHAMENTO_PARA: "karen@x.com,eder@x.com", RESEND_API_KEY: "re_x", RESEND_FROM: "MGB <f@x.com>" };
function bancoComResend(dados, versao) {
  const sb = supabaseFalso({ dados, versao });
  const emails = [];
  const fn = async (url, opts) => {
    if (url === "https://api.resend.com/emails") { emails.push(JSON.parse(opts.body)); return { ok: true, status: 200, text: async () => "{}" }; }
    return sb(url, opts);
  };
  fn.chamadas = sb.chamadas; fn.emails = emails;
  return fn;
}

test("funil: Karen recebe só os leads fechados", async () => {
  const r = resFalsa();
  await estado(req({ token: tk("karen", "financeiro") }), r, { env: ENV_AVISO, fetchFn: bancoComResend(ESTADO_FUNIL, 3) });
  assert.deepEqual(JSON.parse(r.corpo).leads.map((l) => l.nome), ["Loja B"]);
});

test("funil: Karen cadastra o cliente (marca itemCriado) sem poder mexer no funil", async () => {
  const f = bancoComResend(ESTADO_FUNIL, 3);
  const r = resFalsa();
  const enviado = { leads: [{ id: 2, nome: "Loja B", estagio: "fechado", itemCriado: "Loja B" }], clientesInfo: { elev: { "Loja B": { cnpj: "1" } } } };
  await estado(req({ method: "POST", token: tk("karen", "financeiro"), query: { v: "3" }, body: JSON.stringify(enviado) }), r, { env: ENV_AVISO, fetchFn: f });
  assert.equal(r.statusCode, 200);
  const gravado = JSON.parse(JSON.parse(f.chamadas.find((c) => c.url.endsWith("/rpc/salvar_estado")).opts.body).p_dados);
  assert.deepEqual(gravado.leads, [LEADS[0], { ...LEADS[1], itemCriado: "Loja B" }], "só a marca de cadastrado entra; o resto do funil fica");
  assert.deepEqual(gravado.clientesInfo.elev, { "Loja B": { cnpj: "1" } });
  assert.equal(f.emails.length, 0);
});

test("funil: Eder fecha um lead → e-mail para Karen e Eder; lead já fechado não repete", async () => {
  const f = bancoComResend(ESTADO_FUNIL, 3);
  const r = resFalsa();
  const enviado = { leads: [{ ...LEADS[0], estagio: "fechado", email: "padaria@a.com" }, LEADS[1]], clientesInfo: { elev: {} } };
  await estado(req({ method: "POST", token: tk("eder", "admin"), query: { v: "3" }, body: JSON.stringify(enviado) }), r, { env: ENV_AVISO, fetchFn: f });
  assert.equal(r.statusCode, 200);
  assert.equal(f.emails.length, 1);
  assert.deepEqual(f.emails[0].to, ["karen@x.com", "eder@x.com"]);
  assert.match(f.emails[0].subject, /Padaria A/);
  assert.match(f.emails[0].html, /43 9999-0001/);
});

test("funil: seção que não veio no envio do Eder não é apagada", async () => {
  const f = bancoComResend(ESTADO_FUNIL, 3);
  const r = resFalsa();
  await estado(req({ method: "POST", token: tk("eder", "admin"), query: { v: "3" }, body: JSON.stringify({ leads: LEADS, novaSecao: 1 }) }), r, { env: ENV_AVISO, fetchFn: f });
  const gravado = JSON.parse(JSON.parse(f.chamadas.find((c) => c.url.endsWith("/rpc/salvar_estado")).opts.body).p_dados);
  assert.deepEqual(gravado.clientesInfo, { elev: {} });
  assert.equal(gravado.novaSecao, 1);
});

test("funil: Karen não muda etapa, não apaga e não cria lead", async () => {
  const f = bancoComResend(ESTADO_FUNIL, 3);
  const r = resFalsa();
  const enviado = { leads: [{ id: 2, nome: "OUTRO NOME", estagio: "perdido", itemCriado: "X" }, { id: 99, nome: "Lead novo", estagio: "fechado" }], clientesInfo: { elev: {} } };
  await estado(req({ method: "POST", token: tk("karen", "financeiro"), query: { v: "3" }, body: JSON.stringify(enviado) }), r, { env: ENV_AVISO, fetchFn: f });
  const gravado = JSON.parse(JSON.parse(f.chamadas.find((c) => c.url.endsWith("/rpc/salvar_estado")).opts.body).p_dados);
  assert.deepEqual(gravado.leads, [LEADS[0], { ...LEADS[1], itemCriado: "X" }]);
  assert.equal(f.emails.length, 0);
});

// ── Conferência diária do Faturamento (lib/pontes/conferencia.js) ─────────────────
import conferencia, { assinatura } from "../lib/pontes/conferencia.js";
const ITENS = [{ gravidade: "atencao", tipo: "emitido no hub, planilha não atualizada", cliente_id: "elev-arfix", cliente: "Arfix", competencia: "2026-11", detalhe: "hub: boleto-emitido" }];
function supaConferencia(itens, controle) {
  const chamadas = []; const emails = []; let ctrl = { ...controle };
  const fn = async (url, opts = {}) => {
    chamadas.push({ url, opts });
    const R = (o, s = 200) => ({ ok: s < 400, status: s, text: async () => (o == null ? "" : JSON.stringify(o)) });
    if (url === "https://api.resend.com/emails") { emails.push(JSON.parse(opts.body)); return R({ id: "x" }); }
    if (url.includes("/rest/v1/fat_conferencia?")) return R(itens);
    if (url.includes("/rest/v1/fat_conferencia_avisos") && (opts.method || "GET") === "GET") return R([ctrl]);
    if (url.includes("/rest/v1/fat_conferencia_avisos") && opts.method === "PATCH") { ctrl = { ...ctrl, ...JSON.parse(opts.body) }; return R(null, 204); }
    return R({}, 404);
  };
  fn.emails = emails; fn.ctrl = () => ctrl; fn.chamadas = chamadas;
  return fn;
}
const ENV_CONF = { ...ENV_AVISO, CRON_SECRET: "segredo-cron" };
const reqCron = (t = "segredo-cron") => ({ method: "GET", query: {}, headers: { authorization: `Bearer ${t}` } });

test("conferência: sem login nem segredo do cron → 401", async () => {
  const r = resFalsa();
  await conferencia(reqCron("errado"), r, { env: ENV_CONF, fetchFn: supaConferencia(ITENS, { assinatura: "" }) });
  assert.equal(r.statusCode, 401);
});

test("conferência: divergência nova → e-mail para Karen e Eder", async () => {
  const f = supaConferencia(ITENS, { assinatura: "", avisado_em: null });
  const r = resFalsa();
  await conferencia(reqCron(), r, { env: ENV_CONF, fetchFn: f });
  assert.equal(r.corpo.enviado, true);
  assert.deepEqual(f.emails[0].to, ["karen@x.com", "eder@x.com"]);
  assert.match(f.emails[0].html, /Arfix/);
  assert.equal(f.ctrl().assinatura, assinatura(ITENS));
});

test("conferência: mesma lista no dia seguinte não repete; depois de 7 dias lembra", async () => {
  const ontem = new Date(Date.now() - 24 * 3600e3).toISOString();
  const f1 = supaConferencia(ITENS, { assinatura: assinatura(ITENS), avisado_em: ontem });
  const r1 = resFalsa();
  await conferencia(reqCron(), r1, { env: ENV_CONF, fetchFn: f1 });
  assert.equal(r1.corpo.enviado, false);
  assert.equal(f1.emails.length, 0);
  const f2 = supaConferencia(ITENS, { assinatura: assinatura(ITENS), avisado_em: new Date(Date.now() - 8 * 24 * 3600e3).toISOString() });
  const r2 = resFalsa();
  await conferencia(reqCron(), r2, { env: ENV_CONF, fetchFn: f2 });
  assert.equal(r2.corpo.enviado, true);
  assert.equal(r2.corpo.lembrete, true);
});

test("conferência: sem divergência não manda nada; Karen pode só olhar sem enviar", async () => {
  const f = supaConferencia([], { assinatura: "x" });
  const r = resFalsa();
  await conferencia(reqCron(), r, { env: ENV_CONF, fetchFn: f });
  assert.equal(r.corpo.enviado, false);
  assert.equal(f.emails.length, 0);
  const r2 = resFalsa();
  const f2 = supaConferencia(ITENS, { assinatura: "" });
  await conferencia({ method: "GET", query: { enviar: "nao" }, headers: { authorization: `Bearer ${tk("karen", "financeiro")}` } }, r2, { env: ENV_CONF, fetchFn: f2 });
  assert.equal(r2.corpo.itens.length, 1);
  assert.equal(f2.emails.length, 0);
});

// ── Faturamento: gravação em paralelo no Supabase (etapa 3a) ───────────────────────
const ENV_FAT = { ...ENV_PAPEIS, FATURAMENTO_API_URL: "https://fat.example/exec", FATURAMENTO_SECRET: "segredo-fat" };
function fatFalso({ planilha = { ok: true }, bancoFalha = false } = {}) {
  const rpcs = [];
  const fn = async (url, opts = {}) => {
    const R = (o, s = 200) => ({ ok: s < 400, status: s, text: async () => JSON.stringify(o) });
    if (url.startsWith("https://fat.example")) return R(planilha);
    if (url.includes("/rest/v1/rpc/")) { rpcs.push({ fn: url.split("/rpc/")[1], corpo: JSON.parse(opts.body) }); return bancoFalha ? R({ message: "fora" }, 500) : R(null, 204); }
    return R({}, 404);
  };
  fn.rpcs = rpcs;
  return fn;
}

test("faturamento: incluir na planilha grava também no banco, com quem fez", async () => {
  const f = fatFalso();
  const r = resFalsa();
  await faturamento(req({ token: tk("karen", "financeiro"), query: { action: "incluir", id: "hub-radio-x", cliente: "X", valor: "500", s: "injetado" } }), r, { env: ENV_FAT, fetchFn: f });
  assert.equal(r.statusCode, 200);
  assert.equal(f.rpcs[0].fn, "fat_registrar_inclusao");
  assert.equal(f.rpcs[0].corpo.p.id, "hub-radio-x");
  assert.equal(f.rpcs[0].corpo.p.s, undefined, "segredo nunca vai para o banco");
  assert.equal(f.rpcs[0].corpo.p_origem, "hub: karen");
});

test("faturamento: marcar emitido grava no banco; planilha recusando não grava", async () => {
  const f = fatFalso();
  await faturamento(req({ token: tk("eder", "admin"), query: { action: "marcar-emitido", id: "radio-arel", mesRef: "2026-12", nfNumero: "123", paymentId: "pay_1" } }), resFalsa(), { env: ENV_FAT, fetchFn: f });
  assert.deepEqual(f.rpcs[0].corpo, { p_id: "radio-arel", p_mes: "2026-12", p_nf: "123", p_valor_boleto: "", p_payment_id: "pay_1", p_origem: "hub: eder" });
  const f2 = fatFalso({ planilha: { ok: false, erro: "linha não encontrada" } });
  await faturamento(req({ token: tk("eder", "admin"), query: { action: "marcar-emitido", id: "x", mesRef: "2026-12" } }), resFalsa(), { env: ENV_FAT, fetchFn: f2 });
  assert.equal(f2.rpcs.length, 0);
});

test("faturamento: banco fora do ar não atrapalha o hub (planilha segue oficial)", async () => {
  const f = fatFalso({ bancoFalha: true });
  const r = resFalsa();
  await faturamento(req({ token: tk("eder", "admin"), query: { action: "incluir", id: "hub-x" } }), r, { env: ENV_FAT, fetchFn: f });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.corpo, { ok: true });
});
