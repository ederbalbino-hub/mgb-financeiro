// Registro de ações (lib/log.js + hub_log): estado, Asaas, e-mail, Faturamento e Assinafy.
import test from "node:test";
import assert from "node:assert/strict";
import estado from "../api/estado.js";
import asaas from "../api/asaas.js";
import email from "../api/email.js";
import faturamento from "../lib/pontes/faturamento.js";
import { registrarLog, limparAcoes, compararEstados } from "../lib/log.js";
import { assinarToken, hashSenha } from "../lib/auth.js";

const SEGREDO = "seg";
const ENV = {
  HUB_AUTH_SECRET: SEGREDO,
  HUB_USERS: JSON.stringify({
    eder: { nome: "Eder", papel: "admin", senha: hashSenha("x") },
    karen: { nome: "Karen", papel: "financeiro", senha: hashSenha("x") },
  }),
  SUPABASE_URL: "https://ref.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_teste",
  FATURAMENTO_API_URL: "https://fat.example/exec",
  FATURAMENTO_SECRET: "segredo-fat",
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

// Supabase falso com estado + hub_log. logFalha: registrar_log responde 500 (ou lança).
function supabaseFalso(inicial, { logFalha = null } = {}) {
  let linha = inicial;
  const logs = [];
  const chamadas = [];
  const fn = async (url, opts = {}) => {
    chamadas.push({ url, opts });
    const corpo = JSON.parse(opts.body || "{}");
    const resp = (status, texto) => ({ ok: status < 400, status, text: async () => texto, json: async () => JSON.parse(texto) });
    if (url.endsWith("/rpc/carregar_estado")) return resp(200, JSON.stringify([{ dados: linha.dados, versao: linha.versao }]));
    if (url.endsWith("/rpc/salvar_estado")) {
      linha = { dados: corpo.p_dados, versao: linha.versao + 1 };
      return resp(200, JSON.stringify({ ok: true, v: linha.versao }));
    }
    if (url.endsWith("/rpc/registrar_log")) {
      if (logFalha === "lanca") throw new Error("rede caiu");
      if (logFalha) return resp(500, '{"message":"relation hub_log does not exist"}');
      logs.push(corpo);
      return resp(200, "1");
    }
    return resp(404, "{}");
  };
  fn.logs = logs;
  fn.chamadas = chamadas;
  fn.linha = () => linha;
  return fn;
}

test("compararEstados: só seções que mudaram, com ids incluídos/removidos/alterados das listas", () => {
  const antes = { _v: 1, db: { a: 1 }, leads: [{ id: 1, n: "A" }, { id: 2, n: "B" }], fin: { "2026": { x: 1 } }, igual: [1] };
  const depois = { _v: 2, _salvoPor: "Karen", db: { a: 1 }, leads: [{ id: 2, n: "B2" }, { id: 3, n: "C" }], fin: { "2026": { x: 2 } }, igual: [1] };
  const { secoes, detalhe } = compararEstados(antes, depois);
  assert.deepEqual(secoes, ["fin", "leads"]);
  assert.deepEqual(detalhe.leads, { antes: 2, depois: 2, incluidos: ["3"], removidos: ["1"], alterados: ["2"] });
  assert.deepEqual(detalhe.fin, { chaves: ["2026"] });
});

test("limparAcoes: só textos, no máximo 20, 200 caracteres cada", () => {
  const a = limparAcoes(["  Baixa  manual  ", 5, null, "", "x".repeat(300), ...Array(30).fill("y")]);
  assert.equal(a[0], "Baixa manual");
  assert.equal(a[1].length, 200);
  assert.equal(a.length, 20);
  assert.deepEqual(limparAcoes("não é lista"), []);
});

test("estado: salvar registra 1 linha com quem, seções, versão e as ações do navegador; _acoes não entra no estado", async () => {
  const f = supabaseFalso({ dados: JSON.stringify({ anunciantes: [{ id: 1 }, { id: 2 }], db: {} }), versao: 4 });
  const r = resFalsa();
  const corpo = JSON.stringify({ anunciantes: [{ id: 2 }], _v: 5, _acoes: ["Removeu anunciante Clínica Sorriso"] });
  await estado(req({ method: "POST", token: tk("karen", "financeiro"), query: { v: "4" }, body: corpo }), r, { env: ENV, fetchFn: f });
  assert.equal(r.statusCode, 200);
  const gravado = JSON.parse(f.linha().dados);
  assert.equal("_acoes" in gravado, false);
  assert.equal(f.logs.length, 1);
  const l = f.logs[0];
  assert.equal(l.p_origem, "estado");
  assert.equal(l.p_login, "karen");
  assert.equal(l.p_nome, "Karen");
  assert.equal(l.p_papel, "financeiro");
  assert.equal(l.p_versao, 5);
  assert.deepEqual(l.p_secoes, ["anunciantes"]);
  assert.equal(l.p_acao, "Removeu anunciante Clínica Sorriso");
  assert.deepEqual(l.p_detalhe.anunciantes, { antes: 2, depois: 1, removidos: ["1"] });
});

test("estado: sem _acoes o registro tem um resumo automático", async () => {
  const f = supabaseFalso({ dados: JSON.stringify({ leads: [], db: {} }), versao: 1 });
  const r = resFalsa();
  await estado(req({ method: "POST", token: tk("eder", "admin"), query: { v: "1" }, body: JSON.stringify({ leads: [{ id: 9 }], db: { x: 1 } }) }), r, { env: ENV, fetchFn: f });
  assert.equal(r.statusCode, 200);
  assert.equal(f.logs[0].p_acao, "Salvou: db, leads");
});

test("estado: falha do log (500 ou exceção) NÃO derruba o salvar", async () => {
  for (const logFalha of [true, "lanca"]) {
    const f = supabaseFalso({ dados: JSON.stringify({ db: {} }), versao: 2 }, { logFalha });
    const r = resFalsa();
    const erro = console.error;
    console.error = () => {};
    try {
      await estado(req({ method: "POST", token: tk("karen", "financeiro"), query: { v: "2" }, body: JSON.stringify({ db: { y: 1 } }) }), r, { env: ENV, fetchFn: f });
    } finally {
      console.error = erro;
    }
    assert.equal(r.statusCode, 200, String(logFalha));
    assert.deepEqual(r.corpo, { ok: true, v: 3 });
  }
});

test("estado: conflito de versão não registra nada", async () => {
  const f = supabaseFalso({ dados: JSON.stringify({ db: {} }), versao: 7 });
  const r = resFalsa();
  await estado(req({ method: "POST", token: tk("karen", "financeiro"), query: { v: "6" }, body: JSON.stringify({ db: { y: 1 }, _acoes: ["x"] }) }), r, { env: ENV, fetchFn: f });
  assert.equal(r.statusCode, 409);
  assert.equal(f.logs.length, 0);
});

test("registrarLog sem SUPABASE_* configurado não chama nada e não lança", async () => {
  let chamou = false;
  assert.equal(await registrarLog({}, async () => { chamou = true; }, { origem: "x", acao: "y" }), false);
  assert.equal(chamou, false);
});

// Asaas e e-mail usam process.env e o fetch global para falar com o Asaas/Resend: troca os dois no teste.
async function comFetchGlobal(resposta, fn) {
  const fOrig = globalThis.fetch;
  const envOrig = { ...process.env };
  Object.assign(process.env, ENV, { ASAAS_API_KEY: "chave-asaas", RESEND_API_KEY: "chave-resend" });
  globalThis.fetch = async (url, opts = {}) => {
    const { status = 200, json = {}, buf } = resposta(String(url), opts);
    return { ok: status < 400, status, json: async () => json, text: async () => JSON.stringify(json), arrayBuffer: async () => buf || new ArrayBuffer(4) };
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = fOrig;
    for (const k of Object.keys(process.env)) if (!(k in envOrig)) delete process.env[k];
    Object.assign(process.env, envOrig);
  }
}

test("asaas: emitir registra cliente e valor (sem chave nem token no registro)", async () => {
  const logs = [];
  const fLog = async (url, opts) => { logs.push(JSON.parse(opts.body)); return { ok: true, status: 200, text: async () => "1" }; };
  await comFetchGlobal((url, opts) => {
    if (url.includes("/fiscalInfo")) return { json: {} };
    if (url.includes("/customers?cpfCnpj")) return { json: { data: [] } };
    if (url.endsWith("/customers")) return { json: { id: "cus_1" } };
    if (url.includes("/payments?externalReference")) return { json: { data: [] } };
    if (url.endsWith("/payments")) return { json: { id: "pay_1", bankSlipUrl: "https://b" } };
    if (url.includes("/invoices?")) return { json: { data: [] } };
    if (url.endsWith("/invoices")) return { json: { id: "inv_1", status: "SCHEDULED" } };
    return { status: 404, json: {} };
  }, async () => {
    const r = resFalsa();
    await asaas(req({ method: "POST", token: tk("karen", "financeiro"), query: { action: "emitir" }, body: {
      tomador: { nome: "Cliente Exemplo", cnpj: "00000000000191", email: "a@b.com" }, servico: { descricao: "Mídia" }, valores: { total: 1200 }, referencia: "p1-2026-11",
    } }), r, { env: ENV, fetchFn: fLog });
    assert.equal(r.statusCode, 202);
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].p_origem, "asaas");
  assert.equal(logs[0].p_login, "karen");
  assert.match(logs[0].p_acao, /Emitiu nota \+ boleto: Cliente Exemplo · R\$ 1200,00/);
  assert.equal(logs[0].p_detalhe.paymentId, "pay_1");
  assert.equal(JSON.stringify(logs[0]).includes("chave-asaas"), false);
});

test("asaas: consulta de status NÃO registra", async () => {
  const logs = [];
  const fLog = async (url, opts) => { logs.push(opts.body); return { ok: true, status: 200, text: async () => "1" }; };
  await comFetchGlobal(() => ({ json: { status: "PENDING" } }), async () => {
    const r = resFalsa();
    await asaas(req({ token: tk("karen", "financeiro"), query: { action: "status", paymentId: "pay_1" } }), r, { env: ENV, fetchFn: fLog });
    assert.equal(r.statusCode, 200);
  });
  assert.equal(logs.length, 0);
});

test("asaas: cancelar registra o resultado", async () => {
  const logs = [];
  const fLog = async (url, opts) => { logs.push(JSON.parse(opts.body)); return { ok: true, status: 200, text: async () => "1" }; };
  await comFetchGlobal((url) => (url.includes("/payments/pay_1") ? { json: { status: "PENDING" } } : { json: { status: "CANCELED" } }), async () => {
    const r = resFalsa();
    await asaas(req({ method: "POST", token: tk("karen", "financeiro"), query: { action: "cancelar" }, body: { paymentId: "pay_1", invoiceId: "inv_1" } }), r, { env: ENV, fetchFn: fLog });
    assert.equal(r.statusCode, 200);
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].p_acao, "Cancelou no Asaas: nota + boleto");
});

test("email: enviar notas registra para quem e quantas", async () => {
  const logs = [];
  const fLog = async (url, opts) => { logs.push(JSON.parse(opts.body)); return { ok: true, status: 200, text: async () => "1" }; };
  await comFetchGlobal((url) => {
    if (url.includes("/invoices/")) return { json: { pdfUrl: "https://pdf.example/1.pdf", number: "77" } };
    if (url.startsWith("https://pdf.example")) return { json: {} };
    if (url.includes("resend.com")) return { json: { id: "re_1" } };
    return { status: 404, json: {} };
  }, async () => {
    const r = resFalsa();
    await email(req({ method: "POST", token: tk("karen", "financeiro"), query: { action: "enviar-notas" }, body: { para: "loja@exemplo.com", notas: [{ invoiceId: "inv_1" }] } }), r, { env: ENV, fetchFn: fLog });
    assert.equal(r.statusCode, 200);
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].p_origem, "email");
  assert.equal(logs[0].p_acao, "Enviou e-mail com 1 nota(s) para loja@exemplo.com");
  assert.equal(JSON.stringify(logs[0]).includes("chave-resend"), false);
});

test("faturamento: incluir registra; listar não", async () => {
  const logs = [];
  const f = async (url, opts = {}) => {
    if (String(url).endsWith("/rpc/registrar_log")) { logs.push(JSON.parse(opts.body)); return { ok: true, status: 200, text: async () => "1" }; }
    if (String(url).includes("/rest/v1/")) return { ok: true, status: 200, text: async () => "[]", json: async () => [] };
    return { ok: true, status: 200, text: async () => '{"ok":true,"rows":[]}' };
  };
  const r1 = resFalsa();
  await faturamento(req({ token: tk("karen", "financeiro"), query: { action: "listar" } }), r1, { env: ENV, fetchFn: f });
  assert.equal(logs.length, 0);
  const r2 = resFalsa();
  await faturamento(req({ token: tk("karen", "financeiro"), query: { action: "incluir", id: "hub-x", cliente: "Loja X" } }), r2, { env: ENV, fetchFn: f });
  assert.equal(r2.statusCode, 200);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].p_acao, "Incluiu no Faturamento: Loja X");
});
