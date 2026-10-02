-- =============================================================================
-- MIGRAÇÃO: saldo em conta (outubro/2026)
--
-- Rode UMA vez no SQL Editor do Supabase. Não apaga nada: só cria a tabela
-- "saldo" com as mesmas regras de segurança das outras tabelas.
-- =============================================================================

-- --------------------------------- Saldo ------------------------------------
-- Saldo em conta: saldo_inicial na data saldo_desde. O saldo atual é esse valor
-- mais as baixas de "a receber" menos as baixas de "a pagar" (pela data da
-- baixa) a partir dessa data.
create table if not exists public.saldo (
    user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
    saldo_inicial  numeric(12, 2) not null check (saldo_inicial > -100000000 and saldo_inicial < 100000000),
    saldo_desde    date not null,
    updated_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Row Level Security: cada um só enxerga e mexe no que é seu.
-- O papel "anon" (visitante sem login) não tem permissão nenhuma, mesmo se
-- o RLS for desligado por engano.
-- -----------------------------------------------------------------------------
alter table public.saldo enable row level security;
drop policy if exists "dono" on public.saldo;
create policy "dono" on public.saldo for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on table public.saldo from anon;
grant select, insert, update, delete on table public.saldo to authenticated;
