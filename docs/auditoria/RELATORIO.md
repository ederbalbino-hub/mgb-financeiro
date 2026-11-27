# Auditoria do Hub MGB — 24/11/2026

Feita só com o código (branch `claude/auditoria-hub`). **Não li o banco real** e não mexi em nada publicado.
Os números dos exemplos são casos de teste, não dados de clientes. Os scripts que reproduzem cada caso estão em
[`ferramentas/`](ferramentas/) (`TZ=America/Sao_Paulo node docs/auditoria/ferramentas/casos.cjs`).

## Resumo em 5 linhas

1. **As contas principais estão certas**: Simples 7,40% (sem somar ISS de novo), ISS retido no boleto, virada de ano, ajustes de mês, CC dos sócios.
2. **Mas telas diferentes mostram números diferentes para o mesmo mês** (relatório anual, tabela "Por módulo", coluna "Investido").
3. **Edição simultânea pode apagar trabalho**: se Karen e Eder mexem na mesma seção (ex.: pagamentos) ao mesmo tempo, vale a última aba e a outra mudança some (só aparece um aviso).
4. **O histórico existe, mas não é legível** — deixei pronto um protótipo de trilha ("Karen marcou Listen como paga em Nov/2026").
5. **O index.html dá para quebrar com segurança**, começando por ~80 KB de código morto/duplicado que pode sair já.

---

## 1. Corrigir já (erros de número ou risco de perda)

| # | O que | Exemplo | Onde |
|---|---|---|---|
| 1 | **Relatório anual não conta receitas avulsas nem o mês fechado pelas notas** — o imposto delas entra, a receita não | Nov: 10.000 de contrato + 2.000 avulsa → Visão Geral 12.000, relatório 10.000 (lucro 2.000 menor) | `index.html:11563` `relAnualDados` |
| 2 | **Tabela "Por módulo" do Financeiro não fecha com o total do topo** | mesmo caso: linhas somam 10.000, topo 12.000 | `financeiro.js:198-205` |
| 3 | **Coluna "Investido" por condomínio soma também as despesas** (gasolina etc.), que já aparecem em "Despesas do mês" | Uptown 800 investido + 120,50 gasolina → mostra 920,50 | `index.html:12117` |
| 4 | **Edição simultânea: a última aba vence a seção inteira** | Karen marca Listen paga; Eder, em outra aba aberta antes, marca outro cliente → a marcação da Karen some | `index.html:14190` ("minha versão vence") |
| 5 | **Mês calculado em UTC** (24 lugares): depois das 21h do último dia do mês o hub "acha" que já é o mês seguinte | 30/11 às 21h30 → competência padrão `2026-12` (baixa do Léo, receita avulsa, início de cliente/despesa, relatórios) | `toISOString().slice(0,7)` em `index.html` e `faturamento.js:440` |
| 6 | **Despesa à vista sem data e não paga "anda" de mês** — o resultado de um mês passado muda sozinho | 400 aparecem em nov vistos em 23/11 e somem de nov vistos em 05/12 | `index.html:~10539` |
| 7 | **O hub chama o servidor antes do login** (estado 3×, plano de caixa, blocos de rádio 2×) | erros 401 e espera a cada abertura | `index.html:4638, 4905, 16353` |

Sugestão para o nº 4: em vez de "seção inteira", mesclar **por item** nas seções de pagamento (`pagamentos`, `recPagamentos`, `despPagamentos`) — elas são mapas cliente → mês, então dá para juntar as duas mudanças sem conflito.

## 2. Corrigir logo (casos de borda plausíveis)

- **Renomear/excluir condomínio** não atualiza a lista de telas do anunciante: a receita do módulo cai (600 → 300) e a tela de Cobrança continua em 600. `index.html:13177/13184`.
- **Total investido** desconta despesa sem "pago por" que nunca foi somada (48.800 vira 48.700). `index.html:12281`.
- **Rateadas/mês** conta despesa compartilhada que só começa no futuro. `index.html:11968`.
- **Parcelado com nº de parcelas vazio** gera NaN e zera o total de despesas do mês em todas as telas (só dado antigo/importado; os formulários atuais exigem ≥2). `index.html:10521/10526`.
- **Ajuste pontual no Pessoal com valor base 0** é ignorado. `index.html:9504/9519`.
- **"Saldo" do bot do WhatsApp** usa outra conta (só despesas dos módulos): R$ 9.900 de lucro onde o hub dá 7.039. O bot não está ativo hoje; corrigir antes de ligar. `bot/lib/sheets.js:91`.
- 1 centavo de diferença no ISS em valores de meio-centavo (50,00 × 2,01%). `index.html:8067`.
- Rótulos dizem "ISS + Simples" (a conta está certa, o texto não). `index.html:10553, 10850`.

**Perguntas para o Eder** (são regra, não bug): despesa que o Jadson pagou do bolso, num mês em que a despesa passa da receita, entra hoje no "excedente do Eder" *e* na CC do Jadson — é isso mesmo? Contrato de 120+ meses aparece como "sem fim" mas a receita para no mês 121 — qual vale?

## 3. Histórico de alterações (quem mudou o quê)

**Hoje:** cada gravação guarda uma cópia inteira do estado (~125 KB) em `hub_estado_historico`, com quem salvou. Para saber o que mudou é preciso comparar duas cópias. Depois de 30 dias só fica **1 cópia por dia** — quem mudou o quê no meio do dia se perde. A exceção é o Faturamento no banco (`fat_auditoria`), que já registra antes/depois.

**Proposta (protótipo pronto, não ligado):**
- `bot/lib/trilha.js` compara o antes e o depois de cada gravação e gera frases: *"Karen marcou Listen (Rádio Interna) como paga em Nov/2026"*, *"moveu o lead Padaria de negociando para fechado"*, *"alterou em despesas avulsas: Gasolina: valor R$ 100,00 → R$ 120,00"*. 5 testes novos (133 no total, todos passando).
- Tabela `hub_alteracoes` (rascunho em [`trilha.sql`](trilha.sql)): uma linha por mudança, pequena e **sem poda**.
- Para ligar: 3 linhas em `bot/api/estado.js` depois de `gravarEstado()` + aplicar a tabela. Depois, uma tela "Histórico" no hub (ou ao lado de cada cliente).
- Com sua autorização, dá para **preencher o passado** rodando a mesma função sobre as cópias que já estão em `hub_estado_historico`.

Atenção de leitura: nos pagamentos a chave do mês começa em zero (`2026-10` = **novembro**), enquanto em outras partes `2026-11` = novembro. A trilha já traduz; no código é uma armadilha.

## 4. Código (index.html, 1,2 MB, 16.530 linhas)

**Mapa resumido:** CSS 88 KB · HTML 175 KB · três contratos embutidos como iframes (Mercadão, Elevador, Vaapty, 151 KB) · Ferramentas 182 KB · **núcleo de 465 KB** com 584 variáveis globais, do qual dependem todos os módulos novos (`lancar.js` usa 23 delas). Nenhum teste automático roda o index.html — os 133 testes cobrem só os arquivos .js separados.

**Pode sair já (≈80 KB, sem risco):**
- Bloco dos Blocos de rádio **copiado duas vezes**, idêntico (`index.html:4610-4826` e `4876-5093`) — hoje carrega e desenha tudo em dobro.
- `</body></html>` perdido no meio do arquivo (`index.html:4871`).
- LinkedIn: 10 funções + CSS (~12 KB, `index.html:5153-5333`, `809-844`).
- 29 funções que ninguém chama (~30 KB; lista em [`ferramentas/funcoes_mortas.tsv`](ferramentas/funcoes_mortas.tsv)).
- Tela Pessoal antiga (`#page-pessoal`, ~33 KB): o menu já leva ao Plano de Caixa. **Confirmar com o Eder** antes de apagar a importação de extrato.

**A limpar depois:**
- cerca de 22 correções antigas de dados rodam a cada abertura (`index.html:16353`). Marcar as já aplicadas e tirar.
- `brl` e `esc` repetidos em 7 arquivos; máscara de CNPJ em 6 lugares; 21 jeitos de montar "AAAA-MM".

**Segurança (sem copiar valores):** chave do portal do Rádio Moinho no HTML (`index.html:5993`, já listada no ARQUITETURA); chaves Groq/Rádio Ops/Plano guardadas no navegador e a do Rádio Ops na URL; 6 Apps Scripts chamados direto do navegador; CDNs sem verificação de integridade, `pluggy-connect/latest` sem versão fixa, e xlsx 0.18.5 e pdf.js 3.11 com falhas públicas conhecidas.

**Plano para quebrar sem parar o hub:**
1. *Rede de segurança primeiro:* transformar [`ferramentas/smoke.cjs`](ferramentas/smoke.cjs) em teste (abre o hub com dados de exemplo, passa por todas as telas e falha se aparecer erro) + transformar os casos de conta em testes.
2. Apagar o que está morto/duplicado (lista acima).
3. Mover blocos isolados para arquivos: Blocos de rádio, Rádio Moinho, Gerador de spots.
4. Os 3 contratos-iframe viram arquivos `.html` próprios.
5. CSS para `hub.css`.
6. Ferramentas (PDF, vídeo, depois o bloco grande).
7. Núcleo em 6 arquivos seguindo as seções que já existem (estado → páginas → CRM → gravação → migrações → Home/relatórios).
8. Por fim, um `util.js` único (moeda, mês, máscaras) com testes.

Regra de cada passo: mover o bloco **inteiro** para `arquivo.js` com `<script src>` **no mesmo lugar** (troca neutra), rodar teste de fumaça + `npm test`, conferir a tela à mão, um commit por bloco.

## 5. Qualidade

- **Peso:** ~1,1 MB comprimido na primeira visita (3,9 MB sem compressão). As bibliotecas de planilha, PDF, gráfico e QR (~2 MB) carregam **sempre**, mesmo no login. Carregar só ao usar economiza ~500 KB transferidos. Na tela de login, só 26% do JS e 14% do CSS são usados.
- **Celular:** login bom. Visão Geral e Plano de Caixa **rolam para o lado** no celular (barra de abas `index.html:1147`; botões `index.html:5946`). Botão do menu pequeno (32×30, o ideal é 44). Textos de 7,5–9 px na barra inferior e na Home.
- **Acessibilidade:** o menu lateral e as abas **não funcionam pelo teclado** (92 `div` clicáveis sem papel de botão); no login o Tab escapa para o app escondido atrás; 287 campos sem rótulo; borda dos campos e a cor `--hint` com pouco contraste.
- **Cache:** versões `?v=` desencontradas (algumas faltando, uma com data futura). Sugestão: gerar automático.

## Ordem sugerida de trabalho

1. **Esta semana (antes do faturamento de 05/12):** itens 1–3, 5 e 6 da seção 1 (números) + mesclar pagamentos por item (nº 4), cada um com teste.
2. **Em seguida:** ligar a trilha de alterações (precisa do seu OK para criar a tabela no banco); limpar os ~80 KB; não chamar o servidor antes do login; ajustes de celular.
3. **Planejar:** teste de fumaça → quebra do index.html em módulos → bibliotecas sob demanda → acessibilidade.

---

## Adendo 27/11 — divergências vistas pela conversa de Usabilidade (dados simulados)

A `main` mudou bastante depois desta auditoria (Tela Vertical 50/50, despesa do sócio como despesa + aporte, cobrança mensal em cartões). **Os achados da seção 1 sobre Tela Vertical precisam ser reconferidos na versão nova.**

| # | Divergência | Situação |
|---|---|---|
| A | Contratos R$ 27.150 / 17 × Clientes R$ 19.150 / 12 | **Confirmado no código:** `clientes.js:16` ignora "Outros", "Expansão", "Cliente Piloto" e "Franqueado Piloto"; a tela Contratos conta. Decidir uma regra só (sugestão: os dois ignoram, e mostrar "+ 5 itens de previsão" à parte) |
| B | Contas do mês "21 contas · R$ 29.520" × "Lançamento por lançamento · 62 despesas · R$ 31.493" | A aba "Lançamento por lançamento" mostra a **tabela antiga**, montada por outra função; as contas usam `agruparContas`. A investigar qual item (R$ 1.973) uma tem e a outra não |
| C | Tela Vertical: banner 15 condomínios/35 telas × licença 16/36; Pizzaria "no ar" e "encerrada"; resumo dos sócios muda após abrir o formulário | A investigar. O "muda ao abrir" indica que uma tela **altera os dados ao desenhar** — prioridade, porque pode ser gravado |
| D | Cobrança mensal: cartões mudam ao clicar (Tela Vertical 1,4 mil → 2,1 mil; 27.400 → 26.750) | A investigar. Mesmo sintoma do C |
| E | Baixa manual some do registro do Faturamento | **Confirmado no código:** `fFatGuardar` (`index.html:7857` na main) recria `fatEmissoes[chave]` sem `pgManual`. Ao **sincronizar com o Asaas** (linha 8009) depois de uma baixa em dinheiro, a cobrança volta a aparecer como pendente no aviso da Home. O pagamento no financeiro continua marcado (fica em `recPagamentos`); só o aviso erra. Correção: preservar `pgManual` (e `pg` quando for manual) ao regravar |

---

## Correções feitas em 27/11 (branch `claude/auditoria-hub`, não publicado)

| Achado | O que mudou | Prova |
|---|---|---|
| Relatório anual sem avulsas / mês fechado | Usa a mesma receita da Visão Geral; linha "Avulsas, manual e ajuste do fechamento pelas notas" | `bot/test/contas.test.js` |
| Tabela "Por módulo" ≠ topo | Linha "Avulsas e ajuste pelas notas" fecha com o total (`financeiro.js` `linhaOutrasReceitas`) | `contas.test.js` |
| "Investido" com gasolina / total da CC | Investido só com investimento (`elevInvestidoDoItem`); despesa sem "pago por" não é descontada | `contas.test.js` + tela conferida no navegador (Uptown 800, não 920,50) |
| Mês em UTC (39 lugares) | `mesLocal()`/`diaLocal()` no topo do index.html; módulos com a conta local | teste de 30/11 21h30 + teste-guarda contra o jeito antigo |
| Baixa manual sumindo (E) | `fFatGuardar` mantém `pgManual` | `contas.test.js` |
| Telas que mudam os dados só de abrir (C, D) | `syncAnuncReceita` não regrava mais `rec.elev`; `fluxos.js` não cria chaves vazias em `relAjustes`; Receitas do módulo Tela Vertical calcula pelo mês | `docs/auditoria/ferramentas/telas-sem-efeito.cjs`: na main acusa 2 telas, aqui 0 de 26 |
| Licença 16/36 × banner 15/35 (C) | Tabela da licença usa a linha mais recente, marca "ainda fora do ar" e diz no resumo quantos são | conferido no navegador |

**Ainda em aberto:**
- **A (Contratos × Clientes):** é decisão de regra — Diego/Eder escolhem se "Expansão", "Pilotos" e "Outros" contam ou não.
- **B, Pizzaria, cartões da Cobrança e resumo dos sócios:** reconferidos com os dados simulados da Usabilidade (mesmo conjunto que ela usou), na `main` atual e nesta branch: **não acontecem mais**. Contas: topo e "Lançamento por lançamento" batem (31 lançamentos, R$ 29.520,06); cartões iguais a cada clique; sócios iguais antes/depois do formulário; Pizzaria (mai–out/2026) fora dos ativos de novembro nas duas telas. Foram resolvidos pelas mudanças dos Fluxos de 27/11 já na `main`.
