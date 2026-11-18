-- Espelha a planilha "MGB Faturamento - Clientes" (linhas ativas do action=listar do Apps Script)
-- em fat_clientes. Cliente que sumiu da lista de ativos vira ativo=false (nunca é apagado).
create function public.espelhar_clientes_da_planilha(p_linhas json)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_novos integer; v_alterados integer; v_inativados integer; v_total integer;
  n numeric;
begin
  if json_typeof(p_linhas) <> 'array' then
    raise exception 'esperava uma lista de linhas';
  end if;
  v_total := json_array_length(p_linhas);
  if v_total = 0 then
    -- planilha vazia = algo errado na leitura; não inativa ninguém
    return jsonb_build_object('ok', false, 'erro', 'planilha sem linhas — nada alterado');
  end if;
  perform set_config('mgb.origem', 'planilha (Apps Script listar)', true);

  create temp table if not exists _pl (like public.fat_clientes including defaults) on commit drop;
  truncate _pl;
  insert into _pl (id, modulo, cliente, cnpj, email, logradouro, numero, complemento, bairro, cidade, uf, cep, valor,
                   iss_retido, aliquota_iss, descricao, ctribnac, cnbs, boleto, inicio_cobranca, meses_contrato, origem,
                   linha_planilha, ativo, planilha_ultimo_mes, planilha_nf, planilha_valor_boleto, planilha_payment_id,
                   planilha_status_envio, planilha_data_envio, planilha_status_pagamento, planilha_status_pagamento_em,
                   visto_na_planilha_em)
  select r->>'id', coalesce(r->>'modulo', ''), coalesce(r->>'cliente', ''),
         nullif(r->>'cnpj', ''), nullif(r->>'email', ''), nullif(r->>'logradouro', ''), nullif(r->>'numero', ''),
         nullif(r->>'complemento', ''), nullif(r->>'bairro', ''), nullif(r->>'cidade', ''), nullif(r->>'uf', ''), nullif(r->>'cep', ''),
         case when (r->>'valor') ~ '^-?\d+(\.\d+)?$' then (r->>'valor')::numeric end,
         case lower(coalesce(r->>'issRetido', '')) when 'true' then true when 'sim' then true when 'false' then false when 'nao' then false when 'não' then false end,
         case when (r->>'aliquotaIssPlanilha') ~ '^-?\d+(\.\d+)?$' then (r->>'aliquotaIssPlanilha')::numeric end,
         nullif(r->>'descricao', ''), nullif(r->>'ctribnac', ''), nullif(r->>'cnbs', ''),
         case lower(coalesce(r->>'boleto', '')) when 'true' then true when 'sim' then true when 'false' then false when 'nao' then false when 'não' then false end,
         case when (r->>'inicioCobranca') ~ '^\d{4}-\d{2}$' then r->>'inicioCobranca' end,
         case when (r->>'mesesContrato') ~ '^\d+$' and (r->>'mesesContrato')::int > 0 then (r->>'mesesContrato')::int end,
         nullif(r->>'origem', ''),
         case when (r->>'linha') ~ '^\d+$' then (r->>'linha')::int end,
         true,
         nullif(left(coalesce(r->>'ultimoMesFaturado', ''), 7), ''), nullif(r->>'nfNumero', ''),
         case when (r->>'valorBoleto') ~ '^-?\d+(\.\d+)?$' then (r->>'valorBoleto')::numeric end,
         nullif(r->>'paymentId', ''), nullif(r->>'statusEnvio', ''), nullif(r->>'dataEnvio', ''),
         nullif(r->>'statusPagamento', ''), nullif(r->>'statusPagamentoEm', ''),
         now()
  from json_array_elements(p_linhas) r
  where coalesce(r->>'id', '') <> '';

  select count(*) into v_novos from _pl p where not exists (select 1 from public.fat_clientes c where c.id = p.id);

  insert into public.fat_clientes as c
  select * from _pl
  on conflict (id) do update set
    modulo = excluded.modulo, cliente = excluded.cliente, cnpj = excluded.cnpj, email = excluded.email,
    logradouro = excluded.logradouro, numero = excluded.numero, complemento = excluded.complemento, bairro = excluded.bairro,
    cidade = excluded.cidade, uf = excluded.uf, cep = excluded.cep, valor = excluded.valor, iss_retido = excluded.iss_retido,
    aliquota_iss = excluded.aliquota_iss, descricao = excluded.descricao, ctribnac = excluded.ctribnac, cnbs = excluded.cnbs,
    boleto = excluded.boleto, inicio_cobranca = excluded.inicio_cobranca, meses_contrato = excluded.meses_contrato,
    origem = excluded.origem, linha_planilha = excluded.linha_planilha, ativo = true,
    planilha_ultimo_mes = excluded.planilha_ultimo_mes, planilha_nf = excluded.planilha_nf,
    planilha_valor_boleto = excluded.planilha_valor_boleto, planilha_payment_id = excluded.planilha_payment_id,
    planilha_status_envio = excluded.planilha_status_envio, planilha_data_envio = excluded.planilha_data_envio,
    planilha_status_pagamento = excluded.planilha_status_pagamento, planilha_status_pagamento_em = excluded.planilha_status_pagamento_em,
    visto_na_planilha_em = excluded.visto_na_planilha_em,
    atualizado_em = case when (to_jsonb(c) - 'atualizado_em' - 'visto_na_planilha_em') is distinct from
                              (to_jsonb(excluded) - 'atualizado_em' - 'visto_na_planilha_em') then now() else c.atualizado_em end;
  get diagnostics v_alterados = row_count;

  update public.fat_clientes c set ativo = false, atualizado_em = now()
  where c.ativo and not exists (select 1 from _pl p where p.id = c.id);
  get diagnostics v_inativados = row_count;

  return jsonb_build_object('ok', true, 'linhas', v_total, 'novos', v_novos, 'inativados', v_inativados);
end;
$$;
revoke all on function public.espelhar_clientes_da_planilha(json) from public, anon, authenticated;
grant execute on function public.espelhar_clientes_da_planilha(json) to service_role;
