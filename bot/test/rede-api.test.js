import test from "node:test";
import assert from "node:assert/strict";
import { montarRede } from "../api/rede.js";

test("montarRede: só condomínios do CRM (com moradores e telas), foto como URL", () => {
  const state = {
    moduleItems: { elev: ["Lagoa Dourada", "Novo Cond"] },
    clientesInfo: { elev: { "Novo Cond": { fantasia: "Novo Cond", bairro: "Centro", zona: "Sul", tipo: "residencial", torres: 2, telas: 3, moradores: 300, foto: "data:image/jpeg;base64,AAAA" }, "Lagoa Dourada": { cnpj: "1" } } },
    db: { elev: { "Novo Cond": [{ t: "Recorrente", d: "Sistema TV", f: "4Yousee", q: 3, u: 39.56, dataInicio: "2026-11" }] } },
  };
  const r = montarRede(state);
  assert.equal(r.length, 1);
  assert.equal(r[0].nome, "Novo Cond");
  assert.equal(r[0].telas, 3);
  assert.equal(r[0].pessoas, 300);
  assert.equal(r[0].foto, "/api/rede?foto=novocond");
});
