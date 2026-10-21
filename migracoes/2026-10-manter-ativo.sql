-- =============================================================================
-- MIGRAÇÃO: "alô" pro banco não pausar (outubro/2026)
--
-- Rode UMA vez no SQL Editor do Supabase. Não apaga nada.
--
-- No plano grátis, o Supabase pausa o projeto depois de 7 dias sem uso. Uma
-- tarefa agendada no GitHub chama esta função a cada 3 dias pra manter o banco
-- ativo. Ela só devolve a data e hora do servidor: não lê nem grava nenhum dado
-- seu, e as tabelas continuam fechadas pra quem não está logado.
-- =============================================================================

create or replace function public.manter_ativo()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$ select now() $$;

revoke all on function public.manter_ativo() from public;
grant execute on function public.manter_ativo() to anon, authenticated;
