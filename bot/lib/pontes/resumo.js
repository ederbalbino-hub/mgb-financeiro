// Resumo diário "Precisa de você hoje" por e-mail (regras em lib/resumo.js).
//
//   GET /api/rotina               -> Vercel Cron, 1x por dia às 8h07 de Brasília: roda a conferência do
//                                    Faturamento e, de segunda a sexta, manda o resumo para a Karen e o Eder.
//   GET /api/resumo?enviar=nao    -> só mostra o que sairia (JSON), sem mandar e-mail (admin/financeiro logado)
//   GET /api/resumo?ver=karen|eder -> mostra o e-mail como página (admin/financeiro logado), sem mandar
//
// Quem pode chamar: o Vercel Cron (Authorization: Bearer <CRON_SECRET>) ou admin/financeiro logado.
// Variáveis: RESUMO_PARA_FINANCEIRO (Karen) e RESUMO_PARA_ADMIN (Eder), e-mails separados por vírgula.
// Sem elas, ninguém recebe. E também CRON_SECRET, SUPABASE_URL, SUPABASE_SECRET_KEY, RESEND_API_KEY e RESEND_FROM.
// Só lê o banco; não grava nada.

import { cors, exigirLogin, PAPEIS_FINANCEIRO } from "../http.js";
import { lerEstado } from "../estado.js";
import { hojeBrasilia, diaUtil, montarResumo, montarEmailResumo } from "../resumo.js";
import conferencia, { ehCron, sb } from "./conferencia.js";

const DESTINOS = [
  { papel: "financeiro", nome: "Karen", variavel: "RESUMO_PARA_FINANCEIRO" },
  { papel: "admin", nome: "Eder", variavel: "RESUMO_PARA_ADMIN" },
];

async function lerDados(env, fetchFn) {
  const { estado } = await lerEstado(env, fetchFn);
  let linhas = [];
  try {
    linhas = await sb(env, fetchFn, "fat_emissoes?select=cliente_id,competencia,status,payment_id,valor_boleto,cliente_nome,pagamento_status");
  } catch (e) {
    console.error("resumo: não li fat_emissoes, sigo só com o estado:", e.message || e);
  }
  return { estado, linhas };
}

// Monta e manda os e-mails do dia. Devolve o que fez com cada pessoa.
export async function enviarResumos({ env = process.env, fetchFn = fetch, agora = Date.now(), forcar = false } = {}) {
  const h = hojeBrasilia(agora);
  if (!diaUtil(h) && !forcar) return { ok: true, enviado: false, motivo: "fim de semana" };
  const { estado, linhas } = await lerDados(env, fetchFn);
  const resultado = [];
  for (const d of DESTINOS) {
    const para = String(env[d.variavel] || "").split(",").map((s) => s.trim()).filter(Boolean);
    const secoes = montarResumo(estado, linhas, h, d.papel);
    const itens = secoes.reduce((n, s) => n + s.itens.length, 0);
    if (!itens) { resultado.push({ quem: d.nome, enviado: false, motivo: "nada pendente" }); continue; }
    if (!para.length || !env.RESEND_API_KEY || !env.RESEND_FROM) { resultado.push({ quem: d.nome, enviado: false, itens, motivo: `falta ${d.variavel}/RESEND_* no Vercel` }); continue; }
    const { assunto, html, texto } = montarEmailResumo(secoes, h, d.nome);
    try {
      const r = await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.RESEND_FROM, to: para, subject: assunto, html, text: texto }),
      });
      if (!r.ok) throw new Error(`Resend respondeu ${r.status}`);
      resultado.push({ quem: d.nome, enviado: true, itens });
    } catch (e) {
      console.error(`resumo (${d.nome}):`, e.message || e);
      resultado.push({ quem: d.nome, enviado: false, itens, motivo: "erro no envio" });
    }
  }
  console.log("resumo:", JSON.stringify(resultado));
  return { ok: true, resultado };
}

// Prévia para quem está logado: não manda nada.
export default async function handler(req, res, { env = process.env, fetchFn = fetch, agora = Date.now() } = {}) {
  if (cors(req, res, { metodos: "GET,OPTIONS", env })) return;
  if (!(await exigirLogin(req, res, PAPEIS_FINANCEIRO, env, fetchFn))) return;
  try {
    const h = hojeBrasilia(agora);
    const { estado, linhas } = await lerDados(env, fetchFn);
    const ver = String(req.query?.ver || "").toLowerCase();
    const d = DESTINOS.find((x) => x.nome.toLowerCase() === ver);
    if (d) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(montarEmailResumo(montarResumo(estado, linhas, h, d.papel), h, d.nome).html);
    }
    return res.status(200).json({ ok: true, hoje: h.iso, diaUtil: diaUtil(h), ...Object.fromEntries(DESTINOS.map((x) => [x.nome.toLowerCase(), montarResumo(estado, linhas, h, x.papel)])) });
  } catch (e) {
    console.error("resumo:", e.message || e);
    return res.status(502).json({ ok: false, error: "Não consegui montar o resumo." });
  }
}

// Rotina diária do Vercel Cron: conferência do Faturamento + resumo. Uma coisa não impede a outra.
export async function rotina(req, res, { env = process.env, fetchFn = fetch, agora = Date.now() } = {}) {
  if (!ehCron(req, env)) return res.status(401).json({ ok: false, error: "Só o agendamento do Vercel chama a rotina." });
  const saida = {};
  const captura = { headers: {}, codigo: 200, setHeader() {}, status(c) { this.codigo = c; return this; }, json(o) { saida.conferencia = o; return this; }, send() { return this; }, end() { return this; } };
  try { await conferencia(req, captura, { env, fetchFn, agora }); } catch (e) { saida.conferencia = { ok: false, error: e.message || String(e) }; }
  try { saida.resumo = await enviarResumos({ env, fetchFn, agora }); } catch (e) { console.error("rotina/resumo:", e.message || e); saida.resumo = { ok: false, error: "Não consegui montar o resumo." }; }
  return res.status(200).json({ ok: true, ...saida });
}
