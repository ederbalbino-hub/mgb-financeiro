-- Faturamento, etapa 3a (decisão de 18/11/2026): gravação em paralelo.
-- O que o hub manda para a planilha (incluir cliente, marcar emitido) e o que o webhook do Asaas manda
-- (status de pagamento) passa a ser gravado também aqui, na hora. A planilha continua sendo a fonte
-- oficial e o hub continua lendo dela até a troca (depois do faturamento de 05/12/2026).
-- Cada função registra a origem na auditoria (fat_auditoria.origem).

create function public.fat_registrar_inclusao(p jsonb, p_origem text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  num numeric;
begin
  if coalesce(p->>'id', '') = '' then raise exception 'id obrigatório'; end if;
  perform set_config('mgb.origem', p_origem, true);
  insert into public.fat_clientes as c (id, modulo, cliente, cnpj, email, logradouro, numero, complemento, bairro, cidade, uf, cep,
                                        valor, descricao, ctribnac, cnbs, boleto, iss_retido, inicio_cobranca, meses_contrato, origem, ativo)
  values (p->>'id', coalesce(p->>'modulo', ''), coalesce(p->>'cliente', ''),
          nullif(p->>'cnpj', ''), nullif(p->>'email', ''), nullif(p->>'logradouro', ''), nullif(p->>'numero', ''),
          nullif(p->>'complemento', ''), nullif(p->>'bairro', ''), nullif(p->>'cidade', ''), nullif(p->>'uf', ''), nullif(p->>'cep', ''),
          case when (p->>'valor') ~ '^-?\d+(\.\d+)?$' then (p->>'valor')::numeric end,
          nullif(p->>'descricao', ''), nullif(p->>'ctribnac', ''), nullif(p->>'cnbs', ''),
          case lower(coalesce(p->>'boleto', '')) when 'sim' then true when 'true' then true when 'nao' then false when 'não' then false when 'false' then false end,
          case lower(coalesce(p->>'issRetido', '')) when 'sim' then true when 'true' then true when 'nao' then false when 'não' then false when 'false' then false end,
          case when (p->>'inicio') ~ '^\d{4}-\d{2}$' then p->>'inicio' end,
          case when (p->>'meses') ~ '^\d+$' and (p->>'meses')::int > 0 then (p->>'meses')::int end,
          'hub', true)
  on conflict (id) do update set
    modulo = coalesce(nullif(excluded.modulo, ''), c.modulo), cliente = coalesce(nullif(excluded.cliente, ''), c.cliente),
    cnpj = coalesce(excluded.cnpj, c.cnpj), email = coalesce(excluded.email, c.email),
    logradouro = coalesce(excluded.logradouro, c.logradouro), numero = coalesce(excluded.numero, c.numero),
    complemento = coalesce(excluded.complemento, c.complemento), bairro = coalesce(excluded.bairro, c.bairro),
    cidade = coalesce(excluded.cidade, c.cidade), uf = coalesce(excluded.uf, c.uf), cep = coalesce(excluded.cep, c.cep),
    valor = coalesce(excluded.valor, c.valor), descricao = coalesce(excluded.descricao, c.descricao),
    ctribnac = coalesce(excluded.ctribnac, c.ctribnac), cnbs = coalesce(excluded.cnbs, c.cnbs),
    boleto = coalesce(excluded.boleto, c.boleto), iss_retido = coalesce(excluded.iss_retido, c.iss_retido),
    inicio_cobranca = coalesce(excluded.inicio_cobranca, c.inicio_cobranca), meses_contrato = coalesce(excluded.meses_contrato, c.meses_contrato),
    ativo = true, atualizado_em = now();
end;
$$;

create function public.fat_registrar_emissao(p_id text, p_mes text, p_nf text, p_valor_boleto text, p_payment_id text, p_origem text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_mes !~ '^\d{4}-\d{2}$' then raise exception 'mês inválido'; end if;
  perform set_config('mgb.origem', p_origem, true);
  update public.fat_clientes set
    planilha_ultimo_mes = p_mes,
    planilha_nf = coalesce(nullif(p_nf, ''), case when planilha_ultimo_mes = p_mes then planilha_nf end),
    planilha_valor_boleto = coalesce(case when p_valor_boleto ~ '^-?\d+(\.\d+)?$' then p_valor_boleto::numeric end,
                                     case when planilha_ultimo_mes = p_mes then planilha_valor_boleto end),
    planilha_payment_id = coalesce(nullif(p_payment_id, ''), case when planilha_ultimo_mes = p_mes then planilha_payment_id end),
    -- competência nova: o status de pagamento do mês anterior não vale mais
    planilha_status_pagamento = case when planilha_ultimo_mes = p_mes then planilha_status_pagamento end,
    planilha_status_pagamento_em = case when planilha_ultimo_mes = p_mes then planilha_status_pagamento_em end,
    atualizado_em = now()
  where id = p_id;
  return found;
end;
$$;

create function public.fat_registrar_pagamento(p_payment_id text, p_status text, p_origem text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  if coalesce(p_payment_id, '') = '' then return 0; end if;
  perform set_config('mgb.origem', p_origem, true);
  update public.fat_clientes
     set planilha_status_pagamento = p_status,
         planilha_status_pagamento_em = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS'),
         atualizado_em = now()
   where planilha_payment_id = p_payment_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.fat_registrar_inclusao(jsonb, text) from public, anon, authenticated;
revoke all on function public.fat_registrar_emissao(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.fat_registrar_pagamento(text, text, text) from public, anon, authenticated;
grant execute on function public.fat_registrar_inclusao(jsonb, text) to service_role;
grant execute on function public.fat_registrar_emissao(text, text, text, text, text, text) to service_role;
grant execute on function public.fat_registrar_pagamento(text, text, text) to service_role;
