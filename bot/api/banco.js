// Integração bancária via Pluggy (Open Finance) — C6, Bradesco, etc.
// A CHAVE SECRETA do Pluggy fica SÓ aqui no backend (env vars), nunca no index.html.
//
// Ações (via query ?action=...):
//   GET  /api/banco?action=connect-token[&itemId=...]  -> token pro widget Pluggy Connect (frontend)
//   GET  /api/banco?action=items                       -> conexões já criadas (itemId + banco + status)
//   GET  /api/banco?action=transactions&itemId=...      -> lançamentos normalizados pro import do MGB
//
// Formato de saída de "transactions" (igual ao que o import de PDF já usa no index.html):
//   { periodo:{ini,fim}, txns:[ {data:'DD/MM/YYYY', historico, valor, lado:'rec'|'desp', docto, src, conta} ] }

const PLUGGY_API = "https://api.pluggy.ai";

// --- autentica com CLIENT_ID/SECRET e devolve a apiKey (validade 2h) ---
async function getApiKey() {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Faltam PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET nas variáveis de ambiente.");
  }
  const r = await fetch(`${PLUGGY_API}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!r.ok) throw new Error(`Pluggy /auth falhou (${r.status}): ${await r.text()}`);
  const j = await r.json();
  return j.apiKey;
}

async function pluggyGet(path, apiKey) {
  const r = await fetch(`${PLUGGY_API}${path}`, { headers: { "X-API-KEY": apiKey } });
  if (!r.ok) throw new Error(`Pluggy GET ${path} falhou (${r.status}): ${await r.text()}`);
  return r.json();
}

// mapeia o "connector" do Pluggy pra uma sigla curta de origem (dedup do MGB)
function srcFromConnector(name = "") {
  const n = name.toLowerCase();
  if (n.includes("c6")) return "c6";
  if (n.includes("bradesco")) return "brad";
  if (n.includes("pluggy")) return "sandbox"; // banco fake do sandbox
  return n.replace(/[^a-z0-9]+/g, "").slice(0, 8) || "of";
}

const pad = (n) => String(n).padStart(2, "0");
function toBR(isoDate) {
  // Pluggy manda date ISO (ex: 2026-07-12T00:00:00.000Z) -> 'DD/MM/YYYY'
  const d = new Date(isoDate);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export default async function handler(req, res) {
  // CORS: o index.html (outra origem) precisa chamar este endpoint.
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const action = req.query.action || "";

  try {
    // ── token pro widget Pluggy Connect (frontend conecta/atualiza a conta) ──
    if (action === "connect-token") {
      const apiKey = await getApiKey();
      const body = {};
      if (req.query.itemId) body.itemId = req.query.itemId; // atualizar/reconsentir item existente
      const r = await fetch(`${PLUGGY_API}/connect_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Pluggy /connect_token falhou (${r.status}): ${await r.text()}`);
      const j = await r.json();
      return res.status(200).json({ accessToken: j.accessToken });
    }

    // ── lista as conexões (items) já criadas nesta conta Pluggy ──
    if (action === "items") {
      const apiKey = await getApiKey();
      const j = await pluggyGet(`/items`, apiKey).catch(() => ({ results: [] }));
      const items = (j.results || []).map((it) => ({
        itemId: it.id,
        banco: it.connector?.name || "?",
        src: srcFromConnector(it.connector?.name),
        status: it.status,
        ultimaAtualizacao: it.lastUpdatedAt,
      }));
      return res.status(200).json({ items });
    }

    // ── transações de um item, normalizadas pro import do MGB ──
    if (action === "transactions") {
      const itemId = req.query.itemId;
      if (!itemId) return res.status(400).json({ error: "Falta itemId." });
      const apiKey = await getApiKey();

      // janela padrão: últimos 90 dias (ou ?from=YYYY-MM-DD&to=YYYY-MM-DD)
      const today = new Date();
      const from = req.query.from || new Date(today.getTime() - 90 * 864e5).toISOString().slice(0, 10);
      const to = req.query.to || today.toISOString().slice(0, 10);

      const item = await pluggyGet(`/items/${itemId}`, apiKey);
      const src = srcFromConnector(item.connector?.name);
      const accounts = await pluggyGet(`/accounts?itemId=${itemId}`, apiKey);

      // v2 /transactions só aceita accountId + cursor (sem from/to) e vem do mais NOVO pro mais antigo.
      // Filtramos a janela [from, to] no cliente e paramos de paginar ao passar do 'from'.
      const fromMs = new Date(from + "T00:00:00Z").getTime();
      const toMs = new Date(to + "T23:59:59Z").getTime();
      const txns = [];
      for (const acc of accounts.results || []) {
        let url = `${PLUGGY_API}/v2/transactions?accountId=${acc.id}`;
        let stop = false;
        while (url && !stop) {
          const r = await fetch(url, { headers: { "X-API-KEY": apiKey } });
          if (!r.ok) throw new Error(`Pluggy GET /v2/transactions falhou (${r.status}): ${await r.text()}`);
          const t = await r.json();
          for (const x of t.results || []) {
            const dms = new Date(x.date).getTime();
            if (dms < fromMs) { stop = true; break; }  // ordenado desc -> daqui pra frente só mais antigo
            if (dms > toMs) continue;                  // fora do topo da janela
            // sinal do amount é confiável em conta E cartão (o campo `type` inverte no cartão):
            // negativo = dinheiro saindo (despesa) · positivo = dinheiro entrando (receita)
            const lado = x.amount < 0 ? "desp" : "rec";
            txns.push({
              data: toBR(x.date),
              historico: x.description || x.descriptionRaw || "",
              valor: Math.abs(x.amount),       // amount vem signed; guardamos sempre positivo
              lado,
              docto: x.id,                      // id único do Pluggy -> dedup estável
              src,                              // 'c6' | 'brad' | 'sandbox' -> prefixo de dedup
              conta: acc.name || acc.number || acc.type || "",
            });
          }
          url = stop ? null : (t.next || null);
        }
      }

      // ordena por data asc (igual ao extrato)
      txns.sort((a, b) => {
        const pa = a.data.split("/").reverse().join(""), pb = b.data.split("/").reverse().join("");
        return pa.localeCompare(pb);
      });

      return res.status(200).json({
        periodo: { ini: from.split("-").reverse().join("/"), fim: to.split("-").reverse().join("/") },
        banco: item.connector?.name || "",
        src,
        txns,
      });
    }

    return res.status(400).json({ error: `Ação desconhecida: '${action}'. Use connect-token | items | transactions.` });
  } catch (e) {
    console.error("banco.js:", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
