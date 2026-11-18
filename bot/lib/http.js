// Trava comum dos endpoints do hub: CORS só para o domínio do hub + login obrigatório por papel.
//
// Antes (até 11/2026) cada endpoint devolvia a própria origem de quem chamou no
// Access-Control-Allow-Origin e não pedia login: qualquer pessoa com a URL emitia nota fiscal,
// lia o banco (Pluggy) e mandava e-mail em nome da MGB. Agora:
//
//   1. CORS: só as origens de HUB_ORIGINS (ou, sem a variável, o GitHub Pages do hub).
//      CORS só impede OUTRO SITE de chamar a API pelo navegador da vítima. Não barra curl/scripts.
//   2. Login: a barreira de verdade. Exige "Authorization: Bearer <token do /api/auth>", confere a
//      assinatura e o papel ATUAL do usuário em HUB_USERS (tirar alguém do HUB_USERS corta o acesso
//      na hora, sem esperar o token expirar).
//
// Fail-closed: sem HUB_AUTH_SECRET/HUB_USERS no Vercel, os endpoints protegidos respondem 503.

import { carregarUsuarios, usuarioDaRequisicao } from "./auth.js";
import { pareceTokenSupabase, usuarioSupabase } from "./supabaseAuth.js";

export const ORIGENS_PADRAO = ["https://ederbalbino-hub.github.io"];

export function origensPermitidas(env = process.env) {
  const lista = String(env.HUB_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return lista.length ? lista : ORIGENS_PADRAO;
}

// Aplica os cabeçalhos de CORS. Devolve true se a requisição já foi respondida (preflight).
export function cors(req, res, { metodos = "GET,POST,OPTIONS", env = process.env } = {}) {
  const origin = req.headers.origin;
  res.setHeader("Vary", "Origin");
  if (origin && origensPermitidas(env).includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", metodos);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(origin && origensPermitidas(env).includes(origin) ? 204 : 403).end();
    return true;
  }
  return false;
}

// Exige login (e, se informado, um dos papéis). Devolve o usuário ou null (já respondeu o erro).
//
// Dois logins convivem durante a troca:
//   - novo: Supabase Auth (e-mail e senha), token JWT; papel em app_metadata (lib/supabaseAuth.js);
//   - antigo: HUB_USERS/HUB_AUTH_SECRET (lib/auth.js). Desligado com LOGIN_ANTIGO=desligado no Vercel.
export async function exigirLogin(req, res, papeis = null, env = process.env, fetchFn = fetch) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const antigoLigado = env.LOGIN_ANTIGO !== "desligado";

  let u = null;
  if (pareceTokenSupabase(token)) {
    u = await usuarioSupabase(token, env, fetchFn);
  } else if (antigoLigado) {
    let usuarios;
    try {
      usuarios = carregarUsuarios(env);
    } catch {
      res.status(500).json({ error: "Cadastro de usuários inválido no servidor." });
      return null;
    }
    if (!usuarios && !env.SUPABASE_URL) {
      res.status(503).json({ error: "Login não configurado no servidor." });
      return null;
    }
    const dados = usuarios && usuarioDaRequisicao(req, env);
    const cad = dados && usuarios[dados.login];
    if (cad) u = { login: cad.login, nome: cad.nome, papel: cad.papel };
  }

  if (!u) {
    res.status(401).json({ error: "Sessão expirada. Entre de novo no hub." });
    return null;
  }
  if (papeis && !papeis.includes(u.papel)) {
    res.status(403).json({ error: "Seu usuário não tem permissão para esta ação." });
    return null;
  }
  return { login: u.login, nome: u.nome, papel: u.papel, email: u.email };
}

// Quem mexe com dinheiro, nota fiscal e banco.
export const PAPEIS_FINANCEIRO = ["admin", "financeiro"];
