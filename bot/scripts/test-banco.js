// Testa o endpoint api/banco.js localmente, sem Vercel/deploy.
// Uso:
//   1) crie bot/.env com PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET
//   2) crie uma conexão sandbox no Pluggy Dashboard (ou conecte o C6)
//   3) cd bot && node scripts/test-banco.js            -> lista as conexões (items)
//      cd bot && node scripts/test-banco.js <itemId>   -> baixa as transações normalizadas
//
// Ele chama o MESMO handler que roda no Vercel, com req/res simulados.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));

// carrega bot/.env (parser simples, sem dependência)
try {
  const env = readFileSync(join(__dir, "..", ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  console.error("⚠  Não achei bot/.env — crie a partir de .env.example com as credenciais Pluggy.");
  process.exit(1);
}

const handler = (await import("../api/banco.js")).default;

// req/res simulados no formato Vercel
function fakeReq(query) {
  return { method: "GET", headers: { origin: "http://localhost" }, query };
}
function fakeRes() {
  const res = {
    _status: 200, _json: null, _body: null,
    setHeader() { return res; },
    status(c) { res._status = c; return res; },
    json(o) { res._json = o; return res; },
    send(b) { res._body = b; return res; },
    end() { return res; },
  };
  return res;
}

async function call(query) {
  const res = fakeRes();
  await handler(fakeReq(query), res);
  return { status: res._status, data: res._json ?? res._body };
}

const itemId = process.argv[2];

if (!itemId) {
  console.log("→ Listando conexões (action=items)…\n");
  const r = await call({ action: "items" });
  console.log("HTTP", r.status);
  console.dir(r.data, { depth: 4 });
  if (r.data?.items?.length) {
    console.log("\n✓ Rode de novo com um itemId pra ver as transações:");
    r.data.items.forEach((it) => console.log(`   node scripts/test-banco.js ${it.itemId}   # ${it.banco} (${it.status})`));
  } else {
    console.log("\nNenhuma conexão ainda. Crie uma sandbox no Pluggy Dashboard ou conecte o C6.");
  }
} else {
  console.log(`→ Baixando transações do item ${itemId} (action=transactions)…\n`);
  const r = await call({ action: "transactions", itemId });
  console.log("HTTP", r.status);
  if (r.data?.txns) {
    console.log(`Banco: ${r.data.banco} | Período: ${r.data.periodo.ini} a ${r.data.periodo.fim} | ${r.data.txns.length} transações\n`);
    console.table(r.data.txns.slice(0, 20).map((t) => ({
      data: t.data, lado: t.lado, valor: t.valor.toFixed(2), historico: t.historico.slice(0, 40), conta: t.conta,
    })));
    if (r.data.txns.length > 20) console.log(`… e mais ${r.data.txns.length - 20}.`);
  } else {
    console.dir(r.data, { depth: 4 });
  }
}
