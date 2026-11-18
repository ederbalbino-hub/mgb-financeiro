# Segurança — Fase 0: passo a passo de implantação

Este guia leva o hub do modo **"qualquer pessoa com a URL lê e grava tudo"** para o modo **"só quem está logado, e só o que o papel permite"**. Junto, os dados do hub saem do Google Drive e vão para o **Supabase** (projeto **MGB Hub**, região São Paulo).

## O que muda

| Antes | Depois |
|---|---|
| Estado do hub num JSON no Drive, lido e gravado por qualquer pessoa com a URL | Estado no Postgres (Supabase); só o servidor acessa, com a chave secreta |
| O Faturamento listava CNPJ, e-mail e endereço de todos os clientes | O navegador só fala com a API do Vercel, que exige login (admin/financeiro) |
| Qualquer pessoa mandava documento para assinatura em nome da MGB | O mesmo |
| O token do Plano de Caixa estava no `index.html` | O token fica só no Vercel e no Script Properties |
| Duas abas salvando juntas: a última apagava o trabalho da outra | Trava de versão no banco: o segundo a salvar relê, mescla e salva de novo |
| Uma resposta de erro podia virar `{}` e ser gravada por cima de tudo | O banco recusa estado vazio, inválido ou que encolheu para menos de 30% |
| Sem histórico | Cada salvamento guarda a versão anterior (quem, quando). 30 dias completos, depois 1 por dia |
| Sem backup | Backup diário do Supabase (plano Pro) |

## Antes de começar

1. **Backup manual:** no Google Drive, baixe o `mgb-dados.json` e guarde fora do Drive.
2. **Feche todas as abas do hub,** em todos os computadores (Eder, Karen, Guina, Cleiton), antes do passo 3. Uma aba antiga aberta continuaria gravando no Drive depois da mudança.

## Passo 1 — Chave secreta do Supabase

1. Abra [supabase.com/dashboard](https://supabase.com/dashboard) → projeto **MGB Hub** → **Project Settings → API Keys**.
2. Em **Secret keys**, crie uma chave chamada `vercel-hub` e copie o valor (`sb_secret_…`).
3. Cole direto no Vercel (passo 2). Não mande por WhatsApp nem por e-mail.

## Passo 2 — Vercel: variáveis

Em **Vercel → projeto mgb-financeiro → Settings → Environment Variables (Production)**:

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | `https://wvatjibxyhhbotayabig.supabase.co` |
| `SUPABASE_SECRET_KEY` | a chave do passo 1 |
| `APPS_SCRIPT_URL` | URL `/exec` do script principal do hub (`AKfycbwD9L4g…`). Serve só para a importação única |
| `FATURAMENTO_API_URL` | URL `/exec` do Faturamento (`AKfycbwdlNqi…`) |
| `FATURAMENTO_SECRET` | segredo novo (ver abaixo) |
| `ASSINAFY_GS_URL` | URL `/exec` do Assinafy (`AKfycbwG-31A…`) |
| `ASSINAFY_GS_SECRET` | segredo novo |
| `PLANO_CAIXA_URL` | URL `/exec` da implantação "Qualquer pessoa" do Plano de Caixa (`AKfycbyRPxmB…`) |
| `PLANO_CAIXA_TOKEN` | **por enquanto, o token ANTIGO** (`1d97…`). O novo entra no passo 5 |

Para gerar cada segredo novo:

```bash
openssl rand -base64 32 | tr -d '/+=' | cut -c1-40
```

Confira também que já existem `HUB_AUTH_SECRET`, `HUB_USERS`, `WHITELIST` e `ASAAS_WEBHOOK_TOKEN`. Sem `WHITELIST`, o bot do WhatsApp para de responder.

## Passo 3 — Publicar (merge na `main`) e importação automática

Depois do merge, a API (Vercel) e o hub (GitHub Pages) sobem juntos. **Na primeira vez que alguém abrir o hub**, a API vê o banco vazio, copia o estado atual do Apps Script para o Supabase e segue a partir de lá. Não tem passo manual.

Teste, logado no hub:

1. Os dados carregam? Aparece "salvo" depois de editar algo?
2. Contabilidade → 🧾 Faturamento: a lista de clientes aparece?
3. Um contrato com assinatura pendente: o status aparece?
4. Plano de Caixa → sincronizar: aparece "✅ Confirmado"?

Se algo falhar, a mensagem de erro diz qual variável falta.

## Passo 4 — Desligar o acesso direto aos Apps Scripts

Faça um por vez. Para publicar uma versão nova: **Implantar → Gerenciar implantações → ✏️ editar a implantação atual → Versão: Nova versão → Implantar**.

> ⚠️ Use **editar a implantação existente**, NÃO "Nova implantação". Editar mantém a mesma URL, e as URLs que estão no histórico do git passam a responder "forbidden".

### 4a. Script principal do hub: arquivar

Só depois de confirmar, no passo 3, que o hub carrega e salva pelo Supabase:

1. **Implantar → Gerenciar implantações → Arquivar** a implantação.
2. A URL antiga para de responder, e a cópia dos dados que ficou no Drive deixa de ser pública.
3. O `mgb-dados.json` pode continuar no Drive como backup frio.

### 4b. Faturamento

1. Substitua o código pelo de [`apps-script-faturamento/Code.gs`](../apps-script-faturamento/Code.gs).
2. Em Script Properties, adicione:
   - `FATURAMENTO_SECRET`, com o mesmo valor do Vercel;
   - `WEBHOOK_TOKEN`, com o token que estava na constante `WEBHOOK_TOKEN` do script antigo (o mesmo valor de `ASAAS_WEBHOOK_TOKEN` no Vercel).
3. Implante a nova versão.
4. Teste: `…/exec?action=listar` direto no navegador → `{"ok":false,"erro":"forbidden"}`. O Faturamento no hub continua listando.

### 4c. Assinafy

1. Substitua o código pelo de [`apps-script-assinafy/Code.gs`](../apps-script-assinafy/Code.gs).
2. Em Script Properties, adicione `GS_SECRET` com o mesmo valor de `ASSINAFY_GS_SECRET` do Vercel.
3. Implante a nova versão.
4. Teste: `…/exec?action=status&docId=x` → `{"erro":"forbidden"}`.

## Passo 5 — Plano de Caixa: trocar o token vazado

No `Code.gs` do Plano de Caixa, faça quatro trocas.

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

**3 e 4.** No `doGet`, nas duas linhas com `e.parameter.token !== TOKEN_SYNC_EMPRESA`, troque a comparação por `!tokenSyncOk_(e.parameter.token)`.

Depois:

1. Gere um token **novo**.
2. Coloque o token novo em Script Properties → `TOKEN_SYNC_EMPRESA`.
3. Implante uma nova versão das **duas** implantações do Plano de Caixa: a "Só eu" e a "Qualquer pessoa".
4. No Vercel, troque `PLANO_CAIXA_TOKEN` pelo token novo e faça o **redeploy**. O Vercel só lê variáveis novas depois de um deploy.
5. Teste no hub: Plano de Caixa → sincronizar → "✅ Confirmado".

## Passo 6 — Conferência final

Sem login (aba anônima), cada uma destas chamadas tem que ser recusada:

```bash
curl -sL "https://script.google.com/macros/s/AKfycbwdlNqijPhK5MfOFhQ-4lo72hA-3G1J-iPZbdoOZAQGv_8z7NG4QBjNxDIhmZNFOIa8/exec?action=listar"
```

```bash
curl -sL "https://script.google.com/macros/s/AKfycbwG-31A0O10zru2-klj4EbtiD5rg22R-kNG2TLE4Gkd_ZBStE-QNqsbkq-vwSf6vgf3/exec?action=status&docId=x"
```

```bash
curl -s -X POST "https://mgb-financeiro.vercel.app/api/asaas?action=emitir"
```

```bash
curl -s "https://mgb-financeiro.vercel.app/api/estado"
```

## Voltar uma versão do estado (se precisar)

Cada salvamento guarda a versão anterior em `public.hub_estado_historico`. No SQL Editor do Supabase, para ver as últimas:

```sql
select id, versao, salvo_por, salvo_em, bytes
from public.hub_estado_historico
order by id desc
limit 20;
```

Para restaurar uma versão, troque `<id>` pelo número escolhido:

```sql
select public.salvar_estado(
  (select dados::text from public.hub_estado_historico where id = <id>),
  null,
  'restauracao',
  'Restauração manual'
);
```

## Ainda aberto (precisa do código desses scripts)

| Script | Uso | Risco |
|---|---|---|
| `LEADS_SHEET_URL` (`AKfycbyVELtn…`) | exporta os leads do CRM para a planilha "MGB CRM - Leads" | qualquer pessoa sobrescreve a planilha de leads |
| `CALENDAR_APPS_SCRIPT_URL` (`AKfycbzWInbO…`) | lembretes do CRM no Google Agenda | qualquer pessoa cria e apaga eventos na agenda |
| `SHEETS_URL` (`AKfycbww6AHi…`, nos contratos Mercadão e Elevador) | registra contratos numa planilha | qualquer pessoa grava linhas falsas |
| Rádio Ops (`AKfycbx3f1mt…`) | chave do portal do cliente `moinho-portal-…` escrita no `index.html` | trocar a chave do portal e tirá-la do HTML |
