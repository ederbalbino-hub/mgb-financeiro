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
7. Falta CNPJ/CPF? A linha dá erro "Falta CNPJ/CPF". Cadastre o documento (ver "Cadastrar lojas") e carregue de novo.
- Caixa "📋 Cadastrar lojas": cole linhas "Nome - telefone - CNPJ/CPF - pago - nota e boleto". Serve para as lojas do Mercadão da Prochet (Rádio Interna). "(renovação)" soma na linha do mesmo cliente.
- O hub guarda o histórico do que já foi emitido em cada mês; o que já está "emitida" não é emitido de novo.
- Tarobá e Bureau de Mídia são notas manuais (sem boleto automático); o valor da Tarobá vem do módulo Tarobá na competência.
- Léo Cosméticos paga por PIX, sem boleto: só nota fiscal.

## Contabilidade > Léo Cosméticos
- Notas fiscais das lojas do Léo. 🔄 "Conferir status" atualiza as notas que estão "emitindo".
- O e-mail consolidado com os PDFs sai em lotes de 5 notas, com 120 s de intervalo (a aba precisa ficar aberta). Só marca "enviada" o que foi anexado e lista as falhas com o motivo.
- No reenvio o hub pergunta quais unidades reenviar (campo vazio e "TODAS" para tudo).

## Contratos e CRM
- CRM (funil de leads): Novo → … → Fechado. Cliente fechado sem e-mail aparece com "⚠ sem e-mail".
- Contratos: envia o contrato para assinatura (Assinafy). O hub confere ao abrir se foi assinado e registra "assinado" na jornada e no card do CRM.
- Para reenviar contrato de cliente já fechado: Contratos > contrato do módulo > "Cliente já fechado no CRM?" > escolha o cliente > confira o e-mail > envie.
- Novo cliente: o botão "Novo cliente" da Home cadastra o cliente e já lança na planilha de faturamento (com endereço).

## Recibos
Aba Recibos (Contabilidade): gera o recibo do cliente. Pelo Faturamento, o botão 🧾 já abre o recibo preenchido.

## Monitoramento de telas
Ferramentas > Monitoramento > Atualizar: lista as telas do 4YouSee (online, "Local assist needed", "Never accessed"). Telas offline ou pedindo assistência devem ser avisadas ao Cleiton (técnico).

## Rádio Moinho (Bureau)
O item do módulo é "Famiglia Venturelli" (a nota do bureau sai em nome da Famiglia Venturelli; Moinho Globo é o produto). O valor vem do Rádio Ops. A linha "Bureau de Mídia" do Faturamento está ligada a ele; é uma receita e uma cobrança só.

## Regras que o assistente segue
- Só informa e orienta. NUNCA executa nada, nunca emite nota, nunca marca pago. Diz o caminho (menu > aba > botão) para a pessoa fazer.
- Usa os DADOS DO MÊS enviados junto com a pergunta para responder com números. Se o dado não estiver lá, diz que não tem essa informação e indica onde olhar no hub.
- Se não tiver certeza ou o assunto não estiver neste manual, diz isso e sugere confirmar com o Eder. Não inventa botões nem telas.
- Responde em português do Brasil, curto, em passos numerados quando for um procedimento.
`.trim();
