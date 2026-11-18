// Relatórios da política de conteúdo (CSP) do hub, enquanto ela roda em modo "só relatar".
// O navegador manda aqui o que bloquearia; cada aviso vai para o log do Vercel (prefixo "csp:").
// Depois de alguns dias sem avisos inesperados, a política passa a valer de verdade (vercel.json da raiz).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const corpo = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const r = corpo["csp-report"] || (Array.isArray(corpo) ? corpo[0]?.body : corpo.body) || corpo;
    const bloqueado = r["blocked-uri"] || r.blockedURL || "";
    const regra = r["violated-directive"] || r.effectiveDirective || "";
    const pagina = String(r["document-uri"] || r.documentURL || "").split("?")[0];
    console.log(`csp: ${regra} bloquearia ${String(bloqueado).slice(0, 200)} em ${pagina}`);
  } catch {
    /* relatório malformado: ignora */
  }
  return res.status(204).end();
}
