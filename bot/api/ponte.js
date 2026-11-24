// Uma função só para as pontes com os Apps Scripts (Faturamento, Plano de Caixa, Assinafy)
// e para a rotina diária do Vercel Cron (conferência do Faturamento + resumo por e-mail).
//
// O plano Hobby do Vercel aceita no máximo 12 funções por deploy; cada ponte em seu próprio
// arquivo estourava o limite. O vercel.json reescreve as URLs públicas para cá, então o hub
// continua chamando /api/faturamento, /api/plano-caixa e /api/assinafy normalmente:
//   /api/faturamento?...  ->  /api/ponte?alvo=faturamento&...
//
// Cada ponte (lib/pontes/*.js) faz o próprio CORS, login, papel e chamada ao Apps Script.

import faturamento from "../lib/pontes/faturamento.js";
import planoCaixa from "../lib/pontes/plano-caixa.js";
import assinafy from "../lib/pontes/assinafy.js";
import conferencia from "../lib/pontes/conferencia.js";
import csp from "../lib/pontes/csp.js";
import resumo, { rotina } from "../lib/pontes/resumo.js";

const PONTES = { faturamento, "plano-caixa": planoCaixa, assinafy, conferencia, csp, resumo, rotina };

export default async function handler(req, res) {
  const alvo = String(req.query?.alvo || "");
  const ponte = PONTES[alvo];
  if (!ponte) return res.status(404).json({ error: "Ponte desconhecida." });
  return ponte(req, res);
}
