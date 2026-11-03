-- =============================================================================
-- MIGRAÇÃO: o "alô" passa a GRAVAR no banco (novembro/2026)
--
-- Rode UMA vez no SQL Editor do Supabase (cole o conteúdo inteiro e clique em
-- Run). Não apaga nada seu.
--
-- Só ler o banco não bastou: o Supabase pausou o projeto mesmo com a tarefa
-- rodando. Agora a tarefa do GitHub grava todo dia a data e a hora numa tabela
-- de uma linha só (sempre a mesma, então não junta lixo).
--
-- Segurança: a chave pública (anon) só enxerga esta tabelinha, e só a linha 1.
-- Não dá pra criar outras linhas nem apagar, e as suas tabelas continuam
-- fechadas pra quem não está logado.
-- =============================================================================

create table if not exists public.manter_ligado (
    id  int primary key check (id = 1),
    em  timestamptz not null default now()
);

alter table public.manter_ligado enable row level security;
drop policy if exists "manter ligado" on public.manter_ligado;
create policy "manter ligado" on public.manter_ligado for all to anon
    using (id = 1) with check (id = 1);

revoke all on table public.manter_ligado from anon, authenticated;
grant select, insert, update on table public.manter_ligado to anon;

insert into public.manter_ligado (id) values (1)
    on conflict (id) do update set em = now();

-- A função antiga, que só lia, não é mais usada.
drop function if exists public.manter_ativo();
