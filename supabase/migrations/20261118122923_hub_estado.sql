-- Estado do hub MGB (ponte até a Fase 2): o mesmo documento JSON que antes ficava no Drive
-- (mgb-dados.json), agora no Postgres, com trava de versão e histórico de cada salvamento.
-- Acesso SÓ pelo servidor (Vercel, com a secret key): RLS ligado sem políticas e sem grants
-- para anon/authenticated. O navegador nunca fala com estas tabelas.
--
-- "dados" é json (não jsonb) de propósito: guarda o texto exatamente como o hub mandou.
-- O hub compara seções por hash do texto; jsonb reordenaria as chaves e faria toda seção
-- parecer alterada a cada salvamento.

create table public.hub_estado (
  id smallint primary key default 1 check (id = 1),
  dados json not null,
  versao integer not null default 0 check (versao >= 0),
  bytes integer not null,
  salvo_por text,
  salvo_login text,
  salvo_em timestamptz not null default now()
);
comment on table public.hub_estado is 'Estado inteiro do hub MGB (linha única). Escrita só via public.salvar_estado().';

create table public.hub_estado_historico (
  id bigint generated always as identity primary key,
  versao integer not null,
  dados json not null,
  bytes integer not null,
  salvo_por text,
  salvo_login text,
  salvo_em timestamptz not null,
  substituido_em timestamptz not null default now(),
  substituido_por text
);
comment on table public.hub_estado_historico is 'Versões anteriores do estado do hub (uma por salvamento), para auditoria e para voltar atrás.';
create index hub_estado_historico_salvo_em_idx on public.hub_estado_historico (salvo_em desc);

alter table public.hub_estado enable row level security;
alter table public.hub_estado_historico enable row level security;
revoke all on public.hub_estado, public.hub_estado_historico from public, anon, authenticated;

-- Leitura: texto exato + versão.
create function public.carregar_estado()
returns table (dados text, versao integer, salvo_por text, salvo_em timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.dados::text, e.versao, e.salvo_por, e.salvo_em
  from public.hub_estado e
  where e.id = 1;
$$;

-- Gravação atômica com trava de versão.
--   p_versao_esperada: a versão lida pelo cliente. Se alguém salvou depois, devolve conflito.
--   Recusa JSON que não seja objeto, objeto vazio e estado que encolheu para < 30% do atual.
--   A versão anterior vai para o histórico antes de ser substituída.
create function public.salvar_estado(
  p_dados text,
  p_versao_esperada integer default null,
  p_login text default null,
  p_nome text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_json json;
  v_atual public.hub_estado%rowtype;
  v_bytes integer := octet_length(p_dados);
  v_nova integer;
begin
  begin
    v_json := p_dados::json;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'JSON inválido');
  end;
  if json_typeof(v_json) <> 'object' or not exists (select 1 from json_object_keys(v_json)) then
    return jsonb_build_object('ok', false, 'erro', 'estado vazio recusado');
  end if;

  select * into v_atual from public.hub_estado where id = 1 for update;

  if not found then
    insert into public.hub_estado (id, dados, versao, bytes, salvo_por, salvo_login)
    values (1, v_json, 1, v_bytes, p_nome, p_login)
    on conflict (id) do nothing;
    if not found then
      return jsonb_build_object('ok', false, 'conflito', true, 'v', (select versao from public.hub_estado where id = 1));
    end if;
    return jsonb_build_object('ok', true, 'v', 1, 'primeiro', true);
  end if;

  if p_versao_esperada is not null and p_versao_esperada <> v_atual.versao then
    return jsonb_build_object('ok', false, 'conflito', true, 'v', v_atual.versao);
  end if;

  if v_atual.bytes > 20000 and v_bytes < v_atual.bytes * 0.3 then
    return jsonb_build_object('ok', false, 'erro',
      format('estado encolheu demais (%s de %s bytes) — não gravei', v_bytes, v_atual.bytes));
  end if;

  insert into public.hub_estado_historico (versao, dados, bytes, salvo_por, salvo_login, salvo_em, substituido_por)
  values (v_atual.versao, v_atual.dados, v_atual.bytes, v_atual.salvo_por, v_atual.salvo_login, v_atual.salvo_em, p_login);

  v_nova := v_atual.versao + 1;
  update public.hub_estado
     set dados = v_json, versao = v_nova, bytes = v_bytes,
         salvo_por = p_nome, salvo_login = p_login, salvo_em = now()
   where id = 1;

  return jsonb_build_object('ok', true, 'v', v_nova);
end;
$$;

revoke all on function public.carregar_estado() from public, anon, authenticated;
revoke all on function public.salvar_estado(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.carregar_estado() to service_role;
grant execute on function public.salvar_estado(text, integer, text, text) to service_role;
grant select, insert, update on public.hub_estado to service_role;
grant select, insert on public.hub_estado_historico to service_role;
