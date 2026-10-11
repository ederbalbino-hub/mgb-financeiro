// Regras do botão "Novo" (novo.js, na raiz do repositório).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const N = require("../../novo.js");
const A = require("../../acesso.js");

test("custo do condomínio: R$ 70 por torre", () => {
  assert.equal(N.custoCondominio(1), 70);
  assert.equal(N.custoCondominio(2), 140);
  assert.equal(N.custoCondominio("3"), 210);
  assert.equal(N.custoCondominio(0), 0);
  assert.equal(N.custoCondominio(""), 0);
});

test("despesa da licença sai no formato recorrente do hub", () => {
  const d = N.despesaLicenca(2, "2026-11-01", "36");
  assert.equal(d.t, "Recorrente");
  assert.equal(d.q * d.u, 140);
  assert.equal(d.mesesRec, 36);
  assert.equal(d.dataInicio, "2026-11");
  assert.equal(d.pago, false);
});

test("só leads fechados e ainda não cadastrados aparecem no Novo", () => {
  const leads = [
    { id: 1, estagio: "fechado", itemCriado: null },
    { id: 2, estagio: "fechado", itemCriado: "Cond. X" },
    { id: 3, estagio: "negociando" },
    { id: 4, estagio: "perdido" },
  ];
  assert.deepEqual(N.leadsPendentes(leads).map((l) => l.id), [1]);
  assert.deepEqual(N.leadsPendentes(undefined), []);
});

test("não deixa criar condomínio repetido (ignora acento, caixa e espaços)", () => {
  const existentes = ["Lagoa Dourada", "Residencial Málaga"];
  assert.ok(N.jaExiste("lagoa  dourada", existentes));
  assert.ok(N.jaExiste("Residencial Malaga", existentes));
  assert.ok(!N.jaExiste("Lagoa Azul", existentes));
});

test("validação do formulário de condomínio", () => {
  const ok = { nome: "Cond. Novo", torres: "2", inicio: "2026-11-01", email: "s@x.com" };
  assert.deepEqual(N.validarCondominio(ok, []), []);
  assert.equal(N.validarCondominio({ ...ok, nome: "" }, []).length, 1);
  assert.equal(N.validarCondominio({ ...ok, torres: "0" }, []).length, 1);
  assert.equal(N.validarCondominio({ ...ok, inicio: "" }, []).length, 1);
  assert.equal(N.validarCondominio({ ...ok, email: "sem-arroba" }, []).length, 1);
  assert.equal(N.validarCondominio(ok, ["cond. novo"]).length, 1, "nome repetido");
  assert.deepEqual(N.validarCondominio({ ...ok, email: "" }, []), [], "e-mail é opcional (contrato sai depois)");
});

test("botão Novo: Eder e Karen veem; Guina e Cleiton não", () => {
  assert.ok(A.temExtra("admin-geral", "novo"));
  assert.ok(A.temExtra("admin-meudia", "novo"));
  assert.ok(A.temExtra("financeiro", "novo"));
  assert.ok(!A.temExtra("bureau", "novo"));
  assert.ok(!A.temExtra("programacao", "novo"));
});

// ── Rádio interna ──────────────────────────────────────────────────────
test("rádio interna: custo fixo de R$ 70 e sobra calculada", () => {
  assert.equal(N.CUSTO_RADIO, 70);
  assert.equal(N.sobraRadio(250), 180);
  assert.equal(N.sobraRadio("199,90"), 129.9);
  assert.equal(N.sobraRadio(50), -20);
});

test("rádio interna: custo sai no formato recorrente do hub", () => {
  const d = N.despesaRadio("2026-11-01", "24");
  assert.equal(d.t, "Recorrente");
  assert.equal(d.q * d.u, 70);
  assert.equal(d.mesesRec, 24);
  assert.equal(d.dataInicio, "2026-11");
});

test("rádio interna: validação de nome, duplicidade, valor e e-mail", () => {
  const ok = { nome: "Ótica Visão · Centro", valor: "250", inicio: "2026-11-01", email: "a@b.com" };
  assert.deepEqual(N.validarRadio(ok, ["Mercadão Prochet"]), []);
  assert.match(N.validarRadio({ ...ok, nome: "mercadao prochet" }, ["Mercadão Prochet"]).join(), /Já existe/);
  assert.match(N.validarRadio({ ...ok, valor: "" }, []).join(), /valor mensal/);
  assert.match(N.validarRadio({ ...ok, inicio: "" }, []).join(), /início/);
  assert.match(N.validarRadio({ ...ok, email: "a@b" }, []).join(), /e-mail/);
});

test("datas do contrato sem erro de fuso e virando o ano", () => {
  assert.equal(N.dataMais("2026-11-01", 0), "01/11/2026");
  assert.equal(N.dataMais("2026-11-01", 12), "01/11/2027");
  assert.equal(N.dataMais("2026-12-15", 6), "15/06/2027");
  assert.equal(N.dataMais("", 12), "");
});

test("contrato padrão de rádio interna traz partes, valor, vigência e nota", () => {
  const html = N.contratoRadioInterna(
    { nome: "Ótica Visão · Centro", razao: "Visão Ótica Ltda", cnpj: "12.345.678/0001-90", valor: "250", inicio: "2026-11-01", meses: "12", nf: "nota", responsavel: "Ana" },
    { extenso: () => "Duzentos e cinquenta reais", hoje: "10 de outubro de 2026", numero: "MGB-RAD-1" }
  );
  assert.match(html, /CONTRATO DE PRESTAÇÃO DE SERVIÇOS/);
  assert.match(html, /Visão Ótica Ltda/);
  assert.match(html, /R\$ 250,00 \(Duzentos e cinquenta reais\)/);
  assert.match(html, /12 \(doze\) meses/);
  assert.match(html, /01\/11\/2026 a 01\/11\/2027/);
  assert.match(html, /nota fiscal de serviço/);
  assert.match(html, /IPCA\/IBGE[^<]*negativa ou igual a zero[^<]*IGP-M\/FGV/);
  assert.doesNotMatch(html, /torre/i);
  const semNota = N.contratoRadioInterna({ nome: "X", valor: 100, inicio: "2026-11-01", meses: 6, nf: "boleto" });
  assert.doesNotMatch(semNota, /nota fiscal/);
  const xss = N.contratoRadioInterna({ nome: "<script>x</script>", valor: 1, inicio: "2026-11-01" });
  assert.doesNotMatch(xss, /<script>/);
});

// ── Anunciante da Rádio Mercadão ──────────────────────────────────────
test("Mercadão: conta com cotas, valor por cota e repasse", () => {
  assert.deepEqual(N.contaMercadao(1, 100, 20), { total: 100, repasse: 20, mgb: 80 });
  assert.deepEqual(N.contaMercadao(2, "120,00", 20), { total: 240, repasse: 48, mgb: 192 });
  assert.deepEqual(N.contaMercadao(0, 100, 20), { total: 0, repasse: 0, mgb: 0 });
});

test("Mercadão: ocupação dos Blocos (8 × 3) e nomes sem repetir", () => {
  const g = { b1s1_nome: "Loja A", b1s2_nome: "loja a", b2s1_nome: "Loja B", b3s3_nome: "  ", b9s1_nome: "Fora da grade" };
  const o = N.ocupacaoBlocos(g);
  assert.equal(o.total, 24);
  assert.equal(o.ocupadas, 3);
  assert.equal(o.vagas, 21);
  assert.deepEqual(o.nomes, ["Loja A", "Loja B"]);
  assert.equal(N.ocupacaoBlocos(null).vagas, 24);
});

test("Mercadão: validação de loja repetida, cotas livres e valor", () => {
  const ok = { nome: "Açougue Bom Corte", cotas: "2", valorCota: "100", inicio: "2026-11-01" };
  assert.deepEqual(N.validarMercadao(ok, ["Loja A"], 5), []);
  assert.match(N.validarMercadao({ ...ok, nome: "acougue bom corte" }, ["Açougue Bom Corte"], 5).join(), /já está nos Blocos/);
  assert.match(N.validarMercadao({ ...ok, cotas: "3" }, [], 2).join(), /Só há 2 cotas livres/);
  assert.match(N.validarMercadao({ ...ok, cotas: "1" }, [], 0).join(), /Só há 0 cotas livres/);
  assert.match(N.validarMercadao({ ...ok, valorCota: "" }, [], 5).join(), /valor por cota/);
});

test("contrato Mercadão: cotas, inserções, valor, vigência e pagamento", () => {
  const base = { nome: "Açougue Bom Corte", cnpj: "1", cotas: "2", valorCota: "100", inicio: "2026-11-01", meses: "6" };
  const mensal = N.contratoMercadao({ ...base, pagamento: "mensal" }, { extenso: () => "Duzentos reais" });
  assert.match(mensal, /Mercadão da Prochet/);
  assert.match(mensal, /2 cotas, 30 inserções por dia/);
  assert.match(mensal, /R\$ 200,00 \(Duzentos reais\)/);
  assert.match(mensal, /01\/11\/2026 a 01\/05\/2027/);
  assert.match(mensal, /dia 5/);
  const adiant = N.contratoMercadao({ ...base, pagamento: "adiantado" });
  assert.match(adiant, /Pagamento único e antecipado de <strong>R\$ 1\.200,00/);
  assert.doesNotMatch(N.contratoMercadao({ ...base, nome: "<img src=x>" }), /<img/);
});
