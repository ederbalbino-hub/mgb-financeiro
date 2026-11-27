-- Registro de ações do hub (pedido do Diego em 27/11/2026: "tudo o que a Karen fizer tem que gerar
-- um log no banco para possíveis consultas"). Vale para todos os usuários, não só a Karen.
--
-- Uma linha por ação que ALTERA algo: cada salvamento do estado (com as seções que mudaram e o
-- resumo que o navegador mandou), cada emissão/cancelamento no Asaas, cada e-mail enviado, cada
-- inclusão/marcação no Faturamento e cada documento mandado para assinatura. Consultas não entram.
--
-- Acesso SÓ pelo servidor (Vercel, com a secret key), no mesmo padrão de hub_estado: RLS ligado
-- sem políticas e sem grants para anon/authenticated. Só inserção (nada de update/delete pelo app).
--
-- Sem poda automática, de propósito: guardar para sempre. Cada linha tem poucas centenas de bytes
-- (nunca o estado inteiro; o estado completo de cada versão já fica em hub_estado_historico), então
-- mesmo centenas de ações por dia somam poucos MB por ano.

create table public.hub_log (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  login text,
  nome text,
  papel text,
  origem text not null,           -- 'estado' | 'asaas' | 'email' | 'faturamento' | 'assinafy'
  acao text not null,             -- resumo legível em português
  secoes text[],                  -- seções do estado que mudaram (só origem 'estado')
  detalhe jsonb,                  -- pequeno: contagens, ids, cliente/valor; nunca o estado inteiro
  versao integer                  -- versão do estado gravada (só origem 'estado')
);
comment on table public.hub_log is 'Registro de ações do hub (quem fez o quê e quando). Escrita só via public.registrar_log(). Sem poda.';
create index hub_log_em_idx on public.hub_log (em desc);
create index hub_log_login_em_idx on public.hub_log (login, em desc);

alter table public.hub_log enable row level security;
revoke all on public.hub_log from public, anon, authenticated;

create function public.registrar_log(
  p_origem text,
  p_acao text,
  p_login text default null,
  p_nome text default null,
  p_papel text default null,
  p_secoes text[] default null,
  p_detalhe jsonb default null,
  p_versao integer default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  insert into public.hub_log (origem, acao, login, nome, papel, secoes, detalhe, versao)
  values (left(coalesce(p_origem, '?'), 40), left(coalesce(p_acao, ''), 4000), p_login, p_nome, p_papel, p_secoes, p_detalhe, p_versao)
  returning id;
$$;

revoke all on function public.registrar_log(text, text, text, text, text, text[], jsonb, integer) from public, anon, authenticated;
grant execute on function public.registrar_log(text, text, text, text, text, text[], jsonb, integer) to service_role;
grant select, insert on public.hub_log to service_role;
