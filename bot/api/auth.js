// Login do Hub MGB.
//
// Ações (via query ?action=...):
//   GET  /api/auth?action=config  -> {ativo:true|false}  (false = login ainda não configurado no Vercel)
//   POST /api/auth?action=login   body {usuario, senha} -> {token, usuario:{login,nome,papel}}
//   GET  /api/auth?action=me      header Authorization: Bearer <token> -> {usuario:{login,nome,papel}}
//
// Variáveis de ambiente: HUB_AUTH_SECRET e HUB_USERS (ver lib/auth.js e scripts/gerar-usuarios.js).

import { carregarUsuarios, verificarSenha, assinarToken, PAPEIS_SEM_HUB } from "../lib/auth.js";
import { cors, exigirLogin } from "../lib/http.js";

function publico(u) {
  return { login: u.login, nome: u.nome, papel: u.papel };
}

export default async function handler(req, res) {
  if (cors(req, res, { metodos: "GET,POST,OPTIONS" })) return;

  const action = req.query.action || "";
  let usuarios;
  try {
    usuarios = carregarUsuarios();
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }

  if (action === "config") {
    return res.status(200).json({ ativo: !!usuarios || !!process.env.SUPABASE_URL, antigo: process.env.LOGIN_ANTIGO !== "desligado" && !!usuarios });
  }

  if (action === "me") {
    // Vale para o login novo (Supabase) e para o antigo enquanto ele estiver ligado.
    const u = await exigirLogin(req, res);
    if (!u) return;
    return res.status(200).json({ usuario: { login: u.login, nome: u.nome, papel: u.papel } });
  }

  if (process.env.LOGIN_ANTIGO === "desligado") {
    return res.status(410).json({ error: "Este login foi desativado. Entre com o seu e-mail." });
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
    if (PAPEIS_SEM_HUB.includes(u.papel)) return res.status(403).json({ error: "Seu acesso ao hub foi encerrado." });
    const token = assinarToken({ login: u.login, papel: u.papel }, process.env.HUB_AUTH_SECRET);
    return res.status(200).json({ token, usuario: publico(u) });
  }

  return res.status(400).json({ error: "Ação desconhecida. Use ?action=config, login ou me." });
}
