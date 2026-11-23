-- PROPOSTA (não aplicada): trilha de auditoria legível do estado do hub.
-- Fica fora de supabase/migrations/ de propósito: só vira migração quando o Diego aprovar.
--
-- Uma linha por mudança, com frase pronta ("marcou Listen (Rádio Interna) como paga em Nov/2026").
-- Pequena (centenas de bytes por linha) e NÃO é podada — ao contrário de hub_estado_historico,
-- que depois de 30 dias guarda só 1 cópia por dia e perde quem fez cada mudança no meio do dia.
-- Quem preenche: api/estado.js, depois de gravarEstado(), com bot/lib/trilha.js.

create table public.hub_alteracoes (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  versao integer not null,          -- versão do hub_estado criada por esta gravação
  login text,
  nome text,
  secao text not null,              -- ex.: recPagamentos, empresaAvulsas, leads
  ref text not null,                -- caminho do item, ex.: recPagamentos.radio.Listen.2026-10
  texto text not null               -- frase legível
);
comment on table public.hub_alteracoes is 'Trilha legível: quem mudou o quê no estado do hub, uma linha por mudança.';
create index hub_alteracoes_em_idx on public.hub_alteracoes (em desc);
create index hub_alteracoes_ref_idx on public.hub_alteracoes (ref, em desc);

alter table public.hub_alteracoes enable row level security;
revoke all on public.hub_alteracoes from public, anon, authenticated;
grant select, insert on public.hub_alteracoes to service_role;

-- Exemplos de consulta:
--   o que aconteceu hoje:
--     select em at time zone 'America/Sao_Paulo', nome, texto from public.hub_alteracoes
--     where em > now() - interval '1 day' order by em desc;
--   tudo sobre um cliente:
--     select em, nome, texto from public.hub_alteracoes where ref like '%.Listen.%' order by em desc;
