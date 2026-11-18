// Quem lê e quem grava cada seção do estado do hub, por papel.
//
// Até 11/2026 qualquer login recebia o estado inteiro (financeiro da MGB, clientes e até o Pessoal
// do Eder); o menu só escondia as telas. Agora o servidor (api/estado.js) entrega a cada papel só as
// seções das telas que ele usa, e na gravação só aceita mudança nas seções que ele pode gravar —
// as demais ficam exatamente como estão no banco.
//
// Mapa feito a partir do código das telas (acesso.js → PERFIS):
//   admin        tudo
//   financeiro   tudo, menos o Pessoal do Eder (a Karen não tem a tela Pessoal nem o Plano de Caixa).
//                Funil de vendas (leads): só os FECHADOS. O funil é do Eder: a Karen não cria, não apaga
//                e não muda a etapa de lead nenhum. A única coisa que ela grava num lead fechado é a marca
//                de "já cadastrado" (itemCriado), que o Novo cliente (novo.js) põe ao cadastrar — é ela que
//                tira o cliente do aviso "Fechados no CRM, esperando cadastro" da Home.
//                Quando o Eder fecha um lead, Karen e Eder recebem e-mail (lib/notificacao.js).
//   bureau       Guina: Home + Rádio Ops. O Rádio Ops vem do sistema próprio dele, não do estado.
//   programacao  Cleiton: Home + Estúdio + Ferramentas. Só as Etiquetas (Ferramentas) usam o estado;
//                Spots não guardam nada e os Blocos de rádio ficam em outro servidor.
//
// "migracoes" (marcas das migrações já aplicadas) vai para todos: sem ela o navegador acharia que
// precisa rodar de novo migrações antigas. Seção nova que aparecer no futuro: só admin e financeiro
// enxergam até alguém incluir na lista de outro papel.

export const SECOES_PESSOAIS = ["pessoalRec", "pessoalDesp", "pessoalPag", "pessoalRecPag", "pessoalRegras", "pessoalUltimaImport"];

const TODAS = { tudo: true };
const POLITICA = {
  admin: { ler: TODAS, gravar: TODAS },
  financeiro: {
    ler: { exceto: SECOES_PESSOAIS },
    gravar: { exceto: [...SECOES_PESSOAIS, "leads"] },
    filtros: { leads: (lista) => (Array.isArray(lista) ? lista.filter((l) => l && l.estagio === "fechado") : lista) },
    mesclas: { leads: mesclarLeadsKaren },
  },
  bureau: { ler: { so: ["migracoes"] }, gravar: { so: [] } },
  programacao: { ler: { so: ["migracoes", "etiquetas"] }, gravar: { so: ["etiquetas"] } },
};

// Campos de um lead FECHADO que a Karen pode gravar.
const CAMPOS_LEAD_KAREN = ["itemCriado"];
function mesclarLeadsKaren(atuais, enviados) {
  if (!Array.isArray(atuais)) return atuais;
  const daKaren = new Map((Array.isArray(enviados) ? enviados : []).filter((l) => l && l.id != null).map((l) => [l.id, l]));
  return atuais.map((l) => {
    const k = l && l.estagio === "fechado" ? daKaren.get(l.id) : null;
    if (!k) return l;
    const novo = { ...l };
    for (const c of CAMPOS_LEAD_KAREN) if (c in k) novo[c] = k[c];
    return novo;
  });
}

const ehMeta = (secao) => secao.startsWith("_"); // _v, _salvoPor, _salvoEm, _salvoLogin

function permite(regra, secao) {
  if (!regra) return false;
  if (regra.tudo) return true;
  if (regra.exceto) return !regra.exceto.includes(secao);
  return (regra.so || []).includes(secao);
}

export function podeLer(papel, secao) {
  return ehMeta(secao) || permite(POLITICA[papel]?.ler, secao);
}

export function podeGravar(papel, secao) {
  return !ehMeta(secao) && permite(POLITICA[papel]?.gravar, secao);
}

// Estado como o papel pode ver (mesma ordem das chaves, para o hash por seção do hub bater).
export function veTudo(papel) {
  const p = POLITICA[papel];
  return !!p?.ler?.tudo && !p.filtros;
}

export function filtrarLeitura(estado, papel) {
  if (veTudo(papel)) return estado;
  const filtros = POLITICA[papel]?.filtros || {};
  const out = {};
  for (const [k, v] of Object.entries(estado)) if (podeLer(papel, k)) out[k] = filtros[k] ? filtros[k](v) : v;
  return out;
}

// Junta o que o papel mandou com o que está no banco: só as seções que ele pode gravar mudam.
// Seção que não veio no envio fica como está (um navegador com versão antiga do hub, que ainda não
// conhece uma seção nova, não a apaga).
// Devolve {doc, mudou}. `mudou` = false quando nenhuma seção gravável foi alterada (nem precisa gravar).
export function mesclarGravacao(atual, enviado, papel) {
  const doc = { ...atual };
  let mudou = false;
  const mesclas = POLITICA[papel]?.mesclas || {};
  for (const [k, v0] of Object.entries(enviado)) {
    if (ehMeta(k)) continue;
    let v = v0;
    if (mesclas[k]) v = mesclas[k](atual[k], v0); // gravação parcial de uma seção (ex.: leads da Karen)
    else if (!podeGravar(papel, k)) continue;
    if (JSON.stringify(atual[k]) !== JSON.stringify(v)) mudou = true;
    doc[k] = v;
  }
  for (const k of ["_salvoPor", "_salvoLogin", "_salvoEm"]) if (k in enviado) doc[k] = enviado[k];
  return { doc, mudou };
}
