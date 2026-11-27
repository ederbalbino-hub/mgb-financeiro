// Regras dos fluxos entre telas (fluxos.js e funil.js, na raiz do repositório).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const X = require("../../fluxos.js");
const F = require("../../funil.js");
const I = require("../../inicio.js");
const N = require("../../novo.js");

test("apagar a linha 1: as marcações de pago das linhas de baixo sobem junto", () => {
  const P = { 0: { "2026-10": { pago: true } }, 1: { "2026-10": { pago: false } }, 2: { "2026-10": { pago: true, obs: "pix" } }, _x: 1 };
  assert.deepEqual(X.reindexarPagamentos(P, 1), { 0: { "2026-10": { pago: true } }, 1: { "2026-10": { pago: true, obs: "pix" } }, _x: 1 });
  assert.deepEqual(X.reindexarPagamentos(P, 5), P);
  assert.deepEqual(X.reindexarPagamentos({}, 0), {});
  assert.equal(X.reindexarPagamentos(undefined, 0), undefined);
});

test("cadastro do lead: condomínio está na Tela Vertical, rádio pode estar no Mercadão", () => {
  const info = {
    elev: { "Ed. Aurora": { assinafyDocId: "d1" } },
    mercadao: { "Loja do Zé": { assinadoEm: "2026-11-20T10:00:00Z" } },
    radio: { "Loja do Zé": { cnpj: "1" } },
    _rascunhos: { "Loja do Zé": { lixo: true } },
  };
  assert.equal(F.cadastroDoLead({ produto: "condo", itemCriado: "Ed. Aurora" }, info).assinafyDocId, "d1");
  assert.equal(F.cadastroDoLead({ produto: "radio", itemCriado: "Loja do Zé" }, info).assinadoEm, "2026-11-20T10:00:00Z");
  assert.equal(F.cadastroDoLead({ produto: "radio", itemCriado: "None", nome: "Loja do Zé" }, info).assinadoEm, "2026-11-20T10:00:00Z");
  assert.equal(F.cadastroDoLead({ produto: "vaapty", nome: "Ninguém" }, info), null);
});

test('"None" é lead sem cadastro em todas as telas (funil, Início, Novo cliente)', () => {
  const leads = [{ estagio: "fechado", itemCriado: "None" }, { estagio: "fechado", itemCriado: "X" }, { estagio: "fechado" }];
  assert.equal(F.situacaoLead(leads[0]).txt, "esperando cadastro");
  assert.equal(I.contarFunil(leads).semCadastro, 2);
  assert.equal(N.leadsPendentes(leads).length, 2);
});

const C = require("../../clientes.js");

test("Asaas: boleto de outubro pago em novembro sai de vencido na ficha e no Início", () => {
  const recPag = { vaapty: { "Padaria": { _default: { fatId: "f9" }, "2026-9": { pago: false, fonte: "asaas", asaas: { st: "vencido" } }, "2026-8": { pago: true, fonte: "manual", asaas: { st: "vencido" } } } } };
  const emissoes = { "f9|2026-10": { pg: "vencido" }, "f9|2026-09": { pg: "pago" } };
  const refs = { "f9-2026-10": { payment: { status: "RECEIVED" } }, "f9-2026-09": { payment: { status: "OVERDUE" } } };
  const map = (s) => (s === "RECEIVED" ? "pago" : s === "OVERDUE" ? "vencido" : "pendente");
  const n = X.atualizarMesesAnteriores(recPag, emissoes, refs, map, "2026-11-27T10:00:00Z");
  assert.equal(n, 3);
  assert.equal(recPag.vaapty.Padaria["2026-9"].pago, true);
  assert.equal(recPag.vaapty.Padaria["2026-9"].asaas.st, "pago");
  assert.equal(recPag.vaapty.Padaria["2026-8"].pago, true, "baixa manual continua valendo");
  assert.equal(emissoes["f9|2026-10"].pg, "pago");
  assert.equal(X.atualizarMesesAnteriores(recPag, emissoes, refs, map), 0, "segunda vez não muda nada");
});

test("link do e-mail: ?cadastrar=<id>", () => {
  assert.equal(X.leadDoEndereco("?cadastrar=42"), 42);
  assert.equal(X.leadDoEndereco("?x=1&cadastrar=7"), 7);
  assert.equal(X.leadDoEndereco(""), null);
});

test("Início: vencidos dos 3 meses anteriores, sem baixa manual nem cancelados", () => {
  const e = {
    "a|2026-10": { cliente: "A", pg: "vencido" }, "b|2026-08": { cliente: "B", pg: "vencido" }, "c|2026-07": { cliente: "C", pg: "vencido" },
    "d|2026-10": { cliente: "D", pg: "vencido", pgManual: true }, "e|2026-11": { cliente: "E", pg: "vencido" }, "f|2026-10": { cliente: "F", pg: "pago" },
  };
  assert.deepEqual(I.vencidosAnteriores(e, "2026-11").map((x) => x.cliente), ["B", "A"]);
});

test("Início: contratos e aditivos aguardando assinatura, com dias desde o envio", () => {
  const info = {
    vaapty: { A: { assinafyDocId: "1", assinafyEnviadoEm: "2026-11-20T12:00:00Z" }, B: { assinafyDocId: "2", assinadoEm: "x" } },
    elev: { C: { assinafyDocId: "3", assinadoEm: "x", aditivo: { docId: "9", enviadoEm: "2026-11-26T12:00:00Z" } } },
    _rascunhos: { D: { assinafyDocId: "4" } },
  };
  const r = I.aguardandoAssinatura(info, new Date("2026-11-27T12:00:00Z"));
  assert.deepEqual(r.map((x) => [x.nome, x.tipo, x.dias]), [["A", "contrato", 7], ["C", "aditivo", 1]]);
});

test("fim do contrato: conta da assinatura; sem assinatura, do mês em que começa a pagar", () => {
  assert.deepEqual(C.fimContrato({ meses: 12, assinadoEm: "2026-11-20T15:00:00", inicio: "2026-12" }), { data: "2027-11-19", ref: 2027 * 12 + 10, de: "assinatura" });
  assert.equal(C.fimContrato({ meses: 12, inicio: "2026-12" }).data, "2027-11-30");
  assert.equal(C.fimContrato({ meses: 120, inicio: "2026-12" }), null);
  assert.equal(C.fimContrato({ meses: 6 }), null);
  assert.equal(C.diasAte("2026-12-01", new Date(2026, 10, 27)), 4);
});

test("ficha: mês com boleto emitido e nota sem número aparece marcado", () => {
  const L = C.montarClientes({
    modulos: [{ id: "vaapty", items: ["Padaria"] }],
    rec: { vaapty: { Padaria: { valor: 400, inicio: "2026-09", meses: 12 } } },
    recPagamentos: { vaapty: { Padaria: { _default: { fatId: "f9" }, "2026-10": { asaas: { st: "pendente" } } } } },
    fatEmissoes: { "f9|2026-11": { modo: "ambos", paymentId: "p1", nf: "" } },
  }, 2026, 10);
  assert.equal(L[0].contratos[0].historico[0].semNota, true);
});
