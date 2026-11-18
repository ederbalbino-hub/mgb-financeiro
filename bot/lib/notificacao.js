// Aviso de lead fechado: quando o Eder move um lead do funil para "Fechado ✅", a Karen (e o Eder,
// em cópia) recebem um e-mail para cuidar do contrato. No hub, o cliente já aparece na Home da Karen
// em "Fechados no CRM, esperando cadastro" (novo.js) até ela cadastrar pelo Novo cliente.
//
// Variáveis no Vercel:
//   AVISO_FECHAMENTO_PARA  e-mails separados por vírgula (ex.: karen@…,eder@…). Sem ela, não envia.
//   RESEND_API_KEY, RESEND_FROM  as mesmas do envio das notas fiscais.

const HUB = "https://ederbalbino-hub.github.io/mgb-financeiro/";

// Leads que passaram para "fechado" entre o estado antigo e o novo.
export function leadsRecemFechados(antes, depois) {
  const eraFechado = new Set((Array.isArray(antes) ? antes : []).filter((l) => l && l.estagio === "fechado").map((l) => l.id));
  return (Array.isArray(depois) ? depois : []).filter((l) => l && l.estagio === "fechado" && l.id != null && !eraFechado.has(l.id));
}

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const reais = (v) => (Number(v) ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "");

export function montarEmail(lead, quem) {
  const linhas = [
    ["Cliente", lead.nome],
    ["Responsável", [lead.responsavel, lead.funcao].filter(Boolean).join(" · ")],
    ["Telefone", lead.tel],
    ["E-mail", lead.email],
    ["CNPJ", lead.cnpj],
    ["Valor", reais(lead.valor)],
    ["Observações", lead.obs],
  ].filter(([, v]) => v);
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;color:#1d2430">
<h2 style="color:#1d7a46;margin:0 0 8px">Novo cliente fechado ✅</h2>
<p style="font-size:15px;margin:0 0 14px">${esc(quem || "O Eder")} fechou <b>${esc(lead.nome)}</b>. Entre em contato para fechar o contrato.</p>
<table style="border-collapse:collapse;font-size:14px">${linhas.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5a6474">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join("")}</table>
<p style="margin:20px 0"><a href="${HUB}" style="background:#1f5fbf;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir o hub</a></p>
<p style="font-size:12px;color:#5a6474">No hub, ele já está na Home em "Fechados no CRM, esperando cadastro". Depois de falar com o cliente, use o botão Cadastrar.</p></div>`;
  const texto = `Novo cliente fechado: ${lead.nome}. ${linhas.map(([k, v]) => `${k}: ${v}`).join(" | ")}. Abra o hub: ${HUB}`;
  return { assunto: `Cliente fechado: ${lead.nome} — entrar em contato`, html, texto };
}

// Envia um e-mail por lead recém-fechado. Nunca derruba o salvamento: erro só vai para o log.
export async function avisarFechamentos(antes, depois, quem, env = process.env, fetchFn = fetch) {
  const novos = leadsRecemFechados(antes, depois);
  const para = String(env.AVISO_FECHAMENTO_PARA || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!novos.length) return 0;
  if (!para.length || !env.RESEND_API_KEY || !env.RESEND_FROM) {
    console.log(`aviso-fechamento: ${novos.length} lead(s) fechado(s), mas falta AVISO_FECHAMENTO_PARA/RESEND_* — e-mail não enviado`);
    return 0;
  }
  let enviados = 0;
  for (const lead of novos) {
    const { assunto, html, texto } = montarEmail(lead, quem);
    try {
      const r = await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.RESEND_FROM, to: para, subject: assunto, html, text: texto }),
      });
      if (r.ok) enviados++;
      else console.error(`aviso-fechamento: Resend respondeu ${r.status} para o lead ${lead.id}`);
    } catch (e) {
      console.error("aviso-fechamento:", e.message || e);
    }
  }
  console.log(`aviso-fechamento: ${enviados}/${novos.length} e-mail(s) enviado(s)`);
  return enviados;
}
