-- =============================================================================
-- Controle Financeiro Pessoal - schema do banco (Supabase / Postgres)
--
-- Como usar: no painel do Supabase, abra "SQL Editor", cole TODO este arquivo
-- e clique em "Run". Pode rodar de novo sem medo: ele não apaga dados.
--
-- Segurança: toda tabela tem a coluna user_id e Row Level Security (RLS)
-- ligada. Cada usuário logado só consegue ler/gravar as PRÓPRIAS linhas.
-- Isso é o que protege seus dados, já que a chave "anon" fica visível no
-- código do site (isso é normal e esperado no Supabase).
-- =============================================================================

create table if not exists public.categorias (
    id          bigint generated always as identity primary key,
    user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
    nome        text not null check (char_length(nome) between 1 and 60),
    tipo        text not null check (tipo in ('receita', 'despesa')),
    created_at  timestamptz not null default now(),
    unique (user_id, nome)
);

create table if not exists public.formas_pagamento (
    id          bigint generated always as identity primary key,
    user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
    nome        text not null check (char_length(nome) between 1 and 60),
    created_at  timestamptz not null default now(),
    unique (user_id, nome)
);

create table if not exists public.transacoes (
    id                  bigint generated always as identity primary key,
    user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
    data                date not null,
    tipo                text not null check (tipo in ('receita', 'despesa')),
    valor               numeric(12, 2) not null check (valor > 0 and valor < 10000000),
    descricao           text not null default '' check (char_length(descricao) <= 200),
    origem_destino      text not null default '' check (char_length(origem_destino) <= 200),
    categoria_id        bigint not null references public.categorias(id),
    forma_pagamento_id  bigint not null references public.formas_pagamento(id),
    parcela_atual       integer not null default 1 check (parcela_atual >= 1),
    total_parcelas      integer not null default 1 check (total_parcelas between 1 and 48),
    -- parcelas 2..N apontam para a parcela 1; apagar a 1 apaga todas
    transacao_pai_id    bigint references public.transacoes(id) on delete cascade,
    -- normal | credito_informativo | pagamento_fatura (ver README)
    natureza            text not null default 'normal'
                        check (natureza in ('normal', 'credito_informativo', 'pagamento_fatura')),
    created_at          timestamptz not null default now()
);

create table if not exists public.contas_programadas (
    id                  bigint generated always as identity primary key,
    user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
    descricao           text not null check (char_length(descricao) between 1 and 200),
    valor               numeric(12, 2) not null check (valor > 0 and valor < 10000000),
    tipo                text not null check (tipo in ('receita', 'despesa')),
    categoria_id        bigint not null references public.categorias(id),
    forma_pagamento_id  bigint not null references public.formas_pagamento(id),
    proxima_vencimento  date not null,
    recorrente          boolean not null default false,
    ativa               boolean not null default true,
    created_at          timestamptz not null default now()
);

create index if not exists transacoes_user_data_idx on public.transacoes (user_id, data);
create index if not exists transacoes_pai_idx on public.transacoes (transacao_pai_id);
create index if not exists contas_user_venc_idx on public.contas_programadas (user_id, proxima_vencimento);

-- -----------------------------------------------------------------------------
-- Row Level Security: cada um só enxerga e mexe no que é seu
-- -----------------------------------------------------------------------------
alter table public.categorias          enable row level security;
alter table public.formas_pagamento    enable row level security;
alter table public.transacoes          enable row level security;
alter table public.contas_programadas  enable row level security;

drop policy if exists "dono" on public.categorias;
create policy "dono" on public.categorias
    for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

drop policy if exists "dono" on public.formas_pagamento;
create policy "dono" on public.formas_pagamento
    for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

drop policy if exists "dono" on public.transacoes;
create policy "dono" on public.transacoes
    for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

drop policy if exists "dono" on public.contas_programadas;
create policy "dono" on public.contas_programadas
    for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Defesa extra: o papel "anon" (visitante sem login) não tem permissão NENHUMA
-- nessas tabelas. Assim, mesmo se um dia o RLS for desligado por engano, quem
-- não estiver logado continua sem conseguir ler ou gravar nada.
-- -----------------------------------------------------------------------------
revoke all on table public.categorias, public.formas_pagamento,
                    public.transacoes, public.contas_programadas from anon;
grant select, insert, update, delete on table public.categorias, public.formas_pagamento,
                    public.transacoes, public.contas_programadas to authenticated;
