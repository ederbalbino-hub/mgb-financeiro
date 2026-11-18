// Gravação em paralelo do Faturamento no Supabase (etapa 3a, decisão de 18/11/2026).
//
// Tudo o que vai para a planilha "MGB Faturamento - Clientes" (incluir cliente, marcar emitido,
// status de pagamento) também é gravado nas tabelas fat_* na hora. A planilha continua sendo a fonte
// oficial: estas funções NUNCA derrubam a operação — erro só vai para o log (e a conferência diária
// mostra se algo ficou diferente).

async function rpc(funcao, corpo, env, fetchFn) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const chave = env.SUPABASE_SECRET_KEY;
  if (!url || !chave) return null;
  const headers = { apikey: chave, "Content-Type": "application/json" };
  if (chave.startsWith("eyJ")) headers.Authorization = `Bearer ${chave}`;
  try {
    const r = await fetchFn(`${url}/rest/v1/rpc/${funcao}`, { method: "POST", headers, body: JSON.stringify(corpo) });
    if (!r.ok) {
      console.error(`faturamento-db ${funcao}: ${r.status} ${(await r.text()).slice(0, 160)}`);
      return null;
    }
    return true;
  } catch (e) {
    console.error(`faturamento-db ${funcao}:`, e.message || e);
    return null;
  }
}

// Mesmos parâmetros que o hub manda para o Apps Script (action=incluir).
export function registrarInclusao(params, quem, env = process.env, fetchFn = fetch) {
  return rpc("fat_registrar_inclusao", { p: params, p_origem: `hub: ${quem || "?"}` }, env, fetchFn);
}

// action=marcar-emitido: id, mesRef, nfNumero, valorBoleto, paymentId.
export function registrarEmissao(params, quem, env = process.env, fetchFn = fetch) {
  return rpc(
    "fat_registrar_emissao",
    {
      p_id: params.id,
      p_mes: params.mesRef,
      p_nf: params.nfNumero || "",
      p_valor_boleto: params.valorBoleto || "",
      p_payment_id: params.paymentId || "",
      p_origem: `hub: ${quem || "?"}`,
    },
    env,
    fetchFn,
  );
}

// Webhook do Asaas.
export function registrarPagamento(paymentId, status, env = process.env, fetchFn = fetch) {
  return rpc("fat_registrar_pagamento", { p_payment_id: paymentId, p_status: status, p_origem: "webhook do Asaas" }, env, fetchFn);
}
