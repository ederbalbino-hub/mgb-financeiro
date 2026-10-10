// Login do Hub MGB: usuários, senhas e tokens de sessão.
//
// Configuração (variáveis de ambiente no Vercel):
//   HUB_AUTH_SECRET  segredo longo e aleatório usado para assinar os tokens
//   HUB_USERS        JSON com os usuários, gerado por scripts/gerar-usuarios.js:
//                    {"eder":{"nome":"Eder","papel":"admin","senha":"scrypt$<salt>$<hash>"}, ...}
//
// Papéis: admin (Eder) · financeiro (Karen) · bureau (Guina) · programacao (Cleiton).
// A senha nunca é guardada em texto: só o hash scrypt com sal.

import crypto from "node:crypto";

export const PAPEIS = ["admin", "financeiro", "bureau", "programacao"];
const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// ── Senhas ────────────────────────────────────────────────────────────────
export function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(senha), sal, 64).toString("hex");
  return `scrypt$${sal}$${hash}`;
}

export function verificarSenha(senha, armazenado) {
  const partes = String(armazenado || "").split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  const [, sal, hash] = partes;
  const esperado = Buffer.from(hash, "hex");
  const calculado = crypto.scryptSync(String(senha), sal, esperado.length);
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

// ── Usuários ──────────────────────────────────────────────────────────────
export function carregarUsuarios(env = process.env) {
  if (!env.HUB_USERS || !env.HUB_AUTH_SECRET) return null; // login ainda não ativado
  let lista;
  try {
    lista = JSON.parse(env.HUB_USERS);
  } catch {
    throw new Error("HUB_USERS não é um JSON válido.");
  }
  const usuarios = {};
  for (const [login, u] of Object.entries(lista)) {
    if (!u || !PAPEIS.includes(u.papel) || !u.senha) continue;
    usuarios[login.toLowerCase()] = { login: login.toLowerCase(), nome: u.nome || login, papel: u.papel, senha: u.senha };
  }
  return usuarios;
}

// ── Tokens (HMAC-SHA256, formato corpo.assinatura em base64url) ─────────
function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

export function assinarToken(dados, segredo, agora = Date.now()) {
  const corpo = b64url(JSON.stringify({ ...dados, exp: agora + DURACAO_SESSAO_MS }));
  const assinatura = b64url(crypto.createHmac("sha256", segredo).update(corpo).digest());
  return `${corpo}.${assinatura}`;
}

export function verificarToken(token, segredo, agora = Date.now()) {
  const [corpo, assinatura] = String(token || "").split(".");
  if (!corpo || !assinatura) return null;
  const esperada = b64url(crypto.createHmac("sha256", segredo).update(corpo).digest());
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let dados;
  try {
    dados = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!dados.exp || dados.exp < agora) return null;
  return dados;
}

// ── Uso nos endpoints ─────────────────────────────────────────────────────
// Lê "Authorization: Bearer <token>" e devolve o usuário, ou null.
// Fases seguintes usam isso para travar no servidor o que cada papel pode fazer
// (ex.: só emitir NF do faturamento do dia 5 depois da aprovação do admin).
export function usuarioDaRequisicao(req, env = process.env) {
  if (!env.HUB_AUTH_SECRET) return null;
  const h = req.headers.authorization || req.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return verificarToken(token, env.HUB_AUTH_SECRET);
}
