// Recibo automático por e-mail quando um boleto do Mercadão da Prochet é pago (Asaas → webhook).
// Mesmo texto do recibo da aba Recibos do hub (index.html: fRecHtml), em versão e-mail (HTML simples).

export const EMPRESA = {
  razao: "MGB Comunicação e Marketing LTDA",
  fantasia: "MGB Mídia",
  cnpj: "23.770.170/0001-50",
  end: "Rua Raul Juliatto, 200 — Londrina/PR — CEP 86.047-230",
  contato: "comercial@agenciamgb.com.br · (43) 99696-0078",
  resp: "Eder Balbino",
  cargo: "Diretor",
  cidade: "Londrina",
};

// Marcador que o hub coloca na descrição da cobrança (só no boleto, não na nota fiscal).
export const MARCADOR_MERCADAO = /r[aá]dio interna do mercad[aã]o da prochet/i;

export function ehMercadao(descricao) {
  return MARCADOR_MERCADAO.test(String(descricao || ""));
}

export function moeda(v) {
  return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function extenso(v) {
  const u = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const c = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const ate999 = (n) => {
    if (n === 0) return "";
    if (n === 100) return "cem";
    const r = [];
    const ce = Math.floor(n / 100), dz = n % 100;
    if (ce) r.push(c[ce]);
    if (dz) {
      if (dz < 20) r.push(u[dz]);
      else { const de = Math.floor(dz / 10), un = dz % 10; r.push(d[de] + (un ? " e " + u[un] : "")); }
    }
    return r.join(" e ");
  };
  const grupo = (n, sing, plur) => (!n ? "" : n === 1 ? ate999(n) + " " + sing : ate999(n) + " " + plur);
  v = Math.round(Number(v || 0) * 100) / 100;
  const inteiro = Math.floor(v), cent = Math.round((v - inteiro) * 100);
  const mil = Math.floor(inteiro / 1000000), milh = Math.floor((inteiro % 1000000) / 1000), rest = inteiro % 1000;
  const partes = [];
  if (mil) partes.push(grupo(mil, "milhão", "milhões"));
  if (milh) partes.push(milh === 1 ? "mil" : ate999(milh) + " mil");
  if (rest) partes.push(ate999(rest));
  let txt = partes.join(rest && rest < 100 && partes.length > 1 ? " e " : " ").replace(/\s+/g, " ").trim();
  if (inteiro) txt += inteiro === 1 ? " real" : " reais";
  if (cent) txt += (inteiro ? " e " : "") + ate999(cent) + (cent === 1 ? " centavo" : " centavos");
  return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : "Zero reais";
}

export function dataExtenso(iso) {
  const M = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const d = new Date((iso || "") + "T12:00:00");
  if (isNaN(d)) return iso || "";
  return `${d.getDate()} de ${M[d.getMonth()]} de ${d.getFullYear()}`;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function docFmt(doc) {
  const d = String(doc || "").replace(/\D/g, "");
  if (d.length === 14) return "CNPJ " + d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return "CPF " + d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return "";
}

// r: { pagador, doc, valor, descricao, dataPagamento (AAAA-MM-DD), forma, numero, comprovanteUrl }
export function reciboHtml(r) {
  const docTxt = docFmt(r.doc);
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1D1430;max-width:620px;margin:0 auto;border:1px solid #E2DCF0;border-radius:10px;overflow:hidden">
<div style="padding:16px 20px;border-bottom:3px solid #6C55DB">
  <div style="font-size:22px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#6C55DB">${esc(EMPRESA.fantasia)}</div>
  <div style="font-size:12px;color:#4b4459;margin-top:4px;line-height:1.5"><b>${esc(EMPRESA.razao)}</b> · CNPJ ${esc(EMPRESA.cnpj)}<br>${esc(EMPRESA.end)}<br>${esc(EMPRESA.contato)}</div>
</div>
<div style="padding:18px 20px">
  <div style="font-size:12px;letter-spacing:.2em;font-weight:800;color:#6C55DB">RECIBO${r.numero ? " Nº " + esc(r.numero) : ""}</div>
  <div style="display:inline-block;margin:8px 0 14px;background:#F1EDF9;border:1.5px solid #6C55DB;border-radius:8px;padding:6px 12px;font-size:20px;font-weight:900">R$ ${moeda(r.valor)}</div>
  <p style="font-size:14px;line-height:1.7;margin:0 0 12px">Recebemos de <b>${esc(r.pagador || "________________")}</b>${docTxt ? ", " + esc(docTxt) : ""} a importância de <b>R$ ${moeda(r.valor)}</b> (${esc(extenso(r.valor))}), referente a <b>${esc(r.descricao || "prestação de serviços de mídia")}</b>.</p>
  <div style="background:#FAF8FD;border:1px solid #E2DCF0;border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.6">
    <b>Forma de pagamento:</b> ${esc(r.forma || "Boleto bancário")}<br>
    <span style="color:#4b4459">Para maior clareza, firmamos o presente recibo, dando plena e geral quitação do valor acima.</span>
  </div>
  <p style="font-size:12px;margin:14px 0 0">${esc(EMPRESA.cidade)}, ${esc(dataExtenso(r.dataPagamento))}</p>
  <p style="font-size:12px;margin:14px 0 0;border-top:1px solid #1D1430;padding-top:6px;display:inline-block;min-width:260px"><b>${esc(EMPRESA.razao)}</b><br><span style="color:#4b4459">${esc(EMPRESA.resp)} — ${esc(EMPRESA.cargo)} · CNPJ ${esc(EMPRESA.cnpj)}</span></p>
  ${r.comprovanteUrl ? `<p style="font-size:12px;margin:14px 0 0"><a href="${esc(r.comprovanteUrl)}" style="color:#6C55DB">Ver comprovante do pagamento</a></p>` : ""}
</div></div>`;
}

export function reciboTexto(r) {
  const docTxt = docFmt(r.doc);
  return `RECIBO${r.numero ? " Nº " + r.numero : ""} — ${EMPRESA.fantasia}\n\nRecebemos de ${r.pagador || "—"}${docTxt ? ", " + docTxt : ""} a importância de R$ ${moeda(r.valor)} (${extenso(r.valor)}), referente a ${r.descricao || "prestação de serviços de mídia"}.\n\nForma de pagamento: ${r.forma || "Boleto bancário"}\nPara maior clareza, firmamos o presente recibo, dando plena e geral quitação do valor acima.\n\n${EMPRESA.cidade}, ${dataExtenso(r.dataPagamento)}\n${EMPRESA.razao} · CNPJ ${EMPRESA.cnpj}\n${EMPRESA.resp} — ${EMPRESA.cargo}\n${r.comprovanteUrl ? "\nComprovante: " + r.comprovanteUrl + "\n" : ""}`;
}
