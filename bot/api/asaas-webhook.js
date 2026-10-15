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

import { ehMercadao, reciboHtml, reciboTexto } from "../lib/recibo.js";

const ASAAS_BASE = "https://api.asaas.com/v3";

// Pago de verdade (boleto compensado / PIX). CONFIRMED fica de fora de propósito: pode chegar dias antes do
// RECEIVED, e o recibo só sai uma vez.
const EVENTOS_RECIBO = new Set(["PAYMENT_RECEIVED", "PAYMENT_RECEIVED_IN_CASH"]);

async function asaasGet(path) {
  const r = await fetch(ASAAS_BASE + path, {
    headers: { access_token: process.env.ASAAS_API_KEY, "User-Agent": "mgb-financeiro" },
  });
  if (!r.ok) throw new Error(`Asaas ${path} respondeu ${r.status}`);
  return r.json();
}

// Recibo automático por e-mail (Resend) para as lojas do Mercadão da Prochet quando pagam.
async function enviarReciboMercadao(payment) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !process.env.ASAAS_API_KEY) return console.log("asaas-webhook: recibo ignorado — faltam RESEND_API_KEY/ASAAS_API_KEY");
  const cliente = await asaasGet(`/customers/${encodeURIComponent(payment.customer)}`);
  const para = [cliente.email, ...String(cliente.additionalEmails || "").split(/[,;]/)]
    .map((e) => String(e || "").trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const destinos = [...new Set(para)];
  if (!destinos.length) return console.log(`asaas-webhook: recibo sem e-mail do cliente (${cliente.name || payment.customer})`);

  // "Veiculação … do Mercadão da Prochet — Loja — competência 2026-10" → referente a …
  const descricao = String(payment.description || "").replace(/\s+—\s+competência\s+(\d{4})-(\d{2})$/i, (_, a, m) => ` — competência ${m}/${a}`);
  const dataPg = payment.clientPaymentDate || payment.paymentDate || new Date().toISOString().slice(0, 10);
  const dados = {
    pagador: cliente.name,
    doc: cliente.cpfCnpj,
    valor: payment.value,
    descricao,
    dataPagamento: dataPg,
    forma: payment.billingType === "PIX" ? "PIX" : "Boleto bancário",
    numero: "",
    comprovanteUrl: payment.transactionReceiptUrl || "",
  };
  const copia = process.env.RECIBO_COPIA ? [process.env.RECIBO_COPIA] : [];
  const de = process.env.RESEND_FROM || "MGB Mídia <financeiro@agenciamgb.com.br>";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}`, "Idempotency-Key": `recibo-${payment.id}` },
    body: JSON.stringify({
      from: de,
      to: destinos,
      ...(copia.length ? { bcc: copia } : {}),
      subject: `Recibo de pagamento — MGB Mídia · ${cliente.name || ""}`.trim(),
      html: reciboHtml(dados),
      text: reciboTexto(dados),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `Resend respondeu ${r.status}`);
  console.log(`asaas-webhook: recibo enviado → ${destinos.join(", ")} (${payment.id})`);
}

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

    // Recibo automático: só lojas do Mercadão da Prochet (marcador na descrição da cobrança). Falha aqui não
    // impede a atualização de status na planilha.
    if (EVENTOS_RECIBO.has(evento) && ehMercadao(req.body?.payment?.description)) {
      try { await enviarReciboMercadao(req.body.payment); } catch (e) { console.error("asaas-webhook: recibo falhou:", e.message || e); }
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
