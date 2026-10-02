-- =============================================================================
-- Controle Financeiro - schema completo do banco (Supabase / Postgres)
--
-- PARA UM PROJETO NOVO (banco vazio). Se você já usa o app, NÃO rode este
-- arquivo: rode o arquivo da pasta "migracoes" indicado no PR/README.
--
-- Como usar: no painel do Supabase, abra "SQL Editor", cole TODO este arquivo
-- e clique em "Run". Pode rodar de novo sem medo: ele não apaga dados.
--
-- Segurança:
--  - Toda tabela tem user_id e Row Level Security (RLS): cada usuário logado
--    só lê e grava as PRÓPRIAS linhas.
--  - Os vínculos entre tabelas incluem o user_id: um lançamento só pode usar
--    categoria, forma de pagamento e cartão do MESMO dono.
--  - O papel "anon" (visitante sem login) não tem permissão nenhuma.
-- =============================================================================

-- ------------------------------- Cadastros ----------------------------------
create table if not exists public.categorias (
    id          bigint generated always as identity primary key,
    user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
    nome        text not null check (char_length(nome) between 1 and 60),
    tipo        text not null check (tipo in ('receita', 'despesa')),
    created_at  timestamptz not null default now(),
    unique (user_id, nome),
    unique (id, user_id)
);

create table if not exists public.formas_pagamento (
    id          bigint generated always as identity primary key,
    user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
    nome        text not null check (char_length(nome) between 1 and 60),
    -- imediata: pago na hora (Pix, débito...)  -> à vista já entra baixado
    -- cartao:   vai pra fatura de um cartão    (Crédito, Pix no crédito)
    -- prazo:    fica em aberto até a baixa     (Boleto...)
    tipo        text not null default 'imediata' check (tipo in ('imediata', 'cartao', 'prazo')),
    created_at  timestamptz not null default now(),
    unique (user_id, nome),
    unique (id, user_id)
);

create table if not exists public.cartoes (
    id              bigint generated always as identity primary key,
    user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
    nome            text not null check (char_length(nome) between 1 and 60),
    dia_fechamento  smallint not null check (dia_fechamento between 1 and 31),
    dia_vencimento  smallint not null check (dia_vencimento between 1 and 31),
    -- opcional: pra mostrar quanto do limite está usado e quanto sobra
    limite          numeric(12, 2) check (limite > 0 and limite < 10000000),
    created_at      timestamptz not null default now(),
    unique (user_id, nome),
    unique (id, user_id)
);

-- ------------------------------ Lançamentos ---------------------------------
-- Um lançamento é a "conta" (a pagar ou a receber). Ele gera uma ou mais
-- parcelas, e cada parcela tem seu vencimento e sua baixa.
create table if not exists public.lancamentos (
    id                  bigint generated always as identity primary key,
    user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
    tipo                text not null check (tipo in ('receita', 'despesa')),
    descricao           text not null default '' check (char_length(descricao) <= 200),
    pessoa              text not null default '' check (char_length(pessoa) <= 200),
    observacao          text not null default '' check (char_length(observacao) <= 1000),
    categoria_id        bigint not null,
    forma_pagamento_id  bigint not null,
    cartao_id           bigint,
    data_lancamento     date not null default current_date,
    -- cartão: data da compra; demais: 1º vencimento
    data_base           date not null,
    condicao            text not null check (condicao in ('avista', 'parcelado', 'fixo')),
    total_parcelas      integer check (total_parcelas between 1 and 120),
    valor               numeric(12, 2) not null check (valor > 0 and valor < 10000000),
    valor_modo          text not null default 'total' check (valor_modo in ('total', 'parcela')),
    intervalo           text not null default 'mensal' check (intervalo in ('mensal', 'dias')),
    intervalo_dias      integer check (intervalo_dias between 1 and 365),
    -- fixo: false = encerrado (não gera mais parcelas)
    ativo               boolean not null default true,
    qtd_gerada          integer not null default 0,
    created_at          timestamptz not null default now(),
    unique (id, user_id),
    foreign key (categoria_id, user_id) references public.categorias (id, user_id),
    foreign key (forma_pagamento_id, user_id) references public.formas_pagamento (id, user_id),
    foreign key (cartao_id, user_id) references public.cartoes (id, user_id)
);

create table if not exists public.parcelas (
    id              bigint generated always as identity primary key,
    user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
    lancamento_id   bigint not null,
    numero          integer not null check (numero >= 1),
    vencimento      date not null,
    valor           numeric(12, 2) not null check (valor > 0 and valor < 10000000),
    -- cópia do cartão do lançamento: agrupa as parcelas em faturas
    cartao_id       bigint,
    baixado         boolean not null default false,
    data_baixa      date,
    valor_baixa     numeric(12, 2) check (valor_baixa > 0 and valor_baixa < 10000000),
    forma_baixa_id  bigint,
    created_at      timestamptz not null default now(),
    unique (lancamento_id, numero),
    foreign key (lancamento_id, user_id) references public.lancamentos (id, user_id) on delete cascade,
    foreign key (cartao_id, user_id) references public.cartoes (id, user_id),
    foreign key (forma_baixa_id, user_id) references public.formas_pagamento (id, user_id),
    check (baixado = (data_baixa is not null))
);

create index if not exists lancamentos_user_idx on public.lancamentos (user_id, created_at);
create index if not exists parcelas_user_venc_idx on public.parcelas (user_id, vencimento);
create index if not exists parcelas_abertas_idx on public.parcelas (user_id, baixado, vencimento);
create index if not exists parcelas_fatura_idx on public.parcelas (cartao_id, vencimento);

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
alter table public.categorias enable row level security;
drop policy if exists "dono" on public.categorias;
create policy "dono" on public.categorias for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on table public.categorias from anon;
grant select, insert, update, delete on table public.categorias to authenticated;

alter table public.formas_pagamento enable row level security;
drop policy if exists "dono" on public.formas_pagamento;
create policy "dono" on public.formas_pagamento for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on table public.formas_pagamento from anon;
grant select, insert, update, delete on table public.formas_pagamento to authenticated;

alter table public.cartoes enable row level security;
drop policy if exists "dono" on public.cartoes;
create policy "dono" on public.cartoes for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on table public.cartoes from anon;
grant select, insert, update, delete on table public.cartoes to authenticated;

alter table public.lancamentos enable row level security;
drop policy if exists "dono" on public.lancamentos;
create policy "dono" on public.lancamentos for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on table public.lancamentos from anon;
grant select, insert, update, delete on table public.lancamentos to authenticated;

alter table public.parcelas enable row level security;
drop policy if exists "dono" on public.parcelas;
create policy "dono" on public.parcelas for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on table public.parcelas from anon;
grant select, insert, update, delete on table public.parcelas to authenticated;

alter table public.saldo enable row level security;
drop policy if exists "dono" on public.saldo;
create policy "dono" on public.saldo for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on table public.saldo from anon;
grant select, insert, update, delete on table public.saldo to authenticated;
