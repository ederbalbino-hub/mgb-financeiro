-- Segredo do agendamento do espelho: gerado aqui, guardado no Vault, nunca sai do banco.
-- O pg_cron manda no cabeçalho; a Edge Function confere chamando espelho_segredo_ok().
create extension if not exists pg_net;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'espelho_faturamento_segredo',
                           'Cabeçalho x-espelho-segredo do pg_cron para a Edge Function espelho-faturamento');

create function public.espelho_segredo_ok(p_segredo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_segredo, '') <> '' and p_segredo = (
    select decrypted_secret from vault.decrypted_secrets where name = 'espelho_faturamento_segredo' limit 1
  );
$$;
revoke all on function public.espelho_segredo_ok(text) from public, anon, authenticated;
grant execute on function public.espelho_segredo_ok(text) to service_role;
