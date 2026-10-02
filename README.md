# Caderneta — controle financeiro pessoal (versão web)

App web (HTML + JavaScript puro) com banco no **Supabase** e hospedagem grátis no
**GitHub Pages**. Funciona no PC e no celular, e dá pra instalar no celular como
se fosse um aplicativo.

## Arquivos

| Arquivo | Pra que serve |
|---|---|
| `index.html` | A estrutura das telas |
| `style.css` | O visual (celular e PC, tema claro e escuro) |
| `app.js` | Toda a lógica do app |
| `config.js` | **Onde você cola a URL e a chave do seu Supabase** |
| `schema.sql` | Cria as tabelas no Supabase (roda uma vez só) |
| `manifest.json` + `icons/` | Permitem instalar o app na tela inicial do celular |
| `vendor/` | Cópias oficiais das bibliotecas Supabase e Chart.js (o site não carrega scripts de fora) |

---

## Passo 0 — Proteja suas contas (antes de tudo)

Ative a **verificação em duas etapas (2FA)** no GitHub (*Settings → Password and
authentication*) e no Supabase (*Account → Security*, ou use o login do GitHub
já protegido). Quem entra na sua conta do Supabase vê tudo; essa é a porta
principal a trancar.

## Passo 1 — Criar o projeto no Supabase

1. Entre em [supabase.com](https://supabase.com) e crie uma conta (pode usar o login do GitHub).
2. Clique em **New project**. Dê um nome (ex.: `caderneta`), crie uma senha do
   banco (guarde, mas o app não usa ela) e escolha a região **South America (São Paulo)**.
3. Espere uns 2 minutos até o projeto ficar pronto.

## Passo 2 — Criar as tabelas

1. No menu lateral do projeto, abra **SQL Editor**.
2. Clique em **New query**, cole **todo** o conteúdo do `schema.sql` e clique em **Run**.
3. Deve aparecer "Success. No rows returned". Pronto, o banco está criado (zerado).

Se rodar de novo por engano, não tem problema: o script não apaga nada.

## Passo 3 — Criar o seu login

1. No menu lateral, vá em **Authentication → Users**.
2. Clique em **Add user → Create new user**, coloque seu e-mail e uma senha, e
   marque **Auto Confirm User**. Use uma senha **que você não usa em nenhum outro
   lugar** (um gerenciador de senhas ajuda).
3. **Feche o cadastro público** (importante, já que o site vai ficar na internet):
   em **Authentication**, procure as configurações de cadastro (*Sign In / Providers*
   ou *General configuration*, conforme a versão do painel) e desligue a opção
   **Allow new users to sign up**. Assim só você consegue entrar.

Na primeira vez que você entrar no app, ele cria sozinho as categorias e formas de
pagamento padrão (Restaurante, Jogos, Pix, Crédito...).

## Passo 4 — Ligar o app ao seu banco

1. No Supabase, abra **Project Settings → API** (ou o botão **Connect** no topo).
2. Copie a **Project URL** e a chave **anon public** (em painéis mais novos ela
   pode se chamar **publishable key**, começando com `sb_publishable_`; serve igual).
3. Abra o `config.js` num editor de texto (Bloco de Notas serve) e cole os dois
   valores no lugar de `SEU-PROJETO` e `COLE-AQUI-A-ANON-KEY`.

> Nunca use a chave **service_role** (ou *secret key*) no `config.js`. Ela ignora
> todas as proteções.

## Passo 5 — Publicar no GitHub Pages

1. No [GitHub](https://github.com), clique em **New repository**. Nome sugerido:
   `caderneta`. Deixe **Public** (o GitHub Pages grátis exige repositório público;
   veja "Segurança" abaixo, seus dados não ficam expostos).
2. No repositório novo, clique em **Add file → Upload files** e arraste todos os
   arquivos e as pastas `icons` e `vendor`. Clique em **Commit changes**.
3. Vá em **Settings → Pages**. Em *Build and deployment*, escolha **Deploy from a
   branch**, branch **main**, pasta **/ (root)** e salve.
4. Em 1 ou 2 minutos o site fica no ar em
   `https://SEU-USUARIO.github.io/caderneta/`.

Pra atualizar o app no futuro, é só subir os arquivos novos do mesmo jeito
(Upload files substitui os antigos).

## Passo 6 — Instalar no celular

- **Android (Chrome):** abra o site, toque no menu ⋮ e em **Instalar app** ou
  **Adicionar à tela inicial**.
- **iPhone (Safari):** abra o site, toque em **Compartilhar** e em
  **Adicionar à Tela de Início**.

Ele abre em tela cheia com o ícone "R$", como um app normal. O login fica salvo,
então não precisa digitar a senha toda vez.

---

## Segurança

### O que protege seus dados

- **Login obrigatório.** Sem entrar com e-mail e senha, o banco não entrega nada.
- **Row Level Security (RLS)** em todas as tabelas: cada usuário só lê e altera
  as próprias linhas.
- **Visitante sem permissão nenhuma.** O papel "anon" não tem acesso às tabelas.
  Mesmo se um dia o RLS for desligado por engano, quem não está logado continua
  barrado.
- **Cadastro público desligado** (Passo 3): ninguém além de você cria conta.
- **Senha guardada como hash (bcrypt) pelo Supabase.** Ela não fica no código,
  nem no GitHub, nem nas tabelas; nem você consegue vê-la no painel.
- **Política de segurança na página (CSP).** O site só executa scripts dele
  mesmo e só conversa com o Supabase. Script injetado, script de outro site ou
  envio de dados pra fora são bloqueados pelo navegador.
- **Sem bibliotecas de fora.** Supabase e Chart.js estão na pasta `vendor/`,
  copiadas do pacote oficial do npm (assinatura conferida).
- **Texto digitado nunca vira código.** Uma descrição com código malicioso
  aparece na tela como texto comum.
- **Limites no banco:** textos de até 200 caracteres, valores até 10 milhões,
  no máximo 48 parcelas.

Tudo isso foi testado antes da entrega: num Postgres simulando o Supabase (outro
usuário, visitante sem login, RLS desligado por engano, gravação em nome de
outra pessoa) e no navegador (biblioteca real sob a política de segurança,
tentativa de XSS, script externo injetado, envio de dados pra outro site).

### O que é público e por que não tem problema

- **O código no GitHub.** Ele não tem nenhum segredo, só a URL do projeto e a
  chave anon/publishable.
- **A chave anon/publishable.** Ela foi feita pra ficar pública: sozinha, só
  permite falar com o banco como "visitante", e visitante não tem acesso a nada.

> Nunca coloque a chave **service_role** (*secret key*) no `config.js` nem no
> GitHub. Ela ignora todas as proteções.

### O que fica nas suas mãos

1. 2FA no GitHub e no Supabase (Passo 0).
2. Senha exclusiva pro app (Passo 3).
3. Cadastro público desligado (Passo 3).
4. Não guardar número de cartão, CPF ou senhas nas descrições.
5. Tela do celular bloqueada, já que o login fica salvo no app.

### Confira você mesmo (depois de publicar)

1. No painel do Supabase, abra **Advisors → Security Advisor**. Não deve aparecer
   nenhum alerta sobre as tabelas `categorias`, `formas_pagamento`, `transacoes`
   ou `contas_programadas`.
2. Abra o seu site numa **aba anônima** (sem login), aperte **F12**, vá em
   **Console** e cole o código abaixo, trocando a URL e a chave pelas suas (o
   Chrome pode pedir pra você digitar `allow pasting` antes):

```js
const URL = "https://SEU-PROJETO.supabase.co", KEY = "SUA-ANON-KEY";
fetch(`${URL}/rest/v1/transacoes?select=*`, { headers: { apikey: KEY } })
  .then(r => r.json()).then(r => console.log("Leitura sem login:", r));
fetch(`${URL}/auth/v1/signup`, { method: "POST",
  headers: { apikey: KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "teste@exemplo.com", password: "SenhaTeste123!" }) })
  .then(r => r.json()).then(r => console.log("Cadastro:", r));
```

O resultado certo é: a leitura sem login volta com **erro de permissão** (ou uma
lista vazia `[]`), e o cadastro volta com erro dizendo que **novos cadastros não
são permitidos**. Se aparecer algum lançamento seu, ou o cadastro funcionar,
algo ficou errado: revise os passos 2 e 3.

## Plano gratuito do Supabase

No plano grátis, o Supabase pausa projetos com pouca atividade ao longo de 7 dias.
Usando o app no dia a dia isso não acontece; se acontecer, é só entrar no painel
do Supabase, abrir o projeto e clicar em **Resume** (dá pra retomar em até 1 ano,
e os dados continuam lá).

---

## Como o app funciona

- **Lançar:** valor grande no topo, Despesa/Receita, data (já vem com hoje),
  categoria, forma de pagamento, descrição e onde gastou. Compra parcelada divide
  o valor e cria uma parcela por mês (os centavos que sobram vão na 1ª parcela,
  então a soma sempre bate). Embaixo aparecem os últimos lançamentos.
- **Contas:** contas a pagar e a receber com vencimento. Vermelho = vencida,
  amarelo = vence em até 5 dias. O ícone no menu mostra quantas precisam de
  atenção. Ao tocar em **Pagar**, você confirma valor, data e forma de pagamento,
  e o lançamento é criado sozinho. Contas "todo mês" já pulam pro mês seguinte.
- **Extrato:** lançamentos do mês agrupados por dia, com setas pra trocar de mês.
  Toque em qualquer lançamento pra editar ou excluir. Exporta CSV.
- **Relatórios:** por mês ou ano, quanto foi pra cada categoria (com %) e um
  gráfico de receitas e despesas mês a mês. Exporta CSV.
- **Cadastros:** categorias e formas de pagamento. Não deixa remover algo que já
  tem lançamento (pra nenhum lançamento ficar sem categoria).

### Fatura do cartão (sem duplicar gastos)

Todo lançamento tem o campo **"Este lançamento é"**:

- **Normal:** conta na categoria e no total do mês (débito, pix, dinheiro).
- **Compra no crédito:** conta só na categoria (pra saber onde gastou), mas não
  no total do mês. Escolher "Crédito" como forma de pagamento já marca essa opção.
- **Pagamento de fatura:** o valor da fatura paga. Conta no total do mês (é o
  dinheiro que saiu de fato), mas não entra na conta por categoria.

### CSV

Separador `;`, vírgula decimal e acentos corretos, pra abrir direto no Excel ou
no LibreOffice Calc (que é grátis, caso você não tenha o Office em casa).
