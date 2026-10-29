// Rede Tela Vertical ao vivo — lista pública dos condomínios cadastrados pelo CRM do hub (lead "Condomínio" fechado).
// Só dados públicos (nome, bairro, zona, tipo, torres, telas, moradores, foto). Nada financeiro, nada de contato.
// Usado pelos materiais (mídia kits, proposta, apresentações, site) pra mostrar condomínio novo sem ninguém mexer no HTML.
//
//   GET /api/rede            -> { ok, condos:[{id,hub,nome,bairro,zona,tipo,torres,telas,pessoas,foto}] }
//   GET /api/rede?foto=<id>  -> imagem JPEG do condomínio (guardada no hub, em clientesInfo.elev[item].foto)

import { loadState } from "../lib/sheets.js";

let cache = { ts: 0, state: null };
async function estado() {
  if (cache.state && Date.now() - cache.ts < 60 * 1000) return cache.state;
  const state = await loadState();
  cache = { ts: Date.now(), state };
  return state;
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function telasDoItem(state, item) {
  const rows = ((state.db || {}).elev || {})[item] || [];
  const rs = rows.filter((x) => x.t === "Recorrente" && (/sistema tv|4 ?you ?see/i.test(x.d || "") || /4 ?you ?see/i.test(x.f || "")));
  if (!rs.length) return 0;
  rs.sort((a, b) => String(b.dataInicio || "").localeCompare(String(a.dataInicio || "")));
  return rs[0].q || 0;
}

export function montarRede(state) {
  const itens = ((state.moduleItems || {}).elev) || [];
  const infos = ((state.clientesInfo || {}).elev) || {};
  const out = [];
  itens.forEach((item) => {
    const info = infos[item];
    if (!info) return;
    const pessoas = Number(info.moradores || info.pessoas) || 0;
    const telas = telasDoItem(state, item) || Number(info.telas) || 0;
    if (!pessoas || !telas) return; // só entra quem veio do fluxo do CRM (com moradores) e tem telas
    out.push({
      id: norm(item), hub: item, nome: info.fantasia || item, bairro: info.bairro || "", zona: info.zona || "",
      tipo: info.tipo === "comercial" ? "comercial" : "residencial", torres: Number(info.torres) || 0, telas, pessoas,
      foto: info.foto ? "/api/rede?foto=" + encodeURIComponent(norm(item)) : null,
    });
  });
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const state = await estado();
    if (req.query.foto) {
      const id = String(req.query.foto);
      const item = (((state.moduleItems || {}).elev) || []).find((i) => norm(i) === id);
      const data = item && (((state.clientesInfo || {}).elev || {})[item] || {}).foto;
      const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(data || "");
      if (!m) return res.status(404).end();
      res.setHeader("Content-Type", m[1]);
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
      return res.status(200).send(Buffer.from(m[2], "base64"));
    }
    const condos = montarRede(state);
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ ok: true, atualizado: new Date().toISOString(), condos });
  } catch (e) {
    return res.status(200).json({ ok: false, condos: [], erro: String((e && e.message) || e) });
  }
}
