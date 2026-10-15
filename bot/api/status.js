// Proxy pros painéis de monitoramento que já existem em agenciamgb.com.br
// (telas 4YouSee e rádio Vaapty). Existem só pra contornar CORS — o
// index.html (outra origem, GitHub Pages) não consegue chamar esses PHPs
// direto do navegador.
//
// Ações (via query ?action=...):
//   GET /api/status?action=telas  -> painel 4YouSee (telas/api.php)
//   GET /api/status?action=radio  -> unidades conectadas na rádio Vaapty (ouvintes.php)

const TELAS_URL = "https://agenciamgb.com.br/telas/api.php";
const RADIO_URL = "https://agenciamgb.com.br/radios/vaapty/status/ouvintes.php";

async function proxyJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} falhou (${r.status})`);
  return r.json();
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
    if (action === "telas") {
      // Preferido: consulta a API do 4YouSee direto, com o token na variável de ambiente FOURYOUSEE_TOKEN
      // (o token NUNCA vai pro repositório/index.html). Sem a variável, cai no painel PHP antigo.
      const token = process.env.FOURYOUSEE_TOKEN;
      if (token) {
        const players = [];
        let pagina = 1, totalPaginas = 1;
        do {
          const r = await fetch(`https://api.4yousee.com.br/v1/players?limit=100&page=${pagina}`, { headers: { "Secret-Token": token } });
          if (!r.ok) return res.status(200).json({ success: false, error: `4YouSee respondeu ${r.status}` });
          const j = await r.json();
          totalPaginas = j.totalPages || 1;
          (j.results || []).forEach((p) => {
            const min = p.lastContactInMinutes;
            const tempo = min == null ? "—" : min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
            players.push({
              id: p.id, name: p.name, description: p.description || "", platform: p.platform || "",
              group: (p.group && p.group.name) || "", statusName: (p.playerStatus && p.playerStatus.name) || "",
              lastContactInMinutes: min, tempoFormatado: tempo, lastLogReceived: p.lastLogReceived || "", tags: p.tags || [],
            });
          });
          pagina++;
        } while (pagina <= totalPaginas && pagina <= 10);
        return res.status(200).json({ success: true, players });
      }
      const data = await proxyJson(process.env.TELAS_URL || TELAS_URL);
      return res.status(200).json(data);
    }

    if (action === "radio") {
      const data = await proxyJson(RADIO_URL);
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: "Ação desconhecida. Use ?action=telas ou ?action=radio." });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
