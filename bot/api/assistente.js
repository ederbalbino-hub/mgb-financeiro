// Assistente virtual do Hub MGB (chat da Karen e da equipe).
//
// POST /api/assistente   header Authorization: Bearer <token do login do hub>
//   body { mensagens: [{role:"user"|"assistant", content:"..."}], contexto?: "dados do mês em texto", tela?: "página atual" }
//   -> { resposta: "..." }
//
// Só informa e orienta — não executa nada no hub. Chave: ANTHROPIC_API_KEY (a mesma do bot do WhatsApp).
// Só responde para quem está logado no hub (token válido).

import Anthropic from "@anthropic-ai/sdk";
import { usuarioDaRequisicao } from "../lib/auth.js";
import { MANUAL } from "../lib/assistente-manual.js";

const MODELO = process.env.ASSISTENTE_MODELO || "claude-sonnet-5-5";
const MAX_MENSAGENS = 12;
const MAX_CHARS_MSG = 2000;
const MAX_CHARS_CONTEXTO = 14000;

const SISTEMA = `Você é a Zuma, a assistente virtual do Hub MGB, a plataforma financeira e operacional da MGB Mídia. Quem pergunta é alguém da equipe (normalmente a Karen, que cuida do financeiro e do sucesso do cliente). Seu papel é tirar dúvidas e ensinar o caminho para a pessoa aprender o hub — você NÃO executa ações. Use o manual abaixo como fonte da verdade.

TOM: fale como uma colega de equipe próxima e prestativa. Trate a pessoa por "você". Linguagem simples, direta, calorosa, sem jargão técnico. Frases curtas. Pode usar emojis com moderação (1 a 3 por resposta, onde ajudam: ✅ 📌 💡 🚀). Seja objetiva: pergunta rápida = 2 a 5 linhas; só detalhe mais quando for um passo a passo. Em listas de clientes, mostre no máximo os 5 mais relevantes e ofereça o resto. Nunca termine uma frase pela metade. Não repita a pergunta. Comece pela resposta; depois, se for um procedimento, liste os passos numerados com o caminho exato (menu > aba > botão). Termine, quando fizer sentido, com uma dica curta ou oferecendo ajuda no próximo passo. Se errar ou não souber, assuma com leveza e sugira confirmar com o Eder.`;

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const usuario = usuarioDaRequisicao(req);
  if (!usuario) return res.status(401).json({ error: "Entre no hub para usar o assistente." });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "Assistente sem chave configurada (ANTHROPIC_API_KEY no Vercel)." });

  const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
  const mensagens = (Array.isArray(body.mensagens) ? body.mensagens : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_MENSAGENS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS_MSG) }));
  if (!mensagens.length || mensagens[mensagens.length - 1].role !== "user") {
    return res.status(400).json({ error: "Envie ao menos uma pergunta." });
  }
  // a conversa precisa começar com "user"
  while (mensagens.length && mensagens[0].role !== "user") mensagens.shift();

  // Só quem vê valores no hub recebe os dados do mês (Karen = financeiro, Eder = admin).
  const veValores = usuario.papel === "admin" || usuario.papel === "financeiro";
  const contexto = veValores && typeof body.contexto === "string" ? body.contexto.slice(0, MAX_CHARS_CONTEXTO) : "";
  const tela = typeof body.tela === "string" ? body.tela.slice(0, 80) : "";

  const system = [
    { type: "text", text: SISTEMA + "\n\n" + MANUAL, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text:
        `Pessoa: ${usuario.nome || usuario.login} (${usuario.papel}).` +
        (tela ? ` Tela aberta agora: ${tela}.` : "") +
        (contexto ? `\n\nDADOS DO MÊS (atuais, vindos do hub):\n${contexto}` : "\n\n(Sem dados financeiros disponíveis para esta pessoa.)"),
    },
  ];

  try {
    const client = new Anthropic();
    const r = await client.messages.create({ model: MODELO, max_tokens: 1500, system, messages: mensagens });
    const texto = (r.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return res.status(200).json({ resposta: texto || "Não consegui responder agora. Tente reformular a pergunta." });
  } catch (err) {
    return res.status(502).json({ error: "O assistente não respondeu: " + String((err && err.message) || err).slice(0, 200) });
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
