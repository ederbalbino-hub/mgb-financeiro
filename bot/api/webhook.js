// Webhook do Meta WhatsApp Cloud API.
// GET: verificação de URL (Meta valida o endpoint).
// POST: mensagem do usuário → Claude parseia → executa ação → responde no WhatsApp.

import { parseIntent } from "../lib/parseIntent.js";
import { sendText } from "../lib/whatsapp.js";
import { loadState, addDespesa, marcarReceitaPaga, modulosResumo, calcularSaldo } from "../lib/sheets.js";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const WHITELIST = (process.env.WHITELIST || "").split(",").map((s) => s.trim()).filter(Boolean);

export default async function handler(req, res) {
  // --- Verificação Meta (GET) ---
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  // --- Mensagem recebida (POST) ---
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  // Sempre responde 200 rápido pra Meta não reenviar.
  // O processamento é "fire and forget" — Vercel mantém a execução até o timeout.
  res.status(200).send("OK");

  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
    if (!msg) return;

    const from = msg.from; // número do remetente em E.164 sem +
    if (WHITELIST.length && !WHITELIST.includes(from)) {
      console.log("Número fora da whitelist:", from);
      return;
    }

    if (msg.type !== "text") {
      await sendText(from, "Por enquanto só entendo texto. Foto de NFe vem depois.");
      return;
    }

    const userText = msg.text.body.trim();
    if (!userText) return;

    const state = await loadState();
    const modulos = modulosResumo(state);
    const intent = await parseIntent(userText, modulos);

    await executarAcao(from, intent, state);
  } catch (e) {
    console.error("Erro processando mensagem:", e);
  }
}

async function executarAcao(from, intent, state) {
  const now = new Date();

  if (intent.tipo === "despesa") {
    const tipo = intent.tipoPag;
    const data = {
      modId: intent.modId,
      item: intent.item,
      descricao: intent.descricao,
      fornecedor: intent.fornecedor || "",
      valor: intent.valor,
      tipo,
      dataInicio: intent.dataInicio || isoMonth(now),
      mesesRec: intent.mesesRec,
      nparc: intent.nparc,
      venc: tipo === "À vista" ? intent.dataInicio || isoMonth(now) : "",
    };
    await addDespesa(data);
    const modLabel = modulosResumo(state).find((m) => m.id === intent.modId)?.label || intent.modId;
    let extra = "";
    if (tipo === "Parcelado") extra = ` em ${intent.nparc}x de R$ ${(intent.valor / intent.nparc).toFixed(2)}`;
    if (tipo === "Recorrente") extra = ` recorrente por ${intent.mesesRec || 12} meses`;
    await sendText(
      from,
      `✓ Despesa lançada\n${modLabel} › ${intent.item}\n${intent.descricao}${intent.fornecedor ? ` (${intent.fornecedor})` : ""}\n${tipo}: R$ ${intent.valor.toFixed(2)}${extra}`,
    );
    return;
  }

  if (intent.tipo === "receita") {
    const ano = intent.ano ?? now.getFullYear();
    const mes = intent.mes ?? now.getMonth();
    await marcarReceitaPaga({ modId: intent.modId, item: intent.item, ano, mes });
    const modLabel = modulosResumo(state).find((m) => m.id === intent.modId)?.label || intent.modId;
    await sendText(from, `✓ Receita marcada como recebida\n${modLabel} › ${intent.item}\n${MESES[mes]}/${ano}`);
    return;
  }

  if (intent.tipo === "saldo") {
    const ano = intent.ano ?? now.getFullYear();
    const mes = intent.mes ?? now.getMonth();
    const { receita, despesa, lucro } = calcularSaldo(state, ano, mes);
    const sinal = lucro >= 0 ? "+" : "";
    await sendText(
      from,
      `📊 Saldo ${MESES[mes]}/${ano}\n↑ Receita: R$ ${receita.toFixed(2)}\n↓ Despesa: R$ ${despesa.toFixed(2)}\n💰 Lucro: ${sinal}R$ ${lucro.toFixed(2)}`,
    );
    return;
  }

  await sendText(
    from,
    `Não entendi: ${intent.razao || "mensagem ambígua"}.\n\nExemplos:\n• "gastei 50 reais em cabo HDMI no Tecmax pra Calçadão"\n• "recebi do Leo Cosméticos"\n• "saldo do mês"`,
  );
}

function isoMonth(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
