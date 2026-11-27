// Registro de ações do hub (tabela public.hub_log, migração 20261127200000_hub_log.sql), usado SÓ no servidor.
//
// Uma linha por ação que altera algo: salvamento do estado, emissão/cancelamento no Asaas, e-mail enviado,
// inclusão/marcação no Faturamento, envio para assinatura. Pedido do Diego (27/11/2026): tudo o que a Karen
// fizer fica registrado para consulta. Vale para todos os usuários.
//
// registrarLog NUNCA lança erro: se o banco falhar (ou a tabela ainda não existir), só escreve no console.
// Uma falha no log jamais pode impedir a Karen de salvar ou emitir.

const SECOES_META = new Set(["_v", "_salvoPor", "_salvoLogin", "_salvoEm", "_acoes"]);
const MAX_ACOES = 20;
const MAX_CHARS = 200;

export async function registrarLog(env = process.env, fetchFn = fetch, { usuario = null, origem, acao, secoes = null, detalhe = null, versao = null } = {}) {
  try {
    const url = env.SUPABASE_URL;
    const chave = env.SUPABASE_SECRET_KEY;
    if (!url || !chave) return false;
    const headers = { "Content-Type": "application/json", apikey: chave };
    if (chave.startsWith("eyJ")) headers.Authorization = `Bearer ${chave}`;
    const r = await fetchFn(`${url.replace(/\/+$/, "")}/rest/v1/rpc/registrar_log`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_origem: String(origem || "?"),
        p_acao: String(acao || "").slice(0, 4000),
        p_login: usuario?.login ?? null,
        p_nome: usuario?.nome ?? null,
        p_papel: usuario?.papel ?? null,
        p_secoes: secoes && secoes.length ? secoes : null,
        p_detalhe: detalhe ?? null,
        p_versao: versao ?? null,
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error(`log: banco respondeu ${r.status} ${String(t).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("log:", e?.message || e);
    return false;
  }
}

// Lista de ações que o navegador mandou em _acoes: só strings, no máximo 20, 200 caracteres cada.
export function limparAcoes(acoes) {
  if (!Array.isArray(acoes)) return [];
  return acoes
    .filter((a) => typeof a === "string" && a.trim())
    .slice(0, MAX_ACOES)
    .map((a) => a.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS));
}

const idDe = (x) => (x && typeof x === "object" && (x.id ?? x.patCode ?? null)) ?? null;

// Seções de topo que mudaram entre o estado anterior e o gravado (+ detalhe pequeno das listas).
export function compararEstados(antes = {}, depois = {}) {
  const secoes = [];
  const detalhe = {};
  const chaves = new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})]);
  for (const k of chaves) {
    if (SECOES_META.has(k) || k.startsWith("_")) continue;
    const a = antes?.[k];
    const d = depois?.[k];
    if (JSON.stringify(a) === JSON.stringify(d)) continue;
    secoes.push(k);
    if (Array.isArray(a) || Array.isArray(d)) {
      const la = Array.isArray(a) ? a : [];
      const ld = Array.isArray(d) ? d : [];
      const ia = new Set(la.map(idDe).filter((x) => x != null).map(String));
      const id = new Set(ld.map(idDe).filter((x) => x != null).map(String));
      const add = [...id].filter((x) => !ia.has(x));
      const rem = [...ia].filter((x) => !id.has(x));
      const mapa = new Map(la.filter((x) => idDe(x) != null).map((x) => [String(idDe(x)), JSON.stringify(x)]));
      const alt = ld.filter((x) => idDe(x) != null && mapa.has(String(idDe(x))) && mapa.get(String(idDe(x))) !== JSON.stringify(x)).map((x) => String(idDe(x)));
      detalhe[k] = { antes: la.length, depois: ld.length };
      if (add.length) detalhe[k].incluidos = add.slice(0, 10);
      if (rem.length) detalhe[k].removidos = rem.slice(0, 10);
      if (alt.length) detalhe[k].alterados = alt.slice(0, 10);
    } else if (a && d && typeof a === "object" && typeof d === "object") {
      const sub = new Set([...Object.keys(a), ...Object.keys(d)]);
      const mud = [...sub].filter((s) => JSON.stringify(a[s]) !== JSON.stringify(d[s]));
      detalhe[k] = { chaves: mud.slice(0, 15), ...(mud.length > 15 ? { maisChaves: mud.length - 15 } : {}) };
    }
  }
  secoes.sort();
  return { secoes, detalhe };
}
