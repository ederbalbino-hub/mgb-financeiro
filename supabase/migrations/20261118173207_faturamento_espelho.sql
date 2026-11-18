-- Faturamento em tabelas (Fase 2, etapa 1: ESPELHO).
-- Hoje a verdade do faturamento está espalhada: planilha "MGB Faturamento - Clientes" (cadastro +
-- status do último mês, via Apps Script), seção fatEmissoes do estado do hub (histórico por mês) e
-- Asaas. Nesta etapa as tabelas só ESPELHAM essas fontes e apontam divergências (fat_conferencia);
-- ninguém lê nem grava aqui pelo hub ainda. Acesso só pelo servidor (RLS sem políticas, sem grants).

create table public.fat_clientes (
  id text primary key,                         -- id da planilha (ex.: radio-prochet, hub-radio-raz)
  modulo text not null,
  cliente text not null,
  cnpj text, email text,
  logradouro text, numero text, complemento text, bairro text, cidade text, uf text, cep text,
  valor numeric(12,2),
  iss_retido boolean,
  aliquota_iss numeric(6,3),
  descricao text, ctribnac text, cnbs text,
  boleto boolean,
  inicio_cobranca text check (inicio_cobranca is null or inicio_cobranca ~ '^\d{4}-\d{2}$'),
  meses_contrato integer check (meses_contrato is null or meses_contrato > 0),
  origem text,
  linha_planilha integer,
  ativo boolean not null default true,
  -- status do último mês, como a planilha informa (o webhook do Asaas atualiza a planilha)
  planilha_ultimo_mes text, planilha_nf text, planilha_valor_boleto numeric(12,2), planilha_payment_id text,
  planilha_status_envio text, planilha_data_envio text, planilha_status_pagamento text, planilha_status_pagamento_em text,
  visto_na_planilha_em timestamptz,
  atualizado_em timestamptz not null default now()
);
comment on table public.fat_clientes is 'Clientes do faturamento (espelho da planilha MGB Faturamento - Clientes).';

create table public.fat_emissoes (
  cliente_id text not null,                    -- mesmo id da planilha; lojas só do hub podem não estar em fat_clientes
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  status text, modo text,
  valor numeric(12,2), valor_boleto numeric(12,2),
  payment_id text, invoice_id text, nf_numero text,
  boleto_url text, erro text,
  emitido_em timestamptz,
  cliente_nome text,
  pagamento_status text, pagamento_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, competencia)
);
comment on table public.fat_emissoes is 'Emissões do faturamento por cliente e competência (espelho de fatEmissoes do hub).';
create index fat_emissoes_competencia_idx on public.fat_emissoes (competencia);

create table public.fat_auditoria (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  tabela text not null,
  chave text not null,
  acao text not null check (acao in ('criou', 'alterou', 'apagou')),
  antes jsonb,
  depois jsonb,
  origem text
);
comment on table public.fat_auditoria is 'Toda mudança em fat_clientes e fat_emissoes: antes, depois e de onde veio.';
create index fat_auditoria_tabela_chave_idx on public.fat_auditoria (tabela, chave, em desc);

-- Auditoria: grava antes/depois em toda mudança real (ignora atualizado_em/visto_na_planilha_em).
create function public.fat_auditar()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'atualizado_em' - 'visto_na_planilha_em' end;
  v_depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'atualizado_em' - 'visto_na_planilha_em' end;
  v_reg jsonb := coalesce(v_depois, v_antes);
  v_chave text := case when tg_table_name = 'fat_emissoes' then (v_reg->>'cliente_id') || '|' || (v_reg->>'competencia') else v_reg->>'id' end;
begin
  if tg_op = 'UPDATE' and v_antes = v_depois then
    return new;
  end if;
  insert into public.fat_auditoria (tabela, chave, acao, antes, depois, origem)
  values (tg_table_name, v_chave,
          case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'apagou' end,
          v_antes, v_depois, current_setting('mgb.origem', true));
  return coalesce(new, old);
end;
$$;

create trigger fat_clientes_auditoria after insert or update or delete on public.fat_clientes
  for each row execute function public.fat_auditar();
create trigger fat_emissoes_auditoria after insert or update or delete on public.fat_emissoes
  for each row execute function public.fat_auditar();

alter table public.fat_clientes enable row level security;
alter table public.fat_emissoes enable row level security;
alter table public.fat_auditoria enable row level security;
revoke all on public.fat_clientes, public.fat_emissoes, public.fat_auditoria from public, anon, authenticated;
grant select, insert, update, delete on public.fat_clientes, public.fat_emissoes to service_role;
grant select on public.fat_auditoria to service_role;
revoke all on function public.fat_auditar() from public, anon, authenticated;
