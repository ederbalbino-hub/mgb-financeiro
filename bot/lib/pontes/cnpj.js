// Consulta de CNPJ no CNPJá, atrás do login.
//
//   GET /api/cnpj?cnpj=00000000000000   (admin/financeiro)
//   -> { ok:true, dados:{ nome, fantasia, logradouro, numero, complemento, bairro, cidade, uf, cep, telefone, email } }
//
// Os formulários de contrato tentam antes as consultas públicas e gratuitas (cnpj.ws e BrasilAPI),
// direto do navegador. Só quando as duas falham chegam aqui. Antes a chave paga do CNPJá ficava
// escrita no index.html público; agora ela fica só no Vercel.
//
// Variável no Vercel: CNPJA_TOKEN.

import { cors, exigirLogin, PAPEIS_FINANCEIRO } from "../http.js";

export default async function handler(req, res, { env = process.env, fetchFn = fetch } = {}) {
  if (cors(req, res, { metodos: "GET,OPTIONS", env })) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET." });
  if (!(await exigirLogin(req, res, PAPEIS_FINANCEIRO, env, fetchFn))) return;

  const cnpj = String(req.query?.cnpj || "").replace(/\D/g, "");
  if (cnpj.length !== 14) return res.status(400).json({ error: "CNPJ precisa ter 14 números." });
  if (!env.CNPJA_TOKEN) return res.status(503).json({ error: "Servidor sem CNPJA_TOKEN." });

  let r, texto;
  try {
    r = await fetchFn(`https://api.cnpja.com/office/${cnpj}?strategy=CACHE_IF_FRESH`, {
      headers: { Authorization: env.CNPJA_TOKEN },
    });
    texto = await r.text();
  } catch {
    return res.status(502).json({ error: "O CNPJá não respondeu." });
  }
  if (r.status === 404) return res.status(404).json({ error: "CNPJ não encontrado." });
  if (!r.ok) return res.status(502).json({ error: `O CNPJá recusou a consulta (${r.status}).` });

  let d;
  try {
    d = JSON.parse(texto);
  } catch {
    return res.status(502).json({ error: "Resposta inválida do CNPJá." });
  }
  return res.status(200).json({ ok: true, dados: normalizar(d) });
}

export function normalizar(d = {}) {
  const a = d.address || {};
  const tel = (d.phones && d.phones[0]) || {};
  return {
    nome: d.company?.name || "",
    fantasia: d.alias || "",
    logradouro: a.street || "",
    numero: a.number || "",
    complemento: a.details || "",
    bairro: a.district || "",
    cidade: a.city || "",
    uf: a.state || "",
    cep: String(a.zip || "").replace(/\D/g, ""),
    telefone: tel.area ? `${tel.area}${tel.number || ""}` : tel.number || "",
    email: (d.emails && d.emails[0] && d.emails[0].address) || "",
  };
}
