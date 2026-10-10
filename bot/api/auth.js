// Login do Hub MGB.
//
// Ações (via query ?action=...):
//   GET  /api/auth?action=config  -> {ativo:true|false}  (false = login ainda não configurado no Vercel)
//   POST /api/auth?action=login   body {usuario, senha} -> {token, usuario:{login,nome,papel}}
//   GET  /api/auth?action=me      header Authorization: Bearer <token> -> {usuario:{login,nome,papel}}
//
// Variáveis de ambiente: HUB_AUTH_SECRET e HUB_USERS (ver lib/auth.js e scripts/gerar-usuarios.js).

import { carregarUsuarios, verificarSenha, assinarToken, usuarioDaRequisicao } from "../lib/auth.js";

function publico(u) {
  return { login: u.login, nome: u.nome, papel: u.papel };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  const action = req.query.action || "";
  let usuarios;
  try {
    usuarios = carregarUsuarios();
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }

  if (action === "config") {
    return res.status(200).json({ ativo: !!usuarios });
  }

  if (!usuarios) {
    return res.status(503).json({ error: "Login ainda não configurado (faltam HUB_USERS e HUB_AUTH_SECRET no Vercel)." });
  }

  if (action === "login") {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const login = String(body.usuario || "").trim().toLowerCase();
    const u = usuarios[login];
    if (!u || !verificarSenha(body.senha || "", u.senha)) {
      await new Promise((r) => setTimeout(r, 600)); // desacelera tentativas
      return res.status(401).json({ error: "Usuário ou senha incorretos." });
    }
    const token = assinarToken({ login: u.login, papel: u.papel }, process.env.HUB_AUTH_SECRET);
    return res.status(200).json({ token, usuario: publico(u) });
  }

  if (action === "me") {
    const dados = usuarioDaRequisicao(req);
    const u = dados && usuarios[dados.login];
    // O papel vem sempre do cadastro atual: trocar o papel no Vercel vale na próxima verificação.
    if (!u) return res.status(401).json({ error: "Sessão expirada. Entre de novo." });
    return res.status(200).json({ usuario: publico(u) });
  }

  return res.status(400).json({ error: "Ação desconhecida. Use ?action=config, login ou me." });
}
