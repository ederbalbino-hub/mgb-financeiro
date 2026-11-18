-- Controle do aviso diário da conferência (bot/lib/pontes/conferencia.js): guarda a "assinatura" das
-- divergências já avisadas, para não mandar o mesmo e-mail todo dia. Mudou a lista = avisa de novo;
-- a mesma lista é lembrada uma vez por semana enquanto não for resolvida.
create table public.fat_conferencia_avisos (
  id smallint primary key default 1 check (id = 1),
  assinatura text not null default '',
  quantidade integer not null default 0,
  avisado_em timestamptz
);
insert into public.fat_conferencia_avisos (id) values (1);

alter table public.fat_conferencia_avisos enable row level security;
revoke all on public.fat_conferencia_avisos from public, anon, authenticated;
grant select, update on public.fat_conferencia_avisos to service_role;
