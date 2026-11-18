// Ponte entre o hub e o Plano de Caixa (Apps Script do Eder), atrás do login.
//
//   POST /api/plano-caixa?acao=resumoEmpresa   body {mesRef, receita, despesa, despesas:[...]}   (admin/financeiro)
//   GET  /api/plano-caixa?acao=resumoEmpresa&mesRef=YYYY-MM                                     (admin/financeiro)
//   GET  /api/plano-caixa?acao=statusDespesasEmpresa                                            (admin/financeiro)
//   POST /api/plano-caixa?acao=avisosPessoal   body {avisos:[...]}                              (só admin: é pessoal)
//
// Antes o token do sync (TOKEN_SYNC_EMPRESA) ficava escrito no index.html público. Agora ele
// mora só aqui (PLANO_CAIXA_TOKEN) e no Script Properties do Plano de Caixa.
//
// Variáveis no Vercel: PLANO_CAIXA_URL (URL /exec da implantação "Qualquer pessoa") e PLANO_CAIXA_TOKEN.

import { cors, exigirLogin, PAPEIS_FINANCEIRO } from "../http.js";

const ACOES = {
  resumoEmpresa: { metodos: ["GET", "POST"], papeis: PAPEIS_FINANCEIRO },
  statusDespesasEmpresa: { metodos: ["GET"], papeis: PAPEIS_FINANCEIRO },
  avisosPessoal: { metodos: ["POST"], papeis: ["admin"] },
};

export default async function handler(req, res, { env = process.env, fetchFn = fetch } = {}) {
  if (cors(req, res, { metodos: "GET,POST,OPTIONS", env })) return;
  const acao = String(req.query?.acao || "");
  const regra = ACOES[acao];
  if (!regra) return res.status(400).json({ error: "Ação desconhecida." });
  if (!exigirLogin(req, res, regra.papeis, env)) return;
  if (!regra.metodos.includes(req.method)) return res.status(405).json({ error: "Método não permitido." });

  const base = env.PLANO_CAIXA_URL;
  const token = env.PLANO_CAIXA_TOKEN;
  if (!base || !token) return res.status(503).json({ error: "Servidor sem PLANO_CAIXA_URL/PLANO_CAIXA_TOKEN." });

  try {
    let r;
    if (req.method === "GET") {
      const u = new URL(base);
      u.searchParams.set("acao", acao);
      u.searchParams.set("token", token);
      if (req.query.mesRef) u.searchParams.set("mesRef", String(req.query.mesRef).slice(0, 7));
      r = await fetchFn(u.toString(), { redirect: "follow" });
    } else {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const envio = { acao, token };
      if (acao === "resumoEmpresa") {
        Object.assign(envio, {
          mesRef: String(body.mesRef || "").slice(0, 7),
          receita: Number(body.receita) || 0,
          despesa: Number(body.despesa) || 0,
          despesas: Array.isArray(body.despesas) ? body.despesas : [],
        });
      } else {
        envio.avisos = Array.isArray(body.avisos) ? body.avisos : [];
      }
      r = await fetchFn(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envio),
        redirect: "follow",
      });
    }
    const texto = (await r.text()).trim();
    if (texto === "forbidden" || /"erro"\s*:\s*"forbidden"/.test(texto)) {
      return res.status(502).json({ error: "Plano de Caixa recusou o token (PLANO_CAIXA_TOKEN diferente do Script Properties?)." });
    }
    if (req.method === "POST") {
      if (!/^ok/.test(texto)) return res.status(502).json({ error: `Plano de Caixa respondeu: ${texto.slice(0, 120)}` });
      return res.status(200).json({ ok: true, resposta: texto });
    }
    let j;
    try {
      j = JSON.parse(texto);
    } catch {
      return res.status(502).json({ error: "Plano de Caixa não devolveu JSON." });
    }
    return res.status(200).json(j);
  } catch (e) {
    console.error("plano-caixa:", e.message || e);
    return res.status(502).json({ error: "Não consegui falar com o Plano de Caixa." });
  }
}
