// Assistente virtual do Hub MGB (chat da Karen e da equipe).
//
// POST /api/assistente   header Authorization: Bearer <token do login do hub>
//   body { mensagens: [{role:"user"|"assistant", content:"..."}], contexto?: "dados do mês em texto", tela?: "página atual" }
//   -> { resposta: "..." }
//
// Também atende a pesquisa do Planejamento Tarobá (mesma função pra caber no limite de 12 do Vercel):
//   body { pesquisaTaroba: { etapa:"texto"|"mercado", nome, segmento, site, pracas, periodo, frentes:[] } }
//   -> { ok:true, dados:{...} } | { ok:false, erro:"..." }
//
// Só informa e orienta — não executa nada no hub. Chave: ANTHROPIC_API_KEY (a mesma do bot do WhatsApp).
// Só responde para quem está logado no hub (token válido).

import Anthropic from "@anthropic-ai/sdk";
import { cors, exigirLogin } from "../lib/http.js";
import { MANUAL } from "../lib/assistente-manual.js";

const MODELO = process.env.ASSISTENTE_MODELO || "claude-sonnet-5-5";
const MAX_MENSAGENS = 12;
const MAX_CHARS_MSG = 2000;
const MAX_CHARS_CONTEXTO = 24000;

const SISTEMA = `Você é a Zuma, a assistente virtual do Hub MGB, a plataforma financeira e operacional da MGB Mídia. Quem pergunta é alguém da equipe (normalmente a Karen, que cuida do financeiro e do sucesso do cliente). Seu papel é tirar dúvidas e ensinar o caminho para a pessoa aprender o hub — você NÃO executa ações. Use o manual abaixo como fonte da verdade.

TOM: bem informal e próximo, no ritmo de quem conversa com a pessoa — como uma colega de equipe no WhatsApp. Trate por "você". Espelhe o jeito de falar dela (se ela for curta e descontraída, seja também; gírias leves como "tá", "pra", "bora" são bem-vindas, sem exagero). Linguagem simples, sem jargão técnico, frases curtas. Pode usar emojis com moderação (1 a 3 por resposta: ✅ 📌 💡 😉). Seja objetiva: pergunta rápida = 2 a 5 linhas; só detalhe mais quando for um passo a passo. Em listas de clientes, mostre no máximo os 5 mais relevantes e ofereça o resto. Nunca termine uma frase pela metade. Não repita a pergunta. Em procedimentos, numere os passos com o caminho exato (menu > aba > botão).

APRESENTAÇÃO: na primeira mensagem da conversa (quando só há uma mensagem da pessoa) se apresente em uma linha: "Oi, eu sou a Zuma! 😉" e já responda. Se a pessoa só cumprimentar ("oi", "bom dia"), responda apenas: "Oi, eu sou a Zuma! Vamos lá, no que posso ajudar? 😉".

DINHEIRO CURTO: quando a pessoa disser que está sem dinheiro, apertada ou perguntar se vai demorar a entrar grana, use os DADOS DO MÊS e seja franca e acolhedora: diga quanto ainda falta entrar, o que está pendente e o que costuma demorar (ex.: boleto em aberto, baixa manual de PIX). Oriente a ESPERAR um pouco e a NÃO gastar nem assumir novos gastos até entrar o que está previsto — sem dar conselho de investimento. Se for o caso, diga qual cobrança vale cobrar primeiro.

Se errar ou não souber, assuma com leveza e sugira confirmar com o Eder.`;

export default async function handler(req, res) {
  if (cors(req, res, { metodos: "POST,OPTIONS" })) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const usuario = await exigirLogin(req, res);
  if (!usuario) return;
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "Assistente sem chave configurada (ANTHROPIC_API_KEY no Vercel)." });

  const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};

  // Pesquisa do Planejamento Tarobá (lê o site do cliente / dados do setor com busca na web).
  if (body && body.pesquisaTaroba) return pesquisaTaroba(res, body.pesquisaTaroba);

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
        (contexto ? `\n\nDADOS DO HUB (mês atual e próximo em detalhe; 3 meses atrás até 8 à frente em resumo — vindos do hub agora):\n${contexto}` : "\n\n(Sem dados financeiros disponíveis para esta pessoa.)"),
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

/* ── Pesquisa do Planejamento Tarobá ────────────────────────────────────────
   A mesma pesquisa que vivia num Apps Script próprio (Propostas Taroba/apps-script-pesquisa):
   a etapa "texto" lê o site do cliente e escreve a abertura da proposta; a etapa "mercado"
   busca dados do setor com fontes. Veio pra cá em 23/11/2026 porque a configuração
   (URL + token) morava no localStorage do GitHub Pages e se perdeu na troca de hospedagem.
   Modelo: PESQUISA_MODELO (padrão claude-sonnet-5-5 — precisa caber nos 60 s da função). */

const PESQ_SOBRE =
  "Grupo Tarobá (TV afiliada Band em Londrina e Cascavel, Rádio Tarobá FM 101.7 e portal Tarobá News; " +
  "a TV Tarobá integra o Grupo Muffato — Super Muffato e Max Atacadista — desde 1982)";

function pesqContexto(r) {
  return "Cliente: " + (r.nome || "(sem nome)") + "\n" +
    "Segmento: " + (r.segmento || "(não informado — descubra pelo nome/site)") + "\n" +
    "Site/Instagram/informações: " + (r.site || "(não informado — pesquise o nome do cliente)") + "\n" +
    "Praças: " + (r.pracas || "Londrina e Cascavel (interior do Paraná)") + "\n" +
    "Período: " + (r.periodo || "(não informado)") + "\n" +
    "Frentes do plano: " + (Array.isArray(r.frentes) && r.frentes.length ? r.frentes.join("; ") : "TV, rádio e digital") + "\n";
}

function pesqPromptTexto(r) {
  return "Você é redator comercial do " + PESQ_SOBRE + ". Vou apresentar uma proposta comercial a este cliente.\n\n" +
    pesqContexto(r) + "\n" +
    "Leia o site do cliente (se informado) e pesquise o nome dele na internet para entender o que a empresa faz, " +
    "seu público e seu tom. Use apenas informações reais. Não invente números.\n\n" +
    "Responda SOMENTE com um JSON:\n" +
    '{"segmento":"segmento em poucas palavras","sobre":"1 frase sobre o que a empresa faz",' +
    '"headline":"título de capa, até 12 palavras (use \\n para quebrar linha)",' +
    '"destaque":"trecho EXATO do headline, sem quebra de linha, para destacar em dourado",' +
    '"sub":"1 parágrafo de gancho, até 45 palavras",' +
    '"pa_titulo":"título da tela Por que agora, 2 linhas separadas por \\n",' +
    '"pa_p1":"parágrafo sobre o mercado/categoria do cliente, até 70 palavras",' +
    '"pa_p2":"parágrafo sobre o que falta (presença de marca) e como o plano entrega, até 70 palavras"}';
}

function pesqPromptMercado(r) {
  return "Você é pesquisador de mercado do " + PESQ_SOBRE + ".\n\n" +
    pesqContexto(r) + "\n" +
    "Pesquise na internet dados do SETOR deste cliente, de fontes confiáveis e recentes (últimos 2 anos): " +
    "IBGE, associações do setor, Sebrae, NIQ, Kantar, ABRAS/APRAS, ABIA, PwC, McKinsey etc. " +
    "Prefira Paraná; se não houver, Brasil. Cada número precisa de fonte com nome e ano.\n" +
    "NÃO invente. Se não achar um dado verificável, deixe aquele item com texto vazio.\n\n" +
    "Responda SOMENTE com um JSON:\n" +
    '{"mercado":{"titulo":"título da tela, até 10 palavras","lead":"frase de abertura citando a fonte principal, até 40 palavras",' +
    '"destaques":[{"num":"+00%","texto":"o que o número significa","fonte":"Instituição · ano"},{"num":"","texto":"","fonte":""},{"num":"","texto":"","fonte":""}],' +
    '"extras":[{"num":"00%","texto":"o que significa (Fonte, ano)"},{"num":"","texto":""},{"num":"","texto":""},{"num":"","texto":""}]}}';
}

async function pesquisaTaroba(res, r) {
  try {
    const etapa = r && r.etapa === "mercado" ? "mercado" : "texto";
    const prompt = etapa === "mercado" ? pesqPromptMercado(r || {}) : pesqPromptTexto(r || {});
    const tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }];
    if (etapa === "texto") tools.push({ type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 });
    const texto = await pesqClaude(prompt, tools, etapa === "mercado" ? 4000 : 3000);
    const m = String(texto).match(/\{[\s\S]*\}/);
    if (!m) throw new Error("A IA não devolveu JSON: " + String(texto).slice(0, 200));
    return res.status(200).json({ ok: true, dados: JSON.parse(m[0]) });
  } catch (err) {
    return res.status(200).json({ ok: false, erro: String((err && err.message) || err).slice(0, 300) });
  }
}

// Chamada direta à API (sem o SDK): as ferramentas de busca/leitura de página usam o mesmo
// formato do Apps Script que já funcionava, inclusive o laço do stop_reason "pause_turn".
async function pesqClaude(prompt, tools, maxTokens) {
  const modelo = process.env.PESQUISA_MODELO || "claude-sonnet-5-5";
  const messages = [{ role: "user", content: prompt }];
  let texto = "";
  for (let i = 0; i < 5; i++) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: modelo, max_tokens: maxTokens || 4000, tools, messages }),
    });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error("API " + resp.status + ": " + String((j.error && j.error.message) || "").slice(0, 200));
    const t = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    if (t) texto = t;
    if (j.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: j.content }); continue; }
    if (j.stop_reason === "refusal") throw new Error("A API recusou esta solicitação.");
    break;
  }
  return texto;
}
