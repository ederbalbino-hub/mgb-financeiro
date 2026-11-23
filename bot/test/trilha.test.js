// Trilha de auditoria legível (lib/trilha.js).
import test from "node:test";
import assert from "node:assert/strict";
import { descreverMudancas } from "../lib/trilha.js";

const textos = (a, d) => descreverMudancas(a, d).map((x) => x.texto);

test("pagamento marcado como pago vira frase com cliente, módulo e mês (chave com mês começando em zero)", () => {
  const antes = { recPagamentos: { radio: { Listen: { "2026-10": { pago: false } } } } };
  const depois = { recPagamentos: { radio: { Listen: { "2026-10": { pago: true, dataPago: "23/11/2026" } } } } };
  assert.deepEqual(textos(antes, depois), ["marcou Listen (Rádio Interna) como paga em Nov/2026"]);
});

test("desmarcar e mudança de status do boleto", () => {
  const a = { pagamentos: { mb: { _mod_: { "2026-9": { pago: true } } } }, recPagamentos: { tv: { X: { "2026-0": { asaas: { st: "pendente" } } } } } };
  const d = { pagamentos: { mb: { _mod_: { "2026-9": { pago: false } } } }, recPagamentos: { tv: { X: { "2026-0": { asaas: { st: "pago" } } } } } };
  assert.deepEqual(textos(a, d), ["desmarcou MB (MB) como paga em Out/2026", "boleto de X (TV Interna) em Jan/2026: pendente → pago"]);
});

test("listas com id: incluir, alterar valor, apagar", () => {
  const a = { empresaAvulsas: [{ id: 1, desc: "Gasolina", valor: 100, mes: "2026-11" }, { id: 2, desc: "Cabo", valor: 30 }] };
  const d = { empresaAvulsas: [{ id: 1, desc: "Gasolina", valor: 120, mes: "2026-11" }, { id: 3, desc: "Suporte", valor: 50 }] };
  assert.deepEqual(textos(a, d), [
    "alterou em despesas avulsas: Gasolina (R$ 120,00, Nov/2026): valor R$ 100,00 → R$ 120,00",
    "incluiu em despesas avulsas: Suporte (R$ 50,00)",
    "apagou de despesas avulsas: Cabo (R$ 30,00)",
  ]);
});

test("lead mudando de etapa, receita de módulo e emissão do faturamento", () => {
  const a = { leads: [{ id: 7, nome: "Padaria", estagio: "negociando" }], rec: { elev: { Tay: { valor: 300 } } }, fatEmissoes: {} };
  const d = {
    leads: [{ id: 7, nome: "Padaria", estagio: "fechado" }], rec: { elev: { Tay: { valor: 339 } } },
    fatEmissoes: { "c12|2026-12": { modo: "ambos", valor: 1500.5, status: "aguardando-nota" } },
  };
  assert.deepEqual(textos(a, d), [
    "moveu o lead Padaria de negociando para fechado",
    "mudou o valor de Tay (Tela Vertical): R$ 300,00 → R$ 339,00",
    "emitiu c12 em Dez/2026: ambos R$ 1.500,50 (aguardando-nota)",
  ]);
});

test("ignora metadados e seções iguais; limita o tamanho", () => {
  assert.deepEqual(textos({ _v: 1, _salvoPor: "Eder", notas: [] }, { _v: 2, _salvoPor: "Karen", notas: [] }), []);
  const muitos = { receitasAvulsas: Array.from({ length: 300 }, (_, i) => ({ id: i, valor: 1 })) };
  const r = descreverMudancas({}, muitos, { limite: 10 });
  assert.equal(r.length, 11);
  assert.equal(r[10].texto, "… e mais 290 mudança(s)");
});
