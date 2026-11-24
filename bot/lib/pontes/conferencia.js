// Conferência diária do Faturamento (hub × planilha), com aviso por e-mail.
//
//   GET /api/conferencia                 -> roda a conferência (o Vercel Cron chama pela /api/rotina, 8h07 de Brasília)
//   GET /api/conferencia?enviar=nao      -> só mostra o resultado, sem mandar e-mail (admin/financeiro logado)
//
// Lê public.fat_conferencia (Supabase). Se houver divergência de gravidade "erro" ou "atencao", manda um
// e-mail para AVISO_CONFERENCIA_PARA (ou AVISO_FECHAMENTO_PARA). A mesma lista não é reenviada no dia
// seguinte: só quando muda, ou como lembrete semanal enquanto não for resolvida (fat_conferencia_avisos).
//
// Quem pode chamar: o Vercel Cron (Authorization: Bearer <CRON_SECRET>) ou admin/financeiro logado.
// Variáveis: CRON_SECRET, SUPABASE_URL, SUPABASE_SECRET_KEY, RESEND_API_KEY, RESEND_FROM, AVISO_*_PARA.

import crypto from "node:crypto";
import { cors, exigirLogin, PAPEIS_FINANCEIRO } from "../http.js";

const HUB = "https://ederbalbino-hub.github.io/mgb-financeiro/";
const LEMBRETE_MS = 7 * 24 * 60 * 60 * 1000;

export function ehCron(req, env) {
  const s = env.CRON_SECRET;
  const h = req.headers.authorization || "";
  if (!s || !h.startsWith("Bearer ")) return false;
  const a = Buffer.from(h.slice(7));
  const b = Buffer.from(s);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function sb(env, fetchFn, caminho, opcoes = {}) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const chave = env.SUPABASE_SECRET_KEY;
  if (!url || !chave) throw new Error("Servidor sem SUPABASE_URL/SUPABASE_SECRET_KEY.");
  const headers = { apikey: chave, "Content-Type": "application/json", ...(opcoes.headers || {}) };
  if (chave.startsWith("eyJ")) headers.Authorization = `Bearer ${chave}`;
  const r = await fetchFn(`${url}/rest/v1/${caminho}`, { ...opcoes, headers });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${texto.slice(0, 160)}`);
  return texto ? JSON.parse(texto) : null;
}

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function assinatura(itens) {
  const base = itens.map((i) => [i.gravidade, i.tipo, i.cliente_id, i.competencia, i.detalhe].join("¦")).sort().join("\n");
  return crypto.createHash("sha256").update(base).digest("hex");
}

export function montarEmailConferencia(itens) {
  const erros = itens.filter((i) => i.gravidade === "erro");
  const atencao = itens.filter((i) => i.gravidade === "atencao");
  const bloco = (titulo, cor, lista, dica) =>
    lista.length
      ? `<h3 style="color:${cor};margin:18px 0 6px">${titulo} · ${lista.length}</h3><p style="margin:0 0 8px;font-size:13px;color:#5a6474">${dica}</p>
<table style="border-collapse:collapse;font-size:13px;width:100%">${lista
          .map((i) => `<tr><td style="padding:5px 8px 5px 0;border-top:1px solid #e5e7eb"><b>${esc(i.cliente)}</b><br><span style="color:#5a6474">${esc(i.competencia)} · ${esc(i.tipo)}</span></td><td style="padding:5px 0;border-top:1px solid #e5e7eb">${esc(i.detalhe)}</td></tr>`)
          .join("")}</table>`
      : "";
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;color:#1d2430">
<h2 style="margin:0 0 6px">Conferência do Faturamento</h2>
<p style="margin:0 0 4px;font-size:14px">Comparação automática entre o hub e a planilha do Faturamento.</p>
${bloco("Erros", "#b42318", erros, "Número de nota ou de boleto diferente entre o hub e a planilha: um dos dois está errado.")}
${bloco("Atenção", "#a85a00", atencao, "Falta registro de um lado. Boleto emitido com nota sem número costuma ser nota parada na prefeitura: confira no Asaas.")}
<p style="margin:20px 0"><a href="${HUB}" style="background:#1f5fbf;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir o hub</a></p>
<p style="font-size:12px;color:#5a6474">Você recebe este e-mail quando a lista muda, e um lembrete por semana enquanto houver pendência.</p></div>`;
  const texto = itens.map((i) => `[${i.gravidade}] ${i.cliente} ${i.competencia} — ${i.tipo}: ${i.detalhe}`).join("\n");
  const assunto = erros.length
    ? `Faturamento: ${erros.length} erro(s) na conferência`
    : `Faturamento: ${atencao.length} item(ns) para conferir`;
  return { assunto, html, texto };
}

export default async function handler(req, res, { env = process.env, fetchFn = fetch, agora = Date.now() } = {}) {
  if (cors(req, res, { metodos: "GET,OPTIONS", env })) return;
  const cron = ehCron(req, env);
  if (!cron && !(await exigirLogin(req, res, PAPEIS_FINANCEIRO, env, fetchFn))) return;

  try {
    const itens = await sb(env, fetchFn, "fat_conferencia?select=*&gravidade=in.(erro,atencao)&order=gravidade,competencia.desc");
    const [controle] = await sb(env, fetchFn, "fat_conferencia_avisos?id=eq.1&select=*");
    const ass = itens.length ? assinatura(itens) : "";
    const resumo = { ok: true, divergencias: itens.length, erros: itens.filter((i) => i.gravidade === "erro").length };

    if (!cron && String(req.query?.enviar) === "nao") return res.status(200).json({ ...resumo, itens });

    const avisadoEm = controle?.avisado_em ? Date.parse(controle.avisado_em) : 0;
    const mudou = ass !== (controle?.assinatura || "");
    const lembrar = ass && !mudou && agora - avisadoEm >= LEMBRETE_MS;
    if (!ass || (!mudou && !lembrar)) {
      if (mudou) await sb(env, fetchFn, "fat_conferencia_avisos?id=eq.1", { method: "PATCH", body: JSON.stringify({ assinatura: ass, quantidade: 0 }) });
      return res.status(200).json({ ...resumo, enviado: false, motivo: ass ? "já avisado" : "sem divergências" });
    }

    const para = String(env.AVISO_CONFERENCIA_PARA || env.AVISO_FECHAMENTO_PARA || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!para.length || !env.RESEND_API_KEY || !env.RESEND_FROM) {
      return res.status(200).json({ ...resumo, enviado: false, motivo: "falta AVISO_*_PARA/RESEND_* no Vercel" });
    }
    const { assunto, html, texto } = montarEmailConferencia(itens);
    const r = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.RESEND_FROM, to: para, subject: assunto, html, text: texto }),
    });
    if (!r.ok) throw new Error(`Resend respondeu ${r.status}`);
    await sb(env, fetchFn, "fat_conferencia_avisos?id=eq.1", {
      method: "PATCH",
      body: JSON.stringify({ assinatura: ass, quantidade: itens.length, avisado_em: new Date(agora).toISOString() }),
    });
    console.log(`conferencia: e-mail enviado (${itens.length} divergência(s))`);
    return res.status(200).json({ ...resumo, enviado: true, lembrete: !!lembrar });
  } catch (e) {
    console.error("conferencia:", e.message || e);
    return res.status(502).json({ ok: false, error: "Não consegui rodar a conferência." });
  }
}
