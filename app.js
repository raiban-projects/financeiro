/* =============================================================================
   Controle Financeiro - finanças pessoais (Supabase + HTML/JS puro)

   Modelo:
     lançamento  = a "conta" (a pagar ou a receber): descrição, categoria,
                   forma de pagamento, à vista / parcelado / fixo
     parcela     = cada vencimento do lançamento; é nela que se dá baixa
     fatura      = parcelas do mesmo cartão com o mesmo vencimento; pagar a
                   fatura dá baixa em todas de uma vez
   ============================================================================= */
(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constantes
  // ---------------------------------------------------------------------------
  const DIAS_ALERTA = 5;          // "vence em breve" e contador do menu
  const HORIZONTE_FIXOS = 365;    // contas fixas ficam lançadas até 1 ano à frente
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
    "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const TIPO_FORMA = { imediata: "Na hora", cartao: "Cartão de crédito", prazo: "A prazo" };
  const CATEGORIAS_PADRAO = [
    ["Salário", "receita"], ["Freelance", "receita"], ["Outras receitas", "receita"],
    ["Alimentação", "despesa"], ["Restaurante", "despesa"], ["Conveniência", "despesa"],
    ["Transporte", "despesa"], ["Moradia", "despesa"], ["Saúde", "despesa"], ["Jogos", "despesa"],
    ["Lazer", "despesa"], ["Assinaturas", "despesa"], ["Educação", "despesa"], ["Outras despesas", "despesa"],
  ].map(([nome, tipo]) => ({ nome, tipo }));
  const FORMAS_PADRAO = [
    ["Pix", "imediata"], ["Débito", "imediata"], ["Dinheiro", "imediata"], ["Transferência", "imediata"],
    ["Crédito", "cartao"], ["Pix no crédito", "cartao"], ["Boleto", "prazo"],
  ].map(([nome, tipo]) => ({ nome, tipo }));

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
  function ultimoDia(ano, mes) { return new Date(ano, mes, 0).getDate(); }
  /** Data do 'dia' no mês (ano, mes + deslocamento), ajustando meses curtos (31 -> 30/28). */
  function dataNoMes(ano, mes, dia, deslocamento = 0) {
    const total = mes - 1 + deslocamento;
    const a = ano + Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12 + 1;
    return `${a}-${pad(m)}-${pad(Math.min(dia, ultimoDia(a, m)))}`;
  }
  function addMesesISO(iso, meses) { const [a, m, d] = partesISO(iso); return dataNoMes(a, m, d, meses); }
  function addDiasISO(iso, dias) {
    const [a, m, d] = partesISO(iso);
    return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
  }
  /** Dias de 'deISO' até 'ateISO' (positivo = no futuro). */
  function diasEntre(deISO, ateISO) {
    const [a1, m1, d1] = partesISO(deISO);
    const [a2, m2, d2] = partesISO(ateISO);
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
  }
  function fmtData(iso) { if (!iso) return ""; const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; }
  function fmtDataCurta(iso) { const [, m, d] = iso.split("-"); return `${d}/${m}`; }
  function fmtBRL(v) { return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function fmtNumero(v) { return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtNumeroCSV(v) { return Number(v).toFixed(2).replace(".", ","); }
  function nomeMes(ano, mes) { return `${MESES[mes - 1].charAt(0).toUpperCase()}${MESES[mes - 1].slice(1)} ${ano}`; }
  /** Aceita "89,90", "1.234,56", "1234.56", "R$ 50". Retorna NaN se inválido. */
  function lerValor(txt) {
    let s = String(txt ?? "").trim().replace(/R\$|\s/g, "");
    if (!s) return NaN;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const v = Number(s);
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  }
  function valorParaCampo(v) { return Number(v).toFixed(2).replace(".", ","); }
  function plural(n, s, p) { return n === 1 ? s : p; }
  function soma(lista, fn) { return lista.reduce((t, x) => t + fn(x), 0); }

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
    timerToast = setTimeout(() => { t.hidden = true; }, erro ? 5000 : 3500);
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
    if (e.code === "23503") return "Não dá pra remover: está em uso em algum lançamento.";
    if (/fetch|network|Failed/i.test(e.message || "")) return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    return e.message || "Algo deu errado.";
  }

  async function exec(consulta) {
    const { data, error } = await consulta;
    if (error) throw error;
    return data;
  }
  /** Busca todas as linhas, de 1000 em 1000 (limite de cada consulta do Supabase). */
  async function buscarTodos(fabrica) {
    const todos = [];
    for (let de = 0; ; de += 1000) {
      const lote = await exec(fabrica().range(de, de + 999));
      todos.push(...lote);
      if (lote.length < 1000) return todos;
    }
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
    view: "inicio",
    categorias: [], formas: [], cartoes: [],
    catPorId: new Map(), formaPorId: new Map(), cartaoPorId: new Map(),
    lancamentos: [], lancPorId: new Map(),
    inicio: { ano: 0, mes: 0 },
    contas: { lado: "despesa", situacao: "aberto", ano: 0, mes: 0, entradas: [] },
    rel: { periodo: "mensal", mes: 0, ano: 0, tipo: "despesa", situacao: "tudo", cacheAno: null, parcelasAno: [] },
    grafico: null,
    parcela: null,  // parcela aberta no modal
    fatura: null,   // fatura aberta no modal
  };

  // ---------------------------------------------------------------------------
  // Regras de datas: cartão, parcelas e contas fixas
  // ---------------------------------------------------------------------------
  /** Vencimento da fatura em que cai uma compra feita em 'compraISO'.
   *  Compras a partir do dia do fechamento vão pra fatura seguinte. */
  function vencimentoFatura(cartao, compraISO, deslocamento = 0) {
    const [a, m, d] = partesISO(compraISO);
    const fechaEsteMes = Math.min(cartao.dia_fechamento, ultimoDia(a, m));
    let meses = d >= fechaEsteMes ? 1 : 0;                      // mês do fechamento
    if (cartao.dia_vencimento <= cartao.dia_fechamento) meses += 1; // vence no mês seguinte ao fechamento
    return dataNoMes(a, m, cartao.dia_vencimento, meses + deslocamento);
  }
  /** Dia em que a fatura com esse vencimento fecha. */
  function fechamentoFatura(cartao, vencimentoISO) {
    const [a, m] = partesISO(vencimentoISO);
    const volta = cartao.dia_vencimento <= cartao.dia_fechamento ? -1 : 0;
    return dataNoMes(a, m, cartao.dia_fechamento, volta);
  }
  function ocorrencia(lanc, n) {
    return lanc.intervalo === "dias"
      ? addDiasISO(lanc.data_base, (n - 1) * lanc.intervalo_dias)
      : addMesesISO(lanc.data_base, n - 1);
  }
  /** Vencimento da parcela n de um lançamento. */
  function vencimentoDa(lanc, n) {
    const cartao = lanc.cartao_id ? estado.cartaoPorId.get(lanc.cartao_id) : null;
    if (!cartao) return ocorrencia(lanc, n);
    if (lanc.condicao === "fixo") return vencimentoFatura(cartao, ocorrencia(lanc, n)); // assinatura no cartão
    return vencimentoFatura(cartao, lanc.data_base, n - 1);                          // compra parcelada
  }
  /** Divide em centavos; os centavos que sobram vão nas primeiras parcelas. */
  function dividir(valor, n) {
    const centavos = Math.round(valor * 100);
    const base = Math.floor(centavos / n);
    const sobra = centavos - base * n;
    return Array.from({ length: n }, (_, i) => (base + (i < sobra ? 1 : 0)) / 100);
  }
  /** Parcelas a criar pra um lançamento, a partir do número 'deN'. */
  function gerarParcelas(lanc, deN = 1, garantirUma = true) {
    const linhas = [];
    if (lanc.condicao === "fixo") {
      const limite = addDiasISO(hojeISO(), HORIZONTE_FIXOS);
      for (let n = deN; n < deN + 400; n++) {
        const venc = vencimentoDa(lanc, n);
        if (venc > limite && !(garantirUma && linhas.length === 0)) break;
        linhas.push({ numero: n, vencimento: venc, valor: Number(lanc.valor), cartao_id: lanc.cartao_id || null });
      }
      return linhas;
    }
    const total = lanc.condicao === "parcelado" ? lanc.total_parcelas : 1;
    const valores = lanc.condicao === "parcelado" && lanc.valor_modo === "total"
      ? dividir(Number(lanc.valor), total)
      : Array(total).fill(Number(lanc.valor));
    for (let n = 1; n <= total; n++) {
      linhas.push({ numero: n, vencimento: vencimentoDa(lanc, n), valor: valores[n - 1], cartao_id: lanc.cartao_id || null });
    }
    return linhas;
  }

  // ---------------------------------------------------------------------------
  // Situação das parcelas e agrupamento em faturas
  // ---------------------------------------------------------------------------
  function lancDe(p) { return estado.lancPorId.get(p.lancamento_id); }
  function valorEfetivo(p) { return p.baixado && p.valor_baixa != null ? Number(p.valor_baixa) : Number(p.valor); }
  function emAtraso(p) { return !p.baixado && p.vencimento < hojeISO(); }

  function situacaoTexto(vencimentoISO) {
    const dias = diasEntre(hojeISO(), vencimentoISO);
    if (dias < 0) return { texto: `Vencida há ${-dias} ${plural(-dias, "dia", "dias")}`, classe: "st-vencida", alerta: true };
    if (dias === 0) return { texto: "Vence hoje", classe: "st-breve", alerta: true };
    if (dias === 1) return { texto: "Vence amanhã", classe: "st-breve", alerta: true };
    if (dias <= DIAS_ALERTA) return { texto: `Vence em ${dias} dias`, classe: "st-breve", alerta: true };
    return { texto: `Vence em ${dias} dias`, classe: "", alerta: false };
  }
  function situacaoParcela(p) {
    const lanc = lancDe(p);
    if (p.baixado) {
      const verbo = lanc?.tipo === "receita" ? "Recebido" : "Pago";
      return { texto: `${verbo} em ${fmtData(p.data_baixa)}`, classe: "st-paga", alerta: false };
    }
    return situacaoTexto(p.vencimento);
  }
  function situacaoFatura(f) {
    if (f.abertas.length === 0) return { texto: `Paga em ${fmtData(f.parcelas[0].data_baixa)}`, classe: "st-paga", alerta: false };
    const fecha = fechamentoFatura(f.cartao, f.vencimento);
    const st = situacaoTexto(f.vencimento);
    if (hojeISO() < fecha) return { texto: `Aberta, fecha em ${fmtDataCurta(fecha)}`, classe: st.alerta ? st.classe : "", alerta: st.alerta };
    return { texto: `Fechada. ${st.texto}`, classe: st.classe, alerta: st.alerta };
  }
  function rotuloParcela(p) {
    const lanc = lancDe(p);
    if (!lanc) return "";
    if (lanc.condicao === "fixo") return "Fixa";
    if (lanc.condicao === "parcelado") return `${p.numero}/${lanc.total_parcelas}`;
    return "";
  }

  /** Junta parcelas de cartão em faturas (mesmo cartão + mesmo vencimento). */
  function agrupar(parcelas) {
    const entradas = [];
    const faturas = new Map();
    for (const p of parcelas) {
      if (!lancDe(p)) continue;
      const cartao = p.cartao_id ? estado.cartaoPorId.get(p.cartao_id) : null;
      if (!cartao) { entradas.push({ tipo: "parcela", p, vencimento: p.vencimento, valor: valorEfetivo(p) }); continue; }
      const chave = `${p.cartao_id}|${p.vencimento}`;
      let f = faturas.get(chave);
      if (!f) {
        f = { tipo: "fatura", cartao, vencimento: p.vencimento, parcelas: [], abertas: [], valor: 0 };
        faturas.set(chave, f);
        entradas.push(f);
      }
      f.parcelas.push(p);
      if (!p.baixado) f.abertas.push(p);
      f.valor += valorEfetivo(p);
    }
    return entradas.sort((x, y) => x.vencimento.localeCompare(y.vencimento));
  }

  // ---------------------------------------------------------------------------
  // Carregamento de dados
  // ---------------------------------------------------------------------------
  async function carregarCadastros() {
    const [cats, formas, cartoes] = await Promise.all([
      exec(sb.from("categorias").select("id,nome,tipo").order("nome")),
      exec(sb.from("formas_pagamento").select("id,nome,tipo").order("nome")),
      exec(sb.from("cartoes").select("*").order("nome")),
    ]);
    estado.categorias = cats;
    estado.formas = formas;
    estado.cartoes = cartoes;
    estado.catPorId = new Map(cats.map((c) => [c.id, c]));
    estado.formaPorId = new Map(formas.map((f) => [f.id, f]));
    estado.cartaoPorId = new Map(cartoes.map((c) => [c.id, c]));
  }
  async function carregarLancamentos() {
    estado.lancamentos = await buscarTodos(() => sb.from("lancamentos").select("*").order("id"));
    estado.lancPorId = new Map(estado.lancamentos.map((l) => [l.id, l]));
  }
  function parcelasDoPeriodo(ini, fim) {
    return buscarTodos(() => sb.from("parcelas").select("*").gte("vencimento", ini).lt("vencimento", fim)
      .order("vencimento").order("id"));
  }
  function parcelasAbertas() {
    return buscarTodos(() => sb.from("parcelas").select("*").eq("baixado", false).order("vencimento").order("id"));
  }

  /** Contas fixas: mantém lançado sempre até 1 ano à frente. */
  async function renovarFixos() {
    for (const lanc of estado.lancamentos) {
      if (lanc.condicao !== "fixo" || !lanc.ativo) continue;
      const novas = gerarParcelas(lanc, lanc.qtd_gerada + 1, false);
      if (!novas.length) continue;
      await exec(sb.from("parcelas").upsert(novas.map((p) => ({ ...p, lancamento_id: lanc.id })),
        { onConflict: "lancamento_id,numero", ignoreDuplicates: true }));
      const ultima = novas[novas.length - 1].numero;
      await exec(sb.from("lancamentos").update({ qtd_gerada: ultima }).eq("id", lanc.id));
      lanc.qtd_gerada = ultima;
    }
  }

  async function atualizarBadge(abertas) {
    try {
      abertas = abertas || await parcelasAbertas();
      const limite = addDiasISO(hojeISO(), DIAS_ALERTA);
      const n = agrupar(abertas.filter((p) => p.vencimento <= limite)).length;
      const badge = $("#badge-contas");
      badge.hidden = n === 0;
      badge.textContent = n;
      badge.setAttribute("aria-label", `${n} ${plural(n, "conta precisa", "contas precisam")} de atenção`);
    } catch (e) { console.error(e); }
  }

  /** Depois de qualquer alteração: recarrega lançamentos, a tela atual e o contador. */
  async function aposMudanca() {
    estado.rel.cacheAno = null;
    try { await carregarLancamentos(); } catch (e) { toast(msgErro(e), true); }
    recarregarView();
    if (estado.view !== "inicio" && estado.view !== "contas") atualizarBadge();
  }

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
    const [a, m] = partesISO(hojeISO());
    for (const alvo of [estado.inicio, estado.contas, estado.rel]) { alvo.ano = a; alvo.mes = m; }
    $("#l-data").value = hojeISO();
    try {
      await carregarCadastros();
      if (estado.categorias.length === 0 && estado.formas.length === 0) {
        await exec(sb.from("categorias").insert(CATEGORIAS_PADRAO));
        await exec(sb.from("formas_pagamento").insert(FORMAS_PADRAO));
        await carregarCadastros();
      }
      await carregarLancamentos();
      await renovarFixos();
    } catch (e) { toast(msgErro(e), true); }
    atualizarFormLancar();
    // Recarrega a aba ATUAL (não força uma aba): se a pessoa já tocou em outra
    // aba enquanto os dados carregavam, ela continua onde está.
    recarregarView();
    if (estado.view !== "inicio" && estado.view !== "contas") atualizarBadge();
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
    if (v === "inicio") carregarInicio();
    else if (v === "lancar") carregarRecentes();
    else if (v === "contas") carregarContas();
    else if (v === "relatorios") carregarRelatorio();
    else if (v === "cadastros") renderCadastros();
  }

  // Ao voltar pro app (ex.: no dia seguinte), renova fixas e atualiza a tela.
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !estado.iniciado) return;
    try { await carregarLancamentos(); await renovarFixos(); } catch (e) { console.error(e); }
    recarregarView();
    if (estado.view !== "inicio" && estado.view !== "contas") atualizarBadge();
  });

  // ---------------------------------------------------------------------------
  // Itens de lista (parcela ou fatura)
  // ---------------------------------------------------------------------------
  function itemEntrada(e, { mostrarTipo = false } = {}) {
    if (e.tipo === "fatura") {
      const st = situacaoFatura(e);
      return h("li", {}, h("button", { class: "item item-clicavel " + (st.classe || ""), type: "button", onclick: () => abrirFatura(e) },
        h("span", { class: "item-titulo" }, `Fatura ${e.cartao.nome}`),
        h("span", { class: "item-valor despesa" }, fmtBRL(e.valor),
          h("small", {}, `${e.parcelas.length} ${plural(e.parcelas.length, "lançamento", "lançamentos")}`)),
        h("span", { class: "item-meta" },
          h("span", { class: "item-status" }, st.texto),
          h("span", {}, `vence ${fmtData(e.vencimento)}`)),
      ));
    }
    const p = e.p;
    const lanc = lancDe(p);
    const st = situacaoParcela(p);
    const cat = estado.catPorId.get(lanc.categoria_id)?.nome ?? "";
    const rotulo = rotuloParcela(p);
    return h("li", {}, h("button", { class: "item item-clicavel " + (st.classe || ""), type: "button", onclick: () => abrirParcela(p) },
      h("span", { class: "item-titulo" }, lanc.descricao || cat),
      h("span", { class: "item-valor " + lanc.tipo }, `${lanc.tipo === "despesa" ? "−" : "+"} ${fmtBRL(valorEfetivo(p))}`,
        rotulo ? h("small", {}, rotulo) : null),
      h("span", { class: "item-meta" },
        h("span", { class: "item-status" }, st.texto),
        p.baixado ? null : h("span", {}, fmtData(p.vencimento)),
        mostrarTipo ? h("span", {}, lanc.tipo === "despesa" ? "a pagar" : "a receber") : null,
        lanc.descricao && cat ? h("span", {}, cat) : null,
        lanc.pessoa ? h("span", {}, lanc.pessoa) : null),
    ));
  }
  function listaOuVazio(ul, entradas, vazio, opcoes) {
    ul.replaceChildren(...(entradas.length ? entradas.map((e) => itemEntrada(e, opcoes)) : [h("li", { class: "vazio" }, vazio)]));
  }

  // ---------------------------------------------------------------------------
  // Início: visão geral do mês
  // ---------------------------------------------------------------------------
  function mudarMes(alvo, delta, recarregar) {
    const [a, m] = partesISO(dataNoMes(alvo.ano, alvo.mes, 1, delta));
    alvo.ano = a; alvo.mes = m;
    recarregar();
  }
  $("#i-mes-ant").addEventListener("click", () => mudarMes(estado.inicio, -1, carregarInicio));
  $("#i-mes-prox").addEventListener("click", () => mudarMes(estado.inicio, 1, carregarInicio));

  async function carregarInicio() {
    const { ano, mes } = estado.inicio;
    $("#i-mes-titulo").textContent = nomeMes(ano, mes);
    const ini = dataNoMes(ano, mes, 1);
    let doMes, abertas;
    try {
      [doMes, abertas] = await Promise.all([parcelasDoPeriodo(ini, dataNoMes(ano, mes, 1, 1)), parcelasAbertas()]);
    } catch (e) { toast(msgErro(e), true); return; }
    atualizarBadge(abertas);
    doMes = doMes.filter(lancDe);
    abertas = abertas.filter(lancDe);

    const linha = (tipo) => {
      const lista = doMes.filter((p) => lancDe(p).tipo === tipo);
      const feito = soma(lista.filter((p) => p.baixado), valorEfetivo);
      const falta = soma(lista.filter((p) => !p.baixado), valorEfetivo);
      return { feito, falta, total: feito + falta };
    };
    const r = linha("receita"), d = linha("despesa");
    const celula = (v, classe) => h("td", { class: classe || "" }, fmtNumero(v));
    const classeSaldo = (v) => (v < 0 ? "despesa" : "receita");
    $("#i-resumo tbody").replaceChildren(
      h("tr", {}, h("th", {}, "Receitas"), celula(r.feito, "receita"), celula(r.falta), celula(r.total)),
      h("tr", {}, h("th", {}, "Despesas"), celula(d.feito, "despesa"), celula(d.falta), celula(d.total)),
      h("tr", { class: "linha-saldo" }, h("th", {}, "Saldo"),
        celula(r.feito - d.feito, classeSaldo(r.feito - d.feito)),
        celula(r.falta - d.falta),
        celula(r.total - d.total, classeSaldo(r.total - d.total))),
    );

    const hoje = hojeISO();
    const atrasadas = agrupar(abertas.filter((p) => p.vencimento < hoje));
    $("#i-atraso-painel").hidden = atrasadas.length === 0;
    $("#i-atraso-titulo").textContent = `Em atraso (${fmtBRL(soma(atrasadas, (e) => e.tipo === "fatura" ? soma(e.abertas, valorEfetivo) : e.valor))})`;
    listaOuVazio($("#i-atraso"), atrasadas, "", { mostrarTipo: true });

    const proximas = agrupar(abertas.filter((p) => p.vencimento >= hoje && p.vencimento <= addDiasISO(hoje, 7)));
    listaOuVazio($("#i-proximos"), proximas, "Nada vencendo nos próximos 7 dias.", { mostrarTipo: true });

    const faturas = estado.cartoes.map((c) => {
      const futuras = agrupar(abertas.filter((p) => p.cartao_id === c.id && p.vencimento >= hoje));
      return futuras[0];
    }).filter(Boolean);
    $("#i-cartoes-painel").hidden = faturas.length === 0;
    listaOuVazio($("#i-cartoes"), faturas, "");
  }

  // ---------------------------------------------------------------------------
  // Cadastros
  // ---------------------------------------------------------------------------
  function preencherSelect(select, itens, selecionado, rotulo = (i) => i.nome) {
    select.replaceChildren(...itens.map((i) => h("option", { value: i.id }, rotulo(i))));
    if (selecionado != null && itens.some((i) => i.id === selecionado)) select.value = String(selecionado);
  }
  function categoriasDoTipo(tipo) { return estado.categorias.filter((c) => c.tipo === tipo); }
  function formasImediatas() { return estado.formas.filter((f) => f.tipo === "imediata"); }
  /** Forma sugerida ao dar baixa: a do lançamento se for "na hora"; senão Pix; senão a primeira. */
  function formaSugerida(preferidaId) {
    const imediatas = formasImediatas();
    return imediatas.find((f) => f.id === preferidaId)?.id
      ?? imediatas.find((f) => f.nome.trim().toLowerCase() === "pix")?.id
      ?? imediatas[0]?.id;
  }

  function renderCadastros() {
    const remover = (tabela, item) => h("button", { class: "btn-remover", type: "button", "aria-label": `Remover ${item.nome}`,
      onclick: () => removerCadastro(tabela, item) }, "Remover");
    const linhaCat = (c) => h("li", {}, h("span", {}, c.nome), remover("categorias", c));
    $("#lista-cat-despesa").replaceChildren(...categoriasDoTipo("despesa").map(linhaCat));
    $("#lista-cat-receita").replaceChildren(...categoriasDoTipo("receita").map(linhaCat));
    $("#lista-formas").replaceChildren(...estado.formas.map((f) => {
      const sel = h("select", { class: "select-mini", "aria-label": `Como funciona ${f.nome}`,
        onchange: (ev) => mudarTipoForma(f, ev.target.value) },
        ...Object.entries(TIPO_FORMA).map(([v, t]) => h("option", { value: v, selected: v === f.tipo }, t)));
      return h("li", {}, h("span", {}, f.nome), h("span", { class: "li-acoes" }, sel, remover("formas_pagamento", f)));
    }));
    $("#lista-cartoes").replaceChildren(...(estado.cartoes.length
      ? estado.cartoes.map((c) => h("li", {},
          h("span", {}, c.nome, h("small", { class: "dica" }, ` fecha dia ${c.dia_fechamento}, vence dia ${c.dia_vencimento}`)),
          remover("cartoes", c)))
      : [h("li", { class: "dica" }, "Nenhum cartão ainda.")]));
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
      await exec(sb.from("formas_pagamento").insert({ nome, tipo: $("#forma-tipo").value }));
      $("#forma-nome").value = "";
      await aposMudarCadastros();
      toast(`Forma de pagamento “${nome}” adicionada.`);
    });
  });

  function mudarTipoForma(forma, tipo) {
    acao(null, async () => {
      await exec(sb.from("formas_pagamento").update({ tipo }).eq("id", forma.id));
      await aposMudarCadastros();
      toast(`“${forma.nome}” agora é: ${TIPO_FORMA[tipo]}. Vale pros próximos lançamentos.`);
    });
  }

  $("#form-cartao").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nome = $("#cartao-nome").value.trim();
    const fecha = parseInt($("#cartao-fecha").value, 10);
    const vence = parseInt($("#cartao-vence").value, 10);
    if (!nome) { toast("Digite o nome do cartão.", true); return; }
    if (!(fecha >= 1 && fecha <= 31) || !(vence >= 1 && vence <= 31)) { toast("Dias de fechamento e vencimento devem ser entre 1 e 31.", true); return; }
    acao(ev.submitter, async () => {
      await exec(sb.from("cartoes").insert({ nome, dia_fechamento: fecha, dia_vencimento: vence }));
      $("#cartao-nome").value = ""; $("#cartao-fecha").value = ""; $("#cartao-vence").value = "";
      await aposMudarCadastros();
      toast(`Cartão “${nome}” adicionado.`);
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
  const radio = (nome, raiz = document) => raiz.querySelector(`input[name="${nome}"]:checked`).value;

  /** Lê o formulário e devolve o lançamento como ficaria salvo. */
  function lancamentoDoForm() {
    const tipo = radio("tipo");
    const condicao = radio("condicao");
    const forma = estado.formaPorId.get(Number($("#l-forma").value));
    const ehCartao = tipo === "despesa" && forma?.tipo === "cartao";
    const intervalo = ehCartao ? "mensal" : $("#l-intervalo").value;
    return {
      tipo, condicao, forma, ehCartao,
      dados: {
        tipo,
        descricao: $("#l-descricao").value.trim(),
        pessoa: $("#l-pessoa").value.trim(),
        observacao: $("#l-obs").value.trim(),
        categoria_id: Number($("#l-categoria").value),
        forma_pagamento_id: forma?.id,
        cartao_id: ehCartao ? Number($("#l-cartao").value) || null : null,
        data_base: $("#l-data").value,
        condicao,
        total_parcelas: condicao === "parcelado" ? parseInt($("#l-parcelas").value, 10) : condicao === "avista" ? 1 : null,
        valor: lerValor($("#l-valor").value),
        valor_modo: condicao === "parcelado" ? radio("valor-modo") : "total",
        intervalo,
        intervalo_dias: intervalo === "dias" ? parseInt($("#l-intervalo-dias").value, 10) : null,
      },
    };
  }

  function atualizarFormLancar() {
    const tipo = radio("tipo");
    const condicao = radio("condicao");
    $(".valor-grande").dataset.tipo = tipo;
    $("#l-pessoa-rotulo").textContent = tipo === "despesa" ? "Onde / pra quem" : "De quem";
    // Receita não vai pra fatura de cartão.
    const formas = tipo === "receita" ? estado.formas.filter((f) => f.tipo !== "cartao") : estado.formas;
    preencherSelect($("#l-forma"), formas, Number($("#l-forma").value));
    preencherSelect($("#l-categoria"), categoriasDoTipo(tipo), Number($("#l-categoria").value));
    preencherSelect($("#l-cartao"), estado.cartoes, Number($("#l-cartao").value));
    const { forma, ehCartao } = lancamentoDoForm();

    $("#l-cartao-wrap").hidden = !ehCartao || estado.cartoes.length === 0;
    $("#l-sem-cartao").hidden = !(ehCartao && estado.cartoes.length === 0);
    $("#l-parcelas-wrap").hidden = condicao !== "parcelado";
    $("#l-modo-wrap").hidden = condicao !== "parcelado";
    $("#l-intervalo-wrap").hidden = condicao === "avista" || ehCartao;
    $("#l-intervalo-dias").hidden = $("#l-intervalo").value !== "dias";
    $("#l-data-rotulo").textContent = ehCartao ? "Data da compra" : condicao === "avista" ? "Data" : "1º vencimento";

    const podeBaixar = condicao === "avista" && !ehCartao;
    $("#l-pago-wrap").hidden = !podeBaixar;
    $("#l-pago-rotulo").textContent = tipo === "despesa" ? "Já pago" : "Já recebido";
    const data = $("#l-data").value;
    $("#l-pago").checked = podeBaixar && forma?.tipo === "imediata" && !!data && data <= hojeISO();
    atualizarPrevia();
  }

  function atualizarPrevia() {
    const { dados, ehCartao, condicao, tipo } = lancamentoDoForm();
    const alvo = $("#l-previa");
    const n = dados.total_parcelas;
    const ok = dados.valor > 0 && dados.data_base && (!ehCartao || dados.cartao_id)
      && (condicao !== "parcelado" || (n >= 2 && n <= 120))
      && (dados.intervalo !== "dias" || dados.intervalo_dias >= 1);
    if (!ok) { alvo.textContent = ""; return; }
    const parcelas = gerarParcelas(dados);
    const primeira = parcelas[0];
    const cartao = ehCartao ? estado.cartaoPorId.get(dados.cartao_id) : null;
    const naFatura = cartao ? ` na fatura do ${cartao.nome}` : "";
    const repete = dados.intervalo === "dias" ? `a cada ${dados.intervalo_dias} dias` : "todo mês";
    let txt;
    if (condicao === "avista") {
      if (cartao) txt = `Cai na fatura do ${cartao.nome} que vence em ${fmtData(primeira.vencimento)}.`;
      else if ($("#l-pago").checked) txt = `Entra como ${tipo === "despesa" ? "pago" : "recebido"} em ${fmtData(primeira.vencimento)}.`;
      else txt = `Fica em aberto, vence em ${fmtData(primeira.vencimento)}.`;
    } else if (condicao === "parcelado") {
      const v1 = parcelas[0].valor, vN = parcelas[parcelas.length - 1].valor;
      const valores = v1 === vN ? `${n}× de ${fmtBRL(v1)}`
        : `${parcelas.filter((p) => p.valor === v1).length}× de ${fmtBRL(v1)} e ${parcelas.filter((p) => p.valor === vN).length}× de ${fmtBRL(vN)}`;
      const total = soma(parcelas, (p) => p.valor);
      txt = `${valores}${naFatura} (total ${fmtBRL(total)}). A 1ª vence em ${fmtData(primeira.vencimento)}${cartao ? "" : `, depois ${repete}`}.`;
    } else {
      txt = `${fmtBRL(dados.valor)} ${cartao ? "todo mês" : repete}${naFatura}, a partir de ${fmtData(primeira.vencimento)}. ` +
        `Os próximos 12 meses ficam lançados e o app vai renovando sozinho.`;
    }
    alvo.textContent = txt;
  }

  formLancar.querySelectorAll('input[name="tipo"], input[name="condicao"]').forEach((r) => r.addEventListener("change", atualizarFormLancar));
  ["#l-forma", "#l-data", "#l-intervalo"].forEach((s) => $(s).addEventListener("change", atualizarFormLancar));
  ["#l-valor", "#l-parcelas", "#l-intervalo-dias"].forEach((s) => $(s).addEventListener("input", atualizarPrevia));
  $("#l-cartao").addEventListener("change", atualizarPrevia);
  $("#l-pago").addEventListener("change", atualizarPrevia);
  formLancar.querySelectorAll('input[name="valor-modo"]').forEach((r) => r.addEventListener("change", atualizarPrevia));
  $("#l-ir-cartoes").addEventListener("click", () => mostrarView("cadastros"));

  /** Cria o lançamento e as parcelas. 'jaPago' dá baixa na hora (à vista). */
  async function criarLancamento(dados, jaPago) {
    const parcelas = gerarParcelas(dados);
    const qtd = dados.condicao === "fixo" ? parcelas[parcelas.length - 1].numero : parcelas.length;
    const lanc = await exec(sb.from("lancamentos").insert({ ...dados, qtd_gerada: qtd }).select("*").single());
    const linhas = parcelas.map((p) => ({ ...p, lancamento_id: lanc.id }));
    if (jaPago) Object.assign(linhas[0], { baixado: true, data_baixa: dados.data_base, forma_baixa_id: dados.forma_pagamento_id });
    try { await exec(sb.from("parcelas").insert(linhas)); }
    catch (e) { await sb.from("lancamentos").delete().eq("id", lanc.id); throw e; }
    return { lanc, parcelas: linhas };
  }

  formLancar.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const { dados, ehCartao, condicao, tipo } = lancamentoDoForm();
    if (!(dados.valor > 0)) { toast("Digite um valor maior que zero.", true); $("#l-valor").focus(); return; }
    if (!dados.data_base) { toast("Escolha a data.", true); return; }
    if (!dados.categoria_id || !dados.forma_pagamento_id) { toast("Escolha a categoria e a forma de pagamento.", true); return; }
    if (ehCartao && !dados.cartao_id) { toast("Cadastre um cartão em Cadastros pra lançar no crédito.", true); return; }
    if (condicao === "parcelado" && !(dados.total_parcelas >= 2 && dados.total_parcelas <= 120)) { toast("Número de parcelas deve ser entre 2 e 120.", true); return; }
    if (dados.intervalo === "dias" && !(dados.intervalo_dias >= 1 && dados.intervalo_dias <= 365)) { toast("O intervalo deve ser entre 1 e 365 dias.", true); return; }
    const jaPago = !$("#l-pago-wrap").hidden && $("#l-pago").checked;

    acao($("#l-salvar"), async () => {
      const { parcelas } = await criarLancamento(dados, jaPago);
      $("#l-valor").value = "";
      $("#l-descricao").value = "";
      $("#l-pessoa").value = "";
      $("#l-obs").value = "";
      formLancar.querySelector('input[name="condicao"][value="avista"]').checked = true;
      atualizarFormLancar();
      const cartao = ehCartao ? estado.cartaoPorId.get(dados.cartao_id) : null;
      let msg;
      if (condicao === "fixo") msg = `Conta fixa salva: ${parcelas.length} meses lançados.`;
      else if (cartao) msg = `Lançado na fatura do ${cartao.nome}${condicao === "parcelado" ? ` em ${parcelas.length} parcelas` : ""}.`;
      else if (condicao === "parcelado") msg = `Lançamento salvo em ${parcelas.length} parcelas.`;
      else msg = jaPago ? `Lançamento salvo como ${tipo === "despesa" ? "pago" : "recebido"}.` : "Lançamento salvo em aberto.";
      toast(msg);
      aposMudanca();
    });
  });

  function carregarRecentes() {
    const recentes = [...estado.lancamentos].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, 6);
    const ul = $("#lista-recentes");
    if (!recentes.length) {
      ul.replaceChildren(h("li", { class: "vazio" }, "Nada lançado ainda. O primeiro lançamento aparece aqui."));
      return;
    }
    ul.replaceChildren(...recentes.map((l) => {
      const cat = estado.catPorId.get(l.categoria_id)?.nome ?? "";
      const forma = estado.formaPorId.get(l.forma_pagamento_id)?.nome ?? "";
      const cartao = l.cartao_id ? estado.cartaoPorId.get(l.cartao_id)?.nome : null;
      const valor = l.condicao === "parcelado"
        ? (l.valor_modo === "total" ? fmtBRL(l.valor) : `${l.total_parcelas}× ${fmtBRL(l.valor)}`)
        : fmtBRL(l.valor);
      const condicao = l.condicao === "fixo" ? "Fixo" : l.condicao === "parcelado" ? `${l.total_parcelas}x` : "À vista";
      return h("li", {}, h("button", { class: "item item-clicavel", type: "button", onclick: () => abrirLancamento(l) },
        h("span", { class: "item-titulo" }, l.descricao || cat),
        h("span", { class: "item-valor " + l.tipo }, `${l.tipo === "despesa" ? "−" : "+"} ${valor}`, h("small", {}, condicao)),
        h("span", { class: "item-meta" },
          h("span", {}, fmtData(l.data_base)),
          l.descricao ? h("span", {}, cat) : null,
          h("span", {}, cartao ? `${forma} · ${cartao}` : forma),
          l.pessoa ? h("span", {}, l.pessoa) : null),
      ));
    }));
  }

  /** Abre um lançamento pela sua primeira parcela em aberto (ou a primeira). */
  async function abrirLancamento(lanc) {
    try {
      const parcelas = await exec(sb.from("parcelas").select("*").eq("lancamento_id", lanc.id).order("numero"));
      const alvo = parcelas.find((p) => !p.baixado) || parcelas[0];
      if (alvo) abrirParcela(alvo);
    } catch (e) { toast(msgErro(e), true); }
  }

  // ---------------------------------------------------------------------------
  // Modal da parcela: baixar, desfazer, editar, excluir
  // ---------------------------------------------------------------------------
  const modalP = $("#modal-parcela");

  function abrirParcela(p) {
    const lanc = lancDe(p);
    if (!lanc) return;
    estado.parcela = p;
    const cat = estado.catPorId.get(lanc.categoria_id)?.nome ?? "";
    const forma = estado.formaPorId.get(lanc.forma_pagamento_id)?.nome ?? "";
    const cartao = p.cartao_id ? estado.cartaoPorId.get(p.cartao_id) : null;
    const st = situacaoParcela(p);
    const pagar = lanc.tipo === "despesa";

    $("#mp-titulo").textContent = lanc.descricao || cat;
    const cond = lanc.condicao === "fixo" ? "Conta fixa" : lanc.condicao === "parcelado" ? `Parcela ${p.numero} de ${lanc.total_parcelas}` : "À vista";
    $("#mp-sub").textContent = `${pagar ? "A pagar" : "A receber"} · ${cond}`;
    $("#mp-valor").textContent = fmtBRL(valorEfetivo(p));
    $("#mp-valor").className = "detalhe-valor " + lanc.tipo;
    $("#mp-situacao").textContent = cartao && !p.baixado ? `Na fatura do ${cartao.nome} que vence em ${fmtData(p.vencimento)}` : st.texto;
    $("#mp-situacao").className = "situacao " + (st.classe || "");

    const linhas = [
      ["Vencimento", fmtData(p.vencimento)],
      ["Categoria", cat],
      ["Forma de pagamento", cartao ? `${forma} (${cartao.nome})` : forma],
      [pagar ? "Onde / pra quem" : "De quem", lanc.pessoa],
      ["Observação", lanc.observacao],
      ["Lançado em", fmtData(lanc.data_lancamento)],
    ];
    if (p.baixado) {
      linhas.push([pagar ? "Pago em" : "Recebido em", fmtData(p.data_baixa)]);
      if (p.valor_baixa != null) linhas.push(["Valor original", fmtBRL(p.valor)]);
      const fb = estado.formaPorId.get(p.forma_baixa_id)?.nome;
      if (fb) linhas.push(["Pago com", fb]);
    }
    $("#mp-detalhes").replaceChildren(...linhas.filter(([, v]) => v).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));

    $("#mp-baixar").textContent = pagar ? "Pagar" : "Receber";
    $("#mp-baixar").hidden = p.baixado || !!cartao;
    $("#mp-desfazer").hidden = !p.baixado || !!cartao;
    $("#mp-ver-fatura").hidden = !cartao;
    $("#mp-form-baixa").hidden = true;
    $("#mp-form-editar").hidden = true;
    $("#mp-acoes").hidden = false;
    if (!modalP.open) modalP.showModal();
  }

  // Baixa
  $("#mp-baixar").addEventListener("click", () => {
    const p = estado.parcela, lanc = lancDe(p);
    $("#mp-baixa-titulo").textContent = lanc.tipo === "despesa" ? "Confirmar pagamento" : "Confirmar recebimento";
    $("#mp-b-data").value = hojeISO();
    $("#mp-b-valor").value = valorParaCampo(p.valor);
    const formaLanc = estado.formaPorId.get(lanc.forma_pagamento_id);
    preencherSelect($("#mp-b-forma"), formasImediatas(), formaSugerida(formaLanc?.id));
    $("#mp-form-baixa").hidden = false;
    $("#mp-acoes").hidden = true;
  });
  $("#mp-b-cancelar").addEventListener("click", () => abrirParcela(estado.parcela));
  $("#mp-form-baixa").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const p = estado.parcela;
    const valor = lerValor($("#mp-b-valor").value);
    const data = $("#mp-b-data").value;
    if (!(valor > 0)) { toast("Digite um valor maior que zero.", true); return; }
    if (!data) { toast("Escolha a data.", true); return; }
    acao($("#mp-b-confirmar"), async () => {
      await exec(sb.from("parcelas").update({
        baixado: true, data_baixa: data,
        valor_baixa: valor === Number(p.valor) ? null : valor,
        forma_baixa_id: Number($("#mp-b-forma").value) || null,
      }).eq("id", p.id));
      modalP.close();
      toast(lancDe(p).tipo === "despesa" ? "Pagamento registrado." : "Recebimento registrado.");
      aposMudanca();
    });
  });
  $("#mp-desfazer").addEventListener("click", () => {
    const p = estado.parcela;
    acao($("#mp-desfazer"), async () => {
      await exec(sb.from("parcelas").update({ baixado: false, data_baixa: null, valor_baixa: null, forma_baixa_id: null }).eq("id", p.id));
      modalP.close();
      toast("Baixa desfeita. A parcela voltou pra em aberto.");
      aposMudanca();
    });
  });

  // Editar
  $("#mp-editar").addEventListener("click", () => {
    const p = estado.parcela, lanc = lancDe(p);
    $("#mp-e-valor").value = valorParaCampo(p.valor);
    $("#mp-e-venc").value = p.vencimento;
    $("#mp-e-proximas").checked = false;
    $("#mp-e-proximas-wrap").hidden = lanc.condicao === "avista";
    $("#mp-e-desc").value = lanc.descricao;
    $("#mp-e-pessoa").value = lanc.pessoa;
    $("#mp-e-obs").value = lanc.observacao;
    preencherSelect($("#mp-e-categoria"), categoriasDoTipo(lanc.tipo), lanc.categoria_id);
    $("#mp-form-editar").hidden = false;
    $("#mp-acoes").hidden = true;
  });
  $("#mp-e-cancelar").addEventListener("click", () => abrirParcela(estado.parcela));
  $("#mp-form-editar").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const p = estado.parcela, lanc = lancDe(p);
    const valor = lerValor($("#mp-e-valor").value);
    const venc = $("#mp-e-venc").value;
    if (!(valor > 0)) { toast("Digite um valor maior que zero.", true); return; }
    if (!venc) { toast("Escolha o vencimento.", true); return; }
    const proximas = !$("#mp-e-proximas-wrap").hidden && $("#mp-e-proximas").checked;
    acao($("#mp-e-salvar"), async () => {
      await exec(sb.from("parcelas").update({ valor, vencimento: venc }).eq("id", p.id));
      if (proximas) {
        await exec(sb.from("parcelas").update({ valor }).eq("lancamento_id", lanc.id).gt("numero", p.numero).eq("baixado", false));
      }
      const mudancas = {
        descricao: $("#mp-e-desc").value.trim(),
        pessoa: $("#mp-e-pessoa").value.trim(),
        observacao: $("#mp-e-obs").value.trim(),
        categoria_id: Number($("#mp-e-categoria").value),
      };
      if (proximas && lanc.condicao === "fixo") mudancas.valor = valor; // as próximas geradas usam o valor novo
      await exec(sb.from("lancamentos").update(mudancas).eq("id", lanc.id));
      modalP.close();
      toast(proximas ? "Alterações salvas, inclusive nas próximas parcelas." : "Alterações salvas.");
      aposMudanca();
    });
  });

  // Excluir
  $("#mp-excluir").addEventListener("click", async () => {
    const p = estado.parcela, lanc = lancDe(p);
    const dlg = $("#modal-excluir");
    const varias = lanc.condicao !== "avista";
    $("#mx-texto").textContent = varias
      ? `“${lanc.descricao || "Lançamento"}” tem várias parcelas. O que você quer excluir?`
      : `Excluir “${lanc.descricao || "este lançamento"}”?`;
    $("#mx-parcela").hidden = !varias;
    $("#mx-proximas").hidden = !varias;
    $("#mx-proximas").textContent = lanc.condicao === "fixo" ? "Esta e as próximas (encerra a conta fixa)" : "Esta e as próximas em aberto";
    $("#mx-tudo").textContent = varias ? "O lançamento inteiro" : "Excluir";
    modalP.close();
    dlg.returnValue = "";
    dlg.showModal();
    const escolha = await new Promise((ok) => dlg.addEventListener("close", () => ok(dlg.returnValue), { once: true }));
    if (!["parcela", "proximas", "tudo"].includes(escolha)) { abrirParcela(p); return; }
    acao(null, async () => {
      if (escolha === "tudo") {
        await exec(sb.from("lancamentos").delete().eq("id", lanc.id));
        toast("Lançamento excluído.");
      } else if (escolha === "parcela") {
        await exec(sb.from("parcelas").delete().eq("id", p.id));
        toast("Parcela excluída.");
      } else {
        await exec(sb.from("parcelas").delete().eq("lancamento_id", lanc.id).gte("numero", p.numero).eq("baixado", false));
        if (lanc.condicao === "fixo") await exec(sb.from("lancamentos").update({ ativo: false }).eq("id", lanc.id));
        toast(lanc.condicao === "fixo" ? "Conta fixa encerrada a partir desta parcela." : "Parcelas excluídas.");
      }
      aposMudanca();
    });
  });

  $("#mp-ver-fatura").addEventListener("click", async () => {
    const p = estado.parcela;
    try {
      const parcelas = await exec(sb.from("parcelas").select("*").eq("cartao_id", p.cartao_id).eq("vencimento", p.vencimento).order("id"));
      modalP.close();
      const f = agrupar(parcelas)[0];
      if (f) abrirFatura(f);
    } catch (e) { toast(msgErro(e), true); }
  });

  document.querySelectorAll("[data-fechar]").forEach((b) =>
    b.addEventListener("click", () => b.closest("dialog").close()));

  // ---------------------------------------------------------------------------
  // Modal da fatura
  // ---------------------------------------------------------------------------
  const modalF = $("#modal-fatura");

  function abrirFatura(f) {
    estado.fatura = f;
    const st = situacaoFatura(f);
    $("#mf-titulo").textContent = `Fatura ${f.cartao.nome}`;
    $("#mf-sub").textContent = `Vence em ${fmtData(f.vencimento)} · fecha em ${fmtData(fechamentoFatura(f.cartao, f.vencimento))}`;
    $("#mf-total").textContent = fmtBRL(f.valor);
    $("#mf-situacao").textContent = st.texto;
    $("#mf-situacao").className = "situacao " + (st.classe || "");
    $("#mf-itens").replaceChildren(...f.parcelas.map((p) => {
      const lanc = lancDe(p);
      const cat = estado.catPorId.get(lanc.categoria_id)?.nome ?? "";
      const rotulo = rotuloParcela(p);
      return h("li", {}, h("button", { class: "item item-clicavel", type: "button", onclick: () => { modalF.close(); abrirParcela(p); } },
        h("span", { class: "item-titulo" }, lanc.descricao || cat),
        h("span", { class: "item-valor despesa" }, fmtBRL(valorEfetivo(p)), rotulo ? h("small", {}, rotulo) : null),
        h("span", { class: "item-meta" }, h("span", {}, `compra ${fmtData(lanc.data_base)}`), lanc.descricao ? h("span", {}, cat) : null)));
    }));
    const aberta = f.abertas.length > 0;
    $("#mf-pagar").hidden = !aberta;
    $("#mf-confirmar").hidden = !aberta;
    $("#mf-confirmar").textContent = `Pagar ${fmtBRL(soma(f.abertas, valorEfetivo))}`;
    $("#mf-desfazer").hidden = aberta;
    $("#mf-data").value = hojeISO();
    preencherSelect($("#mf-forma"), formasImediatas(), formaSugerida());
    if (!modalF.open) modalF.showModal();
  }

  $("#mf-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = estado.fatura;
    const data = $("#mf-data").value;
    if (!data) { toast("Escolha a data do pagamento.", true); return; }
    acao($("#mf-confirmar"), async () => {
      await exec(sb.from("parcelas").update({
        baixado: true, data_baixa: data, valor_baixa: null, forma_baixa_id: Number($("#mf-forma").value) || null,
      }).eq("cartao_id", f.cartao.id).eq("vencimento", f.vencimento).eq("baixado", false));
      modalF.close();
      toast(`Fatura do ${f.cartao.nome} paga.`);
      aposMudanca();
    });
  });
  $("#mf-desfazer").addEventListener("click", () => {
    const f = estado.fatura;
    acao($("#mf-desfazer"), async () => {
      await exec(sb.from("parcelas").update({ baixado: false, data_baixa: null, valor_baixa: null, forma_baixa_id: null })
        .eq("cartao_id", f.cartao.id).eq("vencimento", f.vencimento));
      modalF.close();
      toast("Pagamento da fatura desfeito.");
      aposMudanca();
    });
  });

  // ---------------------------------------------------------------------------
  // Contas a pagar / a receber
  // ---------------------------------------------------------------------------
  document.querySelectorAll('input[name="c-lado"], input[name="c-situacao"]').forEach((r) =>
    r.addEventListener("change", carregarContas));
  $("#c-mes-ant").addEventListener("click", () => mudarMes(estado.contas, -1, carregarContas));
  $("#c-mes-prox").addEventListener("click", () => mudarMes(estado.contas, 1, carregarContas));

  async function carregarContas() {
    const c = estado.contas;
    c.lado = radio("c-lado");
    c.situacao = radio("c-situacao");
    $("#c-rotulo-baixado").textContent = c.lado === "despesa" ? "Pagos" : "Recebidos";
    $("#c-mes-nav").hidden = c.situacao === "atraso";
    $("#c-mes-titulo").textContent = nomeMes(c.ano, c.mes);
    let parcelas, abertas;
    try {
      abertas = await parcelasAbertas();
      parcelas = c.situacao === "atraso" ? abertas
        : await parcelasDoPeriodo(dataNoMes(c.ano, c.mes, 1), dataNoMes(c.ano, c.mes, 1, 1));
    } catch (e) { toast(msgErro(e), true); return; }
    atualizarBadge(abertas);
    const filtro = {
      aberto: (p) => !p.baixado,
      atraso: (p) => emAtraso(p),
      baixado: (p) => p.baixado,
      tudo: () => true,
    }[c.situacao];
    const daqui = parcelas.filter((p) => lancDe(p)?.tipo === c.lado && filtro(p));
    c.entradas = agrupar(daqui);
    c.parcelas = daqui;
    const total = soma(daqui, valorEfetivo);
    $("#c-total").textContent = daqui.length ? `${c.entradas.length} ${plural(c.entradas.length, "item", "itens")} · ${fmtBRL(total)}` : "";
    const vazio = {
      aberto: c.lado === "despesa" ? "Nada a pagar neste mês." : "Nada a receber neste mês.",
      atraso: "Nada em atraso.",
      baixado: c.lado === "despesa" ? "Nada pago neste mês." : "Nada recebido neste mês.",
      tudo: "Nenhum lançamento neste mês.",
    }[c.situacao];
    listaOuVazio($("#lista-contas"), c.entradas, vazio);
  }

  $("#btn-csv-contas").addEventListener("click", () => {
    const c = estado.contas;
    if (!c.parcelas?.length) { toast("Não há nada nesta lista pra exportar.", true); return; }
    const sufixo = c.situacao === "atraso" ? "em-atraso" : `${c.ano}-${pad(c.mes)}`;
    baixarCSV(`${c.lado === "despesa" ? "pagar" : "receber"}_${c.situacao}_${sufixo}.csv`, linhasCSV(c.parcelas));
  });

  function linhasCSV(parcelas) {
    const cab = ["Vencimento", "Tipo", "Descrição", "Categoria", "Onde / quem", "Forma de pagamento", "Cartão",
      "Parcela", "Valor", "Situação", "Data da baixa", "Valor pago", "Observação"];
    return [cab, ...parcelas.map((p) => {
      const l = lancDe(p);
      return [fmtData(p.vencimento), l.tipo === "despesa" ? "A pagar" : "A receber", l.descricao,
        estado.catPorId.get(l.categoria_id)?.nome ?? "", l.pessoa, estado.formaPorId.get(l.forma_pagamento_id)?.nome ?? "",
        p.cartao_id ? estado.cartaoPorId.get(p.cartao_id)?.nome ?? "" : "", rotuloParcela(p) || "À vista",
        fmtNumeroCSV(p.valor), p.baixado ? (l.tipo === "despesa" ? "Pago" : "Recebido") : emAtraso(p) ? "Em atraso" : "Em aberto",
        fmtData(p.data_baixa), p.baixado ? fmtNumeroCSV(valorEfetivo(p)) : "", l.observacao];
    })];
  }

  // ---------------------------------------------------------------------------
  // Relatórios
  // ---------------------------------------------------------------------------
  $("#r-mes").replaceChildren(...MESES.map((m, i) => h("option", { value: i + 1 }, m.charAt(0).toUpperCase() + m.slice(1))));

  function lerFiltrosRelatorio() {
    const r = estado.rel;
    r.periodo = radio("r-periodo");
    r.tipo = radio("r-tipo");
    r.situacao = $("#r-situacao").value;
    r.mes = Number($("#r-mes").value) || r.mes;
    const ano = parseInt($("#r-ano").value, 10);
    if (ano >= 2000 && ano <= 2100) r.ano = ano;
  }
  document.querySelectorAll('input[name="r-periodo"], input[name="r-tipo"]').forEach((el) =>
    el.addEventListener("change", () => { lerFiltrosRelatorio(); carregarRelatorio(); }));
  ["#r-mes", "#r-ano", "#r-situacao"].forEach((s) => $(s).addEventListener("change", () => { lerFiltrosRelatorio(); carregarRelatorio(); }));

  function passaSituacao(p, s) {
    if (s === "baixado") return p.baixado;
    if (s === "aberto") return !p.baixado;
    if (s === "atraso") return emAtraso(p);
    return true;
  }

  async function carregarRelatorio() {
    const r = estado.rel;
    $("#r-mes").value = String(r.mes);
    $("#r-ano").value = String(r.ano);
    $("#r-situacao").value = r.situacao;
    $("#r-mes").hidden = r.periodo !== "mensal";
    if (r.cacheAno !== r.ano) {
      try {
        r.parcelasAno = (await parcelasDoPeriodo(`${r.ano}-01-01`, `${r.ano + 1}-01-01`)).filter(lancDe);
        r.cacheAno = r.ano;
      } catch (e) { toast(msgErro(e), true); return; }
    }
    const prefixoMes = `${r.ano}-${pad(r.mes)}`;
    const doAno = r.parcelasAno.filter((p) => passaSituacao(p, r.situacao));
    const doPeriodo = r.periodo === "mensal" ? doAno.filter((p) => p.vencimento.startsWith(prefixoMes)) : doAno;
    const periodoTxt = r.periodo === "mensal" ? `${MESES[r.mes - 1]} de ${r.ano}` : String(r.ano);

    const receitas = soma(doPeriodo.filter((p) => lancDe(p).tipo === "receita"), valorEfetivo);
    const despesas = soma(doPeriodo.filter((p) => lancDe(p).tipo === "despesa"), valorEfetivo);
    $("#r-resumo").replaceChildren(
      h("div", { class: "receita" }, h("span", {}, "Receitas"), h("strong", {}, fmtBRL(receitas))),
      h("div", { class: "despesa" }, h("span", {}, "Despesas"), h("strong", {}, fmtBRL(despesas))),
      h("div", { class: receitas - despesas < 0 ? "despesa" : "receita" }, h("span", {}, "Saldo"), h("strong", {}, fmtBRL(receitas - despesas))),
    );

    const mapa = new Map();
    const doTipo = doPeriodo.filter((p) => lancDe(p).tipo === r.tipo);
    for (const p of doTipo) {
      const id = lancDe(p).categoria_id;
      mapa.set(id, (mapa.get(id) || 0) + valorEfetivo(p));
    }
    const totalTipo = soma([...mapa.values()], (v) => v);
    const itens = [...mapa.entries()]
      .map(([id, valor]) => ({ nome: estado.catPorId.get(id)?.nome ?? "Sem categoria", valor, pct: totalTipo ? (valor / totalTipo) * 100 : 0 }))
      .sort((a, b) => b.valor - a.valor);
    r.ultimo = { itens, periodoTxt, doPeriodo, receitas, despesas };

    $("#r-titulo-categorias").textContent = `${r.tipo === "despesa" ? "Despesas" : "Receitas"} por categoria em ${periodoTxt}`;
    const ul = $("#r-categorias");
    ul.classList.toggle("receita", r.tipo === "receita");
    if (!itens.length) {
      ul.replaceChildren(h("li", { class: "dica" }, `Nada em ${periodoTxt} com esse filtro.`));
    } else {
      ul.replaceChildren(...itens.map((i) => h("li", {},
        h("span", { class: "cat-nome" }, i.nome),
        h("span", { class: "cat-valor" }, fmtBRL(i.valor), h("small", {}, `${i.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`)),
        h("div", { class: "trilho", role: "presentation" },
          h("div", { class: "preenchido", style: { width: `${Math.max(i.pct, 0.5)}%` } })))));
    }

    $("#r-titulo-evolucao").textContent = `Receitas e despesas mês a mês em ${r.ano}`;
    desenharGrafico(doAno);
  }

  function desenharGrafico(parcelas) {
    if (!window.Chart) return;
    const rec = Array(12).fill(0), desp = Array(12).fill(0);
    for (const p of parcelas) {
      const m = Number(p.vencimento.slice(5, 7)) - 1;
      if (lancDe(p).tipo === "receita") rec[m] += valorEfetivo(p); else desp[m] += valorEfetivo(p);
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
    const u = estado.rel.ultimo;
    if (!u) return;
    const r = estado.rel;
    const sufixo = r.periodo === "mensal" ? `${r.ano}-${pad(r.mes)}` : `${r.ano}`;
    const linhas = [["Categoria", "Valor", "Percentual"],
      ...u.itens.map((i) => [i.nome, fmtNumeroCSV(i.valor), `${i.pct.toFixed(1).replace(".", ",")}%`]),
      [], ["Período", u.periodoTxt], ["Situação", $("#r-situacao").selectedOptions[0].textContent],
      ["Receitas", fmtNumeroCSV(u.receitas)], ["Despesas", fmtNumeroCSV(u.despesas)], ["Saldo", fmtNumeroCSV(u.receitas - u.despesas)],
      [], ...linhasCSV(u.doPeriodo)];
    baixarCSV(`relatorio_${r.tipo}s_${r.situacao}_${sufixo}.csv`, linhas);
  });

  // Redesenha o gráfico se o celular/PC trocar entre tema claro e escuro.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (estado.view === "relatorios") carregarRelatorio();
  });

  // ---------------------------------------------------------------------------
  // Puxar pra atualizar
  // Só no app instalado na tela inicial: no navegador o próprio celular já faz
  // isso. Recarrega a página inteira, então também pega versões novas do app.
  // ---------------------------------------------------------------------------
  (function puxarParaAtualizar() {
    const instalado = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (!instalado) return;
    const aviso = $("#puxar");
    const LIMITE = 70;      // quanto o aviso precisa descer pra valer
    const RESISTENCIA = 0.5; // o aviso anda metade do que o dedo anda
    let inicioY = null, puxado = 0;

    addEventListener("touchstart", (ev) => {
      const podePuxar = window.scrollY <= 0 && ev.touches.length === 1 && !document.querySelector("dialog[open]");
      inicioY = podePuxar ? ev.touches[0].clientY : null;
      puxado = 0;
    }, { passive: true });

    addEventListener("touchmove", (ev) => {
      if (inicioY == null) return;
      if (window.scrollY > 0) { inicioY = null; aviso.hidden = true; return; }
      puxado = Math.max(0, ev.touches[0].clientY - inicioY) * RESISTENCIA;
      const pronto = puxado >= LIMITE;
      aviso.hidden = puxado < 8;
      aviso.style.transform = `translate(-50%, ${Math.min(puxado, LIMITE + 20)}px)`;
      aviso.classList.toggle("pronto", pronto);
      aviso.textContent = pronto ? "Solte para atualizar" : "Puxe para atualizar";
    }, { passive: true });

    addEventListener("touchend", () => {
      if (inicioY == null) return;
      inicioY = null;
      if (puxado >= LIMITE) {
        aviso.textContent = "Atualizando…";
        location.reload();
      } else {
        aviso.hidden = true;
      }
    });
  })();

  iniciar();
})();
