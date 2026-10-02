-- =============================================================================
-- MIGRAÇÃO: modelo de contas a pagar e a receber (outubro/2026)
--
-- Rode UMA vez no SQL Editor do Supabase, no projeto que já está em uso.
-- (Pode rodar de novo sem erro, mas não precisa.)
--
-- O que ela faz:
--   1. APAGA as tabelas antigas "transacoes" e "contas_programadas"
--      (os lançamentos de teste da versão anterior). Isso não tem volta.
--   2. MANTÉM suas categorias e formas de pagamento.
--   3. Dá um tipo pra cada forma de pagamento, pelo nome:
--        nome com "crédito"/"credito" -> cartão
--        nome com "boleto"            -> a prazo
--        o resto                      -> na hora (pix, débito, dinheiro...)
--      Dá pra mudar depois em Cadastros.
--   4. Cria "Pix no crédito" (cartão) e "Boleto" (a prazo) pra quem não tem.
--   5. Cria as tabelas novas: cartões, lançamentos e parcelas, com as
--      mesmas regras de segurança (RLS, visitante sem acesso).
-- =============================================================================

-- 1. Tabelas antigas (dados de teste) ------------------------------------------
drop table if exists public.transacoes cascade;
drop table if exists public.contas_programadas cascade;

-- 2/3. Ajustes nas tabelas que continuam -------------------------------------
alter table public.formas_pagamento
    add column if not exists tipo text not null default 'imediata'
    check (tipo in ('imediata', 'cartao', 'prazo'));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'categorias_id_user_id_key') then
    alter table public.categorias add constraint categorias_id_user_id_key unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'formas_pagamento_id_user_id_key') then
    alter table public.formas_pagamento add constraint formas_pagamento_id_user_id_key unique (id, user_id);
  end if;
end $$;

update public.formas_pagamento set tipo = 'cartao'
 where tipo = 'imediata' and (nome ilike '%crédito%' or nome ilike '%credito%');
update public.formas_pagamento set tipo = 'prazo'
 where tipo = 'imediata' and nome ilike '%boleto%';

-- 4. Formas novas pra cada usuário que já usa o app -------------------------
insert into public.formas_pagamento (user_id, nome, tipo)
select distinct f.user_id, novo.nome, novo.tipo
  from public.formas_pagamento f
 cross join (values ('Pix no crédito', 'cartao'), ('Boleto', 'prazo')) as novo(nome, tipo)
on conflict (user_id, nome) do nothing;

-- 5. Tabelas novas e segurança (mesmo conteúdo do schema.sql) ---------------
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

-- -----------------------------------------------------------------------------
-- Row Level Security: cada um só enxerga e mexe no que é seu
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categorias', 'formas_pagamento', 'cartoes', 'lancamentos', 'parcelas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format('create policy "dono" on public.%I for all to authenticated
                      using (user_id = (select auth.uid()))
                      with check (user_id = (select auth.uid()))', t);
    -- Visitante sem login: nenhuma permissão, mesmo se o RLS for desligado.
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;
