# Controle Financeiro (versão web)

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
| `schema.sql` | Cria as tabelas num projeto Supabase **novo** (roda uma vez só) |
| `migracoes/` | Atualizações do banco pra quem já usa o app (veja "Atualizar o banco") |
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
2. Clique em **New project**. Dê um nome (ex.: `financeiro`), crie uma senha do
   banco (guarde, mas o app não usa ela) e escolha a região **South America (São Paulo)**.
3. Espere uns 2 minutos até o projeto ficar pronto.

## Passo 2 — Criar as tabelas

Projeto novo, sem nada ainda: use o `schema.sql`. (Se você já usa o app, veja
"Atualizar o banco" mais abaixo.)

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
   `financeiro`. Deixe **Public** (o GitHub Pages grátis exige repositório público;
   veja "Segurança" abaixo, seus dados não ficam expostos).
2. No repositório novo, clique em **Add file → Upload files** e arraste todos os
   arquivos e as pastas `icons` e `vendor`. Clique em **Commit changes**.
3. Vá em **Settings → Pages**. Em *Build and deployment*, escolha **Deploy from a
   branch**, branch **main**, pasta **/ (root)** e salve.
4. Em 1 ou 2 minutos o site fica no ar em
   `https://SEU-USUARIO.github.io/financeiro/`.

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
  no máximo 120 parcelas.
- **Vínculos por dono:** um lançamento só aceita categoria, forma de pagamento e
  cartão do mesmo usuário. Ninguém consegue usar nem mexer nos cadastros do outro.

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

### Trocar a senha

Em **Cadastros → Sua conta → Trocar senha**. O app pede a senha atual (pra que
ninguém troque num aparelho que ficou aberto), e a nova precisa ter pelo menos 8
caracteres.

Quem **esqueceu** a senha não consegue trocar por ali, e o painel do Supabase
não tem botão pra definir uma senha. O jeito é rodar isto no **SQL Editor**,
trocando a senha e o e-mail:

```sql
update auth.users
set encrypted_password = crypt('SENHA-NOVA-AQUI', gen_salt('bf'))
where email = 'email@da-pessoa.com';
```

Depois, entre no app e troque de novo por uma senha definitiva. **Não apague o
usuário pra criar outro:** os lançamentos dele seriam apagados junto.

### O que fica nas suas mãos

1. 2FA no GitHub e no Supabase (Passo 0).
2. Senha exclusiva pro app (Passo 3).
3. Cadastro público desligado (Passo 3).
4. Não guardar número de cartão, CPF ou senhas nas descrições.
5. Tela do celular bloqueada, já que o login fica salvo no app.

### Confira você mesmo (depois de publicar)

1. No painel do Supabase, abra **Advisors → Security Advisor**. Não deve aparecer
   nenhum alerta sobre as tabelas `categorias`, `formas_pagamento`, `cartoes`,
   `lancamentos` ou `parcelas`.
2. Abra o seu site numa **aba anônima** (sem login), aperte **F12**, vá em
   **Console** e cole o código abaixo, trocando a URL e a chave pelas suas (o
   Chrome pode pedir pra você digitar `allow pasting` antes):

```js
const URL = "https://SEU-PROJETO.supabase.co", KEY = "SUA-ANON-KEY";
fetch(`${URL}/rest/v1/parcelas?select=*`, { headers: { apikey: KEY } })
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

## Atualizar o banco (pra quem já usa o app)

Quando uma versão nova muda a estrutura do banco, ela vem com um arquivo na pasta
`migracoes/`. Rode cada arquivo **uma vez**, na ordem da data do nome, no
**SQL Editor** do Supabase (*New query*, cole o arquivo inteiro, **Run**).

| Arquivo | O que faz |
|---|---|
| `2026-10-contas-a-pagar-receber.sql` | Troca o modelo pra contas a pagar e receber. **Apaga os lançamentos da versão anterior**; mantém categorias e formas de pagamento. |
| `2026-10-saldo.sql` | Cria a tabela do saldo em conta. Não apaga nada. |
| `2026-10-limite-cartao.sql` | Acrescenta o limite (opcional) ao cartão. Não apaga nada. |

Rode a migração **antes** de abrir a versão nova do app.

## Outra pessoa usando (ex.: namorada)

Não precisa reabrir o cadastro público. No Supabase, vá em **Authentication →
Users → Add user → Create new user**, coloque o e-mail dela e uma senha, e marque
**Auto Confirm User**. Ela entra no mesmo site. Cada login tem os próprios
lançamentos, categorias, formas de pagamento e cartões: um não vê nem consegue
usar nada do outro.

Passe a senha inicial pra ela e peça pra trocar em **Cadastros → Sua conta →
Trocar senha**. Assim só ela fica sabendo a senha.

## Plano gratuito do Supabase

No plano grátis, o Supabase pausa projetos com pouca atividade ao longo de 7 dias.
Usando o app no dia a dia isso não acontece; se acontecer, é só entrar no painel
do Supabase, abrir o projeto e clicar em **Resume** (dá pra retomar em até 1 ano,
e os dados continuam lá).

---

## Como o app funciona

O app funciona como um sistema de **contas a pagar e a receber**:

- **Lançamento** é a conta: descrição, categoria, onde/quem, forma de pagamento,
  observação, e se é **à vista**, **parcelado** ou **fixo**.
- Cada lançamento gera **parcelas**, cada uma com seu vencimento.
- **Dar baixa** numa parcela é registrar que pagou ou recebeu (data, valor e
  forma usada). O valor pode ser ajustado na hora, por juros ou desconto; o
  original fica guardado.
- Tudo que não teve baixa fica **em aberto**; o que passou do vencimento fica
  **em atraso**.

### Telas

- **Início:** no topo, o **saldo em conta** (veja abaixo). Depois, o mês em
  forma de planilha: receitas e despesas **realizadas**, o que **falta** e o
  **total previsto**, com o saldo. Depois, a **previsão dos próximos meses**.
  Embaixo: o que está em atraso, o que vence nos próximos 7 dias, a próxima
  fatura de cada cartão e o **limite** de cada um.
- **Lançar:** a pagar ou a receber; à vista, parcelado (valor total ou valor de
  cada parcela) ou fixo; intervalo mensal ou a cada X dias. A caixa azul embaixo
  mostra como vai ficar antes de salvar.
- **Contas:** Pagar, Receber ou Tudo, filtrando por **Em aberto**, **Em atraso**,
  **Pagos/Recebidos** ou **Tudo**. Em **Filtros**: período (um mês ou todos),
  **onde/quem**, **categoria** e **busca** por texto (veja abaixo). Toque num item
  pra dar baixa, desfazer, editar, excluir ou lançar de novo. **Selecionar** dá
  baixa em várias de uma vez. Exporta CSV.
- **Relatórios:** por **mês**, **ano** ou **sempre**, despesas ou receitas, com o
  mesmo filtro de situação; total por categoria e gráfico (mês a mês, ou ano a ano
  no "Sempre"). Exporta CSV.
- **Cadastros:** categorias, cartões (com limite), formas de pagamento, backup e
  sua conta (Trocar senha e Sair).

### Saldo em conta

Na primeira vez, o Início pergunta **quanto você tem na conta hoje**. Daí em
diante:

- Dar baixa num **a receber** soma no saldo; dar baixa num **a pagar** subtrai.
  Vale a data da baixa. Desfazer a baixa desfaz o efeito.
- Compra no **cartão** só mexe no saldo quando você **paga a fatura**.
- O saldo pode ficar **negativo** (aparece em vermelho): é o quanto você passou
  do que tinha.
- **Previsto até o fim do mês:** saldo atual + o que falta receber − o que falta
  pagar até o último dia do mês, incluindo o que está em atraso e a fatura que
  vence no mês. É o número pra não passar do limite.
- **Já comprometido no cartão:** parcelas de faturas dos meses seguintes, que
  ainda vão sair do saldo.
- **Acertar saldo:** se o app não bater com o banco (tarifa, rendimento...),
  informe o saldo real. Nenhum lançamento é alterado.

### Próximos meses

No Início, a tabela **Próximos meses** parte do saldo atual e soma, mês a mês,
tudo que já está lançado em aberto: salário e contas fixas, parcelas e faturas.
A coluna **Fim do mês** é quanto deve sobrar na conta no último dia. O mês atual
inclui o que está em atraso, então a primeira linha é igual ao "Previsto até o
fim do mês". A linha destacada é o **mês mais apertado**; se algum mês fecha
negativo, o aviso em cima fica vermelho. Mostra 6 meses; **Ver 12 meses** abre o
ano todo.

A previsão só enxerga o que está lançado. Gasto do dia a dia que você ainda não
lançou (mercado, gasolina) não entra, então deixe uma folga.

### Baixa em lote

Em **Contas**, toque em **Selecionar** e marque as parcelas (ou **Marcar todas
da lista**, que respeita os filtros). **Dar baixa** pede a data e a forma de
pagamento e baixa todas de uma vez, cada uma com o próprio valor. Faturas de
cartão não entram na seleção: elas se pagam inteiras, tocando na fatura. Se
errar, dá pra desfazer a baixa de cada parcela normalmente.

### Lançar de novo

Pra repetir uma compra parecida, use **Repetir** nos últimos lançamentos (tela
Lançar) ou **Lançar de novo** no detalhe de qualquer conta. O formulário vem
preenchido igual, com a data de hoje; confira o valor e salve. O lançamento
original não muda.

### Filtros e "quem deve a quem"

Em **Contas → Filtros**, escolha **Onde / quem** (ex.: Mãe), **Todos os meses**
e **Tudo** no lado. O resumo mostra, por exemplo, "Mãe te deve R$ 300,00", além
do total em aberto e baixado a receber e a pagar. Também dá pra filtrar por
**categoria** e **buscar** texto na descrição, na pessoa ou na observação (sem
diferenciar maiúscula, minúscula ou acento). Com esses filtros, as compras do
cartão aparecem uma a uma em vez de agrupadas na fatura.

No Lançar, o campo de pessoa e o de descrição sugerem o que você já usou, pra
escrever sempre igual ("Mãe" e "mãe" contam como a mesma pessoa).

### Backup

Em **Cadastros → Seus dados**:
- **Baixar backup completo:** um arquivo `.json` com tudo (lançamentos, parcelas,
  cartões, categorias, formas de pagamento e saldo).
- **Baixar planilha (CSV):** todas as parcelas, pra abrir no Excel ou LibreOffice.

Guarde fora do celular (Google Drive, e-mail, PC). O plano grátis do Supabase não
faz backup automático (o próprio Supabase recomenda exportar os dados por conta
própria), então essa cópia é a sua garantia. A tela
mostra a data do último backup baixado naquele aparelho.

### Formas de pagamento

Cada forma tem um tipo, que dá pra mudar em Cadastros:

| Tipo | Exemplos | Lançamento à vista |
|---|---|---|
| **Na hora** | Pix, Débito, Dinheiro, Transferência | já entra pago (dá pra desmarcar) |
| **Cartão de crédito** | Crédito, Pix no crédito | vai pra fatura do cartão escolhido |
| **A prazo** | Boleto | fica em aberto até a baixa |

Parcelado e fixo sempre ficam em aberto, parcela por parcela.

### Cartão de crédito e faturas

Cadastre cada cartão com o **dia do fechamento** e o **dia do vencimento**. Uma
compra feita **antes** do fechamento cai na fatura daquele mês; feita **no dia do
fechamento ou depois**, cai na seguinte. Compras parceladas caem uma em cada
fatura.

Em **Contas → Pagar**, as compras de cada cartão aparecem juntas como **Fatura**.
Ao pagar a fatura, todas as compras dela recebem baixa de uma vez. Juros,
anuidade ou outra cobrança: lance como compra no cartão antes de pagar.

**Limite:** em **Cadastros → Cartões**, informe o limite ao cadastrar ou toque
em **Editar** num cartão que já existe (dá pra mudar também o nome e os dias;
os dias novos valem só pras próximas compras). O Início mostra quanto do limite
está usado e quanto sobra, contando **todas** as parcelas em aberto do cartão,
inclusive as de faturas futuras, como o banco faz. A barra fica amarela a partir
de 80% e vermelha se passar. Ao lançar no crédito, o app mostra o disponível e
avisa se a compra passa dele (só avisa, não impede). Pagar a fatura libera o
limite.

**Pix no crédito:** escolha a forma "Pix no crédito" e o cartão. Se já sabe o
valor de cada parcela com os juros, escolha "O valor digitado é: De cada parcela".

**Emprestou o cartão (ex.: pra sua mãe):** lance a compra como **a pagar** no
crédito, parcelada. E lance **a receber** dela o mesmo valor, parcelado igual.
Conforme ela for te pagando, dê baixa nas parcelas a receber.

### Contas fixas

Salário, aluguel, internet, assinaturas: escolha **Fixo**. O app deixa lançado
sempre **1 ano à frente** e vai renovando sozinho. Pra mudar o valor (aumento da
internet, por exemplo), edite uma parcela e marque "Usar o novo valor também nas
próximas". Pra parar (cancelou a assinatura), exclua a parcela escolhendo
"Esta e as próximas", que encerra a conta fixa.

### Datas dos relatórios

Os totais usam a **data de vencimento**: compra no cartão entra no mês da
fatura, e uma conta paga com atraso continua no mês em que venceu.

### CSV

Separador `;`, vírgula decimal e acentos corretos, pra abrir direto no Excel ou
no LibreOffice Calc (que é grátis, caso você não tenha o Office em casa).
