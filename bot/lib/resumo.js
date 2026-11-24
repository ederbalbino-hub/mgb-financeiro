// Resumo diário "Precisa de você hoje" (e-mail das 8h, de segunda a sexta).
//
// Lê o estado do hub (hub_estado) e as emissões do Faturamento no banco (fat_emissoes, que o webhook do
// Asaas mantém em dia) e monta UM e-mail por pessoa, só com o que pede ação:
//   - boletos vencidos para cobrar (qualquer mês) e notas do mês sem número;
//   - contas a pagar que vencem hoje, nos próximos 3 dias, ou já atrasadas (dia salvo em Contas do mês);
//   - contratos que terminam neste mês ou no próximo e ainda não foram encaminhados/renovados;
//   - clientes fechados no funil esperando cadastro;
//   - retornos do funil de hoje e atrasados (só para o Eder);
//   - repasse do Mercadão e do Vaapty ainda não marcado como enviado (do dia 25 ao dia 10).
//
// As regras copiam as do hub (index.html: coletaDespesasMes, contratosLista, leadLembreteVencido,
// mercadaoAvisoHome, vaaptyAvisoHome, fatPendAnterioresHome; financeiro.js: chaveConta/agruparContas;
// acesso.js: contratosParaRenovar). bot/test/resumo.test.js confere que continuam iguais às de lá.
// Fica de fora (depende de dados que só o navegador carrega): Connectmix e comissão do Rádio Moinho.

export const HUB = "https://ederbalbino-hub.github.io/mgb-financeiro/";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEM_FIM = 120;
const DIAS_AVISO_CONTA = 3;

// Rótulos dos módulos como no MODULES do index.html (a chave de _renovacoes usa o rótulo).
export const MODULOS = {
  mb: "MB — Móveis Brasília",
  elev: "Tela Vertical",
  vaapty: "Vaapty",
  radio: "Rádio Interna",
  tv: "TV Interna",
  taroba: "Tarobá",
  radioops: "Rádio Moinho (Bureau)",
};

// Mesmos nomes e dias padrão de financeiro.js.
const NOMES_CONTA = {
  "receita federal": "Imposto Simples",
  listen: "Listen (rádio)",
  "4yousee": "4Yousee (telas)",
  eder: "Pró-labore do Eder",
  guina: "Comissão do Guina",
  "va vaapty gestao de franquias": "Repasse Vaapty",
  connectmix: "Connectmix (auditoria)",
};
const DIA_PADRAO = { "receita federal": 20, eder: 21 };
const PRO_LABORE = { valor: 1621, inicio: "2026-10" }; // financas.js (PADRAO)

const norm = (t) => String(t || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const num = (v) => Number(v) || 0;
const mesChave = (ano, mes0) => `${ano}-${String(mes0 + 1).padStart(2, "0")}`;

// "Hoje" no horário de Brasília (UTC−3, sem horário de verão desde 2019).
export function hojeBrasilia(agora = Date.now()) {
  const d = new Date(agora - 3 * 60 * 60 * 1000);
  const ano = d.getUTCFullYear(), mes0 = d.getUTCMonth(), dia = d.getUTCDate();
  const iso = `${mesChave(ano, mes0)}-${String(dia).padStart(2, "0")}`;
  const hora = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return { ano, mes0, dia, iso, agoraLocal: `${iso}T${hora}`, semana: d.getUTCDay(), ref: ano * 12 + mes0, comp: mesChave(ano, mes0) };
}
export const diaUtil = (h) => h.semana >= 1 && h.semana <= 5;

// ── Contas a pagar ─────────────────────────────────────────────────────────
export function chaveConta(d) {
  let forn = String((d.r && d.r.f) || "").trim();
  if (!forn || forn === "—" || forn === "-") forn = (d.r && d.r.d) || d.item || "";
  return norm(forn);
}

function contratoAtivo(ro, ref) {
  const m = /^(\d{4})-(\d{2})/.exec((ro && ro.inicio) || "");
  if (!num(ro && ro.valor) || !m) return false;
  const ini = +m[1] * 12 + (+m[2] - 1), meses = num(ro.meses) || 12;
  return ref >= ini && (meses >= SEM_FIM || ref <= ini + meses - 1);
}

// Porta de coletaDespesasMes (index.html) para o mês atual, sem os valores que dependem do navegador.
export function coletarDespesas(estado, ano, mes0) {
  const out = [];
  const ref = ano * 12 + mes0;
  const db = estado.db || {};
  const itensMod = estado.moduleItems || {};
  const empresa = { id: "_empresa", label: "Empresa" };
  Object.keys(db).forEach((modId) => {
    const m = { id: modId, label: MODULOS[modId] || modId };
    const itens = itensMod[modId] || Object.keys(db[modId] || {});
    itens.forEach((item) => {
      ((db[modId] || {})[item] || []).forEach((r, idx) => {
        if (!r) return;
        if (r.t === "Recorrente" || r.t === "Parcelado") {
          if (!r.dataInicio) return;
          const [aI, mI] = String(r.dataInicio).split("-").map(Number);
          const dur = r.t === "Parcelado" ? r.nparc || 1 : r.mesesRec || 12;
          const k = ref - (aI * 12 + mI - 1);
          if (k >= 0 && k < dur) out.push({ m, item, idx, r, vlrMes: r.t === "Parcelado" ? (num(r.q) * num(r.u)) / (r.nparc || 1) : num(r.q) * num(r.u) });
          return;
        }
        if (r.venc) {
          const [aV, mV] = String(r.venc).split("-").map(Number);
          if (aV === ano && mV - 1 === mes0) out.push({ m, item, idx, r, vlrMes: num(r.q) * num(r.u) });
        } else if (!r.pago) out.push({ m, item, idx, r, vlrMes: num(r.q) * num(r.u) });
      });
    });
  });
  // Imposto sobre a receita: o valor depende das notas do mês (só o hub calcula); o lembrete vale igual.
  out.push({ m: empresa, item: "Empresa", idx: "_imposto", r: { d: "Imposto sobre receita", f: "Receita Federal" }, vlrMes: null });
  (estado.empresaDespesas || []).forEach((ed) => {
    if (!ed || !ed.ativo || !ed.valor) return;
    if (ed.inicio) {
      const [aI, mI] = String(ed.inicio).split("-").map(Number);
      if (ref < aI * 12 + (mI - 1)) return;
    }
    out.push({ m: empresa, item: "Empresa", idx: `_emp_${ed.id}`, r: { d: ed.nome, f: "—" }, vlrMes: num(ed.valor) });
  });
  const k = mesChave(ano, mes0);
  (estado.empresaAvulsas || []).forEach((av) => {
    if (av && av.mes === k && av.valor > 0) out.push({ m: empresa, item: "Empresa", idx: `_av_${av.id}`, r: { d: av.desc, f: av.forn || "—" }, vlrMes: num(av.valor) });
  });
  // Repasse à franqueadora Vaapty: % sobre os contratos Vaapty ativos no mês.
  const cfgV = (estado.notaConfig || {}).vaapty || {};
  const pctV = cfgV.pct == null ? 15 : num(cfgV.pct);
  const exV = new Set(cfgV.excluir || ["radio|Rádio Vaapty"]);
  const baseV = (itensMod.vaapty || Object.keys((estado.rec || {}).vaapty || {}))
    .filter((it) => !exV.has(`vaapty|${it}`))
    .reduce((s, it) => {
      const ro = ((estado.rec || {}).vaapty || {})[it];
      return s + (contratoAtivo(ro, ref) ? num(ro.valor) : 0);
    }, 0);
  if (baseV > 0) out.push({ m: { id: "vaapty", label: "Vaapty" }, item: "Franqueadora Vaapty", idx: "_repasse_vaapty", r: { d: "Repasse à franqueadora", f: "VA Vaapty Gestão de Franquias" }, vlrMes: Math.round(baseV * pctV) / 100 });
  // Pró-labore do Eder (financas.js: proLaboreNoMes).
  const nc = estado.notaConfig || {};
  const pl = nc.proLabore != null && nc.proLabore !== "" ? num(nc.proLabore) : PRO_LABORE.valor;
  const [aP, mP] = String(nc.proLaboreInicio || PRO_LABORE.inicio).split("-").map(Number);
  if (pl > 0 && ref >= aP * 12 + (mP - 1)) out.push({ m: empresa, item: "Empresa", idx: "_prolabore", r: { d: "Pró-labore Eder (dia 21)", f: "Eder" }, vlrMes: pl });
  // Tela Vertical: rateio entre condomínios e despesas pagas do bolso por um sócio.
  (estado.despesasComp || []).forEach((dc) => {
    if (!dc || !dc.inicio || !dc.telas || !dc.telas.length) return;
    const [aI, mI] = String(dc.inicio).split("-").map(Number);
    const kk = ref - (aI * 12 + mI - 1);
    if (kk >= 0 && kk < (dc.meses || 1)) out.push({ m: { id: "elev", label: "Tela Vertical" }, item: `Rateio ${dc.telas.length} condomínio(s)`, idx: `dc_${dc.id}`, r: { d: dc.nome, f: dc.forn || "—" }, vlrMes: num(dc.valor) });
  });
  (estado.elevInvestimentos || []).forEach((x) => {
    if (!x || x.tipo !== "despesa" || !x.valor || !/^\d{4}-\d{2}/.test(x.data || "")) return;
    if (+x.data.slice(0, 4) !== ano || +x.data.slice(5, 7) - 1 !== mes0) return;
    out.push({ m: { id: "elev", label: "Tela Vertical" }, item: x.item || "Geral", idx: `_socio_${x.id}`, r: { d: x.descricao || "Despesa", f: x.pagoPor === "jadson" ? "Jadson (do bolso)" : "Eder (do bolso)" }, vlrMes: num(x.valor) });
  });
  return out;
}

// Contas (agrupadas por fornecedor, como em Contas do mês) com dia de vencimento até hoje + 3 e não pagas.
export function contasAVencer(estado, h) {
  const dp = estado.despPagamentos || {};
  const vencs = dp._contas || {};
  const dKey = `${h.ano}-${h.mes0}`; // despPagKey usa o mês de 0 a 11
  const pago = (d) => !!((((dp[d.m.id] || {})[d.item] || {})[d.idx] || {})[dKey] || {}).pago;
  const grupos = new Map();
  coletarDespesas(estado, h.ano, h.mes0).forEach((d) => {
    const k = chaveConta(d);
    if (!grupos.has(k)) grupos.set(k, { chave: k, itens: [], total: 0, semValor: false, pagos: 0 });
    const g = grupos.get(k);
    g.itens.push(d);
    if (d.vlrMes == null) g.semValor = true;
    else g.total += d.vlrMes;
    if (pago(d)) g.pagos++;
  });
  const out = [];
  grupos.forEach((g) => {
    const dia = (vencs[g.chave] && vencs[g.chave].dia) || DIA_PADRAO[g.chave] || null;
    if (!dia || g.pagos === g.itens.length || dia > h.dia + DIAS_AVISO_CONTA) return;
    const d0 = g.itens[0], forn = String((d0.r && d0.r.f) || "").trim();
    const semForn = !forn || forn === "—" || forn === "-";
    out.push({
      titulo: NOMES_CONTA[g.chave] || (semForn ? (d0.r && d0.r.d) || d0.item : forn),
      dia,
      valor: g.semValor && !g.total ? null : Math.round(g.total * 100) / 100,
      situacao: dia < h.dia ? "atrasada" : dia === h.dia ? "hoje" : "em breve",
    });
  });
  return out.sort((a, b) => a.dia - b.dia || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

// ── Boletos ────────────────────────────────────────────────────────────────
// fatEmissoes (estado) + fat_emissoes (banco, atualizado pelo webhook do Asaas). Pago em qualquer um vence.
export function boletosVencidos(emissoes, linhasBanco, h) {
  const banco = new Map((linhasBanco || []).map((l) => [`${l.cliente_id}|${l.competencia}`, l]));
  const chaves = new Set([...Object.keys(emissoes || {}), ...banco.keys()]);
  const out = [];
  chaves.forEach((k) => {
    const i = k.lastIndexOf("|");
    const comp = k.slice(i + 1);
    if (i < 0 || !/^\d{4}-\d{2}$/.test(comp) || comp > h.comp) return;
    const e = (emissoes || {})[k] || {};
    const b = banco.get(k) || {};
    if (!(e.paymentId || b.payment_id) || e.pgManual) return;
    if (e.status === "cancelada" || b.status === "cancelada") return;
    const st = [e.pg, b.pagamento_status];
    if (st.includes("pago") || st.includes("cancelado") || !st.includes("vencido")) return;
    out.push({ cliente: e.cliente || b.cliente_nome || k.slice(0, i).replace(/^hub-[a-z]+-/, ""), comp, valor: num(e.boleto) || num(b.valor_boleto) || null });
  });
  return out.sort((a, b) => a.comp.localeCompare(b.comp) || String(a.cliente).localeCompare(String(b.cliente), "pt-BR"));
}

// Notas do mês que esperam número (inicio.js: semNota).
export function notasSemNumero(emissoes, h) {
  return Object.keys(emissoes || {})
    .filter((k) => k.slice(k.lastIndexOf("|") + 1) === h.comp)
    .map((k) => [k, emissoes[k] || {}])
    .filter(([, e]) => (e.modo === "ambos" || e.modo === "nota") && !e.nf && e.status !== "cancelada" && (e.paymentId || e.invoiceId))
    .map(([k, e]) => e.cliente || k.slice(0, k.lastIndexOf("|")));
}

// ── Contratos ──────────────────────────────────────────────────────────────
export function contratosLista(estado) {
  const out = [];
  const push = (origem, nome, valor, inicio, meses) => {
    let fimKey = null, iniKey = null;
    if (inicio) {
      const [y, m] = String(inicio).split("-").map(Number);
      fimKey = y * 12 + (m - 1) + (meses || 12) - 1;
      iniKey = y * 12 + (m - 1);
    }
    out.push({ origem, nome, valor, inicio: inicio || "", meses, fimKey, iniKey });
  };
  const rec = estado.rec || {};
  Object.keys(MODULOS).forEach((modId) => {
    if (modId === "elev" || modId === "taroba" || modId === "radioops") return;
    const itens = (estado.moduleItems || {})[modId] || Object.keys(rec[modId] || {});
    itens.forEach((item) => {
      const ro = (rec[modId] || {})[item];
      if (ro && ro.valor) push(MODULOS[modId], item, ro.valor, ro.inicio, ro.meses);
    });
  });
  (estado.anunciantes || []).forEach((a) => { if (a && a.valor) push("Tela Vertical", a.nome, a.valor, a.inicio, a.meses || 1); });
  return out;
}

// acesso.js: contratosParaRenovar (este mês e o próximo; some quando encaminhado ou resolvido).
export function contratosParaRenovar(estado, h, modoEder) {
  const renov = ((estado.clientesInfo || {})._renovacoes) || {};
  const chave = (c) => [c.origem === "Tela Vertical" || c.origem === "Elevadores" ? "Elevadores" : c.origem, c.nome, c.fimKey].join("|");
  return contratosLista(estado)
    .filter((c) => {
      if (c.fimKey == null || c.fimKey < h.ref || c.fimKey > h.ref + 1) return false;
      const r = renov[chave(c)];
      return !r || (modoEder && r.s === "eder");
    })
    .sort((a, b) => a.fimKey - b.fimKey || String(a.nome).localeCompare(String(b.nome)))
    .map((c) => ({ nome: c.nome, origem: c.origem, valor: num(c.valor), termina: c.fimKey === h.ref ? "este mês" : "mês que vem", encaminhado: !!renov[chave(c)] }));
}

// ── Funil ──────────────────────────────────────────────────────────────────
// index.html: leadLembreteVencido, mas com a data de Brasília (lá usa a data UTC). Inclui os de hoje.
export function retornosDoFunil(leads, h) {
  return (leads || [])
    .filter((l) => l && l.lembrete && l.estagio !== "fechado" && l.estagio !== "perdido" && String(l.lembrete).slice(0, 10) <= h.iso)
    .map((l) => {
      const [data, hora] = String(l.lembrete).split("T");
      return { nome: l.nome || "(sem nome)", quando: data.split("-").reverse().join("/") + (hora ? ` às ${hora}` : ""), atrasado: data < h.iso || (!!hora && String(l.lembrete) < h.agoraLocal) };
    })
    .sort((a, b) => Number(b.atrasado) - Number(a.atrasado) || a.nome.localeCompare(b.nome, "pt-BR"));
}
export const fechadosSemCadastro = (leads) => (leads || []).filter((l) => l && l.estagio === "fechado" && !l.itemCriado).map((l) => l.nome || "(sem nome)");

// ── Repasses (Cobrança mensal) ─────────────────────────────────────────────
// Do dia 25 ao dia 10: o relatório do mês (ou do mês anterior, até o dia 10) ainda não foi marcado como enviado.
export function repassesPendentes(estado, h) {
  let ano = h.ano, mes0 = h.mes0;
  if (h.dia <= 10) { mes0--; if (mes0 < 0) { mes0 = 11; ano--; } } else if (h.dia < 25) return [];
  const k = mesChave(ano, mes0);
  const nc = estado.notaConfig || {};
  const out = [];
  if (!(((nc.mercadao || {}).enviado || {})[k])) out.push({ nome: "Mercadão", mes: `${MESES[mes0]}/${ano}` });
  const temVaapty = coletarDespesas(estado, ano, mes0).some((d) => d.idx === "_repasse_vaapty");
  if (temVaapty && !(((nc.vaapty || {}).enviado || {})[k])) out.push({ nome: "Vaapty", mes: `${MESES[mes0]}/${ano}` });
  return out;
}

// ── Montagem ───────────────────────────────────────────────────────────────
// papel: "financeiro" (Karen) ou "admin" (Eder). Devolve as seções com itens; vazio = nada a mandar.
export function montarResumo(estado, linhasBanco, h, papel) {
  const eder = papel === "admin";
  const s = [];
  const add = (id, titulo, itens, dica) => { if (itens.length) s.push({ id, titulo, itens, dica }); };
  add("boletos", "Boletos vencidos para cobrar", boletosVencidos(estado.fatEmissoes, linhasBanco, h), "Cobre o cliente ou dê baixa no Faturamento se ele pagou por fora.");
  add("notas", `Notas de ${MESES[h.mes0]} sem número`, notasSemNumero(estado.fatEmissoes, h).map((nome) => ({ nome })), "O boleto saiu, mas a nota não voltou da prefeitura: confira no Faturamento.");
  add("contas", "Contas a pagar", contasAVencer(estado, h), "Depois de pagar, marque em Financeiro › Contas do mês.");
  add("contratos", "Contratos para renovar", contratosParaRenovar(estado, h, eder), eder ? "Ligue para o cliente e marque “Renovado” no hub." : "Encaminhe ao Eder pelo aviso de renovação no Início.");
  add("cadastro", "Clientes fechados esperando cadastro", fechadosSemCadastro(estado.leads).map((nome) => ({ nome })), "Cadastre pelo Novo cliente.");
  if (eder) add("funil", "Retornos do funil", retornosDoFunil(estado.leads, h), "Abra o Funil para registrar o contato.");
  add("repasses", "Repasses para enviar", repassesPendentes(estado, h), "Gere o relatório em Cobrança mensal e marque como enviado.");
  return s;
}

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const reais = (v) => (v == null ? "" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function linha(secao, i) {
  switch (secao) {
    case "boletos": return [i.cliente, `${i.comp.slice(5)}/${i.comp.slice(2, 4)}${i.valor ? " · " + reais(i.valor) : ""}`];
    case "contas": return [i.titulo, `${i.situacao === "atrasada" ? "atrasada · venceu dia " + i.dia : i.situacao === "hoje" ? "vence hoje" : "vence dia " + i.dia}${i.valor != null ? " · " + reais(i.valor) : ""}`];
    case "contratos": return [i.nome, `${i.origem} · termina ${i.termina}${i.encaminhado ? " · a Karen encaminhou" : ""}`];
    case "funil": return [i.nome, `${i.atrasado ? "atrasado · " : ""}${i.quando}`];
    case "repasses": return [i.nome, `relatório de ${i.mes}`];
    default: return [i.nome, ""];
  }
}

export function montarEmailResumo(secoes, h, nome) {
  const total = secoes.reduce((n, s) => n + s.itens.length, 0);
  const dataTxt = `${h.dia} de ${MESES[h.mes0]}`;
  const vermelho = (s, i) => (s.id === "boletos" || (s.id === "contas" && i.situacao === "atrasada") || (s.id === "funil" && i.atrasado));
  const blocos = secoes.map((s) => `<h3 style="margin:20px 0 4px;font-size:16px">${esc(s.titulo)} · ${s.itens.length}</h3>
<p style="margin:0 0 6px;font-size:13px;color:#5a6474">${esc(s.dica)}</p>
<table style="border-collapse:collapse;font-size:14px;width:100%">${s.itens.map((i) => {
    const [a, b] = linha(s.id, i);
    return `<tr><td style="padding:6px 10px 6px 0;border-top:1px solid #e5e7eb"><b>${esc(a)}</b></td><td style="padding:6px 0;border-top:1px solid #e5e7eb;color:${vermelho(s, i) ? "#b42318" : "#1d2430"}">${esc(b)}</td></tr>`;
  }).join("")}</table>`).join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;color:#1d2430">
<h2 style="margin:0 0 4px">Bom dia${nome ? ", " + esc(nome) : ""}!</h2>
<p style="margin:0 0 6px;font-size:15px">Hoje, ${esc(dataTxt)}, ${total === 1 ? "tem 1 assunto" : `tem ${total} assuntos`} precisando de você no hub.</p>
${blocos}
<p style="margin:24px 0"><a href="${HUB}" style="background:#1f5fbf;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir o hub</a></p>
<p style="font-size:12px;color:#5a6474">Resumo automático das 8h, de segunda a sexta. Só chega quando tem algo pendente.</p></div>`;
  const texto = `Bom dia${nome ? ", " + nome : ""}! Hoje, ${dataTxt}:\n\n` +
    secoes.map((s) => `${s.titulo} (${s.itens.length})\n` + s.itens.map((i) => { const [a, b] = linha(s.id, i); return `- ${a}${b ? ": " + b : ""}`; }).join("\n")).join("\n\n") +
    `\n\nAbrir o hub: ${HUB}`;
  return { assunto: `Hub MGB · ${dataTxt}: ${total === 1 ? "1 assunto" : total + " assuntos"} para hoje`, html, texto };
}
