// Ponte entre o hub e o Apps Script do Assinafy (assinatura eletrônica de contratos), atrás do login.
//
//   POST /api/assinafy?action=enviar            body {nomeDoc, html, signatarios:[{nome,email}], mensagem?, pasta?}
//   GET  /api/assinafy?action=status&docId=...
//   GET  /api/assinafy?action=baixar&docId=...
//
// Antes a URL do script estava no index.html público: qualquer pessoa mandava documento para
// assinatura em nome da MGB (com a conta Assinafy da empresa) e baixava contratos assinados.
// Agora só admin/financeiro logados chegam aqui, e o script só responde com o segredo do Vercel.
//
// Variáveis no Vercel: ASSINAFY_GS_URL e ASSINAFY_GS_SECRET (= Script Properties → GS_SECRET no Apps Script).

import { cors, exigirLogin, PAPEIS_FINANCEIRO } from "../http.js";
import { registrarLog } from "../log.js";

const ACOES = { enviar: "POST", status: "GET", baixar: "GET" };

export default async function handler(req, res, { env = process.env, fetchFn = fetch } = {}) {
  if (cors(req, res, { metodos: "GET,POST,OPTIONS", env })) return;
  const usuario = await exigirLogin(req, res, PAPEIS_FINANCEIRO, env, fetchFn);
  if (!usuario) return;

  const action = String(req.query?.action || "");
  if (!ACOES[action]) return res.status(400).json({ erro: "Ação desconhecida." });
  if (req.method !== ACOES[action]) return res.status(405).json({ erro: "Método não permitido." });
  const base = env.ASSINAFY_GS_URL;
  const segredo = env.ASSINAFY_GS_SECRET;
  if (!base || !segredo) return res.status(503).json({ erro: "Servidor sem ASSINAFY_GS_URL/ASSINAFY_GS_SECRET." });

  const u = new URL(base);
  u.searchParams.set("action", action);
  if (req.query.docId) u.searchParams.set("docId", String(req.query.docId));
  u.searchParams.set("s", segredo);

  try {
    let opcoes = { redirect: "follow" };
    if (req.method === "POST") {
      const corpo = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
      opcoes = { ...opcoes, method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: corpo };
      console.log(`assinafy: envio para assinatura por ${usuario.login}`);
    }
    const r = await fetchFn(u.toString(), opcoes);
    const texto = await r.text();
    let j;
    try {
      j = JSON.parse(texto);
    } catch {
      return res.status(502).json({ erro: "Assinafy (Apps Script) não devolveu JSON." });
    }
    if (j && j.erro === "forbidden") return res.status(502).json({ erro: "Apps Script do Assinafy recusou o segredo (ASSINAFY_GS_SECRET diferente?)." });
    if (req.method === "POST") {
      // Registro de ações (hub_log): nome do documento e para quantas pessoas; nunca o HTML do contrato.
      let info = {};
      try { info = typeof req.body === "object" && !Buffer.isBuffer(req.body) ? req.body || {} : JSON.parse(String(req.body || "{}")); } catch { info = {}; }
      const sig = Array.isArray(info.signatarios) ? info.signatarios : [];
      await registrarLog(env, fetchFn, {
        usuario, origem: "assinafy",
        acao: `Mandou para assinatura: ${info.nomeDoc || "documento"} · ${sig.length} signatário(s)`,
        detalhe: { nomeDoc: info.nomeDoc || null, signatarios: sig.map((x) => x?.nome || null).slice(0, 10), docId: j?.docId || j?.id || null, ok: !j?.erro },
      });
    }
    return res.status(200).json(j);
  } catch (e) {
    console.error("assinafy:", e.message || e);
    return res.status(502).json({ erro: "Não consegui falar com o Apps Script do Assinafy." });
  }
}
