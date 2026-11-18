# Hub MGB — como o sistema funciona

Documento de referência para quem for manter o hub. Atualizado em 18/11/2026. Para o passo a passo da troca de segurança, ver [`seguranca-fase0.md`](seguranca-fase0.md).

## Visão geral

```
 Navegador (Eder, Karen)                Vercel (pasta bot/)                    Supabase "MGB Hub" (São Paulo)
 ─────────────────────────              ───────────────────────                ─────────────────────────────
 index.html (GitHub Pages)   ──token──▶  /api/estado ──secret key──▶  hub_estado (+ histórico)
   api-token.js  (login, token)          /api/asaas  ───────────────▶ Asaas (nota fiscal + boleto)
   acesso.js     (perfis, telas)         /api/faturamento ─segredo─▶  Apps Script do Faturamento ─▶ planilha
   vendor/supabase-js (Auth)  ──login──▶  /api/assinafy  ─segredo─▶  Apps Script do Assinafy ─▶ Assinafy
                                         /api/plano-caixa ─token──▶  Apps Script do Plano de Caixa
                                         /api/banco ────────────────▶ Pluggy (Open Finance)
                                         /api/email ────────────────▶ Resend
                                         /api/rede (pública) ───────▶ lista de condomínios da Tela Vertical
                                         /api/asaas-webhook ◀──────── Asaas (pagamentos)
 estudio.html (Cleiton) ─▶ modo Estúdio do mesmo index.html
                                                                      fat_* (espelho do Faturamento)
                                                                      Edge Function espelho-faturamento (de hora em hora)
```

O navegador nunca fala com o banco, com os Apps Scripts nem com o Asaas: só com a API do Vercel, sempre com o token do login. A API confere o token no Supabase Auth, decide o que o papel pode ver e gravar e só então chama o serviço de trás com as chaves que ficam no servidor.

## Quem acessa e o que vê

| Papel | Pessoa | Entra no hub | Recebe do estado | Grava |
|---|---|---|---|---|
| `admin` | Eder | sim | tudo | tudo |
| `financeiro` | Karen | sim | tudo, menos o Pessoal do Eder; do funil, só os leads **fechados** | tudo, menos o Pessoal; num lead fechado, só a marca de cadastrado (`itemCriado`) |
| `programacao` | Cleiton | não: modo Estúdio (Spots, Blocos de rádio, Etiquetas) | só `migracoes` e `etiquetas` | só `etiquetas` |
| `bureau` | Guina | não (usa o painel do Rádio Ops, link próprio) | — | — |

- As regras ficam em `bot/lib/visibilidade.js`, e as telas de cada perfil em `acesso.js` (`PERFIS`).
- O menu só organiza a tela: **a proteção de verdade é o servidor**, que entrega e aceita apenas o que o papel permite.
- Na gravação, o servidor parte do que está no banco e troca só o que o papel pode gravar. Uma seção que o navegador não mandou continua como está.

## Login

- **Supabase Auth com e-mail e senha.**
  - O papel, o nome e o login curto ficam em `app_metadata` do usuário, e só o servidor consegue alterar esses campos.
  - Configuração do projeto: cadastro público fechado, sessão de 12 h, senha com no mínimo 10 caracteres, e-mails de convite e de troca de senha em português.
- **Criar ou tirar alguém:** Supabase → Authentication → Users.
  - Ao convidar, preencher o `app_metadata` com `{"papel":"financeiro","nome":"Karen","login":"karen"}`.
  - Apagar ou bloquear o usuário corta o acesso em até 1 minuto, porque o servidor guarda a resposta do Supabase por 60 s.
- **Login antigo** (`HUB_USERS` no Vercel): continua aceito até `LOGIN_ANTIGO=desligado`.

## Onde estão os dados

| Dado | Onde | Observação |
|---|---|---|
| Estado do hub (clientes, despesas, receitas, CRM, Tela Vertical…) | `public.hub_estado`, uma linha com um JSON | `salvar_estado()` aplica a trava de versão e recusa estado vazio ou encolhido para menos de 30% |
| Versões anteriores do estado | `public.hub_estado_historico` | tudo dos últimos 30 dias; antes disso, 1 versão por dia |
| Cadastro do Faturamento | planilha "MGB Faturamento - Clientes" (Google) | **fonte oficial** até a etapa 3 do Faturamento |
| Espelho do Faturamento | `fat_clientes`, `fat_emissoes`, `fat_auditoria` e a visão `fat_conferencia` | só leitura nesta etapa |
| Notas e boletos | Asaas | |
| Contratos assinados | Assinafy + Google Drive ("MGB contratos") | |
| Blocos de rádio | servidor `agenciamgb.com.br/contratos/api_blocos.php` | fora deste projeto |
| Rádio Ops | Apps Script próprio, com chave | fora deste projeto |

Tabelas e funções do banco estão versionadas em [`supabase/migrations/`](../supabase/migrations/).

## Faturamento do dia 5

Fica no hub em **Contabilidade → 🧾 Faturamento**.

1. **Carregar:** escolher a competência (mês). O hub junta as linhas ativas da planilha com os contratos lançados no hub ("Novo cliente").
2. **Escolher o modo de cada linha:**
   - **ambos:** nota fiscal + boleto;
   - **boleto:** sem nota;
   - **nota:** sem boleto, para cliente que paga por fora.
   - Ajustar o valor, se precisar.
3. **Emitir:** para cada linha, `/api/asaas?action=emitir` cria o cliente no Asaas, o boleto e a nota.
   - A referência é `id-do-cliente + competência`. Por isso, recarregar a página nunca gera duas cobranças.
4. **Aguardar a nota:** a nota fiscal fica "aguardando-nota" até a prefeitura autorizar. Com o número da nota, a planilha é marcada (`marcar-emitido`).
5. **Pagamento:** o Asaas avisa o `/api/asaas-webhook`, que atualiza a planilha (pago ou vencido).
   - Boleto sem nota, e as lojas do Mercadão, recebem recibo por e-mail sozinhos.
   - Pagou em dinheiro: usar a baixa manual 💵 na lista.
6. **Registro:** tudo o que foi emitido fica em `fatEmissoes` (no estado) e, desde 18/11/2026, também em `fat_emissoes`.

### Conferência hub × planilha

Rodar no SQL Editor do Supabase:

```sql
select gravidade, tipo, cliente, competencia, detalhe
from public.fat_conferencia
order by case gravidade when 'erro' then 1 when 'atencao' then 2 else 3 end, competencia desc;
```

| Gravidade | Significado |
|---|---|
| `erro` | número de nota ou boleto diferente entre o hub e a planilha: um dos dois está errado |
| `atencao` | falta registro de um lado. O caso mais comum é boleto emitido com a nota ainda sem número: conferir no Asaas se a nota foi autorizada |
| `info` | esperado. Ex.: lojas cadastradas só no hub não estão na planilha |

### Próximas etapas do Faturamento

2. Conferência diária com aviso por e-mail quando aparecer `erro`.
3. O hub passa a ler e gravar o Faturamento nas tabelas `fat_*`, e a planilha vira só cópia.
4. Desligar a planilha e o Apps Script do Faturamento.

## Operação

### Publicar
- **API:** merge na `main` publica sozinho no Vercel, no projeto `mgb-financeiro`, com a pasta raiz `bot/`.
  - Cada push em outra branch gera uma versão de teste (preview), protegida pelo login do Vercel.
  - O plano Hobby aceita **no máximo 12 funções**; hoje são 11. As pontes para os Apps Scripts dividem uma só função (`api/ponte.js`), com `rewrites` no `vercel.json`.
- **Hub:** merge na `main` publica no GitHub Pages em 1 a 3 minutos.
- **Banco:** migrações novas vão em `supabase/migrations/` e são aplicadas no projeto MGB Hub.

### Testes

```bash
cd bot && npm test
```

São 101 testes: login e papéis, visibilidade por papel, trava de versão, funil, aviso de fechamento, pontes e regras das telas.

### Variáveis do Vercel (só os nomes)

| Grupo | Variáveis |
|---|---|
| Login | `HUB_AUTH_SECRET`, `HUB_USERS` (login antigo), `LOGIN_ANTIGO`, `HUB_ORIGINS` (opcional) |
| Banco | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APPS_SCRIPT_URL` (só para a importação única, já feita) |
| Faturamento | `FATURAMENTO_API_URL`, `FATURAMENTO_SECRET`, `ASAAS_API_KEY`, `ASAAS_API_KEY_SANDBOX`, `ASAAS_WEBHOOK_TOKEN` |
| Contratos | `ASSINAFY_GS_URL`, `ASSINAFY_GS_SECRET` |
| Plano de Caixa | `PLANO_CAIXA_URL`, `PLANO_CAIXA_TOKEN`, `PLANO_CAIXA_TOKEN_NOVO` (durante a troca) |
| E-mail | `RESEND_API_KEY`, `RESEND_FROM`, `AVISO_FECHAMENTO_PARA` |
| Outros | `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `FOURYOUSEE_TOKEN` |

Segredos da Edge Function `espelho-faturamento`: `FATURAMENTO_API_URL` e `FATURAMENTO_SECRET`. O segredo do agendamento fica no Vault do banco e nunca sai dele.

### Backup e restauração
- **Supabase (plano Pro):** backup diário completo do banco, guardado por 7 dias.
- **Voltar o estado do hub a uma versão anterior:** ver "Voltar uma versão do estado" em [`seguranca-fase0.md`](seguranca-fase0.md).

## Pendências conhecidas
- Apps Scripts ainda chamados direto do navegador: exportação de leads, Google Agenda do CRM e o `SHEETS_URL` dos contratos Mercadão e Elevador. É preciso o código `.gs` de cada um.
- A chave do portal do Rádio Moinho está escrita no `index.html`: trocar e tirar do HTML.
- O webhook do WhatsApp não valida a assinatura da Meta. O bot não está ativo (faltam `WHATSAPP_*` e `WHITELIST`).
- O repositório ainda é público.
