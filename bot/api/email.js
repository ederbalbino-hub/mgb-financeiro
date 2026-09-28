// Envio de e-mail transacional via Resend (https://resend.com) — usado pro e-mail
// consolidado do Léo Cosméticos (várias notas fiscais, um e-mail só com todos os PDFs
// anexados), em vez de um e-mail por nota.
// A CHAVE SECRETA fica SÓ aqui no backend (env var RESEND_API_KEY), nunca no index.html.
//
// Ação (via query ?action=...):
//   POST /api/email?action=enviar-notas
//        body: { ambiente:'sandbox'|'producao', para:'email@cliente.com', assunto:'...',
//                mensagem:'texto simples (opcional)',
//                notas:[ { invoiceId, nomeArquivo? } ] }
//        -> pra cada nota, baixa o PDF da Asaas (GET /invoices/{id}) e manda TUDO num
//           e-mail só, com um PDF anexado por nota. Devolve {enviados, falharam:[...]}

const BASE = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};

function getAsaasKey(ambiente) {
  const isSandbox = ambiente === "sandbox";
  const key = isSandbox ? process.env.ASAAS_API_KEY_SANDBOX : process.env.ASAAS_API_KEY;
  if (!key) throw new Error(isSandbox ? "Falta ASAAS_API_KEY_SANDBOX." : "Falta ASAAS_API_KEY.");
  return key;
}

async function buscarPdfBase64(ambiente, invoiceId) {
  const key = getAsaasKey(ambiente);
  const base = BASE[ambiente === "sandbox" ? "sandbox" : "producao"];
  const r = await fetch(`${base}/invoices/${encodeURIComponent(invoiceId)}`, {
    headers: { access_token: key, "User-Agent": "mgb-financeiro" },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `Asaas respondeu ${r.status}`);
  if (!j.pdfUrl) throw new Error(`Nota ${invoiceId} ainda não tem PDF pronto (status: ${j.status}).`);
  const pdfResp = await fetch(j.pdfUrl);
  if (!pdfResp.ok) throw new Error(`Falha ao baixar PDF da nota ${invoiceId} (${pdfResp.status}).`);
  const buf = Buffer.from(await pdfResp.arrayBuffer());
  return { base64: buf.toString("base64"), numero: j.number || invoiceId };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const action = req.query.action || "";

  try {
    if (action === "enviar-notas") {
      if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) return res.status(500).json({ error: "Falta RESEND_API_KEY nas variáveis de ambiente." });

      const { ambiente, para, assunto, mensagem, notas } = req.body || {};
      if (!para || !Array.isArray(notas) || !notas.length) {
        return res.status(400).json({ error: "Faltam dados: para, notas[]." });
      }

      const anexos = [];
      const falharam = [];
      for (const n of notas) {
        try {
          const { base64, numero } = await buscarPdfBase64(ambiente === "sandbox" ? "sandbox" : "producao", n.invoiceId);
          anexos.push({ filename: (n.nomeArquivo || `nota-${numero}`) + ".pdf", content: base64 });
        } catch (e) {
          falharam.push({ invoiceId: n.invoiceId, erro: e.message });
        }
      }

      if (!anexos.length) {
        return res.status(400).json({ error: "Nenhuma nota pôde ser baixada.", falharam });
      }

      const de = process.env.RESEND_FROM || "MGB Mídia <financeiro@agenciamgb.com.br>";
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: de,
          to: [para],
          subject: assunto || `Notas fiscais MGB Mídia — ${anexos.length} unidade(s)`,
          text: mensagem || `Seguem em anexo as notas fiscais referentes às unidades faturadas neste mês (${anexos.length} nota(s)).`,
          attachments: anexos,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || `Resend respondeu ${r.status}`);

      return res.status(200).json({ enviados: anexos.length, falharam, resendId: j.id || null });
    }

    return res.status(400).json({ error: `Ação desconhecida: '${action}'. Use enviar-notas.` });
  } catch (e) {
    console.error("email.js:", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
