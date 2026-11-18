// Quem lê e quem grava cada seção do estado do hub, por papel.
//
// Até 11/2026 qualquer login recebia o estado inteiro (financeiro da MGB, clientes e até o Pessoal
// do Eder); o menu só escondia as telas. Agora o servidor (api/estado.js) entrega a cada papel só as
// seções das telas que ele usa, e na gravação só aceita mudança nas seções que ele pode gravar —
// as demais ficam exatamente como estão no banco.
//
// Mapa feito a partir do código das telas (acesso.js → PERFIS):
//   admin        tudo
//   financeiro   tudo, menos o Pessoal do Eder (a Karen não tem a tela Pessoal nem o Plano de Caixa)
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
  financeiro: { ler: { exceto: SECOES_PESSOAIS }, gravar: { exceto: SECOES_PESSOAIS } },
  bureau: { ler: { so: ["migracoes"] }, gravar: { so: [] } },
  programacao: { ler: { so: ["migracoes", "etiquetas"] }, gravar: { so: ["etiquetas"] } },
};

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

export function veTudo(papel) {
  return !!POLITICA[papel]?.ler?.tudo;
}

// Estado como o papel pode ver (mesma ordem das chaves, para o hash por seção do hub bater).
export function filtrarLeitura(estado, papel) {
  if (veTudo(papel)) return estado;
  const out = {};
  for (const [k, v] of Object.entries(estado)) if (podeLer(papel, k)) out[k] = v;
  return out;
}

// Junta o que o papel mandou com o que está no banco: só as seções que ele pode gravar mudam.
// Devolve {doc, mudou}. `mudou` = false quando nenhuma seção gravável foi alterada (nem precisa gravar).
export function mesclarGravacao(atual, enviado, papel) {
  if (POLITICA[papel]?.gravar?.tudo) return { doc: enviado, mudou: true };
  const doc = { ...atual };
  let mudou = false;
  for (const [k, v] of Object.entries(enviado)) {
    if (ehMeta(k)) continue;
    if (!podeGravar(papel, k)) continue;
    if (JSON.stringify(atual[k]) !== JSON.stringify(v)) mudou = true;
    doc[k] = v;
  }
  for (const k of ["_salvoPor", "_salvoLogin", "_salvoEm"]) if (k in enviado) doc[k] = enviado[k];
  return { doc, mudou };
}
