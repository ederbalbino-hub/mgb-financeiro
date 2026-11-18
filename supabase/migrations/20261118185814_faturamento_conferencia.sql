-- Conferência hub × planilha. Cada linha é uma divergência a olhar.
-- A planilha só guarda o ÚLTIMO mês faturado de cada cliente, então a comparação é feita nesse mês.
--   gravidade 'erro'    = número de nota ou boleto diferente: um dos lados está errado
--   gravidade 'atencao' = falta registro de um lado (ex.: emitiu no hub e a planilha não foi marcada)
--   gravidade 'info'    = esperado, só para saber (ex.: loja cadastrada só no hub)
create view public.fat_conferencia
with (security_invoker = true) as
with hub as (select * from public.fat_emissoes),
pla as (select * from public.fat_clientes where ativo)
-- 1) mesma competência, nota diferente
select 'erro'::text as gravidade, 'nota diferente'::text as tipo, p.id as cliente_id, p.cliente, h.competencia,
       format('hub: NF %s · planilha: NF %s', coalesce(h.nf_numero, '—'), coalesce(p.planilha_nf, '—')) as detalhe
from pla p join hub h on h.cliente_id = p.id and h.competencia = p.planilha_ultimo_mes
where coalesce(h.nf_numero, '') <> '' and coalesce(p.planilha_nf, '') <> '' and h.nf_numero <> p.planilha_nf
union all
-- 2) mesma competência, boleto (payment) diferente
select 'erro', 'boleto diferente', p.id, p.cliente, h.competencia,
       format('hub: %s · planilha: %s', coalesce(h.payment_id, '—'), coalesce(p.planilha_payment_id, '—'))
from pla p join hub h on h.cliente_id = p.id and h.competencia = p.planilha_ultimo_mes
where coalesce(h.payment_id, '') <> '' and coalesce(p.planilha_payment_id, '') <> '' and h.payment_id <> p.planilha_payment_id
union all
-- 3) planilha diz que faturou no mês, mas o hub não tem a emissão
select 'atencao', 'faturado na planilha, sem registro no hub', p.id, p.cliente, p.planilha_ultimo_mes,
       format('planilha: NF %s, boleto %s', coalesce(p.planilha_nf, '—'), coalesce(p.planilha_payment_id, '—'))
from pla p
where p.planilha_ultimo_mes >= '2026-10'   -- o histórico do hub começa em outubro/2026
  and not exists (select 1 from hub h where h.cliente_id = p.id and h.competencia = p.planilha_ultimo_mes)
union all
-- 4) hub emitiu num mês mais novo do que a planilha registra
select 'atencao', 'emitido no hub, planilha não atualizada', p.id, p.cliente, h.competencia,
       format('hub: %s em %s · planilha parada em %s', coalesce(h.status, '—'), h.competencia, coalesce(p.planilha_ultimo_mes, 'nunca'))
from pla p join hub h on h.cliente_id = p.id
where h.competencia > coalesce(p.planilha_ultimo_mes, '0000-00')
  and h.competencia = (select max(h2.competencia) from hub h2 where h2.cliente_id = p.id)
union all
-- 5) emissão no hub de cliente que não está ativo na planilha
select 'info', 'emissão de cliente fora da planilha', h.cliente_id, coalesce(h.cliente_nome, h.cliente_id), h.competencia,
       'cliente só no hub (ex.: loja cadastrada direto no hub) ou inativo na planilha'
from hub h
where not exists (select 1 from pla p where p.id = h.cliente_id);

revoke all on public.fat_conferencia from public, anon, authenticated;
grant select on public.fat_conferencia to service_role;
