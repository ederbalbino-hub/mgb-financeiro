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
      const data = await proxyJson(TELAS_URL);
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
