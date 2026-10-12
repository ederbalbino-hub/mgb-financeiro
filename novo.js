/* Hub MGB — botão "Novo": ponto de partida da Karen para lançar um cliente.
 *
 * Decisão de 10/10/2026 (desenho aprovado no canvas "Áreas de Trabalho do Hub MGB"):
 *  - no topo, os leads que o Eder fechou no CRM e que ainda não foram cadastrados;
 *  - abaixo, os produtos. Esta primeira entrega faz o "Novo condomínio" de ponta a ponta;
 *    os demais levam ao fluxo que já existe no hub ou aparecem como "em breve".
 *
 * Novo condomínio (parceria): condomínio paga R$ 0; custo da licença 4YouSee por tela (nota F6/4YouSee).
 * Ao criar: tela na Tela Vertical + despesa recorrente + lead marcado como cadastrado
 * + contrato de parceria enviado pelo Assinafy + aviso ao Cleiton pelo WhatsApp.
 *
 * Reaproveita o que o hub já tem (index.html): mgbCriarUnidadeModulo, applyToFin, db,
 * leads, scheduleSave, parcGerar. Não altera nenhum cálculo existente.
 */
(function (global) {
  'use strict';

  // Custos unitários pela nota dos fornecedores (11/10/2026):
  //   4YouSee Enterprise (F6 Sistemas, NFS-e 7523): R$ 39,56 por tela/player ao mês
  //   ListenX (NFS-e 724406): R$ 64,87 por unidade de rádio ao mês (3.567,85 ÷ 55)
  var CUSTO_TELA = 39.56;
  var CUSTO_POR_TORRE = CUSTO_TELA; // uma tela por torre
  var ASSINAFY_API_URL = 'https://script.google.com/macros/s/AKfycbwG-31A0O10zru2-klj4EbtiD5rg22R-kNG2TLE4Gkd_ZBStE-QNqsbkq-vwSf6vgf3/exec';

  // ── Regras puras (testadas em bot/test/novo.test.js) ───────────────────
  function custoCondominio(torres) {
    var t = parseInt(torres, 10);
    return t > 0 ? Math.round(t * CUSTO_POR_TORRE * 100) / 100 : 0;
  }

  function leadsPendentes(lista) {
    return (lista || []).filter(function (l) { return l && l.estagio === 'fechado' && !l.itemCriado; });
  }

  function normalizar(s) {
    return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  }

  function jaExiste(nome, existentes) {
    var n = normalizar(nome);
    return (existentes || []).some(function (x) { return normalizar(x) === n; });
  }

  function validarCondominio(d, existentes) {
    var erros = [];
    if (!String(d.nome || '').trim()) erros.push('Informe o nome do condomínio.');
    else if (jaExiste(d.nome, existentes)) erros.push('Já existe um condomínio com esse nome na Tela Vertical.');
    if (!(parseInt(d.torres, 10) > 0)) erros.push('Informe o número de torres.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio || '')) erros.push('Informe a data de início.');
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) erros.push('O e-mail do síndico parece incompleto.');
    return erros;
  }

  // Lançamento no mesmo formato do addItem do hub (recorrente, mês a mês).
  function despesaLicenca(torres, inicio, meses) {
    var t = parseInt(torres, 10) || 0;
    return {
      t: 'Recorrente', tipo: 'Licença',
      d: 'Sistema TV',
      f: '4YouSee', q: t, u: CUSTO_POR_TORRE, cc: '', venc: '', pago: false, dataPago: '',
      mesesRec: parseInt(meses, 10) || 36, dataInicio: String(inicio || '').slice(0, 7)
    };
  }

  // ── Rádio interna: uma unidade por vez, custo da unidade ListenX ──
  var CUSTO_RADIO = 64.87;

  function numero(v) {
    if (typeof v === 'number') return v;
    var s = String(v || '').trim().replace(/[R$\s]/g, '');
    if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
    return parseFloat(s) || 0;
  }

  function sobraRadio(valor, custo) { return Math.round((numero(valor) - (custo == null ? CUSTO_RADIO : numero(custo))) * 100) / 100; }

  function validarRadio(d, existentes) {
    var erros = [];
    if (!String(d.nome || '').trim()) erros.push('Informe o nome da unidade.');
    else if (jaExiste(d.nome, existentes)) erros.push('Já existe uma unidade com esse nome no módulo Rádio Interna.');
    if (!(numero(d.valor) > 0)) erros.push('Informe o valor mensal do contrato.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio || '')) erros.push('Informe a data de início.');
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) erros.push('O e-mail do cliente parece incompleto.');
    return erros;
  }

  function despesaRadio(inicio, meses, custo, descricao) {
    return {
      t: 'Recorrente', tipo: 'Licença', d: descricao || 'Licença da rádio interna', f: '', q: 1, u: custo == null ? CUSTO_RADIO : numero(custo),
      cc: '', venc: '', pago: false, dataPago: '',
      mesesRec: parseInt(meses, 10) || 12, dataInicio: String(inicio || '').slice(0, 7)
    };
  }

  // 'AAAA-MM-DD' + n meses → 'DD/MM/AAAA' (sem fuso horário no meio).
  function dataMais(iso, meses) {
    var p = String(iso || '').split('-').map(Number);
    if (p.length !== 3 || !p[0]) return '';
    var dt = new Date(Date.UTC(p[0], p[1] - 1 + (meses || 0), p[2]));
    return String(dt.getUTCDate()).padStart(2, '0') + '/' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '/' + dt.getUTCFullYear();
  }

  var EXT_MESES = { 6: 'seis', 12: 'doze', 24: 'vinte e quatro', 36: 'trinta e seis' };

  // Modelo padrão de contrato de rádio interna (não existia; criado em 10/10/2026).
  // Rascunho para revisão do Eder antes do primeiro envio a um cliente real.
  function contratoRadioInterna(d, opts) {
    opts = opts || {};
    var e = function (t) {
      return String(t == null || t === '' ? '' : t).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
    var L = function (v, n) { return v ? e(v) : '_'.repeat(n || 26); };
    var meses = parseInt(d.meses, 10) || 12;
    var valor = numero(d.valor);
    var valorFmt = 'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var extenso = typeof opts.extenso === 'function' ? ' (' + opts.extenso(valor) + ')' : '';
    var ini = dataMais(d.inicio, 0) || '____/____/______';
    var fim = dataMais(d.inicio, meses) || '____/____/______';
    var hoje = opts.hoje || '';
    var num = opts.numero || '';
    var comNota = d.nf !== 'boleto';
    var R = function (l, v) {
      return '<div style="display:flex;margin-bottom:5px;font-size:12.5px;line-height:1.5"><span style="font-weight:600;color:#2A1760;min-width:130px;flex-shrink:0">' + l +
        '</span><span style="color:#333;border-bottom:1px solid #e0d8f0;flex:1">' + v + '</span></div>';
    };
    var T = function (t) { return '<div style="font-family:Syne,sans-serif;font-size:11.5px;font-weight:700;color:#2A1760;margin:14px 0 4px;letter-spacing:.3px">' + t + '</div><div style="height:1px;background:#EAD9FF;margin:4px 0 10px"></div>'; };
    var C = function (t, corpo) { return '<div style="font-weight:700;color:#2A1760;font-size:12px;margin-bottom:3px">' + t + '</div><div style="color:#444;line-height:1.55;font-size:11.5px;margin-bottom:8px">' + corpo + '</div>'; };
    var mesesTxt = meses + ' (' + (EXT_MESES[meses] || meses) + ') meses';
    var tv = d.servico === 'tv';
    var S = tv ? {
      nome: 'TV Interna',
      objeto: '1.1. Prestação, pela CONTRATADA, do serviço de TV interna (TV corporativa) na unidade do CONTRATANTE identificada acima: exibição de conteúdo institucional, ofertas, informativos e programação do CONTRATANTE em tela(s) na unidade, operada e atualizada remotamente pela CONTRATADA.',
      c31: '3.1. Manter a programação da TV em funcionamento durante o horário de atendimento da unidade, com conteúdo adequado ao perfil do estabelecimento.',
      c32: '3.2. Produzir e exibir as peças do CONTRATANTE a partir do material ou das informações enviadas por ele, no prazo de até 3 (três) dias úteis após a aprovação.',
      c41: '4.1. Manter na unidade a energia elétrica e a conexão de internet necessárias à exibição, zelando pelos equipamentos instalados.',
      c43: 'qualquer falha na exibição',
      c5: '5.1. As peças, vinhetas e conteúdos produzidos pela CONTRATADA são licenciados ao CONTRATANTE exclusivamente para exibição na TV interna da unidade contratada durante a vigência deste contrato.'
    } : {
      nome: 'Rádio Interna',
      objeto: '1.1. Prestação, pela CONTRATADA, do serviço de rádio interna na unidade do CONTRATANTE identificada acima: programação musical ambiente, vinhetas e veiculação de spots institucionais e de ofertas do CONTRATANTE, operada e atualizada remotamente pela CONTRATADA.',
      c31: '3.1. Manter a rádio em funcionamento durante o horário de atendimento da unidade, com programação adequada ao perfil do estabelecimento.',
      c32: '3.2. Produzir e veicular os spots do CONTRATANTE a partir do material ou das informações enviadas por ele, no prazo de até 3 (três) dias úteis após a aprovação do texto.',
      c41: '4.1. Manter na unidade o sistema de som (caixas, amplificador) e a conexão de internet necessários à reprodução da rádio.',
      c43: 'qualquer falha na reprodução',
      c5: '5.1. Os spots, vinhetas e locuções produzidos pela CONTRATADA são licenciados ao CONTRATANTE exclusivamente para veiculação na rádio interna da unidade contratada durante a vigência deste contrato.<br>5.2. Eventuais obrigações de recolhimento de direitos autorais de execução pública musical (ECAD) relativas ao estabelecimento seguem a legislação aplicável.'
    };
    return '' +
      '<div style="padding:22px 28px 18px;border-bottom:3px solid #E879B0"><div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:8px">' +
      marcaContrato(opts) +
      '<div style="text-align:right"><div style="font-family:Syne,sans-serif;font-size:13px;font-weight:700;color:#2A1760;letter-spacing:.5px">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</div>' +
      '<div style="font-size:11px;color:#5B2D8E;font-weight:600">' + S.nome + '</div><div style="font-size:10px;color:#999;margin-top:2px">' + (num ? 'Nº ' + e(num) + ' · ' : '') + e(hoje) + '</div></div></div></div>' +
      '<div style="padding:22px 28px">' +
      T('1. DADOS DAS PARTES') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px">' +
      '<div style="border:1px solid #DDD0F0;border-radius:8px;padding:12px 14px"><div style="font-size:10px;font-weight:700;color:#5B2D8E;letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px">Contratante</div>' +
      R('Razão social', L(d.razao || d.nome)) + R('CNPJ/CPF', L(d.cnpj, 18)) + R('Unidade', L(d.nome)) + R('Endereço', L(d.end)) +
      R('Responsável', L(d.responsavel)) + R('E-mail', L(d.email)) + R('WhatsApp', L(d.wpp, 18)) + '</div>' +
      '<div style="border:1px solid #DDD0F0;border-radius:8px;padding:12px 14px"><div style="font-size:10px;font-weight:700;color:#5B2D8E;letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px">Contratada</div>' +
      R('Razão social', 'MGB Comunicação e Marketing Ltda.') + R('CNPJ', '23.770.170/0001-50') + R('Endereço', 'Londrina – PR') +
      R('Representante', 'Eder Balbino') + R('E-mail', 'comercial@agenciamgb.com.br') + R('WhatsApp', '(43) 99696-0078') + '</div></div>' +
      T('2. RESUMO') +
      '<table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:12px"><thead><tr style="background:#2A1760;color:#fff">' +
      '<th style="padding:6px 8px;text-align:left">Unidade</th><th style="padding:6px 8px">Mensalidade</th><th style="padding:6px 8px">Vigência</th><th style="padding:6px 8px">Início</th><th style="padding:6px 8px">Término</th></tr></thead>' +
      '<tbody><tr style="background:#F7F4FB"><td style="padding:5px 8px;color:#333;font-weight:500">' + L(d.nome) + '</td><td style="padding:5px 8px;text-align:center;color:#333">' + valorFmt +
      '</td><td style="padding:5px 8px;text-align:center;color:#333">' + meses + ' meses</td><td style="padding:5px 8px;text-align:center;color:#333">' + ini +
      '</td><td style="padding:5px 8px;text-align:center;color:#333">' + fim + '</td></tr></tbody></table>' +
      T('3. CLÁUSULAS E CONDIÇÕES') +
      C('CLÁUSULA 1ª — DO OBJETO', S.objeto + '<br>1.2. O contrato vale para uma única unidade. Cada nova unidade do CONTRATANTE será objeto de contrato próprio.') +
      C('CLÁUSULA 2ª — DO VALOR E DO PAGAMENTO', '2.1. Pelo serviço, o CONTRATANTE pagará à CONTRATADA o valor mensal de <strong>' + valorFmt + extenso + '</strong>.<br>2.2. A cobrança é emitida no dia 5 (cinco) de cada mês, por boleto bancário' + (comNota ? ', acompanhada da nota fiscal de serviço' : '') + ', com o vencimento indicado no boleto. A primeira cobrança refere-se ao mês de início do serviço.<br>2.3. O atraso no pagamento sujeita o CONTRATANTE a multa de 2% (dois por cento) e juros de 1% (um por cento) ao mês sobre o valor devido. Atraso superior a 30 (trinta) dias permite à CONTRATADA suspender o serviço até a regularização.<br>2.4. O valor será reajustado a cada 12 (doze) meses pela variação acumulada do IPCA/IBGE no período. Caso essa variação seja negativa ou igual a zero, será aplicada a variação acumulada do IGP-M/FGV no mesmo período.') +
      C('CLÁUSULA 3ª — DAS OBRIGAÇÕES DA CONTRATADA', S.c31 + '<br>' + S.c32 + '<br>3.3. Corrigir falhas na programação em até 48 (quarenta e oito) horas úteis após o aviso do CONTRATANTE.<br>3.4. Recusar conteúdo ilícito, ofensivo, político-partidário ou fora dos padrões técnicos, informando o motivo ao CONTRATANTE.') +
      C('CLÁUSULA 4ª — DAS OBRIGAÇÕES DO CONTRATANTE', S.c41 + '<br>4.2. Enviar com antecedência o material das campanhas e ofertas, sendo responsável pelo conteúdo e pela veracidade das informações divulgadas.<br>4.3. Comunicar à CONTRATADA ' + S.c43 + ' pelos canais (43) 99696-0078 | comercial@agenciamgb.com.br.<br>4.4. Efetuar os pagamentos nas datas de vencimento.') +
      C('CLÁUSULA 5ª — DOS DIREITOS AUTORAIS', S.c5) +
      C('CLÁUSULA 6ª — DO PRAZO E DA VIGÊNCIA', '6.1. Este contrato vigora por <strong>' + mesesTxt + '</strong>, de ' + ini + ' a ' + fim + '.<br>6.2. Findo o prazo, renova-se automaticamente por períodos iguais e sucessivos, salvo manifestação contrária de qualquer das partes, por escrito, com antecedência mínima de 30 (trinta) dias do término.') +
      C('CLÁUSULA 7ª — DA RESCISÃO', '7.1. Qualquer das partes pode rescindir este contrato mediante aviso prévio por escrito de 30 (trinta) dias, ficando devidos os valores do período de aviso.<br>7.2. O descumprimento de obrigação essencial, não sanado em 15 (quinze) dias após notificação, permite a rescisão imediata pela parte prejudicada.') +
      C('CLÁUSULA 8ª — DA PROTEÇÃO DE DADOS (LGPD)', '8.1. As partes tratarão os dados pessoais a que tiverem acesso em razão deste contrato conforme a Lei nº 13.709/2018, somente para a execução deste instrumento.') +
      C('CLÁUSULA 9ª — DO FORO', '9.1. Fica eleito o foro da Comarca de <strong>Londrina, Estado do Paraná</strong>, para dirimir quaisquer controvérsias decorrentes deste contrato.') +
      '<div style="color:#444;line-height:1.55;font-size:11.5px;margin:10px 0 18px;text-align:justify">E, por estarem de acordo, as partes assinam eletronicamente o presente instrumento.</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:28px;font-size:11.5px;color:#333;text-align:center">' +
      '<div style="border-top:1px solid #2A1760;padding-top:6px">' + L(d.razao || d.nome) + '<br><span style="color:#888">CONTRATANTE</span></div>' +
      '<div style="border-top:1px solid #2A1760;padding-top:6px">MGB Comunicação e Marketing Ltda.<br><span style="color:#888">CONTRATADA</span></div></div>' +
      '</div>';
  }

  // ── Anunciante da Rádio Mercadão (lojas do Mercadão Prochet) ──────────
  // Padrões da Cobrança Mensal do hub: R$ 100 por cota, repasse de 20% ao Mercadão,
  // 15 inserções/dia por cota. A grade tem 8 blocos × 3 spots = 24 cotas.
  var MERCADAO = { valorCota: 100, repasse: 20, insercoesCota: 15, blocos: 8, spots: 3 };

  function contaMercadao(cotas, valorCota, repassePct) {
    var total = Math.round((parseInt(cotas, 10) || 0) * numero(valorCota) * 100) / 100;
    var repasse = Math.round(total * numero(repassePct)) / 100;
    return { total: total, repasse: repasse, mgb: Math.round((total - repasse) * 100) / 100 };
  }

  // Lê a grade dos Blocos (formato mgb_blocos_v4: b{bloco}s{spot}_nome).
  function ocupacaoBlocos(grade) {
    var g = grade || {}, ocupadas = 0, nomes = [];
    for (var b = 1; b <= MERCADAO.blocos; b++) {
      for (var s = 1; s <= MERCADAO.spots; s++) {
        var n = String(g['b' + b + 's' + s + '_nome'] || '').trim();
        if (n) { ocupadas++; if (!jaExiste(n, nomes)) nomes.push(n); }
      }
    }
    return { total: MERCADAO.blocos * MERCADAO.spots, ocupadas: ocupadas, vagas: MERCADAO.blocos * MERCADAO.spots - ocupadas, nomes: nomes };
  }

  function validarMercadao(d, existentes, vagas) {
    var erros = [];
    var c = parseInt(d.cotas, 10);
    if (!String(d.nome || '').trim()) erros.push('Informe o nome da loja.');
    else if (jaExiste(d.nome, existentes)) erros.push('Essa loja já está nos Blocos ou já foi cadastrada como anunciante do Mercadão.');
    if (!(c > 0)) erros.push('Informe quantas cotas.');
    else if (vagas != null && c > vagas) erros.push('Só há ' + vagas + (vagas === 1 ? ' cota livre' : ' cotas livres') + ' nos Blocos.');
    if (!(numero(d.valorCota) > 0)) erros.push('Informe o valor por cota.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio || '')) erros.push('Informe a data de início.');
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) erros.push('O e-mail da loja parece incompleto.');
    return erros;
  }

  // Logo oficial (pasta Marca da MGB). O PNG em data URI é carregado na tela e passado em opts.logo,
  // porque o conversor de HTML→PDF do Apps Script não busca imagens de fora.
  function marcaContrato(opts) {
    if (opts && opts.logo) return '<div><img src="' + opts.logo + '" alt="MGB Mídia" style="height:52px;width:auto;display:block"></div>';
    return '<div><div style="font-family:Syne,sans-serif;font-size:18px;font-weight:800;color:#2A1760">MGB<span style="color:#E879B0">.</span></div><div style="font-size:10px;color:#2A1760;letter-spacing:.3em;margin-top:2px">MÍDIA</div></div>';
  }

  // Contrato de anúncio na Rádio Mercadão. Mesmas condições do contrato Mercadão que já
  // existe no hub (spot de 15s, 9h às 22h, 1 roteiro grátis por mês, aviso de 30 dias),
  // agora com cotas, valor por cota e envio pelo Assinafy.
  function contratoMercadao(d, opts) {
    opts = opts || {};
    var e = function (t) {
      return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
    var L = function (v, n) { return v ? e(v) : '_'.repeat(n || 26); };
    var brlC = function (v) { return 'R$ ' + numero(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var cotas = parseInt(d.cotas, 10) || 1;
    var meses = parseInt(d.meses, 10) || 1;
    var conta = contaMercadao(cotas, d.valorCota, 0);
    var ins = cotas * MERCADAO.insercoesCota;
    var ini = dataMais(d.inicio, 0) || '____/____/______';
    var fim = dataMais(d.inicio, meses) || '____/____/______';
    var adiantado = d.pagamento === 'adiantado';
    var extenso = typeof opts.extenso === 'function' ? ' (' + opts.extenso(conta.total) + ')' : '';
    var R = function (l, v) {
      return '<div style="display:flex;margin-bottom:5px;font-size:12.5px;line-height:1.5"><span style="font-weight:600;color:#2A1760;min-width:130px;flex-shrink:0">' + l +
        '</span><span style="color:#333;border-bottom:1px solid #e0d8f0;flex:1">' + v + '</span></div>';
    };
    var T = function (t) { return '<div style="font-family:Syne,sans-serif;font-size:11.5px;font-weight:700;color:#2A1760;margin:14px 0 4px;letter-spacing:.3px">' + t + '</div><div style="height:1px;background:#EAD9FF;margin:4px 0 10px"></div>'; };
    var C = function (t, corpo) { return '<div style="font-weight:700;color:#2A1760;font-size:12px;margin-bottom:3px">' + t + '</div><div style="color:#444;line-height:1.55;font-size:11.5px;margin-bottom:8px">' + corpo + '</div>'; };
    var pagamento = adiantado
      ? 'Pagamento único e antecipado de <strong>' + brlC(conta.total * meses) + '</strong>, referente aos ' + meses + (meses === 1 ? ' mês' : ' meses') + ' de veiculação, por boleto bancário, antes do início da veiculação.'
      : 'Cobrança mensal emitida no dia 5 (cinco) de cada mês, por boleto bancário, com o vencimento indicado no boleto. A primeira cobrança refere-se ao mês de início da veiculação.';
    var th = function (t) { return '<th style="padding:6px 8px">' + t + '</th>'; };
    var td = function (t) { return '<td style="padding:5px 8px;text-align:center;color:#333">' + t + '</td>'; };
    return '' +
      '<div style="padding:22px 28px 18px;border-bottom:3px solid #E879B0"><div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:8px">' +
      marcaContrato(opts) +
      '<div style="text-align:right"><div style="font-family:Syne,sans-serif;font-size:13px;font-weight:700;color:#2A1760;letter-spacing:.5px">CONTRATO DE VEICULAÇÃO</div>' +
      '<div style="font-size:11px;color:#5B2D8E;font-weight:600">Rádio Interna · Mercadão da Prochet</div><div style="font-size:10px;color:#999;margin-top:2px">' + (opts.numero ? 'Nº ' + e(opts.numero) + ' · ' : '') + e(opts.hoje || '') + '</div></div></div></div>' +
      '<div style="padding:22px 28px">' +
      T('1. DADOS DAS PARTES') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px">' +
      '<div style="border:1px solid #DDD0F0;border-radius:8px;padding:12px 14px"><div style="font-size:10px;font-weight:700;color:#5B2D8E;letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px">Contratante (lojista)</div>' +
      R('Razão social / nome', L(d.razao || d.nome)) + R('Loja', L(d.nome)) + R('CNPJ/CPF', L(d.cnpj, 18)) + R('Endereço', L(d.end)) +
      R('Responsável', L(d.responsavel)) + R('E-mail', L(d.email)) + R('WhatsApp', L(d.wpp, 18)) + '</div>' +
      '<div style="border:1px solid #DDD0F0;border-radius:8px;padding:12px 14px"><div style="font-size:10px;font-weight:700;color:#5B2D8E;letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px">Contratada</div>' +
      R('Razão social', 'MGB Comunicação e Marketing Ltda.') + R('Nome fantasia', 'MGB Mídia') + R('CNPJ', '23.770.170/0001-50') + R('Endereço', 'Londrina – PR') +
      R('E-mail', 'comercial@agenciamgb.com.br') + R('WhatsApp', '(43) 99696-0078') + '</div></div>' +
      T('2. VEICULAÇÃO E INVESTIMENTO') +
      '<table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:12px"><thead><tr style="background:#2A1760;color:#fff">' +
      th('Cotas') + th('Inserções/dia') + th('Spot') + th('Horário') + th('Valor mensal') + th('Vigência') + '</tr></thead>' +
      '<tbody><tr style="background:#F7F4FB">' + td(cotas) + td(ins) + td('15 segundos') + td('9h às 22h, todos os dias') + td(brlC(conta.total)) + td(ini + ' a ' + fim) + '</tr></tbody></table>' +
      T('3. CLÁUSULAS E CONDIÇÕES') +
      C('CLÁUSULA 1ª — DO OBJETO', '1.1. Veiculação de spot publicitário de áudio do CONTRATANTE na <strong>rádio interna do Mercadão da Prochet</strong>, Av. Harry Prochet, 305 — Londrina/PR, operada pela CONTRATADA, conforme o quadro acima: ' +
        cotas + (cotas === 1 ? ' cota' : ' cotas') + ', ' + ins + ' inserções por dia de até 15 segundos, das 9h às 22h, todos os dias.') +
      C('CLÁUSULA 2ª — DO VALOR E DO PAGAMENTO', '2.1. Valor mensal de <strong>' + brlC(conta.total) + extenso + '</strong> (' + cotas + ' × ' + brlC(d.valorCota) + ' por cota).<br>2.2. ' + pagamento +
        (adiantado ? '' : '<br>2.3. O atraso superior a 30 (trinta) dias permite à CONTRATADA suspender a veiculação até a regularização.')) +
      C('CLÁUSULA 3ª — DAS OBRIGAÇÕES DA CONTRATADA', '3.1. Garantir a veiculação nas inserções e nos horários estabelecidos.<br>3.2. Operar e manter a rádio em funcionamento.<br>3.3. Caso o CONTRATANTE não possua spot, produzir 1 (um) texto/roteiro por mês sem custo adicional.') +
      C('CLÁUSULA 4ª — DAS OBRIGAÇÕES DO CONTRATANTE', '4.1. Fornecer o spot em MP3 ou WAV, com até 15 segundos, com no mínimo 3 (três) dias úteis de antecedência, ou aprovar o texto produzido pela CONTRATADA.<br>4.2. Responsabilizar-se pelo conteúdo e pela veracidade das informações divulgadas.<br>4.3. Efetuar os pagamentos nas datas de vencimento.') +
      C('CLÁUSULA 5ª — DA POLÍTICA DE CONTEÚDO', '5.1. A CONTRATADA pode recusar material ilícito, ofensivo, político-partidário ou fora dos padrões técnicos, informando o motivo ao CONTRATANTE.') +
      C('CLÁUSULA 6ª — DA VIGÊNCIA E DA RESCISÃO', '6.1. Este contrato vigora de ' + ini + ' a ' + fim + ' (' + meses + (meses === 1 ? ' mês' : ' meses') + ').<br>6.2. Qualquer das partes pode rescindi-lo com aviso prévio por escrito de 30 (trinta) dias.' +
        (adiantado ? ' Em caso de rescisão pelo CONTRATANTE, não há devolução dos valores já pagos pelo período contratado.' : '')) +
      C('CLÁUSULA 7ª — DO FORO', '7.1. Fica eleito o foro da Comarca de <strong>Londrina, Estado do Paraná</strong>, para dirimir quaisquer controvérsias decorrentes deste contrato.') +
      '<div style="color:#444;line-height:1.55;font-size:11.5px;margin:10px 0 18px">E, por estarem de acordo, as partes assinam eletronicamente o presente instrumento.</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:28px;font-size:11.5px;color:#333;text-align:center">' +
      '<div style="border-top:1px solid #2A1760;padding-top:6px">' + L(d.razao || d.nome) + '<br><span style="color:#888">CONTRATANTE</span></div>' +
      '<div style="border-top:1px solid #2A1760;padding-top:6px">MGB Comunicação e Marketing Ltda.<br><span style="color:#888">CONTRATADA</span></div></div>' +
      '</div>';
  }

  // ── CRM como base: a Karen só cadastra cliente que está fechado no CRM ──
  // Produto do formulário → produto do lead no CRM (módulo).
  var PRODUTO_LEAD = { condominio: 'elev', anunciante: 'elev', vaapty: 'vaapty', radio: 'radio', mercadao: 'radio', tv: 'tv' };

  // Leads fechados e não cadastrados, com os do produto certo primeiro.
  function leadsParaProduto(lista, produto) {
    var alvo = PRODUTO_LEAD[produto];
    var pend = leadsPendentes(lista);
    var certos = pend.filter(function (l) { return l.produto === alvo; });
    var outros = pend.filter(function (l) { return l.produto !== alvo; });
    return { certos: certos, outros: outros };
  }

  // Resposta das APIs públicas de CNPJ → campos do formulário.
  function normalizarCNPJ(fonte, d) {
    d = d || {};
    var r;
    if (fonte === 'cnpjws') {
      var est = d.estabelecimento || {};
      r = { razao: d.razao_social, fantasia: est.nome_fantasia, logradouro: [est.tipo_logradouro, est.logradouro].filter(Boolean).join(' '),
        numero: est.numero, complemento: est.complemento, bairro: est.bairro, cidade: est.cidade && est.cidade.nome, uf: est.estado && est.estado.sigla,
        cep: est.cep, tel: est.ddd1 && est.telefone1 ? est.ddd1 + est.telefone1 : '', email: est.email };
    } else {
      r = { razao: d.razao_social, fantasia: d.nome_fantasia, logradouro: d.logradouro, numero: d.numero, complemento: d.complemento,
        bairro: d.bairro, cidade: d.municipio, uf: d.uf, cep: d.cep, tel: d.ddd_telefone_1, email: d.email };
    }
    Object.keys(r).forEach(function (k) { r[k] = r[k] == null ? '' : String(r[k]).trim(); });
    r.cep = r.cep.replace(/\D/g, '');
    r.email = r.email.toLowerCase();
    r.endereco = [r.logradouro, r.numero ? 'nº ' + r.numero : '', r.complemento, r.bairro, r.cidade ? r.cidade + (r.uf ? '/' + r.uf : '') : '',
      r.cep ? 'CEP ' + r.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : ''].filter(Boolean).join(', ');
    return r;
  }

  var api = {
    PRODUTO_LEAD: PRODUTO_LEAD,
    leadsParaProduto: leadsParaProduto,
    normalizarCNPJ: normalizarCNPJ,
    MERCADAO: MERCADAO,
    contaMercadao: contaMercadao,
    ocupacaoBlocos: ocupacaoBlocos,
    validarMercadao: validarMercadao,
    contratoMercadao: contratoMercadao,
    CUSTO_POR_TORRE: CUSTO_POR_TORRE,
    CUSTO_RADIO: CUSTO_RADIO,
    CUSTO_TELA: CUSTO_TELA,
    custoCondominio: custoCondominio,
    leadsPendentes: leadsPendentes,
    jaExiste: jaExiste,
    validarCondominio: validarCondominio,
    despesaLicenca: despesaLicenca,
    sobraRadio: sobraRadio,
    validarRadio: validarRadio,
    despesaRadio: despesaRadio,
    dataMais: dataMais,
    contratoRadioInterna: contratoRadioInterna
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (!global.document) return;

  // ── Tela ───────────────────────────────────────────────────────────────
  var doc = global.document;
  var leadAtual = null;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function brl(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function listaLeads() { try { return leads; } catch (e) { return []; } }          // eslint-disable-line no-undef
  function modulos() { try { return MODULES; } catch (e) { return []; } }            // eslint-disable-line no-undef
  function modulo(id) { return modulos().filter(function (m) { return m.id === id; })[0]; }
  function condominiosExistentes() { var m = modulo('elev'); return m ? m.items : []; }

  function injetarEstilos() {
    if (doc.getElementById('mgb-novo-css')) return;
    var st = doc.createElement('style');
    st.id = 'mgb-novo-css';
    st.textContent =
      'body.mgb-sem-novo #mgb-novo-btn{display:none!important}' +
      '#mgb-novo-btn{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;width:100%;max-width:1040px;margin:0 auto 16px}' +
      '#mgb-novo-btn .lz-b{display:flex;align-items:center;gap:10px;min-height:56px;padding:8px 16px;border:0;border-radius:14px;color:#fff;font:600 16px "DM Sans",system-ui,sans-serif;cursor:pointer;text-align:left;box-shadow:0 6px 18px rgba(36,26,56,.18)}' +
      '#mgb-novo-btn .lz-b b{display:block;font-size:16px}#mgb-novo-btn .lz-b small{display:block;font-size:12px;font-weight:500;opacity:.85}' +
      '#mgb-novo-btn .lz-mais{font-size:22px;line-height:1}' +
      '#mgb-novo-btn .cli{background:#4E38B2}#mgb-novo-btn .desp{background:#B4235A}#mgb-novo-btn .rec{background:#14724A}' +
      '#mgb-novo-btn .lz-b:focus-visible{outline:3px solid #b9a9f5;outline-offset:2px}' +
      '@media (max-width:680px){#mgb-novo-btn{grid-template-columns:1fr}#mgb-novo-btn .lz-b{min-height:48px}}' +
      '#mgb-novo{position:fixed;inset:0;z-index:9600;background:rgba(36,26,56,.45);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 16px;font-family:"DM Sans",system-ui,sans-serif;color:#241a38}' +
      '#mgb-novo .box{width:100%;max-width:1040px;background:#f6f4fb;border-radius:18px;box-shadow:0 20px 60px rgba(36,26,56,.3);overflow:hidden}' +
      '#mgb-novo .top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 22px;background:#fff;border-bottom:1px solid #e4def2}' +
      '#mgb-novo .top h2{margin:0;font-size:20px}#mgb-novo .x{border:0;background:#efeaf8;border-radius:9px;height:38px;padding:0 14px;font-weight:600;font-size:14px;font-family:inherit;cursor:pointer;color:#3a2a5e}' +
      '#mgb-novo .corpo{padding:22px;display:flex;flex-direction:column;gap:18px}' +
      '#mgb-novo .card{background:#fff;border:1px solid #e4def2;border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;gap:12px;min-width:0}' +
      '#mgb-novo .card.crm{background:#f1faf7;border-color:#a7dccf}' +
      '#mgb-novo h3{margin:0;font-size:16px}#mgb-novo p.sub{margin:0;font-size:13px;color:#6b6380}' +
      '#mgb-novo .lin{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid #ece7f5;font-size:14px}' +
      '#mgb-novo .lin .acoes{display:flex;gap:8px;flex-wrap:wrap}' +
      '#mgb-novo .grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}' +
      '#mgb-novo .prod{display:flex;flex-direction:column;gap:6px;text-align:left;padding:14px;border:1px solid #e4def2;border-radius:12px;background:#fff;cursor:pointer;font:inherit;color:inherit;min-height:92px}' +
      '#mgb-novo .prod:hover{border-color:#4E38B2}#mgb-novo .prod b{font-size:15px}#mgb-novo .prod span{font-size:13px;color:#6b6380}' +
      '#mgb-novo .prod[disabled]{cursor:not-allowed;background:#f6f4fb;opacity:.75}' +
      '#mgb-novo .tag{font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;background:#efeaf8;color:#4E38B2;align-self:flex-start}' +
      '#mgb-novo .b{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-radius:10px;border:1px solid #d9d1ea;background:#fff;font-weight:600;font-size:14px;font-family:inherit;color:#241a38;cursor:pointer}' +
      '#mgb-novo .b.p{background:#4E38B2;border-color:#4E38B2;color:#fff}#mgb-novo .b[disabled]{opacity:.6;cursor:wait}' +
      '#mgb-novo .duas{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}#mgb-novo .duas>main{flex:999 1 520px;min-width:0;display:flex;flex-direction:column;gap:14px}#mgb-novo .duas>aside{flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:14px}' +
      '#mgb-novo .campos{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}' +
      '#mgb-novo label.f{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:#3a3446}' +
      '#mgb-novo label.f input,#mgb-novo label.f select{height:42px;border:1px solid #cfc6e0;border-radius:9px;padding:0 11px;font-size:14px;font-family:inherit;background:#fff;color:#241a38}' +
      '#mgb-novo label.f input.crm{background:#f1faf7;border-color:#a7dccf}' +
      '#mgb-novo .sec{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b6380}' +
      '#mgb-novo .conta{display:flex;justify-content:space-between;font-size:14px}' +
      '#mgb-novo .passo{display:flex;gap:10px;align-items:flex-start;font-size:14px}#mgb-novo .passo i{flex:none;width:22px;height:22px;border-radius:50%;background:#efeaf8;color:#4E38B2;font-style:normal;font-size:12px;font-weight:700;display:grid;place-items:center}' +
      '#mgb-novo .passo.ok i{background:#dcefe4;color:#14583a}#mgb-novo .passo.erro i{background:#fde3dc;color:#a33a1a}#mgb-novo .passo.vai i{background:#4E38B2;color:#fff}' +
      '#mgb-novo .erros{color:#a33a1a;font-size:13px;display:flex;flex-direction:column;gap:4px}';
    doc.head.appendChild(st);
  }

  function inserirBotaoHome() {
    if (doc.getElementById('mgb-novo-btn')) return;
    var hubs = doc.querySelector('.home-hubs');
    if (!hubs) return;
    // Três atalhos lado a lado (11/10): Novo cliente (CRM), Nova despesa e Nova receita (lancar.js)
    var linha = doc.createElement('div');
    linha.id = 'mgb-novo-btn';
    linha.setAttribute('role', 'group');
    linha.setAttribute('aria-label', 'Lançar');
    function botao(rotulo, sub, cls, fn) {
      var b = doc.createElement('button');
      b.type = 'button'; b.className = 'lz-b ' + cls;
      b.innerHTML = '<span aria-hidden="true" class="lz-mais">＋</span><span><b>' + rotulo + '</b><small>' + sub + '</small></span>';
      b.addEventListener('click', fn);
      linha.appendChild(b);
    }
    botao('Novo cliente', 'fechado no CRM', 'cli', function () { abrir(); });
    botao('Nova despesa', 'viagem, instalação, sistema', 'desp', function () { if (global.MGBLancar) global.MGBLancar.despesa(); });
    botao('Nova receita', 'locução e serviço avulso', 'rec', function () { if (global.MGBLancar) global.MGBLancar.receita(); });
    hubs.parentNode.insertBefore(linha, hubs);
  }

  function fechar() { var el = doc.getElementById('mgb-novo'); if (el) el.remove(); doc.removeEventListener('keydown', escFecha); }
  function escFecha(e) { if (e.key === 'Escape') fechar(); }

  function moldura(titulo, corpo, voltar) {
    var el = doc.getElementById('mgb-novo');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'mgb-novo';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      doc.body.appendChild(el);
      el.addEventListener('click', function (e) { if (e.target === el) fechar(); });
      doc.addEventListener('keydown', escFecha);
    }
    el.setAttribute('aria-label', titulo);
    el.innerHTML = '<div class="box"><div class="top"><h2>' + esc(titulo) + '</h2><div style="display:flex;gap:8px">' +
      (voltar ? '<button type="button" class="x" data-novo="inicio">Voltar</button>' : '') +
      '<button type="button" class="x" data-novo="fechar">Fechar</button></div></div><div class="corpo">' + corpo + '</div></div>';
    el.querySelectorAll('[data-novo]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-novo');
        if (a === 'fechar') fechar();
        if (a === 'inicio') abrir();
      });
    });
    el.scrollTop = 0;
    return el;
  }

  // ── Início: CRM + produtos ─────────────────────────────────────────────
  var ROTULO_ACAO = {
    condominio: 'Condomínio', anunciante: 'Anunciante Tela Vertical', vaapty: 'Unidade Vaapty',
    radio: 'Rádio interna', mercadao: 'Anunciante Mercadão', tv: 'TV interna'
  };
  var ACOES_DO_LEAD = { elev: ['condominio', 'anunciante'], radio: ['radio', 'mercadao'], vaapty: ['vaapty'], tv: ['tv'] };

  function leadPorId(id) { return listaLeads().filter(function (l) { return String(l.id) === String(id); })[0] || null; }

  function abrirForm(acao, lead) {
    if (acao === 'taroba') return formTaroba();
    if (!lead) return escolherLead(acao);
    if (acao === 'condominio') return formCondominio(lead);
    if (acao === 'radio') return formUnidade('radio', lead);
    if (acao === 'tv') return formUnidade('tv', lead);
    if (acao === 'mercadao') return formMercadao(lead);
    if (acao === 'anunciante') return formAnuncianteElev(lead);
    if (acao === 'vaapty') return formVaapty(lead);
  }

  function linhaLead(l, acoes) {
    var m = modulo(l.produto);
    var rot = m ? m.label.split('—')[0].trim() : 'Sem produto';
    var bts = acoes.map(function (a, i) {
      return '<button type="button" class="b' + (i === 0 ? ' p' : '') + '" data-lead="' + esc(l.id) + '" data-acao="' + a + '">' + esc(ROTULO_ACAO[a]) + '</button>';
    }).join('');
    return '<div class="lin"><div><div style="font-weight:700">' + esc(l.nome) + '</div><div style="font-size:13px;color:#6b6380">' +
      esc(rot) + (l.valor ? ' · ' + brl(l.valor) + '/mês' : '') + (l.cnpj ? ' · CNPJ ' + esc(l.cnpj) : '') + '</div></div><div class="acoes">' + bts + '</div></div>';
  }

  function ligarAcoes(el) {
    el.querySelectorAll('[data-acao]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-lead');
        abrirForm(b.getAttribute('data-acao'), id ? leadPorId(id) : null);
      });
    });
  }

  function abrir() {
    injetarEstilos();
    leadAtual = null;
    var pend = leadsPendentes(listaLeads());
    var crm = pend.length ? pend.map(function (l) {
      var acoes = ACOES_DO_LEAD[l.produto] || ['condominio', 'anunciante', 'radio', 'mercadao', 'vaapty', 'tv'];
      return linhaLead(l, acoes);
    }).join('') : '<p class="sub">Nenhum cliente fechado esperando cadastro. Quando o Eder marcar um lead como Fechado no CRM, ele aparece aqui.</p>';

    var produtos = [
      ['condominio', 'Condomínio · Tela Vertical', 'Tela no elevador. Parceria: condomínio paga R$ 0; licença 4YouSee de R$ 39,56 por tela ao mês.'],
      ['anunciante', 'Anunciante · Tela Vertical', 'Escolhe os condomínios, gera o contrato Tela Vertical e envia pelo Assinafy.'],
      ['vaapty', 'Unidade Vaapty', 'Franqueado com box em comodato. Contrato Vaapty pelo Assinafy.'],
      ['radio', 'Rádio interna', 'Uma unidade (loja) por vez, com o contrato padrão. Licença ListenX de R$ 64,87 ao mês.'],
      ['mercadao', 'Anunciante · Rádio Mercadão', 'Loja no Mercadão Prochet. Cotas nos Blocos, cobrança mensal e contrato.'],
      ['tv', 'TV interna', 'TV corporativa em empresa ou loja, uma unidade por vez, com contrato padrão.'],
      ['taroba', 'Comissão Tarobá', 'Rádio ou TV Tarobá, Londrina ou Cascavel. Lança o valor do mês.']
    ].map(function (p) {
      return '<button type="button" class="prod" data-acao="' + p[0] + '"><b>' + p[1] + '</b><span>' + p[2] + '</span></button>';
    }).join('');

    var el = moldura('Novo cliente',
      '<section class="card crm"><h3>Fechados no CRM, esperando cadastro' + (pend.length ? ' · ' + pend.length : '') + '</h3>' +
      '<p class="sub">Todo cadastro começa por um cliente fechado no CRM: os dados dele vêm preenchidos e o CNPJ completa o resto.</p>' + crm + '</section>' +
      '<section class="card"><h3>Ou escolha o produto</h3><p class="sub">Você escolhe o cliente do CRM na próxima tela.</p><div class="grade">' + produtos + '</div></section>', false);
    ligarAcoes(el);
  }

  // Produto escolhido sem cliente: lista os clientes fechados no CRM.
  function escolherLead(acao) {
    injetarEstilos();
    var g = leadsParaProduto(listaLeads(), acao);
    var corpo;
    if (!g.certos.length && !g.outros.length) {
      corpo = '<section class="card crm"><h3>Nenhum cliente fechado no CRM</h3><p class="sub">Para cadastrar ' + esc(ROTULO_ACAO[acao].toLowerCase()) +
        ', o cliente precisa estar no CRM como <b>Fechado</b>. Peça ao Eder para fechar o lead e ele aparece aqui com os dados preenchidos.</p></section>';
    } else {
      corpo = '<section class="card crm"><h3>Qual cliente do CRM?</h3><p class="sub">Só aparecem clientes fechados que ainda não foram cadastrados.</p>' +
        (g.certos.length ? g.certos.map(function (l) { return linhaLead(l, [acao]); }).join('') : '<p class="sub">Nenhum cliente deste produto. Abaixo, os fechados de outros produtos.</p>') +
        '</section>' +
        (g.outros.length ? '<section class="card"><h3>Fechados em outros produtos</h3>' + g.outros.map(function (l) { return linhaLead(l, [acao]); }).join('') + '</section>' : '');
    }
    var el = moldura(ROTULO_ACAO[acao] + ' · escolher cliente', corpo, true);
    ligarAcoes(el);
  }

  // Busca o CNPJ (mesmas fontes que os contratos do hub usam) e completa os campos vazios.
  function buscarCNPJ(cnpj) {
    var dig = String(cnpj || '').replace(/\D/g, '');
    if (dig.length !== 14 || typeof fetch !== 'function') return Promise.resolve(null);
    var fontes = [
      ['cnpjws', 'https://publica.cnpj.ws/cnpj/' + dig],
      ['brasilapi', 'https://brasilapi.com.br/api/cnpj/v1/' + dig]
    ];
    var i = 0;
    function tenta() {
      if (i >= fontes.length) return null;
      var f = fontes[i++];
      return fetch(f[1]).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) { var n = normalizarCNPJ(f[0], j); if (!n.razao) throw new Error('vazio'); return n; })
        .catch(tenta);
    }
    return Promise.resolve().then(tenta);
  }

  // mapa: campo do formulário (nv-<id>) → campo do CNPJ
  function completarPorCNPJ(cnpj, mapa) {
    vigiarCNPJ(mapa);
    var st = doc.getElementById('nv-cnpj-st');
    if (!String(cnpj || '').replace(/\D/g, '')) { if (st) st.textContent = 'Sem CNPJ no CRM: digite o CNPJ que o hub busca e preenche o resto sozinho.'; return Promise.resolve(null); }
    if (st) st.textContent = 'Buscando os dados do CNPJ…';
    return buscarCNPJ(cnpj).then(function (r) {
      if (!r) { if (st) st.textContent = 'Não achei o CNPJ nas bases públicas: complete os campos à mão.'; return null; }
      var n = 0;
      Object.keys(mapa).forEach(function (id) {
        var el = doc.getElementById('nv-' + id);
        var v = r[mapa[id]];
        if (el && v && !String(el.value).trim()) { el.value = v; el.classList.add('crm'); n++; el.dispatchEvent(new Event('input')); }
      });
      if (st) st.textContent = n ? 'Dados do CNPJ preenchidos (' + n + ' campos). Confira.' : 'CNPJ conferido.';
      return r;
    });
  }

  // ── Rascunho do formulário (12/10, pedido do Eder): "Salvar e continuar depois" ──
  // Guarda os campos nv-* em clientesInfo._rascunhos[acao|lead] (vai para o Sheets com o resto) e recarrega ao reabrir.
  var acaoAtual = '';
  function chaveRascunho() { return acaoAtual + '|' + (leadAtual ? leadAtual.id : ''); }
  function rascunhos() { try { clientesInfo._rascunhos = clientesInfo._rascunhos || {}; return clientesInfo._rascunhos; } catch (e) { return {}; } } // eslint-disable-line no-undef
  function camposForm() { return Array.prototype.slice.call(doc.querySelectorAll('#mgb-novo input[id^="nv-"], #mgb-novo select[id^="nv-"], #mgb-novo textarea[id^="nv-"]')).filter(function (e) { return !e.readOnly && e.type !== 'button'; }); }
  function ligarRascunho(acao) {
    acaoAtual = acao;
    var btn = doc.getElementById('nv-criar'); if (!btn || doc.getElementById('nv-rascunho')) return;
    var r = doc.createElement('button');
    r.type = 'button'; r.className = 'b'; r.id = 'nv-rascunho'; r.textContent = '💾 Salvar e continuar depois';
    btn.parentNode.insertBefore(r, btn);
    var st = doc.createElement('p'); st.className = 'sub'; st.id = 'nv-rascunho-st'; st.setAttribute('aria-live', 'polite');
    btn.parentNode.insertBefore(st, btn.nextSibling);
    r.addEventListener('click', function () {
      var v = {}; camposForm().forEach(function (e) { v[e.id] = e.value; });
      rascunhos()[chaveRascunho()] = { em: new Date().toISOString(), valores: v, nome: leadAtual ? leadAtual.nome : '' };
      try { scheduleSave(); } catch (e) {}                                                   // eslint-disable-line no-undef
      st.textContent = '✔ Rascunho salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '. Ao abrir este cliente de novo no Novo, os campos voltam preenchidos.';
    });
    var salvo = rascunhos()[chaveRascunho()];
    if (salvo && salvo.valores) {
      Object.keys(salvo.valores).forEach(function (id) { var e = doc.getElementById(id); if (e && !e.readOnly && salvo.valores[id] !== '') { e.value = salvo.valores[id]; e.dispatchEvent(new Event('input', { bubbles: true })); } });
      st.textContent = 'Rascunho de ' + new Date(salvo.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' carregado. Confira e crie quando estiver pronto.';
    }
  }
  function apagarRascunho() { try { delete rascunhos()[chaveRascunho()]; } catch (e) {} }
  // Jornada do cliente: eventos que a Ficha do cliente mostra (lancar.js › fichaCliente)
  function registrarJornada(modId, nome, texto) {
    try {
      clientesInfo[modId] = clientesInfo[modId] || {};                                       // eslint-disable-line no-undef
      var i = clientesInfo[modId][nome] = clientesInfo[modId][nome] || {};                   // eslint-disable-line no-undef
      (i.jornada = i.jornada || []).push({ em: new Date().toISOString(), texto: texto });
    } catch (e) {}
  }
  // Etiquetas de box geradas em Ferramentas › Etiquetas (patrimônio MGBTVV-xxxx), mais recentes primeiro
  function etiquetasBox() { try { return (etiquetas || []).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); } catch (e) { return []; } } // eslint-disable-line no-undef

  // CNPJ digitado à mão (lead sem CNPJ no CRM): ao completar 14 dígitos, busca e preenche sozinho,
  // e guarda o CNPJ no lead do CRM para a próxima vez (12/10, pedido do Eder).
  function vigiarCNPJ(mapa) {
    var inp = doc.getElementById('nv-cnpj');
    if (!inp || inp.dataset.vigiado) return;
    inp.dataset.vigiado = '1';
    var ultimo = String(inp.value || '').replace(/\D/g, '');
    function checar() {
      var dig = String(inp.value || '').replace(/\D/g, '');
      if (dig.length !== 14 || dig === ultimo) return;
      ultimo = dig;
      inp.value = dig.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      if (leadAtual && !String(leadAtual.cnpj || '').replace(/\D/g, '')) {
        leadAtual.cnpj = inp.value;
        try { scheduleSave(); } catch (e) {}                 // eslint-disable-line no-undef
      }
      completarPorCNPJ(inp.value, mapa);
    }
    inp.addEventListener('input', checar);
    inp.addEventListener('change', checar);
    inp.addEventListener('paste', function () { setTimeout(checar, 0); });
  }

  function avisoCNPJ() { return '<p class="sub" id="nv-cnpj-st" aria-live="polite"></p>'; }

  // ── Novo condomínio ────────────────────────────────────────────────────
  function formCondominio(lead) {
    if (!lead) return escolherLead('condominio');
    leadAtual = lead;
    var L = lead || {};
    var hoje = new Date();
    var proxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    var ini = proxMes.toISOString().slice(0, 10);
    function campo(id, rotulo, valor, tipo, extra) {
      var crm = valor && lead ? ' class="crm"' : '';
      return '<label class="f" for="nv-' + id + '">' + rotulo + '<input id="nv-' + id + '"' + crm + ' type="' + (tipo || 'text') + '" value="' + esc(valor || '') + '"' + (extra || '') + '></label>';
    }
    var el = moldura('Novo condomínio',
      '<div class="duas"><main>' +
      '<p class="sub">Cliente do CRM. Os campos em verde vieram do CRM e do CNPJ. Confira e complete o resto.</p>' +
      '<section class="card"><div class="sec">1 · Condomínio</div><div class="campos">' +
      campo('nome', 'Nome do condomínio (do CRM)', L.nome, 'text', ' readonly') + campo('cnpj', 'CNPJ', L.cnpj) +
      campo('end', 'Endereço completo', '') + campo('bairro', 'Bairro ou região', '') + '</div>' + avisoCNPJ() + '</section>' +
      '<section class="card"><div class="sec">2 · Síndico</div><div class="campos">' +
      campo('sindico', 'Nome', L.responsavel) + campo('cpf', 'CPF', '') +
      campo('email', 'E-mail (recebe o contrato no Assinafy)', L.email, 'email') + campo('wpp', 'WhatsApp', L.tel) + '</div></section>' +
      '<section class="card"><div class="sec">3 · Estrutura e contrato</div><div class="campos">' +
      campo('torres', 'Número de torres *', '1', 'number', ' min="1"') + campo('telas', 'Número de telas', '1', 'number', ' min="1"') +
      campo('apts', 'Número de apartamentos', '', 'number', ' min="0"') + campo('inicio', 'Início *', ini, 'date') +
      '<label class="f" for="nv-vig">Vigência<select id="nv-vig"><option value="36">36 meses (renovação automática)</option><option value="24">24 meses (renovação automática)</option><option value="12">12 meses (renovação automática)</option></select></label>' +
      '</div></section>' +
      '<section class="card"><div class="sec">4 · Instalação (opcional)</div><div class="campos">' +
      campo('instval', 'Custo da instalação (R$)', '', 'number', ' min="0" step="0.01"') +
      '<label class="f" for="nv-instpor">Pago por<select id="nv-instpor"><option value="eder">Eder</option><option value="jadson">Jadson</option></select></label>' +
      campo('instdesc', 'Descrição', '', 'text', ' placeholder="ex: telas, cabos e kits"') + '</div>' +
      '<p class="sub">Entra no investimento dos sócios da Tela Vertical. Outras despesas deste condomínio você lança depois em Tela Vertical › Condomínios.</p></section></main>' +
      '<aside><section class="card"><div class="sec">Conta do mês</div>' +
      '<div class="conta"><span>Condomínio paga</span><b>R$ 0</b></div>' +
      '<div class="conta"><span id="nv-custo-rot">Custo · 1 tela × ' + brl(CUSTO_POR_TORRE) + '</span><b id="nv-custo" style="color:#a33a1a">' + brl(CUSTO_POR_TORRE) + '/mês</b></div>' +
      '<p class="sub">A receita vem dos anunciantes que você colocar nestas telas.</p></section>' +
      '<section class="card"><div class="sec">Ao criar, o hub faz</div>' +
      '<div class="passo" id="nv-p1"><i>1</i><span>Cria a tela do condomínio na Tela Vertical.</span></div>' +
      '<div class="passo" id="nv-p2"><i>2</i><span>Lança a despesa recorrente da licença das telas.</span></div>' +
      '<div class="passo" id="nv-p3"><i>3</i><span>' + (lead ? 'Marca o lead do CRM como cadastrado.' : 'Sem lead do CRM: nada a marcar.') + '</span></div>' +
      '<div class="passo" id="nv-p4"><i>4</i><span>Gera o contrato de parceria e envia ao síndico pelo Assinafy.</span></div>' +
      '<div class="passo" id="nv-p5"><i>5</i><span>Prepara o aviso ao Cleiton para instalar e programar.</span></div>' +
      '<div class="erros" id="nv-erros" role="alert"></div>' +
      '<button type="button" class="b p" id="nv-criar">Criar condomínio e enviar contrato</button>' +
      '</section></aside></div>', true);

    var torres = el.querySelector('#nv-telas');           // licença é por tela (uma por elevador)
    function atualizarConta() {
      var t = parseInt(torres.value, 10) || 0;
      el.querySelector('#nv-custo-rot').textContent = 'Custo · ' + t + (t === 1 ? ' tela' : ' telas') + ' × ' + brl(CUSTO_POR_TORRE);
      el.querySelector('#nv-custo').textContent = brl(custoCondominio(t)) + '/mês';
    }
    torres.addEventListener('input', atualizarConta);
    var nTorres = el.querySelector('#nv-torres'), mexeuTelas = false;  // telas acompanham as torres até a Karen mudar
    torres.addEventListener('input', function () { mexeuTelas = true; });
    nTorres.addEventListener('input', function () { if (!mexeuTelas) { torres.value = nTorres.value; atualizarConta(); } });
    el.querySelector('#nv-criar').addEventListener('click', criarCondominio);
    ligarRascunho('condominio');
    completarPorCNPJ(L.cnpj, { end: 'endereco', bairro: 'bairro', email: 'email', wpp: 'tel' });
    var foco = el.querySelector('#nv-torres'); if (foco) foco.focus();
  }

  function val(id) { var e = doc.getElementById('nv-' + id); return e ? String(e.value).trim() : ''; }
  function marcar(n, estado, texto) {
    var p = doc.getElementById('nv-p' + n);
    if (!p) return;
    p.className = 'passo ' + estado;
    if (n === 1 && estado === 'ok') apagarRascunho();
    p.querySelector('i').textContent = estado === 'ok' ? '✓' : estado === 'erro' ? '!' : n;
    if (texto) p.querySelector('span').innerHTML = texto;
  }

  function criarCondominio() {
    var d = {
      nome: val('nome'), cnpj: val('cnpj'), end: val('end'), bairro: val('bairro'), sindico: val('sindico'),
      cpf: val('cpf'), email: val('email'), wpp: val('wpp'), torres: val('torres'), telas: val('telas'),
      apts: val('apts'), inicio: val('inicio'), vig: (doc.getElementById('nv-vig') || {}).value || '36',
      instval: val('instval'), instpor: (doc.getElementById('nv-instpor') || {}).value || 'eder', instdesc: val('instdesc')
    };
    var errosEl = doc.getElementById('nv-erros');
    var erros = validarCondominio(d, condominiosExistentes());
    if (erros.length) { errosEl.innerHTML = erros.map(esc).join('<br>'); return; }
    errosEl.textContent = '';
    var btn = doc.getElementById('nv-criar');
    btn.disabled = true; btn.textContent = 'Criando…';

    // 1. tela na Tela Vertical
    try {
      var cliente = { cnpj: d.cnpj, fantasia: d.nome, responsavel: d.sindico, cargo: 'Síndico(a)', tel: d.wpp, email: d.email,
        endereco: d.end, bairro: d.bairro, torres: parseInt(d.torres, 10), telas: parseInt(d.telas, 10) || '', apartamentos: parseInt(d.apts, 10) || '' };
      var criado = global.mgbCriarUnidadeModulo('elev', d.nome, { valor: 0, inicio: d.inicio.slice(0, 7), meses: parseInt(d.vig, 10), cliente: cliente });
      if (!criado) throw new Error('o módulo Tela Vertical não foi encontrado');
      marcar(1, 'ok', 'Tela <b>' + esc(d.nome) + '</b> criada na Tela Vertical.');
    } catch (e) {
      marcar(1, 'erro', 'Não consegui criar a tela: ' + esc(e.message) + '. Nada foi lançado.');
      btn.disabled = false; btn.textContent = 'Tentar de novo';
      return;
    }

    // 2. despesa recorrente da licença
    try {
      var desp = despesaLicenca(d.telas || d.torres, d.inicio, d.vig);
      applyToFin(desp, +1);                                   // eslint-disable-line no-undef
      if (!db.elev[d.nome]) db.elev[d.nome] = [];             // eslint-disable-line no-undef
      db.elev[d.nome].push(desp);                             // eslint-disable-line no-undef
      marcar(2, 'ok', 'Despesa de <b>' + brl(custoCondominio(d.telas || d.torres)) + '/mês</b> lançada por ' + desp.mesesRec + ' meses a partir de ' + desp.dataInicio.split('-').reverse().join('/') + '.');
      var inst = numero(d.instval);
      if (inst > 0 && typeof elevInvestimentos !== 'undefined') {                       // eslint-disable-line no-undef
        elevInvestimentos.push({ id: elevInvestId++, item: d.nome, descricao: d.instdesc || ('Instalação ' + d.nome), valor: inst, // eslint-disable-line no-undef
          pagoPor: d.instpor, data: new Date().toISOString().slice(0, 10), criadoEm: new Date().toISOString() });
        var p2 = doc.querySelector('#nv-p2 span');
        if (p2) p2.innerHTML += ' Instalação de <b>' + brl(inst) + '</b> lançada no investimento dos sócios.';
      }
    } catch (e) {
      marcar(2, 'erro', 'A tela foi criada, mas a despesa não: ' + esc(e.message) + '. Lance a licença à mão na Tela Vertical.');
    }

    // 3. lead do CRM
    if (leadAtual) {
      leadAtual.itemCriado = d.nome;
      marcar(3, 'ok', 'Lead <b>' + esc(leadAtual.nome) + '</b> marcado como cadastrado.');
    } else {
      marcar(3, 'ok', 'Sem lead do CRM para marcar.');
    }
    try { scheduleSave(); } catch (e) {}                     // eslint-disable-line no-undef
    try { global.buildSidebar(); } catch (e) {}
    try { global.buildHome(); } catch (e) {}

    // 4. contrato de parceria + Assinafy
    enviarContrato(d).then(function (r) {
      marcar(4, r.ok ? 'ok' : 'erro', r.msg);
    }).finally(function () {
      // 5. aviso ao Cleiton (WhatsApp: o hub não manda mensagem sozinho)
      var txt = 'Novo condomínio fechado: ' + d.nome + (d.bairro ? ' (' + d.bairro + ')' : '') + '. ' +
        d.torres + ' torre(s), ' + (d.telas || d.torres) + ' tela(s). Início ' + d.inicio.split('-').reverse().join('/') +
        '. Contrato enviado para assinatura: programar a instalação assim que for assinado.';
      marcar(5, 'ok', 'Aviso pronto: <a href="https://wa.me/?text=' + encodeURIComponent(txt) + '" target="_blank" rel="noopener">enviar ao Cleiton no WhatsApp</a>.');
      btn.textContent = 'Condomínio criado';
      var fim = doc.createElement('button');
      fim.type = 'button'; fim.className = 'b'; fim.textContent = 'Lançar outro';
      fim.addEventListener('click', function () { abrir(); });
      btn.parentNode.appendChild(fim);
      if (global.tvAbrirCondominio) {
        var abre = doc.createElement('button');
        abre.type = 'button'; abre.className = 'b p'; abre.textContent = 'Lançar as despesas deste condomínio';
        abre.addEventListener('click', function () { fechar(); global.tvAbrirCondominio(d.nome); });
        btn.parentNode.appendChild(abre);
      }
    });
  }

  function enviarContrato(d) {
    function set(id, v) { var e = doc.getElementById(id); if (e) e.value = v; }
    try {
      set('p-razao', d.nome); set('p-cnpj', d.cnpj); set('p-end', d.end); set('p-sindico', d.sindico);
      set('p-cpf', d.cpf); set('p-email', d.email); set('p-wpp', d.wpp); set('p-torres', d.torres);
      set('p-apts', d.apts); set('p-telas', d.telas); set('p-bairro', d.bairro); set('p-vigencia', d.vig); set('p-inicio', d.inicio);
      global.parcGerar();
    } catch (e) {
      return Promise.resolve({ ok: false, msg: 'Não consegui gerar o contrato: ' + esc(e.message) + '. Gere pela aba Contratos › Parceria Cond.' });
    }
    var out = doc.getElementById('parc-output');
    if (!out || !out.innerHTML.trim()) return Promise.resolve({ ok: false, msg: 'Contrato não gerado. Gere pela aba Contratos › Parceria Cond.' });
    if (!d.email) return Promise.resolve({ ok: false, msg: 'Contrato gerado, mas sem e-mail do síndico. Envie pela aba Contratos › Parceria Cond. quando tiver o e-mail.' });
    return enviarAssinafy('elev', d.nome, 'Contrato de Parceria - ' + d.nome, out.innerHTML, d.sindico || d.nome, d.email,
      'Segue o contrato de parceria da Tela Vertical (telas digitais nos elevadores) para assinatura eletrônica.')
      .then(function () { return { ok: true, msg: 'Contrato enviado ao síndico (' + esc(d.email) + ') e a você pelo Assinafy.' }; })
      .catch(function (e) { return { ok: false, msg: 'Contrato gerado, mas o envio ao Assinafy falhou: ' + esc(e.message) + '. Envie pela aba Contratos › Parceria Cond.' }; });
  }

  // O Apps Script converte HTML em PDF sem buscar imagens de fora: troca a logo por data URI.
  function logosEmbutidas(html) {
    return String(html).replace(/(?:https?:\/\/[^"']*\/)?marca\/mgb-logo-(roxo|branco)\.(?:png|svg)/g, function (m, cor) {
      return (cor === 'branco' ? LOGOS.branco : LOGOS.roxo) || m;
    });
  }
  function documentoContrato(corpo) {
    corpo = logosEmbutidas(corpo);
    if (/^<!DOCTYPE/i.test(corpo)) return corpo;
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>body{padding:24px;background:#fff;font-family:Arial,sans-serif}</style></head><body>' + corpo + '</body></html>';
  }

  // Envia ao Assinafy (Apps Script do hub). Assinam o cliente e o Eder. Guarda o docId no cadastro do cliente.
  var PASTA_PRODUTO = { vaapty: 'Vaapty', elev: 'Tela Vertical', radio: 'Rádio Interna', tv: 'TV Interna', mercadao: 'Mercadão', condominio: 'Tela Vertical/Condomínios', mb: 'Móveis Brasília' };
  function pastaDrive(modId, nome) { return (PASTA_PRODUTO[modId] || 'Outros') + '/' + String(nome || 'sem nome').trim(); }
  function enviarAssinafy(modId, nome, nomeDoc, corpo, signatario, email, mensagem) {
    return fetch(ASSINAFY_API_URL + '?action=enviar', {
      method: 'POST',
      body: JSON.stringify({
        nomeDoc: nomeDoc,
        html: documentoContrato(corpo),
        signatarios: [{ nome: signatario, email: email }, { nome: 'Eder Balbino — MGB Comunicação e Marketing Ltda.', email: 'ederbalbino@gmail.com' }],
        mensagem: mensagem,
        pasta: pastaDrive(modId, nome)                     // MGB contratos/<produto>/<cliente> no Drive (12/10)
      })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.erro) throw new Error((j && j.erro) || 'resposta vazia');
      try {
        var info = clientesInfo[modId] && clientesInfo[modId][nome];  // eslint-disable-line no-undef
        if (info) { info.assinafyDocId = j.docId; info.pastaDrive = pastaDrive(modId, nome); if (j.urlEnviado) info.contratoEnviadoUrl = j.urlEnviado; scheduleSave(); } // eslint-disable-line no-undef
      } catch (e) {}
      return j;
    });
  }

  function linkVerContrato(corpo) {
    try {
      var url = URL.createObjectURL(new Blob([documentoContrato(corpo)], { type: 'text/html' }));
      return ' <a href="' + url + '" target="_blank" rel="noopener">Ver o contrato</a>.';
    } catch (e) { return ''; }
  }

  // ── Nova rádio interna / TV interna (uma unidade por vez) ──────────────
  function campoNv(id, rotulo, valor, tipo, extra, doCrm) {
    return '<label class="f" for="nv-' + id + '">' + rotulo + '<input id="nv-' + id + '"' + (valor && doCrm ? ' class="crm"' : '') +
      ' type="' + (tipo || 'text') + '" value="' + esc(valor == null ? '' : valor) + '"' + (extra || '') + '></label>';
  }

  var UNIDADE = {
    radio: { mod: 'radio', titulo: 'Nova rádio interna', modulo: 'Rádio Interna', custoRot: 'Custo da rádio', despesa: 'Licença da rádio interna',
      contrato: 'Contrato Rádio Interna', prefixo: 'MGB-RAD-', criar: 'Criar rádio interna e enviar contrato', feito: 'Rádio interna criada',
      aviso: 'Nova rádio interna fechada', cleiton: 'montar a programação', custoFixo: true },
    tv: { mod: 'tv', titulo: 'Nova TV interna', modulo: 'TV Interna', custoRot: 'Custo da TV (licença)', despesa: 'Licença da TV interna',
      contrato: 'Contrato TV Interna', prefixo: 'MGB-TVI-', criar: 'Criar TV interna e enviar contrato', feito: 'TV interna criada',
      aviso: 'Nova TV interna fechada', cleiton: 'montar a programação da TV', custoFixo: false }
  };

  function itensModulo(id) { var m = modulo(id); return m ? m.items : []; }

  function formUnidade(tipo, lead) {
    if (!lead) return escolherLead(tipo);
    var C = UNIDADE[tipo];
    leadAtual = lead;
    var L = lead;
    var hoje = new Date();
    var ini = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1).toISOString().slice(0, 10);
    var el = moldura(C.titulo,
      '<div class="duas"><main>' +
      '<p class="sub">Uma unidade por vez: cada loja é um cliente no CRM e é faturada separada. Os campos em verde vieram do CRM e do CNPJ.</p>' +
      '<section class="card"><div class="sec">1 · Cliente</div><div class="campos">' +
      campoNv('nome', 'Unidade (do CRM)', L.nome, 'text', ' readonly', true) +
      campoNv('razao', 'Razão social', '', 'text', ' placeholder="Vem do CNPJ"') +
      campoNv('cnpj', 'CNPJ ou CPF', L.cnpj, 'text', '', true) +
      campoNv('end', 'Endereço da unidade', '', 'text', ' placeholder="Rua, número, bairro, cidade"') +
      campoNv('resp', 'Responsável', L.responsavel, 'text', '', true) +
      campoNv('email', 'E-mail (recebe o contrato e a nota)', L.email, 'email', ' placeholder="financeiro@cliente.com"', true) +
      campoNv('wpp', 'WhatsApp', L.tel, 'text', '', true) + '</div>' + avisoCNPJ() + '</section>' +
      '<section class="card"><div class="sec">2 · Plano</div><div class="campos">' +
      campoNv('valor', 'Valor mensal do contrato (R$) *', L.valor ? String(L.valor).replace('.', ',') : '', 'text', ' inputmode="decimal" placeholder="0,00"', true) +
      campoNv('custo', C.custoRot + ' (R$/mês)', String(tipo === 'tv' ? CUSTO_TELA : CUSTO_RADIO).replace('.', ','), 'text', ' inputmode="decimal"' + (C.custoFixo ? ' readonly' : '')) +
      campoNv('inicio', 'Início *', ini, 'date') +
      '<label class="f" for="nv-vig">Duração<select id="nv-vig"><option value="12">12 meses</option><option value="24">24 meses</option><option value="6">6 meses</option></select></label>' +
      '<label class="f" for="nv-nf">Nota fiscal<select id="nv-nf"><option value="nota">Nota + boleto todo dia 5</option><option value="boleto">Só boleto, sem nota</option></select></label>' +
      '</div></section></main>' +
      '<aside><section class="card"><div class="sec">Conta do mês</div>' +
      '<div class="conta"><span>Receita</span><b id="nv-rec" style="color:#14583a">R$ 0/mês</b></div>' +
      '<div class="conta"><span>' + esc(C.custoRot) + '</span><b id="nv-custo-v" style="color:#a33a1a">—</b></div>' +
      '<div class="conta" style="border-top:1px solid #ece7f5;padding-top:10px"><span>Sobra para a MGB</span><b id="nv-sobra">—</b></div></section>' +
      '<section class="card"><div class="sec">Ao criar, o hub faz</div>' +
      '<div class="passo" id="nv-p1"><i>1</i><span>Cria a unidade no módulo ' + esc(C.modulo) + ', com a receita mensal.</span></div>' +
      '<div class="passo" id="nv-p2"><i>2</i><span>Lança o custo recorrente mensal.</span></div>' +
      '<div class="passo" id="nv-p3"><i>3</i><span>Marca o cliente do CRM como cadastrado.</span></div>' +
      '<div class="passo" id="nv-p4"><i>4</i><span>Gera o contrato padrão e envia pelo Assinafy.</span></div>' +
      '<div class="passo" id="nv-p5"><i>5</i><span>Prepara o aviso ao Cleiton para ' + esc(C.cleiton) + '.</span></div>' +
      '<div class="erros" id="nv-erros" role="alert"></div>' +
      '<button type="button" class="b p" id="nv-criar">' + esc(C.criar) + '</button>' +
      '</section></aside></div>', true);

    function atualizarConta() {
      var v = numero(val('valor')), c = numero(val('custo'));
      el.querySelector('#nv-rec').textContent = brl(v) + '/mês';
      el.querySelector('#nv-custo-v').textContent = brl(c) + '/mês';
      var s = sobraRadio(v, c);
      var b = el.querySelector('#nv-sobra');
      b.textContent = v ? brl(s) + '/mês' : '—';
      b.style.color = v && s < 0 ? '#a33a1a' : '';
    }
    el.querySelector('#nv-valor').addEventListener('input', atualizarConta);
    el.querySelector('#nv-custo').addEventListener('input', atualizarConta);
    atualizarConta();
    el.querySelector('#nv-criar').addEventListener('click', function () { criarUnidade(tipo); });
    ligarRascunho(tipo);
    completarPorCNPJ(L.cnpj, { razao: 'razao', end: 'endereco', email: 'email', wpp: 'tel' });
    el.querySelector('#nv-valor').focus();
  }

  function criarUnidade(tipo) {
    var C = UNIDADE[tipo];
    var d = {
      nome: val('nome'), razao: val('razao'), cnpj: val('cnpj'), end: val('end'), responsavel: val('resp'),
      email: val('email'), wpp: val('wpp'), valor: val('valor'), custo: val('custo'), inicio: val('inicio'), servico: tipo,
      meses: (doc.getElementById('nv-vig') || {}).value || '12', nf: (doc.getElementById('nv-nf') || {}).value || 'nota'
    };
    var errosEl = doc.getElementById('nv-erros');
    var erros = validarRadio(d, itensModulo(C.mod)).map(function (x) { return x.replace('Rádio Interna', C.modulo); });
    if (erros.length) { errosEl.innerHTML = erros.map(esc).join('<br>'); return; }
    errosEl.textContent = '';
    var btn = doc.getElementById('nv-criar');
    btn.disabled = true; btn.textContent = 'Criando…';
    var valor = numero(d.valor), custo = numero(d.custo), meses = parseInt(d.meses, 10);

    // 1. unidade + receita
    try {
      var cliente = { cnpj: d.cnpj, razao: d.razao || d.nome, fantasia: d.nome, responsavel: d.responsavel, tel: d.wpp, email: d.email,
        endereco: d.end, notaFiscal: d.nf === 'nota' };
      var criado = global.mgbCriarUnidadeModulo(C.mod, d.nome, { valor: valor, inicio: d.inicio.slice(0, 7), meses: meses, cliente: cliente });
      if (!criado) throw new Error('o módulo ' + C.modulo + ' não foi encontrado');
      marcar(1, 'ok', 'Unidade <b>' + esc(d.nome) + '</b> criada com receita de ' + brl(valor) + '/mês por ' + meses + ' meses.');
    } catch (e) {
      marcar(1, 'erro', 'Não consegui criar a unidade: ' + esc(e.message) + '. Nada foi lançado.');
      btn.disabled = false; btn.textContent = 'Tentar de novo';
      return;
    }
    try { global.buildAll(); } catch (e) {}

    // 2. custo recorrente
    if (custo > 0) {
      try {
        var desp = despesaRadio(d.inicio, meses, custo, C.despesa);
        applyToFin(desp, +1);                                     // eslint-disable-line no-undef
        if (!db[C.mod][d.nome]) db[C.mod][d.nome] = [];           // eslint-disable-line no-undef
        db[C.mod][d.nome].push(desp);                             // eslint-disable-line no-undef
        marcar(2, 'ok', 'Custo de <b>' + brl(custo) + '/mês</b> lançado a partir de ' + desp.dataInicio.split('-').reverse().join('/') + '.');
      } catch (e) {
        marcar(2, 'erro', 'A unidade foi criada, mas o custo não: ' + esc(e.message) + '. Lance a licença à mão no módulo ' + esc(C.modulo) + '.');
      }
    } else marcar(2, 'ok', 'Sem custo mensal para lançar.');

    // 3. lead do CRM
    if (leadAtual) { leadAtual.itemCriado = d.nome; marcar(3, 'ok', 'Cliente <b>' + esc(leadAtual.nome) + '</b> marcado como cadastrado no CRM.'); }
    try { scheduleSave(); } catch (e) {}                         // eslint-disable-line no-undef
    try { global.buildSidebar(); } catch (e) {}
    try { global.buildHome(); } catch (e) {}

    // 4. contrato padrão + Assinafy
    var corpo = contratoRadioInterna(d, {
      extenso: typeof global.fRecExtenso === 'function' ? global.fRecExtenso : null,
      hoje: new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }), logo: LOGO,
      numero: C.prefixo + Date.now().toString().slice(-6)
    });
    enviarComStatus(C.mod, d.nome, C.contrato + ' - ' + d.nome, corpo, d.responsavel || d.nome, d.email,
      'Segue o contrato para assinatura eletrônica.', 4).finally(function () {
      var txt = C.aviso + ': ' + d.nome + '. Início ' + d.inicio.split('-').reverse().join('/') +
        '. Contrato enviado para assinatura: ' + C.cleiton + ' assim que for assinado (o material vem pela Karen).';
      marcar(5, 'ok', 'Aviso pronto: <a href="https://wa.me/?text=' + encodeURIComponent(txt) + '" target="_blank" rel="noopener">enviar ao Cleiton no WhatsApp</a>.');
      concluir(btn, C.feito);
    });
  }

  // Envia ao Assinafy e marca o passo n com o resultado.
  function enviarComStatus(modId, nome, nomeDoc, corpo, signatario, email, mensagem, n) {
    var ver = linkVerContrato(corpo);
    var p = email
      ? enviarAssinafy(modId, nome, nomeDoc, corpo, signatario, email, mensagem)
          .then(function () { return { ok: true, msg: 'Contrato enviado ao cliente (' + esc(email) + ') e a você pelo Assinafy. Quando todos assinarem, o PDF vai por e-mail e fica salvo no Drive.' + ver }; })
          .catch(function (e) { return { ok: false, msg: 'Contrato gerado, mas o envio ao Assinafy falhou: ' + esc(e.message) + '.' + ver }; })
      : Promise.resolve({ ok: false, msg: 'Contrato gerado, mas sem e-mail do cliente: nada foi enviado.' + ver });
    return p.then(function (r) {
      marcar(n, r.ok ? 'ok' : 'erro', r.msg);
      registrarJornada(modId, nome, r.ok ? 'Contrato enviado para assinatura (Assinafy) · ' + (email || '') : 'Contrato gerado, envio para assinatura pendente');
      try { scheduleSave(); } catch (e) {}                                                   // eslint-disable-line no-undef
      return r;
    });
  }

  function concluir(btn, texto) {
    btn.textContent = texto;
    var fim = doc.createElement('button');
    fim.type = 'button'; fim.className = 'b'; fim.textContent = 'Lançar outro';
    fim.addEventListener('click', function () { abrir(); });
    btn.parentNode.appendChild(fim);
  }

  // ── Novo anunciante · Rádio Mercadão ──────────────────────────────────
  // Os Blocos Rádio são do Cleiton e só recebem a loja depois do contrato assinado (regra de 10/10).
  // A Cobrança Mensal do Mercadão lê os Blocos: quando o Cleiton coloca a loja, ela entra na cobrança.
  function lerGradeBlocos() { try { return JSON.parse(global.localStorage.getItem('mgb_blocos_v4')) || {}; } catch (e) { return {}; } }
  function padraoCobranca(id, pad) { var el = doc.getElementById(id); var v = el ? numero(el.value) : 0; return v > 0 ? v : pad; }
  function anunciantesMercadao() {
    var nomes = ocupacaoBlocos(lerGradeBlocos()).nomes.slice();
    try { Object.keys(clientesInfo.mercadao || {}).forEach(function (n) { nomes.push(n); }); } catch (e) {}  // eslint-disable-line no-undef
    return nomes;
  }

  function formMercadao(lead) {
    if (!lead) return escolherLead('mercadao');
    leadAtual = lead;
    var L = lead;
    var crm = true;
    var occ = ocupacaoBlocos(lerGradeBlocos());
    var vCota = padraoCobranca('rel-cota', MERCADAO.valorCota);
    var rep = padraoCobranca('rel-repasse', MERCADAO.repasse);
    var hoje = new Date();
    var ini = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1).toISOString().slice(0, 10);
    var el = moldura('Novo anunciante · Rádio Mercadão',
      '<div class="duas"><main>' +
      '<p class="sub">Loja que vai anunciar na rádio interna do Mercadão Prochet. Os campos em verde vieram do CRM e do CNPJ.</p>' +
      '<section class="card"><div class="sec">1 · Anunciante</div><div class="campos">' +
      campoNv('nome', 'Loja (do CRM)', L.nome, 'text', ' readonly', crm) +
      campoNv('razao', 'Razão social ou nome completo', '', 'text', ' placeholder="Se diferente do nome da loja"') +
      campoNv('cnpj', 'CNPJ ou CPF', L.cnpj, 'text', '', crm) +
      campoNv('end', 'Endereço', '', 'text', ' placeholder="Box, rua, número, cidade"') +
      campoNv('resp', 'Responsável', L.responsavel, 'text', '', crm) +
      campoNv('email', 'E-mail (recebe o contrato)', L.email, 'email', ' placeholder="loja@exemplo.com"', crm) +
      campoNv('wpp', 'WhatsApp (recebe o spot para aprovar)', L.tel, 'text', '', crm) + '</div>' + avisoCNPJ() + '</section>' +
      '<section class="card"><div class="sec">2 · Cotas e pagamento</div><div class="campos">' +
      campoNv('cotas', 'Cotas *', '1', 'number', ' min="1" max="' + Math.max(occ.vagas, 1) + '"') +
      campoNv('vcota', 'Valor por cota (R$) *', String(vCota).replace('.', ','), 'text', ' inputmode="decimal"') +
      campoNv('inicio', 'Início *', ini, 'date') +
      '<label class="f" for="nv-vig">Duração<select id="nv-vig"><option value="6">6 meses</option><option value="12">12 meses</option><option value="3">3 meses</option><option value="1">1 mês</option></select></label>' +
      '<label class="f" for="nv-pag">Pagamento<select id="nv-pag"><option value="mensal">Mensal, todo dia 5</option><option value="adiantado">Adiantado (todos os meses de uma vez)</option></select></label>' +
      '</div><p class="sub">Blocos hoje: <b>' + occ.ocupadas + ' de ' + occ.total + '</b> cotas ocupadas, <b>' + occ.vagas + (occ.vagas === 1 ? ' livre' : ' livres') + '</b>. Cada cota = ' + MERCADAO.insercoesCota + ' inserções por dia.</p></section></main>' +
      '<aside><section class="card"><div class="sec">Conta do mês</div>' +
      '<div class="conta"><span id="nv-rot-total">Anunciante paga · 1 cota</span><b id="nv-total" style="color:#14583a">—</b></div>' +
      '<div class="conta"><span>Repasse ao Mercadão (' + rep + '%)</span><b id="nv-repasse" style="color:#a33a1a">—</b></div>' +
      '<div class="conta" style="border-top:1px solid #ece7f5;padding-top:10px"><span>Fica para a MGB</span><b id="nv-mgb">—</b></div>' +
      '<p class="sub" id="nv-ins">15 inserções por dia.</p></section>' +
      '<section class="card"><div class="sec">Ao criar, o hub faz</div>' +
      '<div class="passo" id="nv-p1"><i>1</i><span>Guarda o cadastro da loja (dados, cotas, valor e pagamento) e o contrato na Pasta.</span></div>' +
      '<div class="passo" id="nv-p2"><i>2</i><span>Gera o contrato Mercadão e envia pelo Assinafy.</span></div>' +
      '<div class="passo" id="nv-p3"><i>3</i><span>' + (lead ? 'Marca o lead do CRM como cadastrado.' : 'Sem lead do CRM: nada a marcar.') + '</span></div>' +
      '<div class="passo" id="nv-p4"><i>4</i><span>Prepara o aviso ao Cleiton: reservar as cotas nos Blocos e produzir o spot depois da assinatura.</span></div>' +
      '<div class="passo" id="nv-p5"><i>5</i><span>Com a loja nos Blocos, ela entra sozinha na Cobrança Mensal do Mercadão.</span></div>' +
      '<div class="erros" id="nv-erros" role="alert"></div>' +
      '<button type="button" class="b p" id="nv-criar"' + (occ.vagas ? '' : ' disabled') + '>' + (occ.vagas ? 'Criar anunciante e enviar contrato' : 'Blocos lotados: fale com o Cleiton') + '</button>' +
      '</section></aside></div>', true);

    function atualizarConta() {
      var c = parseInt(val('cotas'), 10) || 0;
      var k = contaMercadao(c, val('vcota'), rep);
      el.querySelector('#nv-rot-total').textContent = 'Anunciante paga · ' + c + (c === 1 ? ' cota' : ' cotas');
      el.querySelector('#nv-total').textContent = brl(k.total) + '/mês';
      el.querySelector('#nv-repasse').textContent = brl(k.repasse);
      el.querySelector('#nv-mgb').textContent = brl(k.mgb) + '/mês';
      el.querySelector('#nv-ins').textContent = (c * MERCADAO.insercoesCota) + ' inserções por dia, de 15 segundos, das 9h às 22h.';
    }
    el.querySelector('#nv-cotas').addEventListener('input', atualizarConta);
    el.querySelector('#nv-vcota').addEventListener('input', atualizarConta);
    atualizarConta();
    el.querySelector('#nv-criar').addEventListener('click', function () { criarMercadao(rep); });
    ligarRascunho('mercadao');
    completarPorCNPJ(L.cnpj, { razao: 'razao', end: 'endereco', email: 'email', wpp: 'tel' });
    el.querySelector('#nv-cotas').focus();
  }

  function criarMercadao(rep) {
    var d = {
      nome: val('nome'), razao: val('razao'), cnpj: val('cnpj'), end: val('end'), responsavel: val('resp'),
      email: val('email'), wpp: val('wpp'), cotas: val('cotas'), valorCota: val('vcota'), inicio: val('inicio'),
      meses: (doc.getElementById('nv-vig') || {}).value || '6', pagamento: (doc.getElementById('nv-pag') || {}).value || 'mensal'
    };
    var occ = ocupacaoBlocos(lerGradeBlocos());
    var errosEl = doc.getElementById('nv-erros');
    var erros = validarMercadao(d, anunciantesMercadao(), occ.vagas);
    if (erros.length) { errosEl.innerHTML = erros.map(esc).join('<br>'); return; }
    errosEl.textContent = '';
    var btn = doc.getElementById('nv-criar');
    btn.disabled = true; btn.textContent = 'Criando…';
    var cotas = parseInt(d.cotas, 10), meses = parseInt(d.meses, 10);
    var k = contaMercadao(cotas, d.valorCota, rep);
    var num = 'MGB-MCD-' + Date.now().toString().slice(-6);
    var fimBr = dataMais(d.inicio, meses);

    // 1. cadastro da loja + Pasta de contratos
    try {
      if (!clientesInfo.mercadao) clientesInfo.mercadao = {};          // eslint-disable-line no-undef
      clientesInfo.mercadao[d.nome] = {                                 // eslint-disable-line no-undef
        cnpj: d.cnpj, razao: d.razao || d.nome, fantasia: d.nome, responsavel: d.responsavel, tel: d.wpp, email: d.email, endereco: d.end,
        cotas: cotas, valorCota: numero(d.valorCota), valorMensal: k.total, inicio: d.inicio.slice(0, 7), meses: meses,
        pagamento: d.pagamento, contrato: num
      };
      try {
        global.mgbSalvarContrato('mercadao', {
          tipo_contrato: 'Mercadao Radio', num_contrato: num, data_emissao: new Date().toLocaleDateString('pt-BR'), status: 'Ativo',
          cnpj_cpf: d.cnpj, razao_social: d.razao || d.nome, nome_fantasia: d.nome, responsavel: d.responsavel, telefone: d.wpp, email: d.email,
          plano: cotas + (cotas === 1 ? ' cota' : ' cotas') + ' · ' + (d.pagamento === 'adiantado' ? 'adiantado' : 'mensal'), meses: meses,
          data_inicio: d.inicio, data_fim: fimBr, valor_total: k.total * meses
        });
      } catch (e) {}
      // Valor por cota diferente do padrão da Cobrança: deixa o valor da loja já ajustado lá.
      var vPad = padraoCobranca('rel-cota', MERCADAO.valorCota);
      if (numero(d.valorCota) !== vPad) {
        try { relAjustesInit(); relAjustes.ov[d.nome.toLowerCase()] = k.total; } catch (e) {}  // eslint-disable-line no-undef
      }
      marcar(1, 'ok', 'Loja <b>' + esc(d.nome) + '</b> cadastrada: ' + cotas + (cotas === 1 ? ' cota' : ' cotas') + ', ' + brl(k.total) + '/mês por ' + meses + (meses === 1 ? ' mês' : ' meses') +
        (d.pagamento === 'adiantado' ? ', pagamento adiantado de <b>' + brl(k.total * meses) + '</b> (emita a cobrança única)' : ', cobrança todo dia 5') + '.');
    } catch (e) {
      marcar(1, 'erro', 'Não consegui guardar o cadastro: ' + esc(e.message) + '. Nada foi lançado.');
      btn.disabled = false; btn.textContent = 'Tentar de novo';
      return;
    }

    // 3. lead do CRM (antes do envio, para não cadastrar duas vezes se a rede cair)
    if (leadAtual) { leadAtual.itemCriado = d.nome; marcar(3, 'ok', 'Lead <b>' + esc(leadAtual.nome) + '</b> marcado como cadastrado.'); }
    else marcar(3, 'ok', 'Sem lead do CRM para marcar.');
    try { scheduleSave(); } catch (e) {}                               // eslint-disable-line no-undef
    try { global.buildHome(); } catch (e) {}

    // 2. contrato + Assinafy
    var corpo = contratoMercadao(d, {
      extenso: typeof global.fRecExtenso === 'function' ? global.fRecExtenso : null,
      hoje: new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }), logo: LOGO, numero: num
    });
    var ver = linkVerContrato(corpo);
    var envio = d.email
      ? enviarAssinafy('mercadao', d.nome, 'Contrato Rádio Mercadão - ' + d.nome, corpo, d.responsavel || d.nome, d.email,
          'Segue o contrato de anúncio na rádio interna do Mercadão da Prochet para assinatura eletrônica.')
          .then(function () { return { ok: true, msg: 'Contrato enviado à loja (' + esc(d.email) + ') e a você pelo Assinafy.' + ver }; })
          .catch(function (e) { return { ok: false, msg: 'Contrato gerado, mas o envio ao Assinafy falhou: ' + esc(e.message) + '.' + ver }; })
      : Promise.resolve({ ok: false, msg: 'Contrato gerado, mas sem e-mail da loja: nada foi enviado.' + ver });

    envio.then(function (r) { marcar(2, r.ok ? 'ok' : 'erro', r.msg); }).finally(function () {
      // 4. aviso ao Cleiton (ele reserva nos Blocos depois da assinatura)
      var txt = 'Novo anunciante na Rádio Mercadão: ' + d.nome + ' · ' + cotas + (cotas === 1 ? ' cota' : ' cotas') +
        (d.wpp ? ' · WhatsApp ' + d.wpp : '') + '. Início ' + d.inicio.split('-').reverse().join('/') +
        '. Contrato enviado para assinatura: assim que assinar, reservar nos Blocos com o nome "' + d.nome + '" e produzir o spot (o material vem pela Karen).';
      marcar(4, 'ok', 'Aviso pronto: <a href="https://wa.me/?text=' + encodeURIComponent(txt) + '" target="_blank" rel="noopener">enviar ao Cleiton no WhatsApp</a>.');
      marcar(5, 'ok', 'Quando o Cleiton puser <b>' + esc(d.nome) + '</b> nos Blocos, a loja aparece na Cobrança Mensal do Mercadão (' + brl(numero(d.valorCota)) + ' por cota).');
      btn.textContent = 'Anunciante criado';
      var fim = doc.createElement('button');
      fim.type = 'button'; fim.className = 'b'; fim.textContent = 'Lançar outro';
      fim.addEventListener('click', function () { abrir(); });
      btn.parentNode.appendChild(fim);
    });
  }

  // ── Contratos que já existem no hub (Tela Vertical e Vaapty) ──────────
  // O formulário novo preenche o gerador oficial (iframe) e usa o contrato que ele gera,
  // assim o texto do contrato continua sendo o mesmo de sempre.
  function janela(id) {
    var f = doc.getElementById(id);
    try { return f && f.contentWindow && f.contentWindow.document && f.contentWindow.document.body ? f.contentWindow : null; } catch (e) { return null; }
  }
  function preencher(w, id, v) { var e = w.document.getElementById(id); if (e && v != null && v !== '') e.value = v; }
  function documentoDoFrame(w, outId) {
    var css = Array.prototype.map.call(w.document.querySelectorAll('style'), function (st) { return st.textContent; }).join('\n');
    var out = w.document.getElementById(outId);
    if (!out || !out.innerHTML.trim()) return '';
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>' + css + 'body{padding:24px;background:#fff}</style></head><body><div class="contract-preview">' + out.innerHTML + '</div></body></html>';
  }
  function campoSel(id, rotulo, opcoes, sel) {
    return '<label class="f" for="nv-' + id + '">' + rotulo + '<select id="nv-' + id + '">' + opcoes.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
      return '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('') + '</select></label>';
  }
  function camposEndereco() {
    return '<section class="card"><div class="sec">Endereço (vem do CNPJ)</div><div class="campos">' +
      campoNv('cep', 'CEP', '') + campoNv('logradouro', 'Logradouro', '') + campoNv('numero', 'Número', '') +
      campoNv('complemento', 'Complemento', '') + campoNv('bairro', 'Bairro', '') + campoNv('cidade', 'Cidade', '') + campoNv('uf', 'UF', '', 'text', ' maxlength="2"') +
      '</div></section>';
  }
  var MAPA_END = { razao: 'razao', cep: 'cep', logradouro: 'logradouro', numero: 'numero', complemento: 'complemento', bairro: 'bairro', cidade: 'cidade', uf: 'uf', email: 'email', tel: 'tel' };
  function ehCPF(doc_) { return String(doc_ || '').replace(/\D/g, '').length === 11; }
  function inicioPadrao() { var h = new Date(); return new Date(h.getFullYear(), h.getMonth() + 1, 1).toISOString().slice(0, 10); }

  // ── Novo anunciante · telas do elevador (contrato Tela Vertical) ──────
  function formAnuncianteElev(lead) {
    if (!lead) return escolherLead('anunciante');
    var w = janela('frame-elevador');
    var condos = [], pgtos = ['Boleto Bancário', 'PIX', 'Transferência Bancária'];
    try { condos = w.eval('eCondominios').filter(function (c) { return c.status === 'ativo'; }); } catch (e) {}
    try { pgtos = Array.prototype.map.call(w.document.getElementById('e-pgto').options, function (o) { return o.text; }); } catch (e) {}
    leadAtual = lead;
    var L = lead;
    var listaCondos = condos.length ? condos.map(function (c) {
      return '<label style="display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border:1px solid #e4def2;border-radius:10px;font-size:13px;cursor:pointer">' +
        '<input type="checkbox" class="nv-condo" value="' + esc(c.id) + '" data-telas="' + (c.telas || 1) + '" style="margin-top:3px">' +
        '<span><b>' + esc(c.nome) + '</b><br><span style="color:#6b6380">' + esc(c.bairro) + ' · ' + (c.telas || 1) + ' tela(s)</span></span></label>';
    }).join('') : '<p class="sub">Não consegui ler a lista de condomínios do contrato Tela Vertical. Recarregue a página.</p>';
    var el = moldura('Novo anunciante · Tela Vertical',
      '<div class="duas"><main>' +
      '<p class="sub">Cliente do CRM. Os campos em verde vieram do CRM e do CNPJ. O contrato gerado é o mesmo Tela Vertical de sempre.</p>' +
      '<section class="card"><div class="sec">1 · Anunciante</div><div class="campos">' +
      campoNv('nome', 'Anunciante (do CRM)', L.nome, 'text', ' readonly', true) +
      campoNv('cnpj', 'CNPJ ou CPF', L.cnpj, 'text', '', true) +
      campoNv('razao', 'Razão social / nome completo', '', 'text', ' placeholder="Vem do CNPJ"') +
      campoNv('resp', 'Responsável', L.responsavel, 'text', '', true) + campoNv('cargo', 'Cargo', L.funcao, 'text', '', true) +
      campoNv('tel', 'Telefone / WhatsApp', L.tel, 'text', '', true) + campoNv('email', 'E-mail (recebe o contrato)', L.email, 'email', '', true) +
      '</div>' + avisoCNPJ() + '</section>' + camposEndereco() +
      '<section class="card"><div class="sec">2 · Condomínios</div><div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">' + listaCondos + '</div></section>' +
      '<section class="card"><div class="sec">3 · Plano e valores</div><div class="campos">' +
      campoSel('dur', 'Duração do spot', [['10', '10 s (padrão)'], ['20', '20 s (2×)'], ['30', '30 s (3×)']], '10') +
      campoSel('formato', 'Formato', [['video', 'Vídeo (MP4)'], ['imagem', 'Imagem (JPG/PNG)']], 'video') +
      campoNv('vtela', 'Valor por tela/mês (R$, base 10 s) *', '', 'text', ' inputmode="decimal" placeholder="Ex.: 290,00"') +
      campoNv('vfinal', 'Valor mensal final (R$, se negociado)', L.valor ? String(L.valor).replace('.', ',') : '', 'text', ' inputmode="decimal"', true) +
      campoSel('plano', 'Plano', [['mensal', 'Mensal (1 mês)'], ['trimestral', 'Trimestral (3 meses)'], ['semestral', 'Semestral (6 meses)'], ['anual', 'Anual (12 meses)']], 'semestral') +
      campoSel('pgto', 'Pagamento', pgtos, pgtos[0]) + campoNv('inicio', 'Início *', inicioPadrao(), 'date') +
      campoNv('obs', 'Observação sobre o material', '', 'text', ' placeholder="Ex.: cliente entrega o vídeo pronto"') +
      '</div></section></main>' +
      '<aside><section class="card"><div class="sec">Conta do mês</div>' +
      '<div class="conta"><span id="nv-rot-telas">0 telas</span><b id="nv-cheio">—</b></div>' +
      '<div class="conta" style="border-top:1px solid #ece7f5;padding-top:10px"><span>Anunciante paga</span><b id="nv-mensal" style="color:#14583a">—</b></div>' +
      '<p class="sub" id="nv-total"></p></section>' +
      '<section class="card"><div class="sec">Ao criar, o hub faz</div>' +
      '<div class="passo" id="nv-p1"><i>1</i><span>Gera o contrato Tela Vertical e lança o anunciante nas telas escolhidas (receita na Tela Vertical).</span></div>' +
      '<div class="passo" id="nv-p2"><i>2</i><span>Envia o contrato pelo Assinafy.</span></div>' +
      '<div class="passo" id="nv-p3"><i>3</i><span>Marca o cliente do CRM como cadastrado.</span></div>' +
      '<div class="passo" id="nv-p4"><i>4</i><span>Prepara o aviso ao Cleiton para programar as telas depois da assinatura.</span></div>' +
      '<div class="erros" id="nv-erros" role="alert"></div>' +
      '<button type="button" class="b p" id="nv-criar"' + (w ? '' : ' disabled') + '>Criar anunciante e enviar contrato</button>' +
      '</section></aside></div>', true);

    function conta() {
      var telas = 0;
      el.querySelectorAll('.nv-condo:checked').forEach(function (c) { telas += parseInt(c.getAttribute('data-telas'), 10) || 1; });
      var mult = { '10': 1, '20': 2, '30': 3 }[val('dur')] || 1;
      var cheio = telas * numero(val('vtela')) * mult;
      var fin = numero(val('vfinal')) || cheio;
      var meses = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }[val('plano')] || 1;
      el.querySelector('#nv-rot-telas').textContent = telas + (telas === 1 ? ' tela' : ' telas') + (mult > 1 ? ' · ' + mult + '×' : '') + ' · valor cheio';
      el.querySelector('#nv-cheio').textContent = cheio ? brl(cheio) : '—';
      el.querySelector('#nv-mensal').textContent = fin ? brl(fin) + '/mês' : '—';
      el.querySelector('#nv-total').textContent = fin ? 'Total do contrato: ' + brl(fin * meses) + ' em ' + meses + (meses === 1 ? ' mês' : ' meses') + '.' : '';
      return { telas: telas, mensal: fin, meses: meses };
    }
    var box = el.querySelector('.box'); box.addEventListener('input', conta); box.addEventListener('change', conta); conta();
    el.querySelector('#nv-criar').addEventListener('click', function () { criarAnuncianteElev(conta()); });
    ligarRascunho('anunciante');
    completarPorCNPJ(L.cnpj, MAPA_END);
  }

  function criarAnuncianteElev(k) {
    var w = janela('frame-elevador');
    var ids = Array.prototype.map.call(doc.querySelectorAll('.nv-condo:checked'), function (c) { return c.value; });
    var d = { nome: val('nome'), cnpj: val('cnpj'), email: val('email'), inicio: val('inicio') };
    var erros = [];
    var existentes = []; try { existentes = (anunciantes || []).map(function (a) { return a.nome; }); } catch (e) {}  // eslint-disable-line no-undef
    if (jaExiste(d.nome, existentes)) erros.push('Este cliente já é anunciante nas telas. Para renovar, use o aviso de renovação.');
    if (!ids.length) erros.push('Escolha pelo menos um condomínio.');
    if (!(k.mensal > 0)) erros.push('Informe o valor por tela ou o valor mensal final.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio)) erros.push('Informe a data de início.');
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) erros.push('O e-mail parece incompleto.');
    if (!w) erros.push('O gerador do contrato Tela Vertical não carregou. Recarregue a página.');
    var errosEl = doc.getElementById('nv-erros');
    if (erros.length) { errosEl.innerHTML = erros.map(esc).join('<br>'); return; }
    errosEl.textContent = '';
    var btn = doc.getElementById('nv-criar');
    btn.disabled = true; btn.textContent = 'Criando…';

    // 1. preenche o gerador oficial e gera (ele mesmo lança o anunciante e registra na Pasta)
    var html = '';
    try {
      var pf = ehCPF(d.cnpj);
      w.eSetTipo(pf ? 'pf' : 'pj');
      if (pf) { preencher(w, 'e-cpf', val('cnpj')); preencher(w, 'e-nomepf', val('razao') || d.nome); }
      else { preencher(w, 'e-cnpj', val('cnpj')); preencher(w, 'e-razao', val('razao')); preencher(w, 'e-fantasia', d.nome); }
      ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade'].forEach(function (c) { preencher(w, 'e-' + c, val(c)); });
      preencher(w, 'e-estado', val('uf').toUpperCase());
      preencher(w, 'e-resp', val('resp')); preencher(w, 'e-cargo', val('cargo')); preencher(w, 'e-tel', val('tel')); preencher(w, 'e-email', d.email);
      preencher(w, 'e-durspot', val('dur')); preencher(w, 'e-formato', val('formato')); preencher(w, 'e-obs', val('obs'));
      preencher(w, 'e-valor', val('vtela')); w.document.getElementById('e-desc').value = val('vfinal');
      var pg = w.document.getElementById('e-pgto'); Array.prototype.forEach.call(pg.options, function (o, i) { if (o.text === val('pgto')) pg.selectedIndex = i; });
      preencher(w, 'e-inicio', d.inicio);
      w.eval('eCondos.clear()');
      ids.forEach(function (id) { w.eToggle(id); });
      w.eSelPlano(val('plano'));
      w.eGerar();
      html = documentoDoFrame(w, 'e-contract-out');
      if (!html) throw new Error('o contrato não foi gerado');
      marcar(1, 'ok', 'Contrato Tela Vertical gerado e anunciante <b>' + esc(d.nome) + '</b> lançado em ' + ids.length + (ids.length === 1 ? ' condomínio' : ' condomínios') + ' (' + brl(k.mensal) + '/mês por ' + k.meses + (k.meses === 1 ? ' mês' : ' meses') + ').');
    } catch (e) {
      marcar(1, 'erro', 'Não consegui gerar o contrato: ' + esc(e.message) + '.');
      btn.disabled = false; btn.textContent = 'Tentar de novo';
      return;
    }

    // 3. lead
    if (leadAtual) { leadAtual.itemCriado = d.nome; marcar(3, 'ok', 'Cliente <b>' + esc(leadAtual.nome) + '</b> marcado como cadastrado no CRM.'); }
    try { scheduleSave(); } catch (e) {}                         // eslint-disable-line no-undef
    try { global.buildHome(); } catch (e) {}

    // 2. Assinafy
    enviarComStatus('elev', d.nome, 'Contrato Tela Vertical - ' + d.nome, html, val('resp') || d.nome, d.email,
      'Segue o contrato de mídia em elevadores da Tela Vertical para assinatura eletrônica.', 2).finally(function () {
      var nomes = []; try { nomes = w.eval('eCondominios').filter(function (c) { return ids.indexOf(c.id) > -1; }).map(function (c) { return c.nome; }); } catch (e) {}
      var txt = 'Novo anunciante nas telas: ' + d.nome + ' · ' + nomes.join(', ') + '. Início ' + d.inicio.split('-').reverse().join('/') +
        '. Contrato enviado para assinatura: programar assim que for assinado (o material vem pela Karen).';
      marcar(4, 'ok', 'Aviso pronto: <a href="https://wa.me/?text=' + encodeURIComponent(txt) + '" target="_blank" rel="noopener">enviar ao Cleiton no WhatsApp</a>.');
      concluir(btn, 'Anunciante criado');
    });
  }

  // ── Nova unidade Vaapty (contrato de franquia Vaapty) ─────────────────
  function formVaapty(lead) {
    if (!lead) return escolherLead('vaapty');
    var w = janela('frame-vaapty');
    var pgtos = ['Boleto mensal', 'PIX mensal', 'Cartão de crédito recorrente', 'Transferência bancária'];
    try { pgtos = Array.prototype.map.call(w.document.getElementById('v-pgto').options, function (o) { return o.text; }); } catch (e) {}
    var tabela = 339; try { tabela = numero(w.document.getElementById('v-tabela').value) || 339; } catch (e) {}
    leadAtual = lead;
    var L = lead;
    var el = moldura('Nova unidade Vaapty',
      '<div class="duas"><main>' +
      '<p class="sub">Cliente do CRM. Os campos em verde vieram do CRM e do CNPJ. O contrato gerado é o mesmo contrato de franquia Vaapty de sempre.</p>' +
      '<section class="card"><div class="sec">1 · Franqueado</div><div class="campos">' +
      campoNv('nome', 'Unidade (do CRM)', L.nome, 'text', ' readonly', true) +
      campoNv('cnpj', 'CNPJ ou CPF', L.cnpj, 'text', '', true) +
      campoNv('razao', 'Razão social / nome completo', '', 'text', ' placeholder="Vem do CNPJ"') +
      campoNv('resp', 'Responsável', L.responsavel, 'text', '', true) + campoNv('cargo', 'Cargo', L.funcao, 'text', '', true) +
      campoNv('tel', 'Telefone / WhatsApp', L.tel, 'text', '', true) + campoNv('email', 'E-mail (recebe o contrato)', L.email, 'email', '', true) +
      '</div>' + avisoCNPJ() + '</section>' + camposEndereco() +
      '<section class="card"><div class="sec">2 · Equipamento e valores</div><div class="campos">' +
      campoNv('serie', 'Patrimônio do box (da etiqueta)', '', 'text', ' list="nv-serie-l" autocomplete="off" placeholder="Ex.: MGBTVV-0002"') +
      '<datalist id="nv-serie-l">' + etiquetasBox().map(function (e) { return '<option value="' + esc(e.patCode) + '">' + esc((e.franqueado || '') + (e.player ? ' · player ' + e.player : '') + (e.data ? ' · ' + e.data.split('-').reverse().join('/') : '')) + '</option>'; }).join('') + '</datalist>' +
      campoNv('envio', 'Custo de envio do box (R$)', '', 'text', ' inputmode="decimal" placeholder="0,00 (frete, Correios)"') +
      campoNv('qtd', 'Quantidade de boxes', '1', 'number', ' min="1"') +
      campoNv('valor', 'Valor negociado (R$/mês) *', L.valor ? String(L.valor).replace('.', ',') : String(tabela).replace('.', ','), 'text', ' inputmode="decimal"', !!L.valor) +
      campoNv('inicio', 'Início *', inicioPadrao(), 'date') + campoSel('pgto', 'Pagamento', pgtos, pgtos[0]) +
      '</div><p class="sub">Valor de tabela: ' + brl(tabela) + '/mês · prazo de 12 meses com renovação automática.</p></section></main>' +
      '<aside><section class="card"><div class="sec">Conta do mês</div>' +
      '<div class="conta"><span>Franqueado paga</span><b id="nv-mensal" style="color:#14583a">—</b></div>' +
      '<p class="sub" id="nv-desc"></p></section>' +
      '<section class="card"><div class="sec">Ao criar, o hub faz</div>' +
      '<div class="passo" id="nv-p1"><i>1</i><span>Gera o contrato Vaapty e cria a unidade no módulo Vaapty com a receita.</span></div>' +
      '<div class="passo" id="nv-p2"><i>2</i><span>Envia o contrato pelo Assinafy.</span></div>' +
      '<div class="passo" id="nv-p3"><i>3</i><span>Marca o cliente do CRM como cadastrado.</span></div>' +
      '<div class="passo" id="nv-p4"><i>4</i><span>Prepara o aviso ao Cleiton para instalar o box depois da assinatura.</span></div>' +
      '<div class="erros" id="nv-erros" role="alert"></div>' +
      '<button type="button" class="b p" id="nv-criar"' + (w ? '' : ' disabled') + '>✍️ Criar unidade e enviar para assinatura</button>' +
      '</section></aside></div>', true);
    function conta() {
      var v = numero(val('valor'));
      el.querySelector('#nv-mensal').textContent = v ? brl(v) + '/mês' : '—';
      var dsc = v && tabela ? Math.round((1 - v / tabela) * 1000) / 10 : 0;
      el.querySelector('#nv-desc').textContent = v ? (dsc > 0 ? 'Desconto de ' + String(dsc).replace('.', ',') + '% sobre a tabela. ' : '') + 'Total de 12 meses: ' + brl(v * 12) + '.' : '';
    }
    el.querySelector('.box').addEventListener('input', conta); conta();
    el.querySelector('#nv-criar').addEventListener('click', criarVaapty);
    ligarRascunho('vaapty');
    ligarPatrimonio(L);
    completarPorCNPJ(L.cnpj, MAPA_END);
  }

  // Patrimônio: sugere a etiqueta enviada para este franqueado e mostra player/destino/data ao escolher
  function ligarPatrimonio(L) {
    var inp = doc.getElementById('nv-serie'); if (!inp) return;
    var info = doc.createElement('p'); info.className = 'sub'; info.id = 'nv-serie-info'; info.setAttribute('aria-live', 'polite');
    inp.closest('section').appendChild(info);
    function etiquetaDe(cod) { return etiquetasBox().filter(function (e) { return String(e.patCode).toUpperCase() === String(cod).trim().toUpperCase(); })[0]; }
    function mostrar() {
      var e = etiquetaDe(inp.value);
      info.innerHTML = e ? '📦 Etiqueta <b>' + esc(e.patCode) + '</b> · ' + esc(e.franqueado || '') + (e.player ? ' · player ' + esc(e.player) : '') +
        (e.destCidadeUf ? ' · enviada para ' + esc(e.destCidadeUf) : '') + (e.data ? ' em ' + e.data.split('-').reverse().join('/') : '') :
        (inp.value ? 'Patrimônio sem etiqueta gerada. Gere em Ferramentas › Etiquetas quando enviar o box.' : 'Escolha a etiqueta do box enviado (Ferramentas › Etiquetas).');
    }
    inp.addEventListener('input', mostrar);
    if (!inp.value) {                                                // sugere a etiqueta cujo franqueado parece com o nome do lead
      var nome = String(L.nome || '').toLowerCase().replace(/vaapty|[-–]/g, '').trim();
      var sug = nome && etiquetasBox().filter(function (e) { var f = String(e.franqueado || '').toLowerCase(); return nome.split(/\s+/).some(function (p) { return p.length > 3 && f.indexOf(p) >= 0; }); })[0];
      if (sug) inp.value = sug.patCode;
    }
    mostrar();
  }

  function criarVaapty() {
    var w = janela('frame-vaapty');
    var d = { nome: val('nome'), cnpj: val('cnpj'), email: val('email'), inicio: val('inicio'), valor: numero(val('valor')) };
    var erros = [];
    if (jaExiste(d.nome, itensModulo('vaapty'))) erros.push('Já existe uma unidade com esse nome no módulo Vaapty.');
    if (!(d.valor > 0)) erros.push('Informe o valor negociado.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio)) erros.push('Informe a data de início.');
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) erros.push('O e-mail parece incompleto.');
    if (!w) erros.push('O gerador do contrato Vaapty não carregou. Recarregue a página.');
    var errosEl = doc.getElementById('nv-erros');
    if (erros.length) { errosEl.innerHTML = erros.map(esc).join('<br>'); return; }
    errosEl.textContent = '';
    var btn = doc.getElementById('nv-criar');
    btn.disabled = true; btn.textContent = 'Criando…';

    var html = '';
    try {
      var pf = ehCPF(d.cnpj);
      w.vSetTipo(pf ? 'pf' : 'pj');
      if (pf) { preencher(w, 'v-cpf', d.cnpj); preencher(w, 'v-nomepf', val('razao') || d.nome); }
      else { preencher(w, 'v-cnpj', d.cnpj); preencher(w, 'v-razao', val('razao')); preencher(w, 'v-fantasia', d.nome); }
      ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade'].forEach(function (c) { preencher(w, 'v-' + c, val(c)); });
      preencher(w, 'v-estado', val('uf').toUpperCase());
      preencher(w, 'v-resp', val('resp')); preencher(w, 'v-cargo', val('cargo')); preencher(w, 'v-tel', val('tel')); preencher(w, 'v-email', d.email);
      preencher(w, 'v-serie', val('serie')); preencher(w, 'v-qtd-box', val('qtd'));
      w.document.getElementById('v-negociado').value = String(d.valor).replace('.', ',');
      preencher(w, 'v-inicio', d.inicio);
      var pg = w.document.getElementById('v-pgto'); Array.prototype.forEach.call(pg.options, function (o, i) { if (o.text === val('pgto')) pg.selectedIndex = i; });
      w.vGerar();
      html = documentoDoFrame(w, 'v-contract-out');
      if (!html) throw new Error('o contrato não foi gerado');
      marcar(1, 'ok', 'Contrato Vaapty gerado e unidade <b>' + esc(d.nome) + '</b> criada com ' + brl(d.valor) + '/mês por 12 meses.');
    } catch (e) {
      marcar(1, 'erro', 'Não consegui gerar o contrato: ' + esc(e.message) + '.');
      btn.disabled = false; btn.textContent = 'Tentar de novo';
      return;
    }
    try {   // guarda e-mail, razão, patrimônio e lead no cadastro (o gerador antigo não guarda)
      clientesInfo.vaapty = clientesInfo.vaapty || {};                                     // eslint-disable-line no-undef
      var info = clientesInfo.vaapty[d.nome] = clientesInfo.vaapty[d.nome] || {};        // eslint-disable-line no-undef
      info.email = d.email; info.razao = val('razao'); info.cnpj = info.cnpj || d.cnpj;
      info.responsavel = info.responsavel || val('resp'); info.tel = info.tel || val('tel'); info.cargo = info.cargo || val('cargo');
      if (leadAtual) info.leadId = leadAtual.id;
      var pat = val('serie').toUpperCase();
      if (pat) {
        var et = etiquetasBox().filter(function (e) { return String(e.patCode).toUpperCase() === pat; })[0];
        info.patrimonio = pat; info.player = et ? et.player || '' : ''; info.etiquetaId = et ? et.id : null;
      }
      registrarJornada('vaapty', d.nome, 'Unidade criada no Novo cliente · ' + brl(d.valor) + '/mês desde ' + d.inicio.split('-').reverse().join('/') + (pat ? ' · patrimônio ' + pat : ''));
      var envio = numero(val('envio'));
      if (envio > 0) {                                                                       // custo de envio vira despesa à vista da unidade
        db.vaapty = db.vaapty || {}; db.vaapty[d.nome] = db.vaapty[d.nome] || [];          // eslint-disable-line no-undef
        var linha = { t: 'À vista', tipo: 'Envio', d: 'Envio do box' + (pat ? ' ' + pat : ''), f: 'Frete', q: 1, u: Math.round(envio * 100) / 100, cc: d.nome,
          venc: new Date().toISOString().slice(0, 7), pago: false, dataPago: '', cat: 'envio', origem: 'novo', criadoEm: new Date().toISOString() };
        db.vaapty[d.nome].push(linha);                                                      // eslint-disable-line no-undef
        try { applyToFin(linha, +1); } catch (e) {}                                          // eslint-disable-line no-undef
        registrarJornada('vaapty', d.nome, 'Custo de envio do box lançado: R$ ' + envio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
    } catch (e) { console.warn('cadastro vaapty', e); }
    if (leadAtual) { leadAtual.itemCriado = d.nome; marcar(3, 'ok', 'Cliente <b>' + esc(leadAtual.nome) + '</b> marcado como cadastrado no CRM.'); }
    try { scheduleSave(); } catch (e) {}                         // eslint-disable-line no-undef
    try { global.buildSidebar(); } catch (e) {}
    try { global.buildHome(); } catch (e) {}

    enviarComStatus('vaapty', d.nome, 'Contrato Vaapty - ' + d.nome, html, val('resp') || d.nome, d.email,
      'Segue o contrato de comodato e prestação de serviços TV Vaapty para assinatura eletrônica.', 2).finally(function () {
      var txt = 'Nova unidade Vaapty: ' + d.nome + (val('cidade') ? ' (' + val('cidade') + ')' : '') + ' · ' + (val('qtd') || '1') + ' box. Início ' + d.inicio.split('-').reverse().join('/') +
        '. Contrato enviado para assinatura: preparar a instalação assim que for assinado.';
      marcar(4, 'ok', 'Aviso pronto: <a href="https://wa.me/?text=' + encodeURIComponent(txt) + '" target="_blank" rel="noopener">enviar ao Cleiton no WhatsApp</a>.');
      concluir(btn, 'Unidade criada');
    });
  }

  // ── Comissão Tarobá (lançamento do mês, sem contrato) ─────────────────
  function formTaroba() {
    injetarEstilos();
    leadAtual = null;
    var veic = itensModulo('taroba');
    var hoje = new Date();
    var mesAtual = hoje.toISOString().slice(0, 7);
    var el = moldura('Comissão Tarobá',
      '<div class="duas"><main>' +
      '<p class="sub">A comissão da Tarobá é lançada mês a mês, pelo valor do extrato. Não tem contrato nem cadastro de cliente.</p>' +
      '<section class="card"><div class="sec">Lançamento</div><div class="campos">' +
      campoSel('veic', 'Veículo', veic, veic[0]) + campoNv('mes', 'Mês', mesAtual, 'month') +
      campoNv('valor', 'Valor da comissão (R$) *', '', 'text', ' inputmode="decimal" placeholder="0,00"') +
      '</div><p class="sub" id="nv-atual"></p></section></main>' +
      '<aside><section class="card"><div class="sec">Ao lançar, o hub faz</div>' +
      '<div class="passo" id="nv-p1"><i>1</i><span>Grava a receita do mês no módulo Tarobá, no veículo escolhido.</span></div>' +
      '<div class="erros" id="nv-erros" role="alert"></div>' +
      '<button type="button" class="b p" id="nv-criar">Lançar comissão</button></section></aside></div>', true);
    function atual() {
      var m = val('mes').split('-').map(Number);
      var v = 0; try { v = global.recTarobaGetMes(val('veic'), m[0], m[1] - 1); } catch (e) {}
      el.querySelector('#nv-atual').textContent = v ? 'Já lançado neste mês: ' + brl(v) + '. Lançar de novo substitui o valor.' : 'Nada lançado ainda neste mês.';
    }
    el.querySelector('.box').addEventListener('change', atual); atual();
    el.querySelector('#nv-criar').addEventListener('click', function () {
      var v = numero(val('valor')), m = val('mes').split('-').map(Number);
      var errosEl = doc.getElementById('nv-erros');
      if (!(v > 0) || !m[0]) { errosEl.textContent = 'Informe o mês e o valor.'; return; }
      errosEl.textContent = '';
      try {
        global.recTarobaSetMes(val('veic'), m[0], m[1] - 1, v);
        try { scheduleSave(); } catch (e) {}                     // eslint-disable-line no-undef
        try { global.buildAll(); } catch (e) {}
        try { global.buildHome(); } catch (e) {}
        marcar(1, 'ok', 'Comissão de <b>' + brl(v) + '</b> lançada em ' + esc(val('veic')) + ', ' + val('mes').split('-').reverse().join('/') + '.');
        atual();
      } catch (e) { marcar(1, 'erro', 'Não consegui lançar: ' + esc(e.message) + '.'); }
    });
  }

  var LOGO = '';
  var LOGOS = { roxo: '', branco: '' };
  function carregarLogo() {
    if (typeof fetch !== 'function' || typeof FileReader === 'undefined') return;
    ['roxo', 'branco'].forEach(function (cor) {
      if (LOGOS[cor]) return;
      fetch('marca/mgb-logo-' + cor + '.png').then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
        if (!b) return;
        var fr = new FileReader();
        fr.onload = function () { LOGOS[cor] = String(fr.result || ''); if (cor === 'roxo') LOGO = LOGOS.roxo; };
        fr.readAsDataURL(b);
      }).catch(function () {});
    });
  }

  global.MGBNovo = Object.assign(api, { abrir: abrir, escolher: escolherLead, logosEmbutidas: logosEmbutidas });
  function iniciar() { injetarEstilos(); inserirBotaoHome(); carregarLogo(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
