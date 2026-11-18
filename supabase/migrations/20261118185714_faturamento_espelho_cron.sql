-- De hora em hora (minuto 23): busca a planilha do Faturamento e atualiza fat_clientes.
create function public.disparar_espelho_faturamento()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://wvatjibxyhhbotayabig.supabase.co/functions/v1/espelho-faturamento',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-espelho-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'espelho_faturamento_segredo' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;
revoke all on function public.disparar_espelho_faturamento() from public, anon, authenticated;

select cron.schedule('espelho-faturamento', '23 * * * *', 'select public.disparar_espelho_faturamento()');
select public.disparar_espelho_faturamento();
