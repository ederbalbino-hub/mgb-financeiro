// Login pelo Supabase Auth (e-mail e senha): confere o token do navegador e devolve o usuário do hub.
//
// O papel, o nome e o login curto do hub ficam em app_metadata do usuário no Supabase, que só o
// servidor (secret key) consegue alterar: {papel:"admin"|"financeiro"|"programacao", nome, login}.
// Usuário apagado ou bloqueado no Supabase perde o acesso em até 1 minuto (cache abaixo).

const CACHE_MS = 60 * 1000;
const cache = new Map(); // token -> {usuario, ate}

export function pareceTokenSupabase(token) {
  return String(token || "").split(".").length === 3; // JWT; o token antigo do hub tem 2 partes
}

export async function usuarioSupabase(token, env = process.env, fetchFn = fetch) {
  const url = env.SUPABASE_URL;
  const chave = env.SUPABASE_SECRET_KEY;
  if (!url || !chave || !token) return null;
  const agora = Date.now();
  const c = cache.get(token);
  if (c && c.ate > agora) return c.usuario;

  let r;
  try {
    r = await fetchFn(`${url.replace(/\/+$/, "")}/auth/v1/user`, { headers: { apikey: chave, Authorization: `Bearer ${token}` } });
  } catch {
    return null;
  }
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  const meta = (u && u.app_metadata) || {};
  if (!u || !meta.papel) return null;
  const usuario = {
    login: String(meta.login || String(u.email || "").split("@")[0]).toLowerCase(),
    nome: meta.nome || u.email,
    papel: meta.papel,
    email: u.email,
  };
  if (cache.size > 500) cache.clear();
  cache.set(token, { usuario, ate: agora + CACHE_MS });
  return usuario;
}
