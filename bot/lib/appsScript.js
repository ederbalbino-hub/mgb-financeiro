// Cliente do Apps Script do hub (estado inteiro num JSON no Drive), usado SÓ no servidor.
// Desde a ida para o Supabase (lib/estado.js) só serve para a importação única dos dados.
//
// Desde 11/2026 o Apps Script só responde a quem manda ?s=<HUB_STATE_SECRET>. O navegador não
// conhece nem a URL nem o segredo: o hub fala com /api/estado (que exige login) e /api/estado
// chama aqui. O bot do WhatsApp e /api/rede também passam por aqui.
//
// Variáveis no Vercel:
//   APPS_SCRIPT_URL   URL /exec da implantação do script principal
//   HUB_STATE_SECRET  o mesmo valor guardado em Script Properties → HUB_STATE_SECRET no Apps Script

export class ErroEstado extends Error {
  constructor(msg, { status = 502, conflito = false, versao = null } = {}) {
    super(msg);
    this.status = status;
    this.conflito = conflito;
    this.versao = versao;
  }
}

function urlComSegredo(env, extra = {}, { segredoOpcional = false } = {}) {
  const base = env.APPS_SCRIPT_URL;
  const segredo = env.HUB_STATE_SECRET;
  if (!base || (!segredo && !segredoOpcional)) throw new ErroEstado("Servidor sem APPS_SCRIPT_URL/HUB_STATE_SECRET configurados.", { status: 503 });
  const u = new URL(base);
  if (segredo) u.searchParams.set("s", segredo);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  return u.toString();
}

// Lê o estado. Devolve o TEXTO cru (para repassar ao hub sem reserializar) e o objeto.
// Nunca devolve estado vazio em silêncio: resposta que não é um objeto JSON com conteúdo vira erro.
// (Antes, um erro do Apps Script virava {} e o bot gravava esse {} por cima de tudo.)
// segredoOpcional: só para a importação única para o Supabase (lib/estado.js), quando o script
// antigo ainda não exige segredo.
export async function lerEstado(env = process.env, fetchFn = fetch, { segredoOpcional = false } = {}) {
  const r = await fetchFn(urlComSegredo(env, { t: Date.now() }, { segredoOpcional }), { method: "GET", redirect: "follow" });
  const texto = await r.text();
  if (!r.ok) throw new ErroEstado(`Apps Script respondeu ${r.status}.`);
  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    throw new ErroEstado(texto.trim() === "forbidden" ? "Apps Script recusou o segredo (HUB_STATE_SECRET diferente?)." : "Apps Script não devolveu JSON.");
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || !Object.keys(obj).length) {
    throw new ErroEstado("Apps Script devolveu estado vazio — nada foi carregado.");
  }
  return { texto, estado: obj, versao: Number(obj._v) || 0 };
}

// Grava o estado inteiro. `versaoEsperada` = o _v que estava no servidor quando você leu:
// se outra pessoa gravou no meio tempo, o Apps Script recusa (conflito) em vez de atropelar.
export async function gravarEstado(textoOuObjeto, versaoEsperada, env = process.env, fetchFn = fetch) {
  const corpo = typeof textoOuObjeto === "string" ? textoOuObjeto : JSON.stringify(textoOuObjeto);
  let obj;
  try {
    obj = JSON.parse(corpo);
  } catch {
    throw new ErroEstado("Estado a gravar não é JSON válido.", { status: 400 });
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || !Object.keys(obj).length) {
    throw new ErroEstado("Recusei gravar estado vazio.", { status: 400 });
  }
  const r = await fetchFn(urlComSegredo(env, { v: versaoEsperada }), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: corpo,
    redirect: "follow",
  });
  const texto = await r.text();
  let j;
  try {
    j = JSON.parse(texto);
  } catch {
    throw new ErroEstado("Apps Script não confirmou a gravação.");
  }
  if (j.conflito) throw new ErroEstado("Outra pessoa salvou antes. Recarregando para mesclar.", { status: 409, conflito: true, versao: j.v });
  if (!j.ok) throw new ErroEstado(j.erro === "forbidden" ? "Apps Script recusou o segredo." : `Apps Script recusou: ${j.erro || "erro desconhecido"}`);
  return { ok: true, versao: Number(j.v) || 0 };
}
