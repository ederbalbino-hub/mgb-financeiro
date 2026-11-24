// Resumo diário por e-mail (lib/resumo.js e lib/pontes/resumo.js). Só dados de mentira.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as R from "../lib/resumo.js";
import resumoHandler, { enviarResumos, rotina } from "../lib/pontes/resumo.js";

const require = createRequire(import.meta.url);
const F = require("../../financeiro.js");
const A = require("../../acesso.js");
const I = require("../../inicio.js");

// Terça, 24/11/2026, 8h07 em Brasília (11h07 UTC).
const AGORA = Date.parse("2026-11-24T11:07:00Z");
const H = R.hojeBrasilia(AGORA);

function estadoTeste() {
  return {
    moduleItems: { mb: ["Benjamin"], vaapty: ["Franqueado Piloto"], radio: ["Leo Cosméticos"] },
    db: {
      mb: {
        Benjamin: [
          { t: "Recorrente", dataInicio: "2026-01", mesesRec: 24, q: 1, u: 300, f: "4Yousee", d: "Licença" },
          { t: "Parcelado", dataInicio: "2026-10", nparc: 3, q: 1, u: 900, f: "Loja de TV", d: "TV 55" },
          { t: "À vista", venc: "2026-09", q: 1, u: 50, f: "Velha", d: "fora do mês" },
        ],
      },
    },
    rec: {
      mb: { Benjamin: { valor: 1000, inicio: "2025-12", meses: 12 } }, // termina 11/2026
      vaapty: { "Franqueado Piloto": { valor: 2000, inicio: "2026-01", meses: 120 } },
      radio: { "Leo Cosméticos": { valor: 500, inicio: "2026-01", meses: 12 } }, // termina 12/2026
    },
    anunciantes: [{ id: 1, nome: "Padaria", valor: 200, inicio: "2026-06", meses: 6 }], // termina 11/2026
    despPagamentos: {
      _contas: { "4yousee": { dia: 10 }, "loja de tv": { dia: 25 }, "va vaapty gestao de franquias": { dia: 26 }, aluguel: { dia: 28 } },
      _empresa: { Empresa: { _prolabore: { "2026-9": { pago: true } } } }, // outubro pago; novembro não
    },
    empresaDespesas: [{ id: 7, nome: "Aluguel", valor: 1500, ativo: true, inicio: "2026-01" }],
    notaConfig: { vaapty: { pct: 15, enviado: {} }, mercadao: { enviado: { "2026-11": "26/11/2026" } } },
    clientesInfo: { _renovacoes: { "Elevadores|Padaria|24322": { s: "eder" } } },
    leads: [
      { id: 1, nome: "Lead atrasado", estagio: "contatado", lembrete: "2026-11-20" },
      { id: 2, nome: "Lead hoje à tarde", estagio: "novo", lembrete: "2026-11-24T15:00" },
      { id: 3, nome: "Lead amanhã", estagio: "novo", lembrete: "2026-11-25" },
      { id: 4, nome: "Lead perdido", estagio: "perdido", lembrete: "2026-11-01" },
      { id: 5, nome: "Fechou", estagio: "fechado" },
      { id: 6, nome: "Já cadastrado", estagio: "fechado", itemCriado: true },
    ],
    fatEmissoes: {
      "hub-mb-benjamin|2026-11": { cliente: "Benjamin", pg: "vencido", paymentId: "p1", boleto: 1000, modo: "ambos", nf: "12" },
      "radio-leo|2026-10": { cliente: "Leo", pg: "pendente", paymentId: "p2", boleto: 500, modo: "boleto" },
      "tv-x|2026-11": { cliente: "TV X", pg: "vencido", paymentId: "p3", pgManual: true },
      "tv-y|2026-11": { cliente: "TV Y", modo: "ambos", paymentId: "p4" },
      "tv-z|2026-12": { cliente: "Futuro", pg: "vencido", paymentId: "p5" },
    },
  };
}
const BANCO = [
  { cliente_id: "radio-leo", competencia: "2026-10", payment_id: "p2", pagamento_status: "vencido", cliente_nome: "Leo" },
  { cliente_id: "hub-mb-benjamin", competencia: "2026-11", payment_id: "p1", pagamento_status: "pago" },
];

test("hoje em Brasília: 23h UTC ainda é o mesmo dia lá, 2h UTC é o dia anterior", () => {
  assert.equal(H.iso, "2026-11-24");
  assert.equal(H.semana, 2);
  assert.equal(R.hojeBrasilia(Date.parse("2026-11-25T02:00:00Z")).iso, "2026-11-24");
  assert.equal(R.diaUtil(R.hojeBrasilia(Date.parse("2026-11-28T12:00:00Z"))), false); // sábado
});

test("chave da conta igual à do financeiro.js", () => {
  for (const d of [{ r: { f: "Receita Federal" } }, { r: { f: "—", d: "Aluguel" } }, { item: "Benjamin", r: {} }, { r: { f: " Ação Ltda " } }]) {
    assert.equal(R.chaveConta(d), F.chaveConta(d));
  }
});

test("contas: vencidas, de hoje e dos próximos 3 dias; pagas e sem dia ficam fora", () => {
  const c = R.contasAVencer(estadoTeste(), H);
  assert.deepEqual(c.map((x) => [x.titulo, x.dia, x.situacao]), [
    ["4Yousee (telas)", 10, "atrasada"],
    ["Imposto Simples", 20, "atrasada"],
    ["Pró-labore do Eder", 21, "atrasada"],
    ["Loja de TV", 25, "em breve"],
    ["Repasse Vaapty", 26, "em breve"],
  ]);
  assert.equal(c[3].valor, 300); // parcela 2/3 de 900
  assert.equal(c[1].valor, null); // imposto: valor só o hub calcula
  assert.equal(c[4].valor, 300); // 15% de 2000
});

test("contas: marcada como paga em Contas do mês some do resumo", () => {
  const e = estadoTeste();
  e.despPagamentos.mb = { Benjamin: { 0: { "2026-10": { pago: true } } } }; // novembro = 2026-10 (mês de 0 a 11)
  e.despPagamentos._empresa.Empresa._imposto = { "2026-10": { pago: true } };
  const t = R.contasAVencer(e, H).map((x) => x.titulo);
  assert.ok(!t.includes("4Yousee (telas)"));
  assert.ok(!t.includes("Imposto Simples"));
});

test("boletos vencidos: junta estado e banco; pago em qualquer lado, baixa manual e mês futuro ficam fora", () => {
  const b = R.boletosVencidos(estadoTeste().fatEmissoes, BANCO, H);
  assert.deepEqual(b, [{ cliente: "Leo", comp: "2026-10", valor: 500 }]);
});

test("notas sem número: mesma regra do Início", () => {
  const e = estadoTeste();
  assert.deepEqual(R.notasSemNumero(e.fatEmissoes, H), I.resumoFaturamento(e.fatEmissoes, "2026-11").semNota);
});

test("contratos: mesma lista do acesso.js para a Karen e para o Eder", () => {
  const e = estadoTeste();
  const lista = R.contratosLista(e);
  for (const eder of [false, true]) {
    const esperado = A.contratosParaRenovar(lista, H.ref, e.clientesInfo._renovacoes, eder).map((c) => c.nome);
    assert.deepEqual(R.contratosParaRenovar(e, H, eder).map((c) => c.nome), esperado);
  }
  assert.deepEqual(R.contratosParaRenovar(e, H, false).map((c) => c.nome), ["Benjamin", "Leo Cosméticos"]);
  assert.deepEqual(R.contratosParaRenovar(e, H, true).map((c) => [c.nome, c.encaminhado]), [["Benjamin", false], ["Padaria", true], ["Leo Cosméticos", false]]);
});

test("funil: hoje e atrasados, sem fechados/perdidos nem os de amanhã", () => {
  const f = R.retornosDoFunil(estadoTeste().leads, H);
  assert.deepEqual(f.map((x) => [x.nome, x.atrasado]), [["Lead atrasado", true], ["Lead hoje à tarde", false]]);
  assert.equal(f[1].quando, "24/11/2026 às 15:00");
  assert.deepEqual(R.fechadosSemCadastro(estadoTeste().leads), ["Fechou"]);
});

test("repasses: só do dia 25 ao 10 e enquanto não marcado como enviado", () => {
  const e = estadoTeste();
  assert.deepEqual(R.repassesPendentes(e, H), []); // dia 24
  const d26 = R.hojeBrasilia(Date.parse("2026-11-26T12:00:00Z"));
  assert.deepEqual(R.repassesPendentes(e, d26).map((x) => x.nome), ["Vaapty"]); // Mercadão já enviado
  const d03 = R.hojeBrasilia(Date.parse("2026-12-03T12:00:00Z"));
  assert.deepEqual(R.repassesPendentes(e, d03).map((x) => x.mes), ["novembro/2026"]);
});

test("Karen não recebe o funil; o Eder recebe", () => {
  const e = estadoTeste();
  assert.ok(!R.montarResumo(e, BANCO, H, "financeiro").some((s) => s.id === "funil"));
  assert.ok(R.montarResumo(e, BANCO, H, "admin").some((s) => s.id === "funil"));
  assert.deepEqual(R.montarResumo({}, [], H, "financeiro").filter((s) => s.id !== "contas"), []);
});

test("e-mail: assunto com a contagem e nomes escapados", () => {
  const e = estadoTeste();
  e.leads.push({ id: 9, nome: "<script>", estagio: "fechado" });
  const s = R.montarResumo(e, BANCO, H, "financeiro");
  const m = R.montarEmailResumo(s, H, "Karen");
  assert.match(m.assunto, /^Hub MGB · 24 de novembro: \d+ assuntos para hoje$/);
  assert.ok(m.html.includes("&lt;script&gt;") && !m.html.includes("<script>"));
  assert.match(m.texto, /Boletos vencidos para cobrar \(1\)\n- Leo: 10\/26 · R\$ 500,00/);
});

// ── Envio (fetch de mentira) ─────────────────────────────────────────────
function fetchFalso(estado, enviados) {
  return async (url, op = {}) => {
    const u = String(url);
    const ok = (corpo) => ({ ok: true, status: 200, text: async () => JSON.stringify(corpo), json: async () => corpo });
    if (u.includes("/rpc/carregar_estado")) return ok([{ dados: JSON.stringify(estado), versao: 5 }]);
    if (u.includes("/rest/v1/fat_emissoes")) return ok(BANCO);
    if (u.includes("/rest/v1/fat_conferencia_avisos")) return ok([{ id: 1, assinatura: "" }]);
    if (u.includes("/rest/v1/fat_conferencia")) return ok([]);
    if (u.includes("api.resend.com")) { enviados.push(JSON.parse(op.body)); return ok({ id: "x" }); }
    throw new Error("URL inesperada: " + u);
  };
}
const ENV = { SUPABASE_URL: "https://exemplo.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_teste", RESEND_API_KEY: "re_teste", RESEND_FROM: "hub@exemplo.com", RESUMO_PARA_FINANCEIRO: "karen@exemplo.com", RESUMO_PARA_ADMIN: "eder@exemplo.com", CRON_SECRET: "segredo" };

test("envio: um e-mail para cada pessoa em dia útil", async () => {
  const enviados = [];
  const r = await enviarResumos({ env: ENV, fetchFn: fetchFalso(estadoTeste(), enviados), agora: AGORA });
  assert.deepEqual(r.resultado.map((x) => [x.quem, x.enviado]), [["Karen", true], ["Eder", true]]);
  assert.deepEqual(enviados.map((e) => e.to), [["karen@exemplo.com"], ["eder@exemplo.com"]]);
  assert.ok(!enviados[0].text.includes("Retornos do funil") && enviados[1].text.includes("Retornos do funil"));
});

test("envio: fim de semana não manda; sem destinatário configurado não manda", async () => {
  const enviados = [];
  const sab = await enviarResumos({ env: ENV, fetchFn: fetchFalso(estadoTeste(), enviados), agora: Date.parse("2026-11-28T11:07:00Z") });
  assert.equal(sab.motivo, "fim de semana");
  const r = await enviarResumos({ env: { ...ENV, RESUMO_PARA_ADMIN: "" }, fetchFn: fetchFalso(estadoTeste(), enviados), agora: AGORA });
  assert.equal(r.resultado[1].enviado, false);
  assert.equal(enviados.length, 1);
});

function resFalso() {
  return { codigo: 0, corpo: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.codigo = c; return this; }, json(o) { this.corpo = o; return this; }, send(t) { this.corpo = t; return this; }, end() { return this; } };
}

test("rotina: só o Vercel Cron chama; roda conferência e resumo", async () => {
  const enviados = [];
  const negado = resFalso();
  await rotina({ headers: { authorization: "Bearer errado" }, query: {} }, negado, { env: ENV, fetchFn: fetchFalso(estadoTeste(), enviados), agora: AGORA });
  assert.equal(negado.codigo, 401);
  const res = resFalso();
  await rotina({ method: "GET", headers: { authorization: "Bearer segredo" }, query: {} }, res, { env: ENV, fetchFn: fetchFalso(estadoTeste(), enviados), agora: AGORA });
  assert.equal(res.codigo, 200);
  assert.equal(res.corpo.conferencia.motivo, "sem divergências");
  assert.equal(enviados.length, 2);
});

test("prévia: sem login não mostra nada", async () => {
  const res = resFalso();
  await resumoHandler({ method: "GET", headers: {}, query: { ver: "karen" } }, res, { env: ENV, fetchFn: fetchFalso(estadoTeste(), []), agora: AGORA });
  assert.equal(res.codigo, 401);
});
