# Troca de hospedagem: GitHub Pages → Vercel (projeto `mgb-hub`)

**Objetivo:** tirar o hub e os materiais do GitHub Pages para o repositório poder ficar **privado**, e ganhar os cabeçalhos de segurança que o Pages não permite.

**Por que não basta deixar o repositório privado:** no plano gratuito do GitHub, repositório privado não tem Pages. Isso derrubaria o hub, o site da Tela Vertical e todos os links de mídia kit e proposta já enviados a clientes.

## O que já está pronto

| Peça | Situação |
|---|---|
| Projeto `mgb-hub` no Vercel | criado e ligado ao repositório (branch de produção: `main`) |
| Arquivos fora da publicação (`.vercelignore`) | `bot/`, `docs/`, `supabase/`, Apps Scripts |
| Cabeçalhos de segurança (`vercel.json` da raiz) | HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy e CSP em modo "só relatar" |
| Relatórios da CSP | `/api/csp` na API, aparecem no log com o prefixo `csp:` |
| API aceita chamadas do endereço novo | `HUB_ORIGINS` inclui `https://hub-mgb.vercel.app` |
| Páginas de redirecionamento | [`docs/redirecionamento/`](redirecionamento/) |

## Pré-requisito
O Eder precisa ter terminado o guia do Google (PDF), porque os links do guia apontam para arquivos do GitHub público.

## Dia da troca

1. **Endereços absolutos no código.** No mesmo commit, troque `https://ederbalbino-hub.github.io/mgb-financeiro/` por `https://hub-mgb.vercel.app/`. São 13 arquivos: os materiais da Tela Vertical, o mídia kit, as apresentações e um logo no `index.html`. Para conferir se sobrou algum:

   ```bash
   grep -rn "ederbalbino-hub.github.io/mgb-financeiro" --include=*.html --include=*.js . | grep -v "^./bot/\|^./docs/"
   ```

   O `<script src>` do `rede-viva.js` **precisa** desse ajuste: script não segue redirecionamento de página.

2. **Merge na `main`.** O Vercel publica o `mgb-hub` em produção (`https://hub-mgb.vercel.app`). Conferir:
   - login, carga dos dados, Faturamento e contratos;
   - uma página da Tela Vertical (`/telavertical/03-site/index.html`) mostrando os condomínios ao vivo;
   - os cabeçalhos, com o comando abaixo.

   ```bash
   curl -sI https://hub-mgb.vercel.app/ | grep -iE "strict-transport|x-frame|content-security"
   ```

3. **Supabase Auth.** Em `site_url`, colocar `https://hub-mgb.vercel.app/`. Em `uri_allow_list`, incluir `https://hub-mgb.vercel.app/**`. Assim os links de convite e de troca de senha abrem no endereço novo.

4. **Repositório privado, mantendo os links antigos vivos:**
   1. Renomear o repositório `ederbalbino-hub/mgb-financeiro` para `ederbalbino-hub/mgb-hub` e deixá-lo **privado**. O Vercel acompanha a mudança de nome.
   2. Criar um repositório **público novo** chamado `mgb-financeiro`, só com os arquivos de [`docs/redirecionamento/`](redirecionamento/) (`index.html` e `404.html`).
   3. Ligar o GitHub Pages nele (branch `main`, raiz).
   4. Resultado: qualquer link antigo (`ederbalbino-hub.github.io/mgb-financeiro/qualquer/caminho`) leva ao mesmo caminho em `hub-mgb.vercel.app`, mantendo `?parâmetros` e `#âncora`.

5. **Tirar o endereço antigo de `HUB_ORIGINS`** (API no Vercel): deixar só `https://hub-mgb.vercel.app`.

6. **Uma semana depois:** ler os relatórios `csp:` no log da API. Se não aparecer nada inesperado, trocar `Content-Security-Policy-Report-Only` por `Content-Security-Policy` no `vercel.json` da raiz.

## Domínio próprio (opcional)
Para usar algo como `hub.agenciamgb.com.br` em vez de `hub-mgb.vercel.app`:
1. Adicionar o domínio no projeto `mgb-hub` (Vercel → Settings → Domains).
2. Criar o CNAME no DNS da `agenciamgb.com.br`.
3. Usar esse domínio nos passos 1, 3, 4 e 5 e no `404.html` do redirecionamento.
