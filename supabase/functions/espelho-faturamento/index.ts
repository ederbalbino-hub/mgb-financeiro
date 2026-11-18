// Espelho da planilha "MGB Faturamento - Clientes" em public.fat_clientes.
//
// Chamada pelo pg_cron (de hora em hora) com o cabeçalho x-espelho-segredo, que é conferido no
// banco (public.espelho_segredo_ok, segredo no Vault). Lê as linhas ativas pelo Apps Script
// (action=listar, com o FATURAMENTO_SECRET) e entrega para public.espelhar_clientes_da_planilha.
//
// Segredos da função: FATURAMENTO_API_URL e FATURAMENTO_SECRET (os mesmos do Vercel).
// Publicada com verify_jwt = false: a autenticação é o segredo acima.

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

async function rpc(fn: string, body: unknown) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${texto.slice(0, 200)}`);
  return JSON.parse(texto);
}

Deno.serve(async (req) => {
  try {
    const ok = await rpc("espelho_segredo_ok", { p_segredo: req.headers.get("x-espelho-segredo") || "" });
    if (ok !== true) return json({ ok: false, erro: "forbidden" }, 403);

    const base = Deno.env.get("FATURAMENTO_API_URL");
    const segredo = Deno.env.get("FATURAMENTO_SECRET");
    if (!base || !segredo) return json({ ok: false, erro: "faltam FATURAMENTO_API_URL/FATURAMENTO_SECRET" }, 503);

    const u = new URL(base);
    u.searchParams.set("action", "listar");
    u.searchParams.set("s", segredo);
    const r = await fetch(u.toString(), { redirect: "follow" });
    const j = await r.json().catch(() => null);
    if (!j || !Array.isArray(j.rows)) return json({ ok: false, erro: (j && j.erro) || "planilha não respondeu" }, 502);

    const res = await rpc("espelhar_clientes_da_planilha", { p_linhas: j.rows });
    console.log("espelho-faturamento:", JSON.stringify(res));
    return json(res, res.ok ? 200 : 502);
  } catch (e) {
    console.error("espelho-faturamento:", String((e as Error).message || e));
    return json({ ok: false, erro: "falha no espelho" }, 500);
  }
});
