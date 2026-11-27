// Regras do Financeiro novo (financeiro.js, na raiz do repositório).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const F = require("../../financeiro.js");

const M = (label, id = label) => ({ id, label });
const D = (m, item, idx, d, f, v) => ({ m: M(m), item, idx, r: { d, f }, vlrMes: v, tipoLbl: "Recorrente" });
const desp = [
  D("MB — Móveis Brasília", "Calçadão", 0, "Rádio", "Listen", 64.87),
  D("Rádio Interna", "Leo", 0, "Sistema", "Listen", 2010.97),
  D("TV Interna", "Saul", 1, "Sistema TV", "4Yousee", 118.68),
  D("Tela Vertical", "Uptown", 0, "4yousee", "4yousee", 39.56),
  D("Empresa", "Empresa", "_imposto", "Imposto Simples sobre receita", "Receita Federal", 5898.51),
  D("Empresa", "Empresa", "_emp_1", "Cleiton", "—", 1000),
  D("Tela Vertical", "Rateio 31 condomínio(s)", "dc_2", "Operador do Sistema", "Cleiton", 500),
  D("Empresa", "Empresa", "_emp_2", "Contador", "—", 500),
  D("Empresa", "Empresa", "_prolabore", "Pró-labore Eder (dia 21)", "Eder", 1621),
];

test("contas: junta por fornecedor (sem diferenciar maiúsculas), usa a descrição quando não há fornecedor", () => {
  const c = F.agruparContas(desp, () => false, {});
  const t = Object.fromEntries(c.map((g) => [g.titulo, [g.itens.length, g.total]]));
  assert.deepEqual(t["Listen (rádio)"], [2, 2075.84]);
  assert.deepEqual(t["4Yousee (telas)"], [2, 158.24]);
  assert.deepEqual(t["Cleiton"], [2, 1500]);
  assert.deepEqual(t["Contador"], [1, 500]);
  assert.deepEqual(t["Imposto Simples"], [1, 5898.51]);
  assert.equal(c[0].titulo, "Imposto Simples"); // maior valor primeiro
  assert.equal(c.find((g) => g.titulo === "Imposto Simples").dia, 20);
  assert.equal(c.find((g) => g.titulo === "Pró-labore do Eder").dia, 21);
});

test("contas: paga só quando todos os lançamentos estão pagos; pagas vão para o fim; dia salvo vale", () => {
  const pago = (d) => d.r.f === "Listen" || (d.r.f === "Cleiton" && d.idx === "dc_2");
  const c = F.agruparContas(desp, pago, { contador: { dia: 10 } });
  const listen = c.find((g) => g.chave === "listen"), cleiton = c.find((g) => g.chave === "cleiton");
  assert.equal(listen.pago, true);
  assert.equal(cleiton.pago, false);
  assert.equal(cleiton.pagos, 1);
  assert.equal(c[c.length - 1].chave, "listen");
  assert.equal(c.find((g) => g.chave === "contador").dia, 10);
});

test("contrato: no ar, termina, encerrado, futuro e sem fim (120 meses)", () => {
  const ref = 2026 * 12 + 10; // novembro/2026
  assert.equal(F.contrato({ valor: 950, inicio: "2026-06", meses: 120 }, ref).estado, "ativo");
  assert.equal(F.contrato({ valor: 950, inicio: "2026-06", meses: 120 }, ref).semFim, true);
  assert.equal(F.contrato({ valor: 200, inicio: "2026-11", meses: 1 }, ref).estado, "termina");
  assert.equal(F.contrato({ valor: 600, inicio: "2026-06", meses: 1 }, ref).estado, "encerrado");
  assert.equal(F.contrato({ valor: 100, inicio: "2027-01", meses: 12 }, ref).estado, "futuro");
  assert.equal(F.contrato({ valor: 0 }, ref).estado, "sem");
  assert.equal(F.contrato({ valor: 10 }, ref).estado, "sem-inicio");
  assert.equal(F.rotMes(F.contrato({ valor: 1, inicio: "2026-11", meses: 3 }, ref).fim), "jan/27");
});

test("resumo de contratos e maiores mudanças", () => {
  const ref = 100;
  const r = F.resumoContratos([{ nome: "A", iniKey: 90, fimKey: 120 }, { nome: "B", iniKey: 99, fimKey: 100 }, { nome: "C", iniKey: 80, fimKey: 95 }, { nome: "D", iniKey: 101, fimKey: 130 }, { nome: "E", iniKey: null, fimKey: null }], ref);
  assert.deepEqual([r.ativo, r.termina, r.encerrado, r.futuro, r.terminaNomes], [1, 1, 1, 1, ["B"]]);
  const m = F.mudancas({ rec: [{ tipo: "entra", rot: "x", a: 0, b: 200 }], desp: [{ tipo: "muda", rot: "y", a: 750, b: 125 }, { tipo: "sai", rot: "z", a: 10, b: 0 }] }, 2);
  assert.deepEqual(m.map((o) => [o.x.rot, o.delta]), [["y", -625], ["x", 200]]);
});

test("gráficos: escala com teto redondo dividido em 3 partes", () => {
  assert.deepEqual(F.escala(78762.71), { teto: 90000, marcas: [0, 30000, 60000, 90000] });
  assert.equal(F.escala(9800).teto, 12000);
  assert.equal(F.escala(123456).teto, 150000);
  assert.ok(F.escala(0).teto > 0);
});

test("gráficos: fatias junta o resto em Outros e calcula a porcentagem", () => {
  const f = F.fatias([{ rot: "MB", valor: 52900 }, { rot: "Rádio", valor: 17400 }, { rot: "TV", valor: 3400 }, { rot: "TVert", valor: 3100 }, { rot: "Vaapty", valor: 465 }, { rot: "Zero", valor: 0 }], 2);
  assert.deepEqual(f.map((x) => x.rot), ["MB", "Rádio", "Outros (3)"]);
  assert.equal(Math.round(f[0].pct), 68);
  assert.equal(Math.round(f.reduce((a, x) => a + x.pct, 0)), 100);
  assert.deepEqual(F.fatias([{ rot: "A", valor: 2 }, { rot: "B", valor: 1 }], 1).map((x) => x.rot), ["A", "B"]);
});

test("painel: renovações dos próximos 3 meses, do mais próximo ao mais distante, sem contratos sem fim", () => {
  const ref = 2026 * 12 + 10; // nov/26
  const l = [
    { nome: "Neoville", valor: 2210, fimKey: ref + 2, meses: 12 },
    { nome: "Eletran", valor: 200, fimKey: ref, meses: 12 },
    { nome: "Muffato", valor: 6116, fimKey: ref + 5, meses: 18 },
    { nome: "Antigo", valor: 900, fimKey: ref - 1, meses: 12 },
    { nome: "Arfix", valor: 2900, fimKey: ref + 1, meses: 120 },
  ];
  const r = F.renovacoes(l, ref, 3);
  assert.deepEqual(r.lista.map((c) => c.nome), ["Eletran", "Neoville"]);
  assert.equal(r.valor, 2410);
});

test("painel: situação do módulo pela margem", () => {
  assert.equal(F.saudeModulo(52900, 627), "saudavel");
  assert.equal(F.saudeModulo(3100, 2500), "critico");
  assert.equal(F.saudeModulo(1000, 600), "atencao");
  assert.equal(F.saudeModulo(0, 125), "critico");
  assert.equal(F.saudeModulo(0, 0), "vazio");
});
