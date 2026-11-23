// Regras da área Clientes / Ficha do cliente (clientes.js, na raiz do repositório).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../../clientes.js");

const fontes = {
  modulos: [
    { id: "radio", label: "Rádio Interna", items: ["Vaapty JK - Londrina", "Arel", "Outros", "Lead sem contrato"] },
    { id: "vaapty", label: "Vaapty", items: ["Vaapty JK - Londrina"] },
    { id: "elev", label: "Tela Vertical", items: ["Lagoa Dourada"] },
  ],
  rec: { radio: { "Vaapty JK - Londrina": { valor: 150, inicio: "2026-08", meses: 120 }, Arel: { valor: 240, inicio: "2026-06", meses: 120 } }, vaapty: { "Vaapty JK - Londrina": { valor: 265, inicio: "2026-09", meses: 120 } } },
  anunciantes: [{ nome: "Arfix", valor: 600, inicio: "2026-06", meses: 12, telas: ["Lake Portinari", "Spazio Louvre"] }],
  clientesInfo: { radio: { "Vaapty JK - Londrina": { cnpj: "11.111.111/0001-11", tel: "43 9999-0000" } }, vaapty: { "Vaapty JK - Londrina": { cnpj: "11.111.111/0001-11" } }, elev: { Arfix: { assinadoEm: "2026-06-02T10:00:00Z" } } },
  recPagamentos: {
    elev: { Arfix: { "2026-9": { pago: false, asaas: { st: "vencido", nf: "" } }, "2026-8": { pago: true } } }, // chave = ano-mês com janeiro = 0
    radio: { Arel: { "2026-10": { pago: true }, "2026-9": { pago: true } } },
  },
  leads: [{ id: 7, nome: "Arfix", origem: "Indicação", itemCriado: "Arfix", criado: "2026-05-20" }],
  recOfMes: (mod, item, ano, mes) => ({ radio: { "Vaapty JK - Londrina": 150, Arel: 240 }, vaapty: { "Vaapty JK - Londrina": 265 } }[mod] || {})[item] || 0,
};

test("junta o mesmo cliente de vários módulos pelo CNPJ e ignora item sem contrato", () => {
  const L = C.montarClientes(fontes, 2026, 10);
  const nomes = L.map((g) => g.nome).sort();
  assert.deepEqual(nomes, ["Arel", "Arfix", "Vaapty JK - Londrina"]);
  const jk = L.find((g) => g.nome === "Vaapty JK - Londrina");
  assert.equal(jk.contratos.length, 2);
  assert.equal(jk.pagaPorMes, 415);
  assert.deepEqual(jk.modulos, ["Rádio Interna", "Vaapty"]);
});

test("anunciante da Tela Vertical: valor, prédios, assinatura, vencido e lead do funil", () => {
  const L = C.montarClientes(fontes, 2026, 10);
  const a = L[0];
  assert.equal(a.nome, "Arfix"); // quem tem vencido vem primeiro
  assert.equal(a.situacao, "vencido");
  assert.equal(a.emAberto, 600);
  assert.equal(a.contratos[0].telas.length, 2);
  assert.ok(a.contratos[0].assinadoEm);
  assert.equal(a.origem, "Indicação");
  assert.deepEqual(a.contratos[0].historico.slice(0, 2).map((h) => h.status), ["a emitir", "vencido"]);
});

test("status do mês e vigência", () => {
  assert.equal(C.statusMes({ pago: true }, 100, true), "pago");
  assert.equal(C.statusMes({ asaas: { st: "pendente" } }, 100, false), "pendente");
  assert.equal(C.statusMes(null, 100, true), "sem baixa");
  assert.equal(C.statusMes(null, 0, true), "sem cobrança");
  assert.equal(C.vigencia({ inicio: "2026-06", meses: 120 }), "desde jun/26, sem data para acabar");
  assert.equal(C.vigencia({ inicio: "2026-11", meses: 3 }), "desde nov/26 até jan/27");
  assert.equal(C.ativoNoMes({ valor: 1, inicio: "2026-06", meses: 1 }, 2026 * 12 + 6), false);
});
