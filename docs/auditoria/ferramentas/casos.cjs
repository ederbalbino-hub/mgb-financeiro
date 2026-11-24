// Casos de teste das contas do hub. Rodar: node casos.js
const { novoCtx, linha, REPO } = require('./harness.cjs');
const path = require('path');
let n = 0;
function caso(titulo, obtido, esperado, nota) {
  n++;
  const ok = (typeof obtido==='number'&&typeof esperado==='number') ? Math.abs(obtido-esperado)<1e-9 : JSON.stringify(obtido) === JSON.stringify(esperado);
  if (typeof obtido==='number' && !isFinite(obtido)) obtido = String(obtido);
  console.log((ok ? 'OK   ' : 'BUG  ') + '#' + n + ' ' + titulo + '\n      obtido=' + JSON.stringify(obtido) + '  esperado=' + JSON.stringify(esperado) + (nota ? '\n      ' + nota : ''));
}
const R2 = (v) => Math.round(v * 100) / 100;

// ── 1. Imposto: Simples vazio vs 0, sem somar ISS ──
{
  let c = novoCtx({ notaConfig: { aliquotaMes: 2.37, simplesMes: '' } });
  caso('Simples vazio => 7,40%', c.impostoAliq(), 0.074);
  c = novoCtx({ notaConfig: { aliquotaMes: 2.37, simplesMes: 0 } });
  caso('Simples 0 => 0% (respeita 0)', c.impostoAliq(), 0);
  c = novoCtx({ notaConfig: { aliquotaMes: 2.37, simplesMes: '6,5' } });
  caso('Simples digitado com vírgula "6,5" => 6,5%', c.impostoAliq(), 0.065, 'Number("6,5") = NaN -> ||0 => imposto ZERO (suspeita: depende se o input salva string com vírgula) linha ' + linha('impostoSimples'));
  c = novoCtx({ notaConfig: { aliquotaMes: 2.37 }, rec: { mb: { Benjamin: { valor: 10000, inicio: '2026-01', meses: 12 } } } });
  const imp = c.coletaDespesasMes(2026, 10).find((d) => d.idx === '_imposto');
  caso('Imposto nov/26 sobre 10.000 = 740 (ISS não somado)', R2(imp.vlrMes), 740);
}

// ── 2. recOfMes: virada de ano, início futuro, meses 0/undefined ──
{
  const c = novoCtx({ rec: { mb: {
    Benjamin: { valor: 1000, inicio: '2026-11', meses: 3 },   // nov, dez, jan/27
    Calcadao: { valor: 500, inicio: '2027-02', meses: 12 },
  } } });
  c.MODULES[0].items.push('Calcadao');
  caso('Contrato nov/26 3 meses cobra jan/27', c.recOfMes('mb', 'Benjamin', 2027, 0), 1000);
  caso('Contrato nov/26 3 meses NÃO cobra fev/27', c.recOfMes('mb', 'Benjamin', 2027, 1), 0);
  caso('Início futuro (fev/27) não cobra nov/26', c.recOfMes('mb', 'Calcadao', 2026, 10), 0);
  c.rec.mb.Benjamin = { valor: 1000, inicio: '2026-11', meses: 0 };
  caso('meses=0 vira 12 (r.meses||12): cobra out/27', c.recOfMes('mb', 'Benjamin', 2027, 9), 1000, 'Comportamento: meses 0 => 12 meses. Esperado discutível (0 = sem contrato?)');
}

// ── 3. Pessoal: valMes override, pulaMes, virada de ano, parcelado meses 0 ──
{
  const c = novoCtx({
    pessoalRec: [{ id: 1, valor: 100, inicio: '2026-12', meses: 2, valMes: { '2027-01': 150 } }],
    pessoalDesp: [
      { id: 1, valor: 0.1, tipo: 'recorrente', inicio: '2026-01' },
      { id: 2, valor: 0.2, tipo: 'avista', inicio: '2026-11' },
      { id: 3, valor: 300, tipo: 'parcelado', inicio: '2026-12', meses: 2, pulaMes: { '2027-01': true } },
      { id: 4, valor: 50, tipo: 'recorrente', inicio: '2026-01', valMes: { '2026-11': 0 } },
    ],
  });
  caso('Pessoal rec valMes jan/27 = 150 (virada de ano)', c.pessoalRecMes(2027, 0), 150);
  caso('Pessoal desp nov/26 0,1+0,2 (+ override 0)', c.pessoalDespMes(2026, 10), 0.30000000000000004, 'float bruto; tela formata com 2 casas -> 0,30 (ok na tela, mas compara === falharia)');
  caso('Pessoal desp parcelado pulaMes jan/27 = só recorrentes', c.pessoalDespMes(2027, 0), 50.1);
  c.pessoalDesp[3].valMes = { '2026-11': 0 };
  caso('valMes=0 zera o mês (recorrente de 50 some em nov)', R2(c.pessoalDespMes(2026, 10)), 0.3);
  c.pessoalDesp = [{ id: 9, valor: 0, tipo: 'avista', inicio: '2026-11', valMes: { '2026-11': 80 } }];
  caso('base 0 com override 80 no mês => 80', c.pessoalDespMes(2026, 10), 80, 'if(!d.valor) return acc descarta o item antes de olhar valMes (linha ' + linha('pessoalDespMes') + ')');
}

// ── 4. Despesas de módulo: parcelado nparc 0/undefined, recorrente mesesRec 0 ──
{
  const c = novoCtx({ db: { mb: { Benjamin: [
    { t: 'Parcelado', q: 1, u: 3000, nparc: 0, dataInicio: '2026-11' },
  ] } } });
  caso('Parcelado nparc=0 → despesa do mês (só mb)', c.despesaTotalMesMod('mb', 2026, 10), 3000, 'dur usa nparc||1 mas o valor divide por r.nparc cru → Infinity (linha ~10526)');
  c.db.mb.Benjamin = [{ t: 'Parcelado', q: 1, u: 3000, dataInicio: '2026-11' }];
  caso('Parcelado sem nparc → despesa do mês (só mb)', c.despesaTotalMesMod('mb', 2026, 10), 3000);
  caso('…e o total do mês inteiro (pró-labore 1.621 + 3.000)', c.despesaTotalMes(2026, 10), 4621, 'NaN contamina despesaTotalMes inteiro (Início, Financeiro, Resultado)');
  c.db.mb.Benjamin = [{ t: 'Parcelado', q: 1, u: 1000, nparc: 3, dataInicio: '2026-11' }];
  caso('Parcelado 1000/3 x3 soma 1000,00 exatos', R2([10, 11].map((m) => c.despesaTotalMesMod('mb', 2026, m)).reduce((a, b) => a + b, 0) + c.despesaTotalMesMod('mb', 2027, 0)), 1000);
  caso('Parcela 1000/3 exibida = 333,33 (3×333,33=999,99)', R2(c.despesaTotalMesMod('mb', 2026, 10)), 333.33, 'centavo perdido na apresentação; soma bruta fecha');
}

// ── 5. Despesa compartilhada e anunciantes divididos por telas ──
{
  const c = novoCtx({
    anunciantes: [{ id: 1, nome: 'Anunc X', valor: 900, inicio: '2026-11', meses: 1, telas: ['Lagoa Dourada', 'Uptown', 'Tela Removida'] }],
    despesasComp: [{ id: 1, nome: 'Operador', valor: 500, inicio: '2026-11', meses: 1, telas: ['Lagoa Dourada', 'Uptown'] }],
  });
  caso('Receita elev nov/26 com anunciante de 900 em 3 telas (1 removida)', R2(c.recModMes('elev', 2026, 10)), 900, 'tela fora de MODULES.items some com 1/3 do valor (linha ' + linha('anuncRecByTelaMes') + ')');
  caso('Despesa compartilhada 500 entra 1x (não multiplicada por tela)', c.despesaTotalMesMod('elev', 2026, 10), 500);
  // despCompIsAtivo: compartilhada que só começa no futuro
  c.despesasComp.push({ id: 2, nome: 'Futuro', valor: 200, inicio: '2027-06', meses: 1, telas: ['Spot'] });
  caso('despCompIsAtivo de compartilhada que começa em jun/27 (hoje nov/26)', c.despCompIsAtivo(c.despesasComp[1]), false, 'não checa o início — card "Rateadas /mês" do módulo soma 200 a mais');
}

// ── 6. Sócios (CC) Jadson × Eder e despesa paga do bolso ──
{
  const c = novoCtx({ elevInvestimentos: [
    { id: 1, item: 'Histórico', valor: 25000, pagoPor: 'eder', data: '2026-10-06' },
    { id: 2, item: 'Histórico', valor: 23000, pagoPor: 'jadson', data: '2026-10-06' },
    { id: 3, item: 'Uptown', valor: 120.5, pagoPor: 'jadson', data: '2026-11-30', tipo: 'despesa' },
    { id: 4, item: 'Uptown', valor: 800, pagoPor: 'eder', data: '2026-11-10', tipo: 'investimento' },
  ] });
  const t = c.elevInvestTotais();
  caso('CC Jadson = 23.120,50', t.jadson, 23120.5);
  caso('Total investido = 48.800 (sem a gasolina)', t.total, 48800);
  caso('Despesa do sócio entra em nov/26 da Tela Vertical', c.despesaTotalMesMod('elev', 2026, 10), 120.5);
  caso('Despesa do sócio NÃO entra em dez/26', c.despesaTotalMesMod('elev', 2026, 11), 0);
  // pagoPor fora de jadson/eder (dado antigo ou vazio)
  c.elevInvestimentos.push({ id: 5, item: 'Geral', valor: 100, pagoPor: '', data: '2026-11-05', tipo: 'despesa' });
  const t2 = c.elevInvestTotais();
  caso('Total investido com despesa sem pagoPor continua 48.800', t2.total, 48800, 'total = jadson+eder−despesas desconta despesa que nunca foi somada (linha ' + linha('elevInvestTotais') + ')');
  // Coluna "Investido" por condomínio (tvCondosRender ~12117) soma tudo do item, inclusive tipo despesa
  const invUptown = c.elevInvestimentos.filter((x) => x.item === 'Uptown').reduce((a, x) => a + (x.valor || 0), 0);
  caso('Coluna "Investido" Uptown (fórmula de tvCondosRender) = 800', invUptown, 800, 'soma a gasolina 120,50 como investimento, e ela também aparece em "Despesas do mês" do mesmo condomínio');
  // Excedente do Eder: despesa paga pelo Jadson vira "custo do Eder" se despesa>receita
  const r = c.elevMesResumo(2026, 10);
  caso('Excedente nov/26 (sem receita) não deve atribuir ao Eder a gasolina paga pelo Jadson', r.excedente, 100, 'excedente=' + r.excedente + ' inclui 120,50 que já está na CC do Jadson (suspeita de regra — confirmar com Eder)');
}

// ── 7. Boleto com ISS retido (Londrina) ──
{
  const c = novoCtx({ notaConfig: { aliquotaMes: 2.37 } });
  caso('Boleto 1.234,56 com ISS 2,37% retido = 1.205,30', c.fFatBoleto({ valor: 1234.56, issRetido: true, modo: 'ambos' }), 1205.30);
  caso('Só boleto não desconta ISS', c.fFatBoleto({ valor: 1000, issRetido: true, modo: 'boleto' }), 1000);
  c.notaConfig.aliquotaMes = 2.01;
  caso('Boleto 50,00 com ISS 2,01%: ISS = 1,005 → arredonda 1,01 → 48,99', c.fFatBoleto({ valor: 50, issRetido: true, modo: 'ambos' }), 48.99, '50*2.01=100.49999999999999 em float → Math.round=100 → ISS 1,00 (meio-centavo para baixo)');
  c.notaConfig.aliquotaMes = '2,37';
  caso('Alíquota ISS salva como "2,37" (string com vírgula)', c.fFatBoleto({ valor: 1000, issRetido: true, modo: 'ambos' }), 976.30, 'Number("2,37")=NaN→0: boleto sai cheio (suspeita — depende do input)');
}

// ── 8. Divergência: receita total × soma dos módulos × relatório anual ──
{
  const c = novoCtx({
    notaConfig: { aliquotaMes: 2.37 },
    rec: { mb: { Benjamin: { valor: 10000, inicio: '2026-01', meses: 12 } } },
    receitasAvulsas: [{ id: 1, cliente: 'Loja', valor: 2000, mes: '2026-11' }],
  });
  const total = c.finGetRec(2026, 10);
  const somaMod = c.MODULES.reduce((a, m) => a + c.recModMes(m.id, 2026, 10), 0);
  const rel = c.relAnualDados(2026);
  caso('Receita nov/26 Visão Geral/Início = 12.000', total, 12000);
  caso('Relatório anual nov/26 receita = mesma 12.000', rel.recPorMes[10], 12000, 'relAnualDados soma só recModMes: perde a receita avulsa (2.000), mas o imposto dela (148) está nas despesas → lucro do relatório 2.000 menor (linha ' + linha('relAnualDados') + ')');
  caso('Tabela "Por módulo" (financeiro.js) soma = receita do topo', somaMod, total, 'financeiro.js desenharResumo: linhas por módulo usam recModMes; topo usa finGetRec');
  // mês fechado pelas notas
  c.notaConfig.fechamentos = { '2026-11': { receitaNotas: 11500 } };
  caso('Mês fechado: Visão Geral usa notas (11.500)', c.finGetRec(2026, 10), 11500);
  caso('Mês fechado: relatório anual usa o mesmo 11.500', c.relAnualDados(2026).recPorMes[10], 11500, 'relatório anual continua na prevista dos contratos');
}

// ── 9. Bot WhatsApp "saldo do mês" × hub ──
(async () => {
  const sheets = await import(path.join(REPO, 'bot/lib/sheets.js'));
  const state = {
    rec: { mb: { Benjamin: { valor: 10000, inicio: '2026-01', meses: 12 } } },
    db: { mb: { Benjamin: [{ t: 'Recorrente', q: 1, u: 100, mesesRec: 12, dataInicio: '2026-01' }] } },
    empresaDespesas: [{ id: 1, nome: 'Contador', valor: 500, inicio: '2026-01', ativo: true }],
    notaConfig: { aliquotaMes: 2.37 },
  };
  const bot = sheets.calcularSaldo(state, 2026, 10);
  const c = novoCtx({ rec: state.rec, db: state.db, empresaDespesas: state.empresaDespesas, notaConfig: state.notaConfig });
  const hubDesp = R2(c.finGetDesp(2026, 10));
  caso('Bot saldo nov/26 despesa = hub', bot.despesa, hubDesp, 'bot (bot/lib/sheets.js calcularSaldo) ignora imposto 740, contador 500, pró-labore 1.621, avulsas, compartilhadas, sócio, anunciantes');
  caso('Bot saldo nov/26 lucro = hub', bot.lucro, R2(c.finGetRec(2026, 10) - c.finGetDesp(2026, 10)));

  // ── 10. Fuso: mês em UTC ──
  const d = new Date('2026-11-30T21:30:00-03:00');
  caso('toISOString().slice(0,7) às 21h30 de 30/11 (Brasília)', d.toISOString().slice(0, 7), '2026-11', 'dá 2026-12: competência do Faturamento/Fechamento/Contador default (empresaDespesas.inicio) e Léo saem no mês seguinte');
  console.log('\n' + n + ' casos');
})();

// ── 11. Extras: renomear condomínio, despesa sem data "anda" de mês ──
setTimeout(() => {
  const { novoCtx } = require('./harness.cjs');
  const c = novoCtx({ anunciantes: [{ id: 1, nome: 'Padaria', valor: 600, inicio: '2026-11', meses: 6, telas: ['Uptown', 'Spot'] }] });
  // renomear 'Uptown' pelo modal de unidade (index.html ~13177) troca só m.items, não a.telas
  c.MODULES[1].items[1] = 'Uptown Residence';
  const recMod = c.recModMes('elev', 2026, 10);
  const recLista = c.coletaClientesMes(2026, 10).filter((l) => l.modId === 'elev').reduce((a, l) => a + l.valor, 0);
  console.log((recMod === recLista ? 'OK   ' : 'BUG  ') + 'Renomear condomínio: receita do módulo=' + recMod + ' × Visão Receita/cobrança=' + recLista + ' (esperado 600 e 600)');

  // Despesa à vista sem venc, não paga: entra no mês "de hoje" -> o resultado de meses passados muda conforme o dia em que se olha
  const RealDate = Date;
  const mk = (iso) => { class D extends RealDate { constructor(...a) { super(...(a.length ? a : [iso])); } } return D; };
  const est = { db: { mb: { Benjamin: [{ t: 'À vista', q: 1, u: 400, venc: '', pago: false }] } } };
  const cNov = novoCtx(Object.assign({ Date: mk('2026-11-23T12:00:00-03:00') }, JSON.parse(JSON.stringify(est))));
  const cDez = novoCtx(Object.assign({ Date: mk('2026-12-05T12:00:00-03:00') }, JSON.parse(JSON.stringify(est))));
  const novVistoEmNov = cNov.despesaTotalMesMod('mb', 2026, 10), novVistoEmDez = cDez.despesaTotalMesMod('mb', 2026, 10);
  console.log((novVistoEmNov === novVistoEmDez ? 'OK   ' : 'BUG  ') + 'Despesa sem data: nov/26 visto em 23/11=' + novVistoEmNov + ' × visto em 05/12=' + novVistoEmDez + ' (esperado igual; o resultado de nov "melhora" 400 sozinho em dezembro)');
}, 50);
