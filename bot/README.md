# MGB Financeiro — WhatsApp Bot

Bot que recebe mensagens em PT-BR, classifica a intenção com Claude e atualiza o dashboard MGB Financeiro.

## Comandos suportados

- **Lançar despesa**: "gastei 50 reais em cabo HDMI no Tecmax pra Calçadão"
- **Lançar receita**: "recebi do Leo Cosméticos"
- **Consultar saldo**: "saldo do mês" ou "quanto entrou em maio?"

## Stack

- Vercel serverless (Node 22+)
- Anthropic Claude Opus 4.7 (parser de intent)
- Meta WhatsApp Cloud API (gratuita até 1k conv/mês)
- Apps Script existente do dashboard (persistência)

## Variáveis de ambiente

Ver `.env.example`. Todas obrigatórias.

| Var | Onde pegar |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `WHATSAPP_TOKEN` | Meta for Developers → seu app → WhatsApp → API Setup |
| `WHATSAPP_PHONE_NUMBER_ID` | Mesma tela, campo "Phone number ID" |
| `WHATSAPP_VERIFY_TOKEN` | String aleatória que você escolhe (mesma usada ao registrar webhook no Meta) |
| `APPS_SCRIPT_URL` | Mesma URL que está hardcoded no `index.html` do dashboard |
| `WHITELIST` | Seu número e da sua esposa em E.164, sem +, separados por vírgula (ex: `5543999999999,5543988888888`) |

## Deploy no Vercel

```bash
cd bot
npm install
npx vercel
```

Configura as env vars em **Vercel dashboard → Settings → Environment Variables**.

## Configurar webhook no Meta

1. Meta for Developers → seu app → WhatsApp → Configuration → Webhooks
2. **Callback URL**: `https://seu-projeto.vercel.app/api/webhook`
3. **Verify token**: o mesmo `WHATSAPP_VERIFY_TOKEN` da env
4. Clica **Verify and save**
5. **Subscribe** em `messages`

## Testar

Manda mensagem WhatsApp pro número Business cadastrado. Logs em `vercel logs`.

## Estrutura

```
bot/
├── api/webhook.js       # endpoint Vercel
├── lib/
│   ├── parseIntent.js   # chamada Claude com prompt caching
│   ├── sheets.js        # cliente Apps Script (read+write full state)
│   └── whatsapp.js      # envio Meta API
├── package.json
├── vercel.json
└── .env.example
```

## Observações

- O bot lê o estado completo, modifica em memória, salva tudo de volta — mesma estratégia do `index.html`. Funciona sem mudanças no Apps Script.
- Se vocês dois (você e esposa) lançarem ao mesmo tempo, último que salvar sobrescreve o outro. Aceitável pra uso pessoal.
- Prompt caching ativo no system prompt — primeira mensagem do dia paga preço cheio, próximas ~5min são 90% mais baratas.

## Login do Hub (acesso por pessoa)

O hub (`index.html` + `acesso.js`) pede usuário e senha e mostra a cada pessoa só a área dela:

| Usuário | Papel | Vê |
|---|---|---|
| eder | admin | Meu dia ou Visão geral (tudo) + "Ver como" |
| karen | financeiro | Financeiro MGB, Módulos, Contabilidade, Contratos, Cobrança Mensal, Gerar Resultados, Rádio Ops, Ferramentas |
| guina | bureau | Rádio Ops (sem o Resumo financeiro da MGB), Ferramentas |
| cleiton | programacao | Estúdio (spots, Blocos Rádio), Ferramentas |

Endpoint: `api/auth.js` (`?action=config|login|me`). Regras de cada papel: `PERFIS` em `acesso.js`.

### Ativar

1. Dentro de `bot/`, rode `node scripts/gerar-usuarios.js` e digite a senha de cada pessoa.
2. No Vercel, em Settings > Environment Variables, crie `HUB_USERS` e `HUB_AUTH_SECRET` com o que o script imprimiu.
3. Faça um novo deploy. A partir daí o hub passa a pedir login.

Enquanto essas variáveis não existirem, o hub funciona como antes, sem login.

### Limite desta fase

O login organiza o que cada pessoa vê. Os dados ainda ficam acessíveis pelas URLs do Apps Script para quem souber usá-las. A proteção no servidor (começando pela emissão de NF só depois da aprovação do dia 5) usa `usuarioDaRequisicao()` de `lib/auth.js` e entra nas próximas fases.

### Testes

`npm test` dentro de `bot/` (senhas, tokens e as regras de cada papel).
