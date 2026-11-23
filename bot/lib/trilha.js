// Trilha de auditoria legível do estado do hub (PROTÓTIPO — ainda não ligado em api/estado.js).
//
// Hoje cada gravação guarda uma cópia inteira do estado em hub_estado_historico (~125 KB), e depois de
// 30 dias só sobra 1 cópia por dia. Para saber "quem mudou o quê" é preciso comparar duas cópias à mão.
// Esta função compara o estado ANTES e DEPOIS de uma gravação e devolve frases curtas, do tipo
// "Karen marcou Listen (Rádio Interna) como paga em Nov/2026", para guardar numa tabela pequena
// (proposta em docs/auditoria/trilha.sql) que não é podada.
//
// Uso previsto em api/estado.js, logo depois de gravarEstado():
//   const linhas = descreverMudancas(atual.estado, doc);   // [{secao, texto, ref}]
//   gravar em hub_alteracoes com login, nome, versão e data.

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MODULOS = {
  mb: "MB", elev: "Tela Vertical", vaapty: "Vaapty", radio: "Rádio Interna",
  tv: "TV Interna", taroba: "Tarobá", radioops: "Rádio Moinho",
};
const NOMES_SECAO = {
  db: "despesas dos módulos", rec: "receitas dos módulos", fin: "financeiro mensal",
  pagamentos: "pagamentos", recPagamentos: "pagamentos (receita)", despPagamentos: "pagamentos de despesas",
  catalogo: "catálogo", anunciantes: "anunciantes da Tela Vertical", permutas: "permutas",
  despesasComp: "despesas compartilhadas", elevInvestimentos: "conta dos sócios (Tela Vertical)",
  empresaDespesas: "despesas fixas da empresa", empresaReceitas: "entradas da empresa",
  empresaMovimentos: "extrato importado", empresaAvulsas: "despesas avulsas", receitasAvulsas: "receitas avulsas",
  pessoalRec: "receitas pessoais", pessoalDesp: "despesas pessoais", pessoalPag: "pagamentos pessoais",
  pessoalRecPag: "recebimentos pessoais", relAjustes: "ajustes do relatório Mercadão", leads: "funil",
  clientesInfo: "cadastro de clientes", etiquetas: "etiquetas", recibos: "recibos", notas: "notas fiscais",
  notaConfig: "alíquotas", fatEmissoes: "faturamento", leoUnidades: "unidades Leo", moduleItems: "lista de clientes",
};

const brl = (v) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const obj = (x) => (x && typeof x === "object" ? x : {});

// Chave de mês dos pagamentos: "AAAA-M" com o mês começando em ZERO ("2026-10" = Nov/2026).
function mesPag(chave) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(chave));
  return m ? `${MESES[Number(m[2])] || "?"}/${m[1]}` : String(chave);
}
// Chave "AAAA-MM" com mês começando em UM (fatEmissoes, lançamentos avulsos).
function mesIso(chave) {
  const m = /^(\d{4})-(\d{2})/.exec(String(chave || ""));
  return m ? `${MESES[Number(m[2]) - 1] || "?"}/${m[1]}` : String(chave || "");
}
const nomeMod = (id) => MODULOS[id] || id;

// pagamentos[mod][item][chave] e recPagamentos[mod][item][chave] = {pago, dataPago, obs, nf, asaas:{st}}
function difPagamentos(secao, antes, depois, out) {
  const A = obj(antes), D = obj(depois);
  for (const mod of new Set([...Object.keys(A), ...Object.keys(D)])) {
    const am = obj(A[mod]), dm = obj(D[mod]);
    for (const item of new Set([...Object.keys(am), ...Object.keys(dm)])) {
      const ai = obj(am[item]), di = obj(dm[item]);
      for (const k of new Set([...Object.keys(ai), ...Object.keys(di)])) {
        const a = obj(ai[k]), d = obj(di[k]);
        if (igual(a, d)) continue;
        const quem = `${item === "_mod_" ? nomeMod(mod) : item} (${nomeMod(mod)})`;
        const ref = `${secao}.${mod}.${item}.${k}`;
        if (!!a.pago !== !!d.pago) {
          out.push({ secao, ref, texto: `${d.pago ? "marcou" : "desmarcou"} ${quem} como paga em ${mesPag(k)}` });
        } else if (obj(a.asaas).st !== obj(d.asaas).st && obj(d.asaas).st) {
          out.push({ secao, ref, texto: `boleto de ${quem} em ${mesPag(k)}: ${obj(a.asaas).st || "—"} → ${d.asaas.st}` });
        } else {
          const campos = Object.keys({ ...a, ...d }).filter((c) => !igual(a[c], d[c]));
          out.push({ secao, ref, texto: `alterou ${campos.join(", ")} de ${quem} em ${mesPag(k)}` });
        }
      }
    }
  }
}

// rec[mod][item] = {valor, inicio, meses}
function difRec(antes, depois, out) {
  const A = obj(antes), D = obj(depois);
  for (const mod of new Set([...Object.keys(A), ...Object.keys(D)])) {
    const am = obj(A[mod]), dm = obj(D[mod]);
    for (const item of new Set([...Object.keys(am), ...Object.keys(dm)])) {
      const a = obj(am[item]), d = obj(dm[item]);
      if (igual(a, d)) continue;
      const ref = `rec.${mod}.${item}`;
      if ((a.valor || 0) !== (d.valor || 0)) {
        out.push({ secao: "rec", ref, texto: `mudou o valor de ${item} (${nomeMod(mod)}): ${brl(a.valor)} → ${brl(d.valor)}` });
      } else {
        out.push({ secao: "rec", ref, texto: `mudou início/duração de ${item} (${nomeMod(mod)})` });
      }
    }
  }
}

// Listas com id: [{id, ...}] — inclusão, exclusão e alteração, com um rótulo legível.
function rotulo(x) {
  const nome = x.nome || x.desc || x.cliente || x.item || x.descricao || x.patrimonio || `#${x.id}`;
  const valor = x.valor != null ? ` (${brl(x.valor)}${x.mes ? ", " + mesIso(x.mes) : ""})` : "";
  return nome + valor;
}
function difLista(secao, antes, depois, out) {
  const A = Array.isArray(antes) ? antes : [], D = Array.isArray(depois) ? depois : [];
  const chave = (x, i) => (x && x.id != null ? String(x.id) : `@${i}`);
  const ma = new Map(A.map((x, i) => [chave(x, i), x])), md = new Map(D.map((x, i) => [chave(x, i), x]));
  const nome = NOMES_SECAO[secao] || secao;
  for (const [k, d] of md) {
    const a = ma.get(k);
    if (!a) out.push({ secao, ref: `${secao}.${k}`, texto: `incluiu em ${nome}: ${rotulo(obj(d))}` });
    else if (!igual(a, d)) {
      if (secao === "leads" && a.estagio !== d.estagio) {
        out.push({ secao, ref: `${secao}.${k}`, texto: `moveu o lead ${rotulo(obj(d))} de ${a.estagio || "—"} para ${d.estagio || "—"}` });
        continue;
      }
      const campos = Object.keys({ ...a, ...d }).filter((c) => !igual(a[c], d[c]));
      const det = campos.includes("valor") ? `: valor ${brl(a.valor)} → ${brl(d.valor)}` : ` (${campos.join(", ")})`;
      out.push({ secao, ref: `${secao}.${k}`, texto: `alterou em ${nome}: ${rotulo(obj(d))}${det}` });
    }
  }
  for (const [k, a] of ma) if (!md.has(k)) out.push({ secao, ref: `${secao}.${k}`, texto: `apagou de ${nome}: ${rotulo(obj(a))}` });
}

// fatEmissoes['<id>|<AAAA-MM>'] = {status, modo, valor, nf, boleto, ...}
function difEmissoes(antes, depois, out) {
  const A = obj(antes), D = obj(depois);
  for (const k of new Set([...Object.keys(A), ...Object.keys(D)])) {
    const a = A[k], d = D[k];
    if (igual(a, d)) continue;
    const [cli, comp] = k.split("|");
    const ref = `fatEmissoes.${k}`;
    if (!d) out.push({ secao: "fatEmissoes", ref, texto: `apagou a emissão de ${cli} em ${mesIso(comp)}` });
    else if (!a) out.push({ secao: "fatEmissoes", ref, texto: `emitiu ${cli} em ${mesIso(comp)}: ${d.modo || "?"} ${brl(d.valor)} (${d.status || "?"})` });
    else out.push({ secao: "fatEmissoes", ref, texto: `emissão de ${cli} em ${mesIso(comp)}: ${a.status || "—"} → ${d.status || "—"}${d.nf && d.nf !== a.nf ? ", nota " + d.nf : ""}` });
  }
}

const ESPECIAIS = {
  pagamentos: (a, d, o) => difPagamentos("pagamentos", a, d, o),
  recPagamentos: (a, d, o) => difPagamentos("recPagamentos", a, d, o),
  rec: difRec,
  fatEmissoes: difEmissoes,
};

/** Compara dois estados do hub e devolve [{secao, ref, texto}] em português simples. */
export function descreverMudancas(antes, depois, { limite = 200 } = {}) {
  const A = obj(antes), D = obj(depois), out = [];
  for (const secao of new Set([...Object.keys(A), ...Object.keys(D)])) {
    if (secao.startsWith("_") || secao === "migracoes") continue;
    if (igual(A[secao], D[secao])) continue;
    if (ESPECIAIS[secao]) ESPECIAIS[secao](A[secao], D[secao], out);
    else if (Array.isArray(A[secao]) || Array.isArray(D[secao])) difLista(secao, A[secao], D[secao], out);
    else out.push({ secao, ref: secao, texto: `alterou ${NOMES_SECAO[secao] || secao}` });
  }
  if (out.length > limite) {
    const resto = out.length - limite;
    return [...out.slice(0, limite), { secao: "_", ref: "_", texto: `… e mais ${resto} mudança(s)` }];
  }
  return out;
}
