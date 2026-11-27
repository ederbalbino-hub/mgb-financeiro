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

const L = require("../../lancar.js");
const FI = require("../../financeiro.js");

test("despesa da Tela Vertical paga do bolso do sócio vai só para a conta dele", () => {
  const base = { destino: "elev", item: "Spot", categoria: "combustivel", descricao: "Gasolina instalação", fornecedor: "Posto X", valor: "120,50", data: "2026-11-20", forma: "avista" };
  assert.equal(L.pagaPeloSocio({ ...base, quemPagou: "jadson" }), true);
  assert.equal(L.pagaPeloSocio({ ...base, quemPagou: "eder" }), true);
  assert.equal(L.pagaPeloSocio({ ...base, quemPagou: "mgb" }), false);
  assert.equal(L.pagaPeloSocio({ ...base, destino: "vaapty", quemPagou: "eder" }), false, "fora da Tela Vertical, Eder continua sendo reembolso");
  const x = L.lancamentoSocio({ ...base, quemPagou: "jadson", lancadoPor: "Karen" }, 7);
  assert.equal(x.id, 7); assert.equal(x.item, "Spot"); assert.equal(x.valor, 120.5); assert.equal(x.pagoPor, "jadson");
  assert.equal(x.tipo, "despesa"); assert.equal(x.data, "2026-11-20"); assert.equal(x.descricao, "Gasolina instalação · Posto X");
  assert.deepEqual(L.validarDespesa({ ...base, quemPagou: "jadson" }), []);
  assert.ok(L.validarDespesa({ ...base, quemPagou: "jadson", destino: "vaapty", item: "A" }).some((e) => /Jadson/.test(e)));
  assert.ok(L.validarDespesa({ ...base, quemPagou: "eder", forma: "mensal", meses: 3 }).some((e) => /à vista/.test(e)));
});

test("Contas do mês: vencida, vence hoje, vence em poucos dias", () => {
  const hoje = new Date(2026, 10, 27);
  assert.equal(FI.situacaoVenc(20, 2026, 10, hoje).txt, "vencida");
  assert.equal(FI.situacaoVenc(27, 2026, 10, hoje).txt, "vence hoje");
  assert.equal(FI.situacaoVenc(28, 2026, 10, hoje).txt, "vence amanhã");
  assert.equal(FI.situacaoVenc(30, 2026, 10, hoje).txt, "vence em 3 dias");
  assert.equal(FI.situacaoVenc(10, 2026, 11, hoje), null, "dezembro ainda longe");
  assert.equal(FI.situacaoVenc(5, 2026, 9, hoje).txt, "vencida", "outubro não paga");
  assert.equal(FI.situacaoVenc(null, 2026, 10, hoje), null);
  assert.equal(FI.situacaoVenc(31, 2027, 1, new Date(2027, 1, 28)).txt, "vence hoje", "31 em fevereiro = último dia");
});

test("renomear condomínio leva anunciantes, pagos, cadastro, cobranças e lead", () => {
  const e = {
    anunciantes: [{ nome: "Oficina", telas: ["Spot", "Tay"] }], despesasComp: [{ telas: ["Spot"] }], elevInvestimentos: [{ item: "Spot" }, { item: "Tay" }],
    despPagamentos: { elev: { Spot: { 0: { "2026-10": { pago: true } } } } }, clientesInfo: { elev: { Spot: { cnpj: "1" } } },
    recPagamentos: { elev: {} }, pagamentos: { elev: { Spot: {} } }, leads: [{ produto: "condo", itemCriado: "Spot" }, { produto: "vaapty", itemCriado: "Spot" }],
  };
  const n = X.renomearNoEstado(e, "elev", "Spot", "Ed. Spot");
  assert.ok(n >= 7);
  assert.deepEqual(e.anunciantes[0].telas, ["Ed. Spot", "Tay"]);
  assert.deepEqual(e.despesasComp[0].telas, ["Ed. Spot"]);
  assert.equal(e.elevInvestimentos[0].item, "Ed. Spot");
  assert.ok(e.despPagamentos.elev["Ed. Spot"] && !e.despPagamentos.elev.Spot);
  assert.equal(e.clientesInfo.elev["Ed. Spot"].cnpj, "1");
  assert.equal(e.leads[0].itemCriado, "Ed. Spot");
  assert.equal(e.leads[1].itemCriado, "Spot", "lead de outro módulo não muda");
  assert.equal(X.renomearNoEstado(e, "elev", "A", "A"), 0);
});

test("repasse da Tela Vertical: 50% da sobra para cada sócio; sem sobra, sem repasse", () => {
  assert.deepEqual(X.repasseSocios(1000.01), { sobra: 1000.01, eder: 500.01, jadson: 500.01 });
  assert.deepEqual(X.repasseSocios(-200), { sobra: 0, eder: 0, jadson: 0 });
});

test("cartão do anunciante: situação do pagamento no mês", () => {
  assert.equal(X.situacaoAnunciante({ pago: true }).txt, "Pago");
  assert.equal(X.situacaoAnunciante({ asaas: { st: "vencido" } }).txt, "Boleto vencido");
  assert.equal(X.situacaoAnunciante({ asaas: { st: "pendente" } }).txt, "Boleto em aberto");
  assert.equal(X.situacaoAnunciante(undefined).txt, "A emitir");
});

test("aditivo: novo período começa no dia seguinte ao fim e dura os meses pedidos", () => {
  assert.deepEqual(X.periodoAditivo("2027-11-19", 12), { de: "2027-11-20", ate: "2028-11-19", meses: 12 });
  assert.deepEqual(X.periodoAditivo("2026-12-31", 6), { de: "2027-01-01", ate: "2027-06-30", meses: 6 });
  assert.equal(X.periodoAditivo("", 6), null);
  assert.equal(X.fimDoMes(2026 * 12 + 1), "2026-02-28");
});

test("aditivo: documento com partes, prazo, mesmo valor e escape do nome", () => {
  const h = X.documentoAditivo({ nome: "Loja <Teste>", razao: "Loja Teste Ltda", cnpj: "11.222.333/0001-81", produto: "Rádio Interna", meses: 12, de: "2027-11-20", ate: "2028-11-19", valor: 450, assinadoEm: "2026-11-20T10:00:00Z" });
  assert.match(h, /Termo Aditivo de Prorrogação/);
  assert.match(h, /23\.770\.170\/0001-50/);
  assert.match(h, /Loja Teste Ltda · CNPJ 11\.222\.333\/0001-81/);
  assert.match(h, /mais <b>12 meses<\/b>, de <b>20\/11\/2027<\/b> a <b>19\/11\/2028<\/b>/);
  assert.match(h, /R\$ 450,00/);
  assert.match(h, /assinado em 20\/11\/2026/);
  assert.match(h, /Loja &lt;Teste&gt;/);
});
