// Cliente do estado do hub para o bot do WhatsApp (via lib/appsScript.js, com o segredo do servidor).
// Lê o estado completo, modifica em memória e grava de volta com trava de versão: se alguém salvou
// no hub entre a leitura e a gravação, relê e aplica a mudança de novo (até 3 vezes), em vez de
// atropelar o que a pessoa salvou.

import { lerEstado, gravarEstado } from "./appsScript.js";

export async function loadState() {
  const { estado } = await lerEstado();
  return estado;
}

// Aplica `mudar(state)` sobre o estado mais novo e grava. Devolve o que `mudar` devolver.
export async function atualizarEstado(mudar) {
  for (let tentativa = 1; ; tentativa++) {
    const { estado, versao } = await lerEstado();
    const resultado = mudar(estado);
    estado._v = versao + 1;
    estado._salvoPor = "Bot WhatsApp";
    estado._salvoEm = new Date().toISOString();
    try {
      await gravarEstado(estado, versao);
      return resultado;
    } catch (e) {
      if (!e.conflito || tentativa >= 3) throw e;
    }
  }
}

// Adiciona um lançamento de despesa no db do módulo/unidade.
// Formato compatível com o que o dashboard espera (campo r.t, r.dataInicio, r.venc etc).
export async function addDespesa({ modId, item, descricao, fornecedor, valor, tipo, dataInicio, mesesRec, nparc, venc, cc }) {
  return atualizarEstado((state) => {
  if (!state.db) state.db = {};
  if (!state.db[modId]) state.db[modId] = {};
  if (!state.db[modId][item]) state.db[modId][item] = [];

  const entry = {
    t: tipo, // 'À vista' | 'Parcelado' | 'Recorrente'
    tipo: "Outros",
    d: descricao,
    f: fornecedor || "",
    q: 1,
    u: valor,
    cc: cc || "",
    venc: tipo === "À vista" ? (venc || "") : "",
    pago: false,
    dataPago: "",
  };
  if (tipo === "Parcelado") {
    entry.nparc = nparc || 1;
    entry.paga = 0;
    entry.dataInicio = dataInicio || isoMonth(new Date());
  } else if (tipo === "Recorrente") {
    entry.mesesRec = mesesRec || 12;
    entry.dataInicio = dataInicio || isoMonth(new Date());
  }

  state.db[modId][item].push(entry);
  return entry;
  });
}

// Marca uma receita como recebida no mês.
export async function marcarReceitaPaga({ modId, item, ano, mes }) {
  return atualizarEstado((state) => {
  if (!state.recPagamentos) state.recPagamentos = {};
  if (!state.recPagamentos[modId]) state.recPagamentos[modId] = {};
  if (!state.recPagamentos[modId][item]) state.recPagamentos[modId][item] = {};
  const key = `${ano}-${mes}`;
  state.recPagamentos[modId][item][key] = { pago: true, obs: "" };
  });
}

// Lista módulos e seus itens — útil pra montar o contexto que vai pro Claude.
export function modulosResumo(state) {
  const MODULES = [
    { id: "mb", label: "MB — Móveis Brasília", default_items: ["Benjamin", "Saul Elkind", "Santa Catarina", "Calçadão", "Rolândia", "Cornélio Procópio"] },
    { id: "elev", label: "Tela Vertical (elevadores)", default_items: ["Lagoa Dourada", "Lake Portinari", "Spazio Louvre", "Terra Parque", "Residencial Málaga"] },
    { id: "vaapty", label: "Vaapty", default_items: ["Franqueado Piloto", "Expansão"] },
    { id: "radio", label: "Rádio Interna", default_items: ["Mercadão Prochet", "Leo Cosméticos", "Supermercado Santarém", "Outros"] },
    { id: "tv", label: "TV Interna", default_items: ["Cliente Piloto", "Expansão"] },
    { id: "taroba", label: "Tarobá", default_items: ["Rádio Tarobá Londrina", "Rádio Tarobá Cascavel", "TV Tarobá Londrina", "TV Tarobá Cascavel"] },
  ];
  return MODULES.map((m) => {
    const items = state?.moduleItems?.[m.id] || m.default_items;
    return { id: m.id, label: m.label, items };
  });
}

// Calcula saldo (receita / despesa / lucro) do mês — mesma lógica simplificada do dashboard.
export function calcularSaldo(state, ano, mes) {
  let receita = 0;
  const rec = state?.rec || {};
  for (const modId of Object.keys(rec)) {
    for (const item of Object.keys(rec[modId])) {
      const ro = rec[modId][item];
      if (!ro?.valor || !ro?.inicio) continue;
      const [aI, mI] = ro.inicio.split("-").map(Number);
      const dur = ro.meses || 12;
      for (let k = 0; k < dur; k++) {
        const mk = (mI - 1 + k) % 12;
        const ak = aI + Math.floor((mI - 1 + k) / 12);
        if (ak === ano && mk === mes) {
          receita += ro.valor;
          break;
        }
      }
    }
  }

  let despesa = 0;
  const db = state?.db || {};
  for (const modId of Object.keys(db)) {
    for (const item of Object.keys(db[modId])) {
      for (const r of db[modId][item] || []) {
        if (r.t === "Recorrente" || r.t === "Parcelado") {
          if (!r.dataInicio) continue;
          const [aI, mI] = r.dataInicio.split("-").map(Number);
          const dur = r.t === "Parcelado" ? r.nparc || 1 : r.mesesRec || 12;
          for (let k = 0; k < dur; k++) {
            const mk = (mI - 1 + k) % 12;
            const ak = aI + Math.floor((mI - 1 + k) / 12);
            if (ak === ano && mk === mes) {
              despesa += r.t === "Parcelado" ? (r.q * r.u) / r.nparc : r.q * r.u;
              break;
            }
          }
        } else if (r.venc) {
          const [aV, mV] = r.venc.split("-").map(Number);
          if (aV === ano && mV - 1 === mes) despesa += r.q * r.u;
        }
      }
    }
  }

  return { receita, despesa, lucro: receita - despesa };
}

function isoMonth(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
