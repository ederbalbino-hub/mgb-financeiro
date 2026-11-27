// Carrega funções de conta do index.html num contexto vm, com stubs mínimos (testes e docs/auditoria/ferramentas/casos.cjs).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const REPO = path.resolve(__dirname, '../../..');  // raiz do repositório (bot/test/apoio → ../../..)
const SRC = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');

function extrair(nome) {
  const re = new RegExp('^function ' + nome + '\\s*\\(', 'm');
  const m = re.exec(SRC);
  if (!m) throw new Error('não achei ' + nome);
  let i = SRC.indexOf('{', m.index), prof = 0, j = i;
  for (; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') prof++;
    else if (c === '}') { prof--; if (prof === 0) break; }
  }
  return SRC.slice(m.index, j + 1);
}
function linha(nome) { const m = new RegExp('^function ' + nome + '\\s*\\(', 'm').exec(SRC); return SRC.slice(0, m.index).split('\n').length; }

const FUNCS = ['ymKey', 'impostoIss', 'impostoSimples', 'impostoAliq', 'impostoRotulo', 'pesValorNoMes', 'pesPulou', 'pessoalRecMes', 'pessoalDespMes',
  'anuncRecByTelaMes', 'recOfMes', 'recModMes', 'finYear', 'finGetRecPrevista', 'receitaOficialMes', 'finGetRec', 'despPagKey',
  'coletaDespesasMes', 'despesaTotalMes', 'despesaTotalMesMod', 'finGetDesp', 'elevInvestTotais', 'elevInvestidoDoItem', 'elevMesResumo', 'fFatBoleto', 'fFatNoContrato',
  'relAnualDados', 'despCompIsAtivo', 'contratosLista', 'recTarobaGetMes', 'tarobaRecMap', 'recPagKey', 'recDefault', 'coletaClientesMes'];

function novoCtx(estado) {
  const MGBFinancas = require(path.join(REPO, 'financas.js'));
  const MGBLancar = require(path.join(REPO, 'lancar.js'));
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const ctx = Object.assign({
    console, Math, Number, String, Object, Array, JSON, Date, isFinite, parseInt, parseFloat, Set,
    MGBFinancas, MGBLancar, MESES, window: {}, ELEV_SOCIO_NO_RESULTADO: true,
    MODULES: [
      { id: 'mb', label: 'MB — Móveis Brasília', items: ['Benjamin', 'Calçadão'] },
      { id: 'elev', label: 'Tela Vertical', items: ['Lagoa Dourada', 'Uptown', 'Spot'] },
      { id: 'vaapty', label: 'Vaapty', items: ['Franqueado Piloto'] },
      { id: 'radio', label: 'Rádio Interna', items: ['Leo Cosméticos'] },
      { id: 'taroba', label: 'Tarobá', items: ['Rádio Tarobá Londrina'] },
      { id: 'radioops', label: 'Rádio Moinho', items: ['Famiglia Venturelli'] },
    ],
    rec: {}, db: {}, fin: {}, notaConfig: { aliquotaMes: null }, anunciantes: [], despesasComp: [], elevInvestimentos: [],
    empresaDespesas: [], empresaAvulsas: [], receitasAvulsas: [], pessoalRec: [], pessoalDesp: [], recPagamentos: {}, despPagamentos: {},
    ropsFinMes: () => ({ receita: 0, despesaCmx: 0, radios: 0, radiosCmx: 0, guina: 0, guinaPct: 25, guinaBase: 0, guinaFontes: [], guinaOrigem: '' }),
    vaaptyRepasseMes: () => ({ valor: 0, pct: 0, base: 0 }),
    f: (v) => 'R$ ' + Number(v).toFixed(2),
  }, estado || {});
  ctx.recObj = (modId, item) => (ctx.rec[modId] || {})[item] || { valor: 0, inicio: '', meses: 12 };
  vm.createContext(ctx);
  vm.runInContext(FUNCS.map(extrair).join('\n'), ctx);
  return ctx;
}
module.exports = { novoCtx, extrair, linha, SRC, REPO };
