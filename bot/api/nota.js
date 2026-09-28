// Emissão de nota fiscal (NFS-e) via Notaas (https://www.notaas.com.br).
// A CHAVE SECRETA da Notaas fica SÓ aqui no backend (env vars), nunca no index.html.
//
// Ações (via query ?action=...):
//   POST /api/nota?action=emitir&ambiente=sandbox|producao   body: {tomador,servico,valores}
//        -> dispara a emissão na Notaas, devolve {invoiceId,status}
//   GET  /api/nota?action=status&invoiceId=...&ambiente=sandbox|producao
//        -> consulta o status da nota (issued/processing/error), com link do PDF/XML quando pronta
//
// "ambiente" escolhe qual chave de API usar (sandbox pra testar sem gerar nota fiscal real,
// produção pra emitir de verdade) — os dois ficam em env vars separadas.

const NOTAAS_API = "https://platform.notaas.com.br/api/v1";

function getApiKey(ambiente) {
  const isSandbox = ambiente === "sandbox";
  const key = isSandbox ? process.env.NOTAAS_API_KEY_SANDBOX : process.env.NOTAAS_API_KEY;
  if (!key) {
    throw new Error(
      isSandbox
        ? "Falta NOTAAS_API_KEY_SANDBOX nas variáveis de ambiente."
        : "Falta NOTAAS_API_KEY nas variáveis de ambiente."
    );
  }
  return key;
}

export default async function handler(req, res) {
  // CORS: o index.html (outra origem) precisa chamar este endpoint.
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const action = req.query.action || "";
  const ambiente = (req.query.ambiente || req.body?.ambiente || "producao") === "sandbox" ? "sandbox" : "producao";

  try {
    // ── emite a nota (NFS-e) ──
    if (action === "emitir") {
      if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
      const apiKey = getApiKey(ambiente);
      const { tomador, servico, valores } = req.body || {};
      if (!tomador?.nome || !servico?.descricao || !(valores?.total > 0)) {
        return res.status(400).json({ error: "Faltam dados: tomador.nome, servico.descricao ou valores.total." });
      }
      const r = await fetch(`${NOTAAS_API}/emitir`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ tomador, servico, valores }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ error: j.message || j.error || `Notaas respondeu ${r.status}`, detalhe: j });
      return res.status(202).json({ invoiceId: j.invoiceId || j.id, status: j.status || "processing", ambiente, raw: j });
    }

    // ── consulta status de uma nota já emitida ──
    if (action === "status") {
      const invoiceId = req.query.invoiceId;
      if (!invoiceId) return res.status(400).json({ error: "Falta invoiceId." });
      const apiKey = getApiKey(ambiente);
      const r = await fetch(`${NOTAAS_API}/invoices/${encodeURIComponent(invoiceId)}/status`, {
        headers: { "x-api-key": apiKey },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ error: j.message || j.error || `Notaas respondeu ${r.status}`, detalhe: j });
      return res.status(200).json({
        status: j.status,
        pdfUrl: j.pdfUrl || j.pdf_url || j.pdf || null,
        xmlUrl: j.xmlUrl || j.xml_url || j.xml || null,
        numero: j.numero || j.number || null,
        erro: j.error || j.errorMessage || null,
        raw: j,
      });
    }

    return res.status(400).json({ error: `Ação desconhecida: '${action}'. Use emitir | status.` });
  } catch (e) {
    console.error("nota.js:", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
