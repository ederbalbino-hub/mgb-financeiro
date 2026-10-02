// Recebe os webhooks da Asaas (Configurações → Integrações → Webhooks, na conta de produção)
// e grava o status de pagamento de volta na planilha "MGB Faturamento - Clientes", pra fazer
// aparecer vermelho (vencido) / verde (pago) no hub sem precisar abrir o site da Asaas.
//
// Configurar na Asaas:
//   URL:    https://<este-domínio-vercel>/api/asaas-webhook
//   Eventos: PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_DELETED,
//            PAYMENT_RESTORED, PAYMENT_UPDATED
//   Token de acesso: o MESMO valor da env var ASAAS_WEBHOOK_TOKEN abaixo (a Asaas manda esse
//            token de volta no header "asaas-access-token" em toda chamada — é assim que a
//            gente confirma que a chamada é mesmo da Asaas, já que este endpoint é público).
//
// A Asaas espera 200 rápido (senão ela reenvia e pode até suspender o webhook depois de muitas
// falhas), então aqui só validamos e respondemos — a escrita na planilha roda sem bloquear.

const FATURAMENTO_API_URL =
  "https://script.google.com/macros/s/AKfycbwdlNqijPhK5MfOFhQ-4lo72hA-3G1J-iPZbdoOZAQGv_8z7NG4QBjNxDIhmZNFOIa8/exec";

// Normaliza os ~15 status possíveis da Asaas pros 3 que o hub pinta (vermelho/verde/cinza).
const MAPA_STATUS = {
  PAYMENT_RECEIVED: "pago",
  PAYMENT_CONFIRMED: "pago",
  PAYMENT_RECEIVED_IN_CASH: "pago",
  PAYMENT_OVERDUE: "vencido",
  PAYMENT_DELETED: "cancelado",
  PAYMENT_REFUNDED: "cancelado",
  PAYMENT_RESTORED: "pendente",
  PAYMENT_UPDATED: "pendente",
  PAYMENT_CREATED: "pendente",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const token = req.headers["asaas-access-token"];
  if (!process.env.ASAAS_WEBHOOK_TOKEN) {
    console.error("asaas-webhook: falta ASAAS_WEBHOOK_TOKEN no Vercel.");
    return res.status(500).send("Webhook não configurado.");
  }
  if (token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return res.status(401).send("Token inválido.");
  }

  // Responde rápido — a Asaas não precisa esperar a planilha.
  res.status(200).send("OK");

  try {
    const evento = req.body?.event;
    const paymentId = req.body?.payment?.id;
    const status = MAPA_STATUS[evento];
    if (!paymentId || !status) {
      console.log("asaas-webhook: evento ignorado:", evento, paymentId);
      return;
    }

    const qs = new URLSearchParams({
      action: "atualizar-status-pagamento",
      paymentId,
      status,
      token: process.env.ASAAS_WEBHOOK_TOKEN,
    });
    const r = await fetch(FATURAMENTO_API_URL + "?" + qs.toString());
    const j = await r.json().catch(() => ({}));
    if (!j.ok) console.log("asaas-webhook: planilha não atualizou:", j.erro || j);
    else console.log(`asaas-webhook: ${evento} → ${status} (${j.cliente || paymentId})`);
  } catch (e) {
    console.error("asaas-webhook:", e);
  }
}
