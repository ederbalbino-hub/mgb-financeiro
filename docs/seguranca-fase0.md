# Segurança — Fase 0: passo a passo de implantação

Este guia leva o hub do modo **"qualquer pessoa com a URL lê e grava tudo"** para o modo **"só quem está logado, e só o que o papel permite"**. Cada passo funciona com o anterior já no ar, então o hub não para no meio da troca.

## O que muda

| Antes | Depois |
|---|---|
| O navegador falava direto com 4 Apps Scripts cujas URLs estavam no `index.html` público | O navegador fala só com a API do Vercel, que exige login |
| Qualquer pessoa lia o estado inteiro e gravava por cima | O Apps Script só responde com um segredo que fica no Vercel |
| O Faturamento listava CNPJ, e-mail e endereço de todos os clientes | O mesmo |
| Qualquer pessoa mandava documento para assinatura em nome da MGB | O mesmo |
| O token do Plano de Caixa estava escrito no `index.html` | O token fica só no Vercel e no Script Properties |
| Duas abas salvando juntas: a última apagava o trabalho da outra | Trava de versão: o segundo a salvar relê, mescla e salva de novo |
| Uma resposta de erro podia virar `{}` e ser gravada por cima de tudo | Estado vazio ou encolhido demais é recusado |
| Sem backup automático | Backup diário no Drive, com os 30 últimos |

## Antes de começar: backup manual

No Google Drive, baixe o arquivo **`mgb-dados.json`** (o estado inteiro do hub) e guarde fora do Drive.

## Passo 1 — Gerar os segredos

São quatro segredos, um por Apps Script. Gere cada um com:

```bash
openssl rand -base64 32 | tr -d '/+=' | cut -c1-40
```

Outra opção: no editor de qualquer Apps Script, rode `Logger.log(Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,''))`.

| Nome no Vercel | Onde o mesmo valor vai no Apps Script |
|---|---|
| `HUB_STATE_SECRET` | script principal do hub → Script Properties → `HUB_STATE_SECRET` |
| `FATURAMENTO_SECRET` | script do Faturamento → Script Properties → `FATURAMENTO_SECRET` |
| `ASSINAFY_GS_SECRET` | script do Assinafy → Script Properties → `GS_SECRET` |
| `PLANO_CAIXA_TOKEN` | Plano de Caixa → Script Properties → `TOKEN_SYNC_EMPRESA` (só no passo 4) |

Não mande os segredos por WhatsApp nem por e-mail. Cole direto no Vercel e no Apps Script.

## Passo 2 — Vercel: variáveis e deploy da API

Em **Vercel → projeto mgb-financeiro → Settings → Environment Variables (Production)**, adicione:

| Variável | Valor |
|---|---|
| `APPS_SCRIPT_URL` | URL `/exec` do script principal do hub (a que estava no `index.html`, começa com `AKfycbwD9L4g…`) |
| `HUB_STATE_SECRET` | segredo do passo 1 |
| `FATURAMENTO_API_URL` | URL `/exec` do Faturamento (`AKfycbwdlNqi…`) |
| `FATURAMENTO_SECRET` | segredo do passo 1 |
| `ASSINAFY_GS_URL` | URL `/exec` do Assinafy (`AKfycbwG-31A…`) |
| `ASSINAFY_GS_SECRET` | segredo do passo 1 |
| `PLANO_CAIXA_URL` | URL `/exec` da implantação "Qualquer pessoa" do Plano de Caixa (`AKfycbyRPxmB…`) |
| `PLANO_CAIXA_TOKEN` | **por enquanto, o token ANTIGO** (`1d97…`, o que já está no Code.gs). O token novo entra no passo 4. |

Confira também que estas variáveis já existem: `HUB_AUTH_SECRET`, `HUB_USERS`, `WHITELIST` e `ASAAS_WEBHOOK_TOKEN`. Sem `WHITELIST`, o bot do WhatsApp para de responder.

Depois faça o deploy da branch.

**Por que funciona:** os Apps Scripts antigos ignoram o parâmetro de segredo. A API nova já funciona com eles e o hub antigo continua funcionando.

**Teste:** abra `https://mgb-financeiro.vercel.app/api/estado` no navegador. Tem que aparecer `Sessão expirada`, porque você não mandou login.

## Passo 3 — Hub: publicar o `index.html` novo

Faça o merge na `main` (GitHub Pages). Depois, logado no hub:

1. Os dados carregam? Aparece "salvo" depois de editar algo?
2. Abra Contabilidade → 🧾 Faturamento. A lista de clientes aparece?
3. Abra um contrato com assinatura pendente. O status aparece?
4. Abra o Plano de Caixa → sincronizar. Aparece "✅ Confirmado"?

Se algo falhar, a mensagem de erro diz qual variável falta.

## Passo 4 — Trancar os Apps Scripts

Faça um por vez. Em cada um, depois de colar o código e configurar o Script Properties, vá em **Implantar → Gerenciar implantações → ✏️ editar a implantação atual → Versão: Nova versão → Implantar**.

> ⚠️ Use **editar a implantação existente**, NÃO "Nova implantação". Editar mantém a mesma URL, e as URLs antigas que estão no histórico do git passam a responder "forbidden".

### 4a. Script principal do hub

1. Substitua todo o `Código.gs` pelo conteúdo de [`apps-script-hub/Code.gs`](../apps-script-hub/Code.gs).
2. Em Configurações do projeto → Script Properties, adicione `HUB_STATE_SECRET` com o mesmo valor do Vercel. Não mexa no `DATA_FILE_ID`.
3. Implante a nova versão, como descrito acima.
4. Rode **`instalarBackupDiario`** uma vez no editor. Ele agenda o backup das 3h e já faz o primeiro na pasta "MGB Backups".
5. Teste: abra a URL `/exec` direto no navegador. Tem que aparecer só `forbidden`. O hub continua salvando normalmente.

### 4b. Faturamento

1. Substitua o código pelo de [`apps-script-faturamento/Code.gs`](../apps-script-faturamento/Code.gs).
2. Em Script Properties, adicione:
   - `FATURAMENTO_SECRET`, com o mesmo valor do Vercel;
   - `WEBHOOK_TOKEN`, com o token que já estava na constante `WEBHOOK_TOKEN` do script antigo (o mesmo valor de `ASAAS_WEBHOOK_TOKEN` no Vercel). O código novo lê esse valor daqui.
3. Implante a nova versão.
4. Teste: `…/exec?action=listar` direto no navegador → `{"ok":false,"erro":"forbidden"}`. O Faturamento no hub continua listando.

### 4c. Assinafy

1. Substitua o código pelo de [`apps-script-assinafy/Code.gs`](../apps-script-assinafy/Code.gs).
2. Em Script Properties, adicione `GS_SECRET` com o mesmo valor de `ASSINAFY_GS_SECRET` do Vercel.
3. Implante a nova versão.
4. Teste: `…/exec?action=status&docId=x` → `{"erro":"forbidden"}`.

### 4d. Plano de Caixa: trocar o token vazado

O token antigo (`1d97…`) está público e precisa morrer. No `Code.gs` do Plano de Caixa, faça quatro trocas.

**1.** Troque a linha `const TOKEN_SYNC_EMPRESA = '1d97…';` por:

```js
// Token do sync com o Hub: fica em Script Properties → TOKEN_SYNC_EMPRESA (nunca no código).
// O mesmo valor fica no Vercel (PLANO_CAIXA_TOKEN). O hub não conhece o token: passa por /api/plano-caixa.
function tokenSyncOk_(t) {
  const k = String(PropertiesService.getScriptProperties().getProperty('TOKEN_SYNC_EMPRESA') || '');
  t = String(t || '');
  if (!k || !t || k.length !== t.length) return false;
  let diff = 0;
  for (let i = 0; i < k.length; i++) diff |= k.charCodeAt(i) ^ t.charCodeAt(i);
  return diff === 0;
}
```

**2.** No `doPost`, troque

```js
if (body.token !== TOKEN_SYNC_EMPRESA) return ContentService.createTextOutput('forbidden');
```

por

```js
if (!tokenSyncOk_(body.token)) return ContentService.createTextOutput('forbidden');
```

**3 e 4.** No `doGet`, nas duas linhas que comparam `e.parameter.token !== TOKEN_SYNC_EMPRESA`, troque a comparação por `!tokenSyncOk_(e.parameter.token)`.

Depois:

1. Gere um token **novo** (passo 1).
2. Coloque o token novo em Script Properties → `TOKEN_SYNC_EMPRESA`.
3. Implante uma nova versão das **duas** implantações do Plano de Caixa: a "Só eu" e a "Qualquer pessoa".
4. No Vercel, troque `PLANO_CAIXA_TOKEN` pelo token novo e faça o redeploy. O Vercel só lê variáveis novas depois de um deploy.
5. Teste no hub: Plano de Caixa → sincronizar → "✅ Confirmado".

Entre os itens 3 e 4, o sync do Plano de Caixa falha por alguns minutos. Isso não perde dados: o hub manda de novo no próximo cálculo.

## Passo 5 — Conferência final

Abra cada URL `/exec` antiga **sem login** (aba anônima). Todas têm que responder `forbidden`.

```bash
curl -sL "https://script.google.com/macros/s/AKfycbwD9L4gj8zr9vwOBZxn4-71khw5yhoXwJTFfsWizP-okmZZQWlumQs93seg-H2USa8D/exec"
```

```bash
curl -sL "https://script.google.com/macros/s/AKfycbwdlNqijPhK5MfOFhQ-4lo72hA-3G1J-iPZbdoOZAQGv_8z7NG4QBjNxDIhmZNFOIa8/exec?action=listar"
```

```bash
curl -sL "https://script.google.com/macros/s/AKfycbwG-31A0O10zru2-klj4EbtiD5rg22R-kNG2TLE4Gkd_ZBStE-QNqsbkq-vwSf6vgf3/exec?action=status&docId=x"
```

E a API sem login:

```bash
curl -s -X POST "https://mgb-financeiro.vercel.app/api/asaas?action=emitir"
```

Tem que voltar `401`.

## Ainda aberto (precisa do código desses scripts)

Estes Apps Scripts ainda são chamados direto do navegador. O código deles não está no repositório.

| Script | Uso | Risco |
|---|---|---|
| `LEADS_SHEET_URL` (`AKfycbyVELtn…`) | exporta os leads do CRM para a planilha "MGB CRM - Leads" | qualquer pessoa sobrescreve a planilha de leads |
| `CALENDAR_APPS_SCRIPT_URL` (`AKfycbzWInbO…`) | lembretes do CRM no Google Agenda | qualquer pessoa cria e apaga eventos na agenda |
| `SHEETS_URL` (`AKfycbww6AHi…`, nos contratos Mercadão e Elevador) | registra contratos numa planilha | qualquer pessoa grava linhas falsas |
| Rádio Ops (`AKfycbx3f1mt…`) | chave do portal do cliente `moinho-portal-…` escrita no `index.html` | trocar a chave do portal e tirá-la do HTML |
