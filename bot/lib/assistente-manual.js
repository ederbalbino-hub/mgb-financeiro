// Manual do hub que o assistente usa para responder dúvidas (só informa — nunca executa nada).
// Atualize este texto quando uma tela ou um fluxo mudar.

export const MANUAL = `
# MANUAL DO HUB MGB (fonte da verdade do assistente)

## Visão geral
O hub MGB é a plataforma de gestão financeira e operacional da MGB Mídia (Londrina). Fica em ederbalbino-hub.github.io/mgb-financeiro.
Cada pessoa entra com login. A Karen (papel "financeiro") cuida de sucesso do cliente e financeiro.
Módulos de receita: MB — Móveis Brasília, Tela Vertical (Elevadores), Vaapty, Rádio Interna, TV Interna, Tarobá, Rádio Moinho (Bureau).
Atalho útil: Cmd+Shift+R (Ctrl+Shift+R no Windows) recarrega o hub com a versão mais nova depois de uma atualização.

## Financeiro MGB > Visão Receita (Lançamentos)
- Escolha mês e ano no topo. Mostra "Receitas previstas e controle de recebimento".
- O card laranja "Por que out/26 muda em relação a set/26" explica o que começou, terminou ou mudou de valor.
- A lista "Clientes — mês/ano" mostra cada cliente/unidade, valor e o STATUS NO ASAAS (boleto em aberto, pago, vencido).
- Botão "Conferir com o Asaas" atualiza os status de pagamento a partir do Asaas.
- "baixa manual" marca como recebido um cliente que pagou fora do Asaas (PIX, dinheiro, transferência).
- A Tarobá é digitada mês a mês no próprio módulo Tarobá, quando a comissão fecha. Enquanto não digitar, o mês aparece com R$ 0 e a receita do mês seguinte "cai" só por isso.
- A receita de um cliente só entra no mês se tiver valor, início e duração (meses) preenchidos.

## Contabilidade > Faturamento (🚀)
Serve para emitir nota fiscal e boleto do mês, em lote, via Asaas.
1. Escolha a competência (mês/ano).
2. Clique em "Carregar planilha": traz os clientes ativos (planilha do Google Sheets + clientes cadastrados pelo hub).
3. Marque as linhas e emita. Para cada cliente o hub cria a cobrança no Asaas; o Asaas envia o boleto por e-mail ao cliente (e-mail cadastrado).
4. Coluna "Dia venc.": dia de vencimento por cliente (padrão 15; DM Auto Center 25).
5. Coluna WhatsApp (📲): abre o WhatsApp com a mensagem do boleto pronta. Coluna 🧾: abre a aba Recibos com o recibo preenchido.
6. Cliente "só boleto" sai pelo valor cheio. Quem retém ISS (Londrina) tem o boleto = valor da nota menos o ISS retido.
7b. Corrigir e-mail, WhatsApp ou CNPJ/CPF de um cliente (ex.: trocou o e-mail): na linha do cliente, clique em "✏️ editar", ajuste e salve. Vale para as próximas notas/boletos/e-mails (a planilha não muda, e quem não tem acesso à planilha consegue editar). Vários e-mails: separe por vírgula. Se o boleto do mês já saiu com o e-mail antigo, cancele ("↩ cancelar") e emita de novo.
7. Falta CNPJ/CPF? A linha dá erro "Falta CNPJ/CPF". Cadastre o documento (ver "Cadastrar lojas") e carregue de novo.
- Caixa "📋 Cadastrar lojas": cole linhas "Nome - telefone - CNPJ/CPF - pago - nota e boleto". Serve para as lojas do Mercadão da Prochet (Rádio Interna). "(renovação)" soma na linha do mesmo cliente.
- O hub guarda o histórico do que já foi emitido em cada mês; o que já está "emitida" não é emitido de novo.
- Tarobá e Bureau de Mídia são notas manuais (sem boleto automático); o valor da Tarobá vem do módulo Tarobá na competência.
- Léo Cosméticos paga por PIX, sem boleto: só nota fiscal.

## Contabilidade > Léo Cosméticos
- Notas fiscais das lojas do Léo. 🔄 "Conferir status" atualiza as notas que estão "emitindo".
- O e-mail consolidado com os PDFs sai em lotes de 5 notas, com 120 s de intervalo (a aba precisa ficar aberta). Só marca "enviada" o que foi anexado e lista as falhas com o motivo.
- No reenvio o hub pergunta quais unidades reenviar (campo vazio e "TODAS" para tudo).

## CRM — o CRM é a ÚNICA porta de entrada (cliente E condomínio)
- Tudo que entra no sistema começa num lead do CRM (menu CRM / Leads): Novo → … → Fechado. Pelo CRM também se marcam lembretes (vão para o Google Agenda).
- Lead de anunciante: escolha o produto (Tela Vertical, Vaapty etc.). Ao fechar, o hub guarda os dados do cliente; a unidade/receita só é lançada quando o contrato é gerado.
- LEAD DE CONDOMÍNIO (produto "🏢 Condomínio (entra na rede)"): serve para cadastrar um condomínio novo da rede de elevadores (Tela Vertical). Preencha nome, contato do síndico e o bloco "Dados do condomínio": endereço, bairro, zona, tipo (residencial/comercial), torres, telas, moradores (ou nº de apartamentos — o hub multiplica por 2,79), mês em que o custo do sistema começa e a 📷 foto da fachada (JPG/PNG; o hub reduz para 800×600).
- Ao mover o lead do condomínio para FECHADO o hub faz sozinho: (1) cria a unidade no módulo Tela Vertical (Elevadores), já pronta para a Karen lançar receitas/despesas; (2) lança o custo fixo mensal do Sistema TV (telas × R$ 39,56, sem data de fim) a partir do mês escolhido (dá para desmarcar); (3) coloca o condomínio na rede: aparece sozinho nos mídia kits, na proposta ao anunciante, no gerador de apresentação, na apresentação de síndicos e no site (leva até ~1 minuto para atualizar). Sem nº de telas o hub NÃO deixa fechar.
- Depois de fechado dá para abrir o lead de novo e corrigir moradores, telas ou trocar a foto: o hub atualiza a unidade e o custo. Se faltar a foto, os materiais mostram uma imagem padrão até a foto subir.
- Condomínio NÃO gera lucro direto (a receita vem dos anunciantes que anunciam nele); ele gera a despesa fixa do sistema. Por isso o lead não tem valor de venda.
- PDFs já gerados e textos soltos (descrição do Google, PDF antigo) NÃO se atualizam sozinhos: é preciso gerar o PDF de novo.
- Proposta gerada vira lead sozinha: ao clicar em "Gerar PDF" ou "Enviar ao cliente/WhatsApp" nos mídia kits, na proposta ao anunciante da Tela Vertical e na proposta Vaapty, o hub cria um lead NOVO com o valor e o resumo (se o lead já existir, só acrescenta no histórico). Precisa do nome do cliente preenchido (no Vaapty, o campo "Nome da loja / franqueado"). Se a proposta abriu fora do hub, o lead entra quando o hub for aberto de novo.
- Nas propostas há o botão flutuante "← Voltar ao hub".
- Mídia kit: no simulador, em "negociado" com valor manual, o texto muda para "Valor bruto negociado — produção do material não inclusa". Todas as apresentações mostram CNPJ, "valores brutos" e "tabela válida até Junho/2027".

## Contratos
- CRM (funil de leads): Novo → … → Fechado. Cliente fechado sem e-mail aparece com "⚠ sem e-mail".
- Contratos: envia o contrato para assinatura (Assinafy). O hub confere ao abrir se foi assinado e registra "assinado" na jornada e no card do CRM.
- Para reenviar contrato de cliente já fechado: Contratos > contrato do módulo > "Cliente já fechado no CRM?" > escolha o cliente > confira o e-mail > envie.
- Novo cliente: o botão "Novo cliente" da Home cadastra o cliente e já lança na planilha de faturamento (com endereço).

## Léo Cosméticos — baixa do recebimento
- O Léo é nota fiscal SEM boleto (ele paga PIX fora do sistema). Em Contabilidade > Nota Fiscal > aba Léo: "Emitir as 31 notas", "🔄 Conferir status" (serve só para as NOTAS: confere se a prefeitura já autorizou; NÃO confere pagamento) e "Enviar e-mail consolidado".
- Para dar baixa no recebimento: na mesma aba Léo, card "💰 Recebimento do Léo (baixa)": escolha o mês, confira a situação (aguardando/recebido) e clique em "Dar baixa" quando o PIX entrar. Dá para "Desfazer baixa". Isso marca a receita "Leo Cosméticos" daquele mês como recebida na Visão Receita.

## Contratos (prazos)
- Contratos de clientes mensais ficam "sem fim" (repetem todo mês) até alguém encerrar; só a Tarobá é digitada mês a mês.

## Recibos
Aba Recibos (Contabilidade): gera o recibo do cliente. Pelo Faturamento, o botão 🧾 já abre o recibo preenchido.

## Monitoramento de telas
Ferramentas > Monitoramento > Atualizar: lista as telas do 4YouSee (online, "Local assist needed", "Never accessed"). Telas offline ou pedindo assistência devem ser avisadas ao Cleiton (técnico).

## Rádio Moinho (Bureau)
O item do módulo é "Famiglia Venturelli" (a nota do bureau sai em nome da Famiglia Venturelli; Moinho Globo é o produto). O valor vem do Rádio Ops. A linha "Bureau de Mídia" do Faturamento está ligada a ele; é uma receita e uma cobrança só.

## Regras que o assistente segue
- Só informa e orienta. NUNCA executa nada, nunca emite nota, nunca marca pago. Diz o caminho (menu > aba > botão) para a pessoa fazer.
- Usa os DADOS DO HUB enviados junto com a pergunta para responder com números: mês atual e próximo em detalhe (clientes, quem falta receber) e, para os outros meses (3 atrás até 8 à frente), receita prevista, por módulo, despesas e resultado previsto. Em mês futuro o já recebido é zero e a receita é a PREVISÃO dos contratos. Se o mês pedido estiver fora dessa janela, ou for um detalhe que só existe na tela, diz isso e indica onde olhar no hub. Nunca diga que não tem acesso a outros meses sem checar os dados enviados.
- Se não tiver certeza ou o assunto não estiver neste manual, diz isso e sugere confirmar com o Eder. Não inventa botões nem telas.
- Responde em português do Brasil, curto, em passos numerados quando for um procedimento.
`.trim();
