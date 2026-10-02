/* =============================================================================
   Controle Financeiro - finanças pessoais (Supabase + HTML/JS puro)
   ============================================================================= */
(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constantes
  // ---------------------------------------------------------------------------
  const NATUREZAS = [
    { valor: "normal", titulo: "Normal", dica: "Conta na categoria e no total do mês" },
    { valor: "credito_informativo", titulo: "Compra no crédito", dica: "Vai pra fatura: só conta na categoria" },
    { valor: "pagamento_fatura", titulo: "Pagamento de fatura", dica: "Só conta no total do mês" },
  ];
  const NATUREZA_CURTA = { normal: "", credito_informativo: "Crédito (fatura)", pagamento_fatura: "Pagto. de fatura" };
  const DIAS_ALERTA = 5;
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
    "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const CATEGORIAS_PADRAO = [
    ["Salário", "receita"], ["Freelance", "receita"], ["Outras receitas", "receita"],
    ["Alimentação", "despesa"], ["Restaurante", "despesa"], ["Conveniência", "despesa"],
    ["Transporte", "despesa"], ["Moradia", "despesa"], ["Saúde", "despesa"], ["Jogos", "despesa"],
    ["Lazer", "despesa"], ["Assinaturas", "despesa"], ["Educação", "despesa"], ["Outras despesas", "despesa"],
  ].map(([nome, tipo]) => ({ nome, tipo }));
  const FORMAS_PADRAO = ["Débito", "Crédito", "Pix", "Dinheiro", "Transferência"].map((nome) => ({ nome }));

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const pad = (n) => String(n).padStart(2, "0");

  function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function partesISO(iso) { return iso.split("-").map(Number); }
  /** Soma meses a uma data AAAA-MM-DD, ajustando o dia em meses mais curtos (31 -> 30/28). */
  function addMesesISO(iso, meses) {
    const [a, m, d] = partesISO(iso);
    const total = m - 1 + meses;
    const ano = a + Math.floor(total / 12);
    const mes = ((total % 12) + 12) % 12 + 1;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    return `${ano}-${pad(mes)}-${pad(Math.min(d, ultimoDia))}`;
  }
  /** Dias de 'deISO' até 'ateISO' (positivo = no futuro). */
  function diasEntre(deISO, ateISO) {
    const [a1, m1, d1] = partesISO(deISO);
    const [a2, m2, d2] = partesISO(ateISO);
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
  }
  function fmtData(iso) { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; }
  function fmtDiaLongo(iso) {
    const [a, m, d] = partesISO(iso);
    const txt = new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }
  function fmtBRL(v) { return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function fmtNumeroCSV(v) { return Number(v).toFixed(2).replace(".", ","); }
  /** Aceita "89,90", "1.234,56", "1234.56", "R$ 50". Retorna NaN se inválido. */
  function lerValor(txt) {
    let s = String(txt ?? "").trim().replace(/R\$|\s/g, "");
    if (!s) return NaN;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const v = Number(s);
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  }
  function valorParaCampo(v) { return Number(v).toFixed(2).replace(".", ","); }
  function semAcento(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function ehCredito(nomeForma) { return semAcento(nomeForma || "").includes("credito"); }
  function plural(n, s, p) { return n === 1 ? s : p; }

  /** Cria elementos: h("div", {class: "x", onclick: fn}, "texto", outroEl) */
  function h(tag, props = {}, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "style") Object.assign(el.style, v); // via CSSOM: permitido pela política de segurança
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const f of filhos.flat()) {
      if (f == null || f === false) continue;
      el.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return el;
  }

  let timerToast;
  function toast(msg, erro = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("erro-toast", erro);
    t.hidden = false;
    clearTimeout(timerToast);
    timerToast = setTimeout(() => { t.hidden = true; }, erro ? 5000 : 3000);
  }

  function confirmar(texto, botao = "Excluir") {
    const dlg = $("#modal-confirmar");
    $("#confirmar-texto").textContent = texto;
    $("#confirmar-sim").textContent = botao;
    dlg.returnValue = "";
    dlg.showModal();
    return new Promise((ok) => dlg.addEventListener("close", () => ok(dlg.returnValue === "sim"), { once: true }));
  }

  function baixarCSV(nomeArquivo, linhas) {
    const conteudo = linhas.map((l) => l.map((c) => {
      const s = String(c ?? "");
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: nomeArquivo });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function msgErro(e) {
    if (!e) return "Algo deu errado.";
    if (e.code === "23505") return "Já existe um cadastro com esse nome.";
    if (e.code === "23503") return "Não dá pra remover: está em uso em lançamentos ou contas.";
    if (/fetch|network|Failed/i.test(e.message || "")) return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    return e.message || "Algo deu errado.";
  }

  /** Executa uma consulta do Supabase e lança erro se houver. */
  async function exec(consulta) {
    const { data, error } = await consulta;
    if (error) throw error;
    return data;
  }

  /** Desabilita o botão enquanto a ação roda e mostra erros num toast. */
  async function acao(botao, fn) {
    if (botao) botao.disabled = true;
    try { await fn(); }
    catch (e) { console.error(e); toast(msgErro(e), true); }
    finally { if (botao) botao.disabled = false; }
  }

  // ---------------------------------------------------------------------------
  // Estado e cliente Supabase
  // ---------------------------------------------------------------------------
  const cfg = window.APP_CONFIG || {};
  const configurado = /^https:\/\//.test(cfg.SUPABASE_URL || "") && !/SEU-PROJETO/.test(cfg.SUPABASE_URL)
    && cfg.SUPABASE_ANON_KEY && !/COLE-AQUI/.test(cfg.SUPABASE_ANON_KEY);
  const sb = configurado ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const estado = {
    iniciado: false,
    view: "lancar",
    categorias: [], formas: [],
    catPorId: new Map(), formaPorId: new Map(),
    contas: [],
    extrato: { ano: 0, mes: 0, linhas: [] },
    rel: { periodo: "mensal", mes: 0, ano: 0, tipo: "despesa", cacheAno: null, linhasAno: [] },
    grafico: null,
    editando: null, // transação aberta no modal
    contaEditando: null,
    contaPagando: null,
  };

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------
  function mostrarLogin(msg) {
    $("#app").hidden = true;
    $("#tela-login").hidden = false;
    const erro = $("#login-erro");
    erro.hidden = !msg;
    erro.textContent = msg || "";
  }

  async function iniciar() {
    if (!configurado) {
      mostrarLogin("Falta configurar o arquivo config.js com a URL e a chave anon do seu projeto Supabase.");
      $("#form-login").querySelector("button").disabled = true;
      return;
    }
    const { data } = await sb.auth.getSession();
    if (data.session) await entrar(data.session.user);
    else mostrarLogin();
    sb.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") location.reload();
    });
  }

  $("#form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const botao = ev.submitter || $("#form-login button");
    botao.disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({
      email: $("#login-email").value.trim(),
      password: $("#login-senha").value,
    });
    botao.disabled = false;
    if (error) {
      mostrarLogin(/invalid/i.test(error.message) ? "E-mail ou senha incorretos." : msgErro(error));
      return;
    }
    await entrar(data.user);
  });

  $("#btn-sair").addEventListener("click", () => sb.auth.signOut());
  // No celular o menu lateral não existe: o "Sair" fica em Cadastros > Sua conta.
  $("#btn-sair-conta").addEventListener("click", async () => {
    if (await confirmar("Sair da sua conta neste aparelho?", "Sair")) sb.auth.signOut();
  });

  async function entrar(usuario) {
    if (estado.iniciado) return;
    estado.iniciado = true;
    $("#conta-email").textContent = usuario?.email ? `Conectado como ${usuario.email}` : "Conectado";
    $("#tela-login").hidden = true;
    $("#app").hidden = false;
    const hoje = hojeISO();
    const [a, m] = partesISO(hoje);
    estado.extrato.ano = a; estado.extrato.mes = m;
    estado.rel.ano = a; estado.rel.mes = m;
    $("#l-data").value = hoje;
    renderNatureza($("#l-natureza"), "l-nat", "normal");
    try {
      await carregarCadastros();
      if (estado.categorias.length === 0 && estado.formas.length === 0) {
        await exec(sb.from("categorias").insert(CATEGORIAS_PADRAO));
        await exec(sb.from("formas_pagamento").insert(FORMAS_PADRAO));
        await carregarCadastros();
      }
    } catch (e) { toast(msgErro(e), true); }
    atualizarFormLancar();
    // Recarrega a aba ATUAL (não força "Lançar"): se a pessoa já tocou em outra
    // aba enquanto as categorias carregavam, ela continua onde está.
    recarregarView();
    carregarContas();
  }

  // ---------------------------------------------------------------------------
  // Navegação
  // ---------------------------------------------------------------------------
  document.querySelectorAll(".menu-item").forEach((b) =>
    b.addEventListener("click", () => mostrarView(b.dataset.view)));

  function mostrarView(nome) {
    estado.view = nome;
    document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== `view-${nome}`; });
    document.querySelectorAll(".menu-item").forEach((b) => b.classList.toggle("ativo", b.dataset.view === nome));
    window.scrollTo(0, 0);
    recarregarView();
  }

  function recarregarView() {
    const v = estado.view;
    if (v === "lancar") carregarRecentes();
    else if (v === "contas") carregarContas();
    else if (v === "extrato") carregarExtrato();
    else if (v === "relatorios") carregarRelatorio();
    else if (v === "cadastros") renderCadastros();
  }

  /** Depois de qualquer alteração em lançamentos. */
  function lancamentosMudaram() {
    estado.rel.cacheAno = null;
    recarregarView();
  }

  // Ao voltar pro app (ex.: abriu o celular no dia seguinte), atualiza vencimentos.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && estado.iniciado) carregarContas();
  });

  // ---------------------------------------------------------------------------
  // Cadastros (categorias e formas de pagamento)
  // ---------------------------------------------------------------------------
  async function carregarCadastros() {
    const [cats, formas] = await Promise.all([
      exec(sb.from("categorias").select("id,nome,tipo").order("nome")),
      exec(sb.from("formas_pagamento").select("id,nome").order("nome")),
    ]);
    estado.categorias = cats;
    estado.formas = formas;
    estado.catPorId = new Map(cats.map((c) => [c.id, c]));
    estado.formaPorId = new Map(formas.map((f) => [f.id, f]));
  }

  function preencherSelect(select, itens, selecionado) {
    select.replaceChildren(...itens.map((i) => h("option", { value: i.id }, i.nome)));
    if (selecionado != null && itens.some((i) => i.id === selecionado)) select.value = String(selecionado);
  }
  function categoriasDoTipo(tipo) { return estado.categorias.filter((c) => c.tipo === tipo); }

  function renderNatureza(fieldset, nome, valor) {
    fieldset.replaceChildren(
      h("legend", {}, "Este lançamento é"),
      ...NATUREZAS.map((n) => h("label", {},
        h("input", { type: "radio", name: nome, value: n.valor, checked: n.valor === valor }),
        h("strong", {}, n.titulo),
        h("small", {}, n.dica),
      )),
    );
  }
  function lerNatureza(fieldset) { return fieldset.querySelector("input:checked")?.value || "normal"; }
  function definirNatureza(fieldset, valor) {
    const r = fieldset.querySelector(`input[value="${valor}"]`);
    if (r) r.checked = true;
  }
  /** Ao escolher "Crédito", sugere "compra no crédito"; ao sair do crédito, volta pro normal. */
  function sugerirNatureza(fieldset, selectForma, tipo) {
    const forma = estado.formaPorId.get(Number(selectForma.value));
    if (tipo === "despesa" && forma && ehCredito(forma.nome)) definirNatureza(fieldset, "credito_informativo");
    else if (lerNatureza(fieldset) === "credito_informativo") definirNatureza(fieldset, "normal");
  }

  function renderCadastros() {
    const linhaCat = (c) => h("li", {}, h("span", {}, c.nome),
      h("button", { class: "btn-remover", type: "button", "aria-label": `Remover ${c.nome}`, onclick: () => removerCadastro("categorias", c) }, "Remover"));
    $("#lista-cat-despesa").replaceChildren(...categoriasDoTipo("despesa").map(linhaCat));
    $("#lista-cat-receita").replaceChildren(...categoriasDoTipo("receita").map(linhaCat));
    $("#lista-formas").replaceChildren(...estado.formas.map((f) => h("li", {}, h("span", {}, f.nome),
      h("button", { class: "btn-remover", type: "button", "aria-label": `Remover ${f.nome}`, onclick: () => removerCadastro("formas_pagamento", f) }, "Remover"))));
  }

  async function aposMudarCadastros() {
    await carregarCadastros();
    renderCadastros();
    atualizarFormLancar();
  }

  $("#form-categoria").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nome = $("#cat-nome").value.trim();
    if (!nome) return;
    acao(ev.submitter, async () => {
      await exec(sb.from("categorias").insert({ nome, tipo: $("#cat-tipo").value }));
      $("#cat-nome").value = "";
      await aposMudarCadastros();
      toast(`Categoria “${nome}” adicionada.`);
    });
  });

  $("#form-forma").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nome = $("#forma-nome").value.trim();
    if (!nome) return;
    acao(ev.submitter, async () => {
      await exec(sb.from("formas_pagamento").insert({ nome }));
      $("#forma-nome").value = "";
      await aposMudarCadastros();
      toast(`Forma de pagamento “${nome}” adicionada.`);
    });
  });

  async function removerCadastro(tabela, item) {
    if (!(await confirmar(`Remover “${item.nome}”?`, "Remover"))) return;
    acao(null, async () => {
      await exec(sb.from(tabela).delete().eq("id", item.id));
      await aposMudarCadastros();
      toast(`“${item.nome}” removido.`);
    });
  }

  // ---------------------------------------------------------------------------
  // Lançar
  // ---------------------------------------------------------------------------
  const formLancar = $("#form-lancar");
  const tipoLancar = () => formLancar.querySelector('input[name="tipo"]:checked').value;

  function atualizarFormLancar() {
    const tipo = tipoLancar();
    $(".valor-grande").dataset.tipo = tipo;
    $("#l-origem-rotulo").textContent = tipo === "despesa" ? "Onde gastou" : "De quem recebeu";
    preencherSelect($("#l-categoria"), categoriasDoTipo(tipo), Number($("#l-categoria").value));
    preencherSelect($("#l-forma"), estado.formas, Number($("#l-forma").value));
    sugerirNatureza($("#l-natureza"), $("#l-forma"), tipo);
    atualizarInfoParcelas();
  }

  function atualizarInfoParcelas() {
    const parcelado = $("#l-parcelado").checked;
    $("#l-parcelas-wrap").hidden = !parcelado;
    const info = $("#l-parcelas-info");
    const n = parseInt($("#l-parcelas").value, 10);
    const v = lerValor($("#l-valor").value);
    info.hidden = !(parcelado && n >= 2 && v > 0);
    if (!info.hidden) info.textContent = `${n}× de ${fmtBRL(Math.floor((v * 100) / n) / 100)}, uma em cada mês a partir da data escolhida.`;
  }

  formLancar.querySelectorAll('input[name="tipo"]').forEach((r) => r.addEventListener("change", atualizarFormLancar));
  $("#l-forma").addEventListener("change", () => sugerirNatureza($("#l-natureza"), $("#l-forma"), tipoLancar()));
  $("#l-parcelado").addEventListener("change", atualizarInfoParcelas);
  $("#l-parcelas").addEventListener("input", atualizarInfoParcelas);
  $("#l-valor").addEventListener("input", atualizarInfoParcelas);

  /** Insere um lançamento; se parcelado, cria uma linha por mês ligadas à primeira. */
  async function inserirTransacao(dados, totalParcelas = 1) {
    if (totalParcelas <= 1) {
      return exec(sb.from("transacoes").insert({ ...dados, parcela_atual: 1, total_parcelas: 1 }).select("id").single());
    }
    // Divide em centavos; os centavos que sobram vão nas primeiras parcelas (a soma bate exata).
    const centavos = Math.round(dados.valor * 100);
    const base = Math.floor(centavos / totalParcelas);
    const sobra = centavos - base * totalParcelas;
    const valorDa = (i) => (base + (i <= sobra ? 1 : 0)) / 100;

    const pai = await exec(sb.from("transacoes")
      .insert({ ...dados, valor: valorDa(1), parcela_atual: 1, total_parcelas: totalParcelas })
      .select("id").single());
    const filhas = [];
    for (let i = 2; i <= totalParcelas; i++) {
      filhas.push({ ...dados, valor: valorDa(i), data: addMesesISO(dados.data, i - 1),
        parcela_atual: i, total_parcelas: totalParcelas, transacao_pai_id: pai.id });
    }
    try { await exec(sb.from("transacoes").insert(filhas)); }
    catch (e) { await sb.from("transacoes").delete().eq("id", pai.id); throw e; }
    return pai;
  }

  formLancar.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const valor = lerValor($("#l-valor").value);
    const data = $("#l-data").value;
    const parcelado = $("#l-parcelado").checked;
    const parcelas = parcelado ? parseInt($("#l-parcelas").value, 10) : 1;
    if (!(valor > 0)) { toast("Digite um valor maior que zero.", true); $("#l-valor").focus(); return; }
    if (!data) { toast("Escolha a data.", true); return; }
    if (!$("#l-categoria").value || !$("#l-forma").value) { toast("Escolha a categoria e a forma de pagamento.", true); return; }
    if (parcelado && !(parcelas >= 2 && parcelas <= 48)) { toast("Número de parcelas deve ser entre 2 e 48.", true); return; }

    acao($("#l-salvar"), async () => {
      await inserirTransacao({
        data, tipo: tipoLancar(), valor,
        categoria_id: Number($("#l-categoria").value),
        forma_pagamento_id: Number($("#l-forma").value),
        descricao: $("#l-descricao").value.trim(),
        origem_destino: $("#l-origem").value.trim(),
        natureza: lerNatureza($("#l-natureza")),
      }, parcelas);
      $("#l-valor").value = "";
      $("#l-descricao").value = "";
      $("#l-origem").value = "";
      $("#l-parcelado").checked = false;
      atualizarInfoParcelas();
      definirNatureza($("#l-natureza"), "normal");
      sugerirNatureza($("#l-natureza"), $("#l-forma"), tipoLancar());
      toast(parcelado ? `Lançamento salvo em ${parcelas} parcelas.` : "Lançamento salvo.");
      lancamentosMudaram();
    });
  });

  async function carregarRecentes() {
    try {
      const linhas = await exec(sb.from("transacoes").select("*")
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(6));
      const ul = $("#lista-recentes");
      if (!linhas.length) {
        ul.replaceChildren(h("li", { class: "vazio" }, "Nada lançado ainda. O primeiro lançamento aparece aqui."));
      } else {
        ul.replaceChildren(...linhas.map((t) => h("li", {}, itemTransacao(t, true))));
      }
    } catch (e) { toast(msgErro(e), true); }
  }

  /** Card de um lançamento (usado em Últimos lançamentos e no Extrato). */
  function itemTransacao(t, mostrarData) {
    const cat = estado.catPorId.get(t.categoria_id)?.nome ?? "Sem categoria";
    const forma = estado.formaPorId.get(t.forma_pagamento_id)?.nome ?? "";
    const titulo = t.descricao || cat;
    const sinal = t.tipo === "despesa" ? "−" : "+";
    return h("button", { class: "item item-clicavel", type: "button", onclick: () => abrirEdicao(t) },
      h("span", { class: "item-titulo" }, titulo),
      h("span", { class: "item-valor " + t.tipo }, `${sinal} ${fmtBRL(t.valor)}`,
        t.total_parcelas > 1 ? h("small", {}, `parcela ${t.parcela_atual}/${t.total_parcelas}`) : null),
      h("span", { class: "item-meta" },
        mostrarData ? h("span", {}, fmtData(t.data)) : null,
        t.descricao ? h("span", {}, cat) : null,
        forma ? h("span", {}, forma) : null,
        t.origem_destino ? h("span", {}, t.origem_destino) : null,
        NATUREZA_CURTA[t.natureza] ? h("span", { class: "etiqueta" }, NATUREZA_CURTA[t.natureza]) : null,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Editar / excluir lançamento
  // ---------------------------------------------------------------------------
  const modalT = $("#modal-transacao");
  const tipoEdicao = () => modalT.querySelector('input[name="t-tipo"]:checked').value;

  function abrirEdicao(t) {
    estado.editando = t;
    modalT.querySelector(`input[name="t-tipo"][value="${t.tipo}"]`).checked = true;
    $("#t-valor").value = valorParaCampo(t.valor);
    $("#t-data").value = t.data;
    preencherSelect($("#t-categoria"), categoriasDoTipo(t.tipo), t.categoria_id);
    preencherSelect($("#t-forma"), estado.formas, t.forma_pagamento_id);
    $("#t-descricao").value = t.descricao || "";
    $("#t-origem").value = t.origem_destino || "";
    renderNatureza($("#t-natureza"), "t-nat", t.natureza);
    const aviso = $("#t-aviso-parcela");
    aviso.hidden = !(t.total_parcelas > 1);
    aviso.textContent = `Parcela ${t.parcela_atual} de ${t.total_parcelas}. A alteração vale só para esta parcela.`;
    modalT.showModal();
  }

  modalT.querySelectorAll('input[name="t-tipo"]').forEach((r) => r.addEventListener("change", () => {
    preencherSelect($("#t-categoria"), categoriasDoTipo(tipoEdicao()));
  }));
  $("#t-forma").addEventListener("change", () => sugerirNatureza($("#t-natureza"), $("#t-forma"), tipoEdicao()));

  $("#form-transacao").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = estado.editando;
    const valor = lerValor($("#t-valor").value);
    if (!(valor > 0)) { toast("Digite um valor maior que zero.", true); return; }
    if (!$("#t-data").value || !$("#t-categoria").value) { toast("Preencha data e categoria.", true); return; }
    acao(ev.submitter, async () => {
      await exec(sb.from("transacoes").update({
        tipo: tipoEdicao(), valor, data: $("#t-data").value,
        categoria_id: Number($("#t-categoria").value),
        forma_pagamento_id: Number($("#t-forma").value),
        descricao: $("#t-descricao").value.trim(),
        origem_destino: $("#t-origem").value.trim(),
        natureza: lerNatureza($("#t-natureza")),
      }).eq("id", t.id));
      modalT.close();
      toast("Lançamento atualizado.");
      lancamentosMudaram();
    });
  });

  $("#t-excluir").addEventListener("click", async () => {
    const t = estado.editando;
    const parcelado = t.total_parcelas > 1;
    const texto = parcelado
      ? `Excluir as ${t.total_parcelas} parcelas desta compra? Todas somem do extrato.`
      : "Excluir este lançamento?";
    modalT.close();
    if (!(await confirmar(texto))) { modalT.showModal(); return; }
    acao(null, async () => {
      // Apagar a parcela 1 apaga as demais (on delete cascade no banco).
      await exec(sb.from("transacoes").delete().eq("id", t.transacao_pai_id ?? t.id));
      toast(parcelado ? "Parcelas excluídas." : "Lançamento excluído.");
      lancamentosMudaram();
    });
  });

  document.querySelectorAll("[data-fechar]").forEach((b) =>
    b.addEventListener("click", () => b.closest("dialog").close()));

  // ---------------------------------------------------------------------------
  // Contas a pagar / receber
  // ---------------------------------------------------------------------------
  function statusConta(c) {
    if (!c.ativa) return { texto: "Paga", classe: "paga", alerta: false };
    const dias = diasEntre(hojeISO(), c.proxima_vencimento);
    if (dias < 0) return { texto: `Vencida há ${-dias} ${plural(-dias, "dia", "dias")}`, classe: "vencida", alerta: true };
    if (dias === 0) return { texto: "Vence hoje", classe: "em-breve", alerta: true };
    if (dias === 1) return { texto: "Vence amanhã", classe: "em-breve", alerta: true };
    if (dias <= DIAS_ALERTA) return { texto: `Vence em ${dias} dias`, classe: "em-breve", alerta: true };
    return { texto: `Vence em ${dias} dias`, classe: "", alerta: false };
  }

  async function carregarContas() {
    try {
      estado.contas = await exec(sb.from("contas_programadas").select("*").order("proxima_vencimento"));
    } catch (e) { toast(msgErro(e), true); return; }
    const pendentes = estado.contas.filter((c) => statusConta(c).alerta).length;
    const badge = $("#badge-contas");
    badge.hidden = pendentes === 0;
    badge.textContent = pendentes;
    badge.setAttribute("aria-label", `${pendentes} ${plural(pendentes, "conta precisa", "contas precisam")} de atenção`);
    if (estado.view === "contas") renderContas();
  }

  function renderContas() {
    const mostrarPagas = $("#c-mostrar-pagas").checked;
    const lista = estado.contas.filter((c) => mostrarPagas || c.ativa);
    const ul = $("#lista-contas");
    if (!lista.length) {
      ul.replaceChildren(h("li", { class: "vazio" },
        h("div", {}, "Nenhuma conta cadastrada. Cadastre internet, aluguel ou assinaturas pra acompanhar os vencimentos."),
        h("button", { class: "btn btn-primario", type: "button", onclick: () => abrirConta() }, "Nova conta")));
      return;
    }
    ul.replaceChildren(...lista.map((c) => {
      const st = statusConta(c);
      const cat = estado.catPorId.get(c.categoria_id)?.nome ?? "";
      const forma = estado.formaPorId.get(c.forma_pagamento_id)?.nome ?? "";
      const pagar = c.tipo === "despesa" ? "Pagar" : "Receber";
      return h("li", { class: `item conta ${st.classe}` },
        h("span", { class: "item-titulo" }, c.descricao),
        h("span", { class: "item-valor " + c.tipo }, fmtBRL(c.valor), h("small", {}, c.tipo === "despesa" ? "a pagar" : "a receber")),
        h("span", { class: "item-meta" },
          h("span", { class: "conta-status" }, st.texto),
          h("span", {}, fmtData(c.proxima_vencimento)),
          cat ? h("span", {}, cat) : null,
          forma ? h("span", {}, forma) : null,
          c.recorrente ? h("span", { class: "etiqueta" }, "Todo mês") : null),
        h("div", { class: "conta-acoes" },
          c.ativa ? h("button", { class: "btn btn-primario btn-pequeno", type: "button", onclick: () => abrirPagar(c) }, pagar) : null,
          h("button", { class: "btn btn-pequeno", type: "button", onclick: () => abrirConta(c) }, "Editar"),
          h("button", { class: "btn btn-perigo btn-pequeno", type: "button", onclick: () => excluirConta(c) }, "Excluir")),
      );
    }));
  }

  $("#c-mostrar-pagas").addEventListener("change", renderContas);
  $("#btn-nova-conta").addEventListener("click", () => abrirConta());

  const modalC = $("#modal-conta");
  const tipoConta = () => modalC.querySelector('input[name="c-tipo"]:checked').value;

  function abrirConta(c = null) {
    estado.contaEditando = c;
    $("#c-titulo").textContent = c ? "Editar conta" : "Nova conta";
    const tipo = c?.tipo ?? "despesa";
    modalC.querySelector(`input[name="c-tipo"][value="${tipo}"]`).checked = true;
    $("#c-descricao").value = c?.descricao ?? "";
    $("#c-valor").value = c ? valorParaCampo(c.valor) : "";
    $("#c-vencimento").value = c?.proxima_vencimento ?? hojeISO();
    $("#c-recorrente").checked = c ? c.recorrente : true;
    preencherSelect($("#c-categoria"), categoriasDoTipo(tipo), c?.categoria_id);
    preencherSelect($("#c-forma"), estado.formas, c?.forma_pagamento_id);
    modalC.showModal();
  }
  modalC.querySelectorAll('input[name="c-tipo"]').forEach((r) => r.addEventListener("change", () =>
    preencherSelect($("#c-categoria"), categoriasDoTipo(tipoConta()))));

  $("#form-conta").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const descricao = $("#c-descricao").value.trim();
    const valor = lerValor($("#c-valor").value);
    if (!descricao) { toast("Digite uma descrição.", true); return; }
    if (!(valor > 0)) { toast("Digite um valor maior que zero.", true); return; }
    if (!$("#c-vencimento").value || !$("#c-categoria").value) { toast("Preencha vencimento e categoria.", true); return; }
    const dados = {
      descricao, valor, tipo: tipoConta(),
      categoria_id: Number($("#c-categoria").value),
      forma_pagamento_id: Number($("#c-forma").value),
      proxima_vencimento: $("#c-vencimento").value,
      recorrente: $("#c-recorrente").checked,
    };
    acao(ev.submitter, async () => {
      const c = estado.contaEditando;
      if (c) await exec(sb.from("contas_programadas").update(dados).eq("id", c.id));
      else await exec(sb.from("contas_programadas").insert({ ...dados, ativa: true }));
      modalC.close();
      toast(c ? "Conta atualizada." : "Conta cadastrada.");
      carregarContas();
    });
  });

  async function excluirConta(c) {
    if (!(await confirmar(`Excluir a conta “${c.descricao}”? Os lançamentos já feitos continuam no extrato.`))) return;
    acao(null, async () => {
      await exec(sb.from("contas_programadas").delete().eq("id", c.id));
      toast("Conta excluída.");
      carregarContas();
    });
  }

  const modalP = $("#modal-pagar");
  function abrirPagar(c) {
    estado.contaPagando = c;
    const pagar = c.tipo === "despesa";
    $("#p-titulo").textContent = pagar ? "Confirmar pagamento" : "Confirmar recebimento";
    $("#p-confirmar").textContent = pagar ? "Confirmar pagamento" : "Confirmar recebimento";
    $("#p-resumo").textContent = `${c.descricao}, vencimento ${fmtData(c.proxima_vencimento)}`;
    $("#p-valor").value = valorParaCampo(c.valor);
    $("#p-data").value = hojeISO();
    preencherSelect($("#p-forma"), estado.formas, c.forma_pagamento_id);
    renderNatureza($("#p-natureza"), "p-nat", "normal");
    sugerirNatureza($("#p-natureza"), $("#p-forma"), c.tipo);
    modalP.showModal();
  }
  $("#p-forma").addEventListener("change", () =>
    sugerirNatureza($("#p-natureza"), $("#p-forma"), estado.contaPagando?.tipo));

  $("#form-pagar").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const c = estado.contaPagando;
    const valor = lerValor($("#p-valor").value);
    const data = $("#p-data").value;
    if (!(valor > 0)) { toast("Digite um valor maior que zero.", true); return; }
    if (!data) { toast("Escolha a data.", true); return; }
    acao(ev.submitter, async () => {
      await inserirTransacao({
        data, tipo: c.tipo, valor,
        categoria_id: c.categoria_id,
        forma_pagamento_id: Number($("#p-forma").value),
        descricao: c.descricao, origem_destino: "",
        natureza: lerNatureza($("#p-natureza")),
      });
      let msg;
      if (c.recorrente) {
        const proximo = addMesesISO(c.proxima_vencimento, 1);
        await exec(sb.from("contas_programadas").update({ proxima_vencimento: proximo }).eq("id", c.id));
        msg = `Registrado. Próximo vencimento: ${fmtData(proximo)}.`;
      } else {
        await exec(sb.from("contas_programadas").update({ ativa: false }).eq("id", c.id));
        msg = "Registrado. A conta saiu da lista de pendentes.";
      }
      modalP.close();
      toast(msg);
      estado.rel.cacheAno = null;
      carregarContas();
    });
  });

  // ---------------------------------------------------------------------------
  // Regras de soma (iguais às da versão desktop)
  //  - Totais / saldo / mês a mês: ignoram "compra no crédito" (o dinheiro só
  //    sai quando a fatura é paga).
  //  - Por categoria: ignora "pagamento de fatura" (as compras já foram
  //    categorizadas uma a uma).
  // ---------------------------------------------------------------------------
  function totaisCaixa(linhas) {
    let receitas = 0, despesas = 0;
    for (const t of linhas) {
      if (t.natureza === "credito_informativo") continue;
      if (t.tipo === "receita") receitas += Number(t.valor); else despesas += Number(t.valor);
    }
    return { receitas, despesas, saldo: receitas - despesas };
  }
  function somaPorCategoria(linhas, tipo) {
    const mapa = new Map();
    for (const t of linhas) {
      if (t.tipo !== tipo || t.natureza === "pagamento_fatura") continue;
      mapa.set(t.categoria_id, (mapa.get(t.categoria_id) || 0) + Number(t.valor));
    }
    const total = [...mapa.values()].reduce((a, b) => a + b, 0);
    const itens = [...mapa.entries()]
      .map(([id, valor]) => ({ nome: estado.catPorId.get(id)?.nome ?? "Sem categoria", valor, pct: total ? (valor / total) * 100 : 0 }))
      .sort((a, b) => b.valor - a.valor);
    return { itens, total };
  }
  function renderResumo(alvo, { receitas, despesas, saldo }) {
    alvo.replaceChildren(
      h("div", { class: "receita" }, h("span", {}, "Receitas"), h("strong", {}, fmtBRL(receitas))),
      h("div", { class: "despesa" }, h("span", {}, "Despesas"), h("strong", {}, fmtBRL(despesas))),
      h("div", { class: saldo < 0 ? "despesa" : "receita" }, h("span", {}, "Saldo"), h("strong", {}, fmtBRL(saldo))),
    );
  }

  // ---------------------------------------------------------------------------
  // Extrato
  // ---------------------------------------------------------------------------
  function mudarMesExtrato(delta) {
    const iso = addMesesISO(`${estado.extrato.ano}-${pad(estado.extrato.mes)}-01`, delta);
    const [a, m] = partesISO(iso);
    estado.extrato.ano = a; estado.extrato.mes = m;
    carregarExtrato();
  }
  $("#e-mes-ant").addEventListener("click", () => mudarMesExtrato(-1));
  $("#e-mes-prox").addEventListener("click", () => mudarMesExtrato(1));

  async function carregarExtrato() {
    const { ano, mes } = estado.extrato;
    const ini = `${ano}-${pad(mes)}-01`;
    const fim = addMesesISO(ini, 1);
    const nomeMes = `${MESES[mes - 1].charAt(0).toUpperCase()}${MESES[mes - 1].slice(1)} ${ano}`;
    $("#e-mes-titulo").textContent = nomeMes;
    let linhas;
    try {
      linhas = await exec(sb.from("transacoes").select("*").gte("data", ini).lt("data", fim)
        .order("data", { ascending: false }).order("id", { ascending: false }));
    } catch (e) { toast(msgErro(e), true); return; }
    estado.extrato.linhas = linhas;
    renderResumo($("#e-resumo"), totaisCaixa(linhas));

    const alvo = $("#lista-extrato");
    if (!linhas.length) {
      alvo.replaceChildren(h("div", { class: "vazio" },
        h("div", {}, `Nenhum lançamento em ${MESES[mes - 1]} de ${ano}.`),
        h("button", { class: "btn btn-primario", type: "button", onclick: () => mostrarView("lancar") }, "Lançar agora")));
      return;
    }
    const blocos = [];
    let diaAtual = null, ul = null;
    for (const t of linhas) {
      if (t.data !== diaAtual) {
        diaAtual = t.data;
        ul = h("ul", { class: "lista" });
        blocos.push(h("h3", { class: "dia" }, fmtDiaLongo(t.data)), ul);
      }
      ul.append(h("li", {}, itemTransacao(t, false)));
    }
    alvo.replaceChildren(...blocos);
  }

  $("#btn-csv-extrato").addEventListener("click", () => {
    const { ano, mes, linhas } = estado.extrato;
    if (!linhas.length) { toast("Não há lançamentos nesse mês pra exportar.", true); return; }
    const cab = ["Data", "Tipo", "Valor", "Categoria", "Forma de pagamento", "Descrição", "Onde / de quem", "Parcela", "Natureza"];
    const corpo = [...linhas].reverse().map((t) => [
      fmtData(t.data), t.tipo === "despesa" ? "Despesa" : "Receita", fmtNumeroCSV(t.valor),
      estado.catPorId.get(t.categoria_id)?.nome ?? "", estado.formaPorId.get(t.forma_pagamento_id)?.nome ?? "",
      t.descricao, t.origem_destino, t.total_parcelas > 1 ? `${t.parcela_atual}/${t.total_parcelas}` : "",
      NATUREZAS.find((n) => n.valor === t.natureza)?.titulo ?? t.natureza,
    ]);
    baixarCSV(`extrato_${ano}-${pad(mes)}.csv`, [cab, ...corpo]);
  });

  // ---------------------------------------------------------------------------
  // Relatórios
  // ---------------------------------------------------------------------------
  $("#r-mes").replaceChildren(...MESES.map((m, i) => h("option", { value: i + 1 }, m.charAt(0).toUpperCase() + m.slice(1))));

  function lerFiltrosRelatorio() {
    const r = estado.rel;
    r.periodo = document.querySelector('input[name="r-periodo"]:checked').value;
    r.tipo = document.querySelector('input[name="r-tipo"]:checked').value;
    r.mes = Number($("#r-mes").value) || r.mes;
    const ano = parseInt($("#r-ano").value, 10);
    if (ano >= 2000 && ano <= 2100) r.ano = ano;
  }
  document.querySelectorAll('input[name="r-periodo"], input[name="r-tipo"]').forEach((el) =>
    el.addEventListener("change", () => { lerFiltrosRelatorio(); carregarRelatorio(); }));
  $("#r-mes").addEventListener("change", () => { lerFiltrosRelatorio(); carregarRelatorio(); });
  $("#r-ano").addEventListener("change", () => { lerFiltrosRelatorio(); carregarRelatorio(); });

  async function carregarRelatorio() {
    const r = estado.rel;
    $("#r-mes").value = String(r.mes);
    $("#r-ano").value = String(r.ano);
    $("#r-mes").hidden = r.periodo !== "mensal";
    if (r.cacheAno !== r.ano) {
      try {
        r.linhasAno = await exec(sb.from("transacoes").select("*")
          .gte("data", `${r.ano}-01-01`).lt("data", `${r.ano + 1}-01-01`).order("data"));
        r.cacheAno = r.ano;
      } catch (e) { toast(msgErro(e), true); return; }
    }
    const prefixoMes = `${r.ano}-${pad(r.mes)}`;
    const linhas = r.periodo === "mensal" ? r.linhasAno.filter((t) => t.data.startsWith(prefixoMes)) : r.linhasAno;
    const periodoTxt = r.periodo === "mensal" ? `${MESES[r.mes - 1]} de ${r.ano}` : String(r.ano);

    renderResumo($("#r-resumo"), totaisCaixa(linhas));

    const { itens } = somaPorCategoria(linhas, r.tipo);
    r.ultimoRelatorio = { itens, periodoTxt, linhas };
    $("#r-titulo-categorias").textContent = `${r.tipo === "despesa" ? "Despesas" : "Receitas"} por categoria em ${periodoTxt}`;
    const ul = $("#r-categorias");
    ul.classList.toggle("receita", r.tipo === "receita");
    if (!itens.length) {
      ul.replaceChildren(h("li", { class: "dica" }, `Nenhuma ${r.tipo} lançada em ${periodoTxt}.`));
    } else {
      ul.replaceChildren(...itens.map((i) => h("li", {},
        h("span", { class: "cat-nome" }, i.nome),
        h("span", { class: "cat-valor" }, fmtBRL(i.valor), h("small", {}, `${i.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`)),
        h("div", { class: "trilho", role: "presentation" },
          h("div", { class: "preenchido", style: { width: `${Math.max(i.pct, 0.5)}%` } })))));
    }

    $("#r-titulo-evolucao").textContent = `Receitas e despesas mês a mês em ${r.ano}`;
    desenharGrafico(r.linhasAno);
  }

  function desenharGrafico(linhasAno) {
    if (!window.Chart) return;
    const rec = Array(12).fill(0), desp = Array(12).fill(0);
    for (const t of linhasAno) {
      if (t.natureza === "credito_informativo") continue;
      const m = Number(t.data.slice(5, 7)) - 1;
      if (t.tipo === "receita") rec[m] += Number(t.valor); else desp[m] += Number(t.valor);
    }
    const css = getComputedStyle(document.documentElement);
    const cor = (v) => css.getPropertyValue(v).trim();
    const dados = {
      labels: MESES_CURTOS,
      datasets: [
        { label: "Receitas", data: rec, backgroundColor: cor("--serie-receita"), borderRadius: 4, maxBarThickness: 18 },
        { label: "Despesas", data: desp, backgroundColor: cor("--serie-despesa"), borderRadius: 4, maxBarThickness: 18 },
      ],
    };
    const opcoes = {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", align: "start", labels: { color: cor("--texto-2"), boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 3 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtBRL(ctx.parsed.y)}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: cor("--texto-3"), autoSkip: false, maxRotation: 0, font: { size: innerWidth < 480 ? 10 : 12 } }, border: { color: cor("--linha") } },
        y: {
          beginAtZero: true, grid: { color: cor("--linha") }, border: { display: false },
          ticks: { color: cor("--texto-3"), maxTicksLimit: 5,
            callback: (v) => v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR")} mil` : `R$ ${v}` },
        },
      },
    };
    if (estado.grafico) estado.grafico.destroy();
    estado.grafico = new Chart($("#r-grafico"), { type: "bar", data: dados, options: opcoes });
  }

  $("#btn-csv-relatorio").addEventListener("click", () => {
    const rel = estado.rel.ultimoRelatorio;
    if (!rel) return;
    const t = totaisCaixa(rel.linhas);
    const linhas = [["Categoria", "Valor", "Percentual"],
      ...rel.itens.map((i) => [i.nome, fmtNumeroCSV(i.valor), `${i.pct.toFixed(1).replace(".", ",")}%`]),
      [], ["Período", rel.periodoTxt],
      ["Receitas", fmtNumeroCSV(t.receitas)], ["Despesas", fmtNumeroCSV(t.despesas)], ["Saldo", fmtNumeroCSV(t.saldo)]];
    const r = estado.rel;
    const sufixo = r.periodo === "mensal" ? `${r.ano}-${pad(r.mes)}` : `${r.ano}`;
    baixarCSV(`relatorio_${r.tipo}s_${sufixo}.csv`, linhas);
  });

  // Redesenha o gráfico se o celular/PC trocar entre tema claro e escuro.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (estado.view === "relatorios") desenharGrafico(estado.rel.linhasAno);
  });

  iniciar();
})();
