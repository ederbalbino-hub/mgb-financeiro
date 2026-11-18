-- Retenção do histórico: tudo dos últimos 30 dias; antes disso, só a última versão de cada dia.
-- Cada salvamento guarda ~125 KB, então sem limpeza o histórico cresce dezenas de MB por dia.
create extension if not exists pg_cron;

create function public.podar_historico_estado()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with manter as (
    select distinct on ((h.salvo_em at time zone 'America/Sao_Paulo')::date) h.id
    from public.hub_estado_historico h
    order by (h.salvo_em at time zone 'America/Sao_Paulo')::date, h.salvo_em desc
  ), apagados as (
    delete from public.hub_estado_historico h
    where h.salvo_em < now() - interval '30 days'
      and h.id not in (select id from manter)
    returning 1
  )
  select count(*)::integer from apagados;
$$;
revoke all on function public.podar_historico_estado() from public, anon, authenticated;

select cron.schedule('podar-historico-estado', '17 6 * * *', 'select public.podar_historico_estado()');
