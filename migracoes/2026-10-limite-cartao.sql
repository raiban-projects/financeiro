-- =============================================================================
-- MIGRAÇÃO: limite do cartão (outubro/2026)
--
-- Rode UMA vez no SQL Editor do Supabase. Não apaga nada: só acrescenta a
-- coluna "limite" (opcional) na tabela de cartões. As regras de segurança da
-- tabela continuam as mesmas.
-- =============================================================================

alter table public.cartoes
    add column if not exists limite numeric(12, 2)
    check (limite > 0 and limite < 10000000);
