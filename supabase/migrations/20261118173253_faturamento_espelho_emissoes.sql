-- Espelha fatEmissoes (estado do hub) em fat_emissoes a cada salvamento do hub.
-- Chave no estado: "<cliente_id>|<AAAA-MM>". Emissão apagada no hub (cancelamento) some daqui também.
-- Nunca derruba o salvamento do hub: qualquer erro vira aviso no log do Postgres.
create function public.espelhar_emissoes_do_estado(p_estado json)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  perform set_config('mgb.origem', 'hub (fatEmissoes)', true);
  create temp table if not exists _fe (
    cliente_id text, competencia text, status text, modo text, valor numeric, valor_boleto numeric,
    payment_id text, invoice_id text, nf_numero text, boleto_url text, erro text, emitido_em timestamptz,
    cliente_nome text, pagamento_status text, pagamento_em timestamptz
  ) on commit drop;
  truncate _fe;

  insert into _fe
  select split_part(j.k, '|', 1), split_part(j.k, '|', 2),
         j.v->>'status', j.v->>'modo',
         nullif(j.v->>'valor', '')::numeric, nullif(j.v->>'boleto', '')::numeric,
         j.v->>'paymentId', j.v->>'invoiceId', j.v->>'nf', j.v->>'boletoUrl', j.v->>'erro',
         nullif(j.v->>'em', '')::timestamptz, j.v->>'cliente',
         j.v->>'pg', nullif(j.v->>'pgEm', '')::timestamptz
  from json_each(coalesce(p_estado->'fatEmissoes', '{}'::json)) as j(k, v)
  where json_typeof(j.v) = 'object' and j.k ~ '^[^|]+\|\d{4}-\d{2}$';

  insert into public.fat_emissoes as e (cliente_id, competencia, status, modo, valor, valor_boleto, payment_id, invoice_id,
                                       nf_numero, boleto_url, erro, emitido_em, cliente_nome, pagamento_status, pagamento_em)
  select * from _fe
  on conflict (cliente_id, competencia) do update set
    status = excluded.status, modo = excluded.modo, valor = excluded.valor, valor_boleto = excluded.valor_boleto,
    payment_id = excluded.payment_id, invoice_id = excluded.invoice_id, nf_numero = excluded.nf_numero,
    boleto_url = excluded.boleto_url, erro = excluded.erro, emitido_em = excluded.emitido_em,
    cliente_nome = excluded.cliente_nome, pagamento_status = excluded.pagamento_status, pagamento_em = excluded.pagamento_em,
    atualizado_em = now()
  where (e.status, e.modo, e.valor, e.valor_boleto, e.payment_id, e.invoice_id, e.nf_numero, e.boleto_url, e.erro,
         e.emitido_em, e.cliente_nome, e.pagamento_status, e.pagamento_em)
        is distinct from
        (excluded.status, excluded.modo, excluded.valor, excluded.valor_boleto, excluded.payment_id, excluded.invoice_id,
         excluded.nf_numero, excluded.boleto_url, excluded.erro, excluded.emitido_em, excluded.cliente_nome,
         excluded.pagamento_status, excluded.pagamento_em);
  get diagnostics v_n = row_count;

  delete from public.fat_emissoes e
  where not exists (select 1 from _fe f where f.cliente_id = e.cliente_id and f.competencia = e.competencia);

  return v_n;
end;
$$;
revoke all on function public.espelhar_emissoes_do_estado(json) from public, anon, authenticated;

create function public.hub_estado_espelhar()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  begin
    perform public.espelhar_emissoes_do_estado(new.dados);
  exception when others then
    raise warning 'espelho do faturamento falhou (salvamento do hub seguiu normal): %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.hub_estado_espelhar() from public, anon, authenticated;

create trigger hub_estado_espelhar_faturamento after insert or update of dados on public.hub_estado
  for each row execute function public.hub_estado_espelhar();

-- Carga inicial com o estado atual.
select public.espelhar_emissoes_do_estado(dados) from public.hub_estado where id = 1;
