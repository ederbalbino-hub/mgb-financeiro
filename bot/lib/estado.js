// Estado do hub no Supabase (projeto "MGB Hub"), usado SÓ no servidor.
//
// Substitui o JSON no Drive servido pelo Apps Script. As regras de proteção ficam no banco
// (migração hub_estado): trava de versão, recusa de estado vazio/encolhido e histórico de cada
// salvamento (public.hub_estado_historico). Aqui só chamamos as funções carregar_estado/salvar_estado.
//
// Variáveis no Vercel:
//   SUPABASE_URL         https://<ref>.supabase.co
//   SUPABASE_SECRET_KEY  secret key (sb_secret_…) ou service_role — NUNCA no navegador
//   APPS_SCRIPT_URL      (opcional) só para a importação única: se o banco estiver vazio na primeira
//                        leitura, copia o estado atual do Apps Script para o Supabase.

import { ErroEstado, lerEstado as lerDoAppsScript } from "./appsScript.js";

export { ErroEstado };

function config(env) {
  const url = env.SUPABASE_URL;
  const chave = env.SUPABASE_SECRET_KEY;
  if (!url || !chave) throw new ErroEstado("Servidor sem SUPABASE_URL/SUPABASE_SECRET_KEY configurados.", { status: 503 });
  return { url: url.replace(/\/+$/, ""), chave };
}

async function rpc(env, fetchFn, funcao, corpo) {
  const { url, chave } = config(env);
  const headers = { "Content-Type": "application/json", apikey: chave };
  if (chave.startsWith("eyJ")) headers.Authorization = `Bearer ${chave}`; // chave legada (JWT service_role)
  const r = await fetchFn(`${url}/rest/v1/rpc/${funcao}`, { method: "POST", headers, body: JSON.stringify(corpo || {}) });
  const texto = await r.text();
  if (!r.ok) {
    console.error(`supabase ${funcao}: ${r.status} ${texto.slice(0, 200)}`);
    throw new ErroEstado(`Banco respondeu ${r.status}.`);
  }
  return JSON.parse(texto);
}

async function salvarNoBanco(texto, versaoEsperada, quem, env, fetchFn) {
  const j = await rpc(env, fetchFn, "salvar_estado", {
    p_dados: texto,
    p_versao_esperada: versaoEsperada ?? null,
    p_login: quem?.login ?? null,
    p_nome: quem?.nome ?? null,
  });
  if (j.conflito) throw new ErroEstado("Outra pessoa salvou antes. Recarregando para mesclar.", { status: 409, conflito: true, versao: j.v });
  if (!j.ok) throw new ErroEstado(`Banco recusou: ${j.erro || "erro desconhecido"}`, { status: 422 });
  return { ok: true, versao: Number(j.v) || 0 };
}

// Lê o estado. A versão que vale é a da coluna `versao` (o _v dentro do JSON é sobrescrito com ela).
export async function lerEstado(env = process.env, fetchFn = fetch) {
  let linhas = await rpc(env, fetchFn, "carregar_estado");
  if (!linhas.length && env.APPS_SCRIPT_URL) {
    // Importação única: o banco ainda está vazio — copia o estado que está hoje no Apps Script.
    const origem = await lerDoAppsScript(env, fetchFn, { segredoOpcional: true });
    try {
      await salvarNoBanco(origem.texto, null, { login: "importacao", nome: "Importação do Apps Script" }, env, fetchFn);
      console.log(`estado: importado do Apps Script (${origem.texto.length} bytes, _v ${origem.versao})`);
    } catch (e) {
      if (!e.conflito) throw e; // outra requisição importou ao mesmo tempo: tudo bem
    }
    linhas = await rpc(env, fetchFn, "carregar_estado");
  }
  if (!linhas.length) throw new ErroEstado("Banco sem estado (e sem APPS_SCRIPT_URL para importar).", { status: 503 });

  const { dados, versao } = linhas[0];
  let estado;
  try {
    estado = JSON.parse(dados);
  } catch {
    throw new ErroEstado("Estado no banco não é JSON válido.");
  }
  estado._v = Number(versao) || 0;
  return { texto: JSON.stringify(estado), estado, versao: estado._v };
}

// Grava o estado inteiro. `versaoEsperada` = a versão lida; `quem` = {login, nome} de quem salvou.
export async function gravarEstado(textoOuObjeto, versaoEsperada, quem = null, env = process.env, fetchFn = fetch) {
  let obj;
  try {
    obj = typeof textoOuObjeto === "string" ? JSON.parse(textoOuObjeto) : textoOuObjeto;
  } catch {
    throw new ErroEstado("Estado a gravar não é JSON válido.", { status: 400 });
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || !Object.keys(obj).length) {
    throw new ErroEstado("Recusei gravar estado vazio.", { status: 400 });
  }
  if (versaoEsperada !== undefined && versaoEsperada !== null) obj._v = Number(versaoEsperada) + 1;
  return salvarNoBanco(JSON.stringify(obj), versaoEsperada, quem, env, fetchFn);
}
