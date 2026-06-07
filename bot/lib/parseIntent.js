// Chama Claude para classificar a mensagem e extrair os campos estruturados.
// System prompt é cacheado (prefix-match prompt caching); a lista de módulos
// vai depois do breakpoint pra não invalidar o cache quando o usuário
// adicionar/remover clientes.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_BASE = `Você é um assistente financeiro que processa mensagens em português brasileiro do dono de uma empresa de mídia (MGB Mídia). O objetivo é classificar a intenção do usuário e extrair os dados estruturados pra registrar no sistema.

A empresa tem 6 módulos: MB (Móveis Brasília), Elevadores, Vaapty, Rádio Interna, TV Interna, Tarobá. Cada módulo tem unidades/clientes.

Sua tarefa: classificar a mensagem em uma das categorias:

1. "despesa" — usuário lançou uma despesa/compra
   Extraia: modId, item (cliente/unidade), descricao, fornecedor, valor (number), tipo ("À vista" | "Parcelado" | "Recorrente"), nparc (se Parcelado, number), mesesRec (se Recorrente, number, default 12), dataInicio ("YYYY-MM", default mês corrente)
   Exemplos:
   - "gastei 50 reais em cabo HDMI no Tecmax pra Calçadão" → {tipo:"despesa", modId:"mb", item:"Calçadão", descricao:"Cabo HDMI", fornecedor:"Tecmax", valor:50, tipo:"À vista"}
   - "comprei TV de 3000 parcelada em 10x do Magalu pra Lake Portinari" → {tipo:"despesa", modId:"elev", item:"Lake Portinari", descricao:"TV", fornecedor:"Magalu", valor:3000, tipo:"Parcelado", nparc:10}

2. "receita" — cliente pagou / recebeu valor
   Extraia: modId, item, ano (number), mes (0-indexed, 0=Janeiro). Default ano/mes = mês corrente.
   Exemplos:
   - "recebi do Leo Cosméticos" → {tipo:"receita", modId:"radio", item:"Leo Cosméticos"}
   - "Mercadão Prochet pagou janeiro" → {tipo:"receita", modId:"radio", item:"Mercadão Prochet", mes:0}

3. "saldo" — consulta de saldo do mês
   Extraia: ano (number, opcional), mes (0-indexed, opcional, default mês corrente)
   Exemplos:
   - "saldo do mês" → {tipo:"saldo"}
   - "quanto entrou em maio?" → {tipo:"saldo", mes:4}

4. "outro" — qualquer outra coisa (saudação, dúvida, comando não-suportado)
   Retorne: {tipo:"outro", razao:"explicação curta do que entendeu da mensagem"}

REGRAS IMPORTANTES:
- modId DEVE ser um dos: "mb", "elev", "vaapty", "radio", "tv", "taroba"
- item DEVE bater EXATAMENTE com um dos clientes/unidades listados no contexto (use match insensitive a acentos e maiúsculas, mas retorne o nome exato como está na lista)
- Se o usuário não especificar a unidade claramente e o módulo tiver várias, retorne tipo:"outro" pedindo pra ser mais específico
- valor sempre como number (sem R$, sem vírgula como decimal: "R$ 1.500,00" → 1500)
- Se for despesa sem fornecedor, deixe fornecedor:""
- Se a mensagem for ambígua, retorne tipo:"outro" explicando

Responda SEMPRE com JSON válido, nada além disso.`;

const SCHEMA = {
  type: "object",
  oneOf: [
    {
      type: "object",
      properties: {
        tipo: { const: "despesa" },
        modId: { type: "string", enum: ["mb", "elev", "vaapty", "radio", "tv", "taroba"] },
        item: { type: "string" },
        descricao: { type: "string" },
        fornecedor: { type: "string" },
        valor: { type: "number" },
        tipoPag: { type: "string", enum: ["À vista", "Parcelado", "Recorrente"] },
        nparc: { type: "number" },
        mesesRec: { type: "number" },
        dataInicio: { type: "string" },
      },
      required: ["tipo", "modId", "item", "descricao", "valor", "tipoPag"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        tipo: { const: "receita" },
        modId: { type: "string", enum: ["mb", "elev", "vaapty", "radio", "tv", "taroba"] },
        item: { type: "string" },
        ano: { type: "number" },
        mes: { type: "number" },
      },
      required: ["tipo", "modId", "item"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        tipo: { const: "saldo" },
        ano: { type: "number" },
        mes: { type: "number" },
      },
      required: ["tipo"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        tipo: { const: "outro" },
        razao: { type: "string" },
      },
      required: ["tipo", "razao"],
      additionalProperties: false,
    },
  ],
};

export async function parseIntent(userMessage, modulos) {
  const contexto =
    "MÓDULOS E UNIDADES DISPONÍVEIS:\n" +
    modulos.map((m) => `- ${m.id} (${m.label}): ${m.items.join(", ")}`).join("\n") +
    `\n\nMês corrente: ${new Date().getMonth()} (0-indexed), ano corrente: ${new Date().getFullYear()}.`;

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: SYSTEM_BASE,
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: contexto },
    ],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content.find((b) => b.type === "text")?.text || "{}";
  return JSON.parse(text);
}
