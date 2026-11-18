// Ponte entre o hub e o Apps Script do Faturamento (planilha "MGB Faturamento - Clientes"), atrás do login.
//
//   GET /api/faturamento?action=listar[&mesRef=YYYY-MM]
//   GET /api/faturamento?action=incluir&id=hub-...&...
//   GET /api/faturamento?action=marcar-emitido&id=...&...
//   (mesmos parâmetros do Apps Script — ver apps-script-faturamento/Code.gs)
//
// Antes a URL do script estava no index.html e o "listar" devolvia CNPJ, e-mail e endereço de
// todos os clientes para qualquer pessoa. Agora só admin/financeiro logados chegam aqui, e o
// script só responde com o segredo que fica no Vercel.
//
// Variáveis no Vercel: FATURAMENTO_API_URL e FATURAMENTO_SECRET (= Script Properties → FATURAMENTO_SECRET).

import { cors, exigirLogin, PAPEIS_FINANCEIRO } from "../http.js";

const ACOES = new Set(["listar", "incluir", "marcar-emitido"]);

export default async function handler(req, res, { env = process.env, fetchFn = fetch } = {}) {
  if (cors(req, res, { metodos: "GET,OPTIONS", env })) return;
  if (!(await exigirLogin(req, res, PAPEIS_FINANCEIRO, env, fetchFn))) return;
  if (req.method !== "GET") return res.status(405).json({ ok: false, erro: "Use GET." });

  const action = String(req.query?.action || "");
  if (!ACOES.has(action)) return res.status(400).json({ ok: false, erro: "Ação desconhecida." });
  const base = env.FATURAMENTO_API_URL;
  const segredo = env.FATURAMENTO_SECRET;
  if (!base || !segredo) return res.status(503).json({ ok: false, erro: "Servidor sem FATURAMENTO_API_URL/FATURAMENTO_SECRET." });

  const u = new URL(base);
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k === "s" || k === "token") continue; // ninguém injeta credencial pelo navegador
    u.searchParams.set(k, Array.isArray(v) ? String(v[0]) : String(v));
  }
  u.searchParams.set("s", segredo);

  try {
    const r = await fetchFn(u.toString(), { redirect: "follow" });
    const texto = await r.text();
    let j;
    try {
      j = JSON.parse(texto);
    } catch {
      return res.status(502).json({ ok: false, erro: "Faturamento não devolveu JSON." });
    }
    if (j && j.erro === "forbidden") return res.status(502).json({ ok: false, erro: "Faturamento recusou o segredo (FATURAMENTO_SECRET diferente?)." });
    return res.status(200).json(j);
  } catch (e) {
    console.error("faturamento:", e.message || e);
    return res.status(502).json({ ok: false, erro: "Não consegui falar com a planilha do Faturamento." });
  }
}
