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
    // "1.250,00" e também "2.000" (ponto de milhar sem centavos) viram 1250 e 2000; "12.5" continua 12,50.
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const v = Number(s);
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  }
  function valorParaCampo(v) { return Number(v).toFixed(2).replace(".", ","); }
  function plural(n, s, p) { return n === 1 ? s : p; }
  /** Texto pra comparar: sem acento, sem espaços nas pontas, minúsculo ("Mãe " = "mae"). */
  function chaveTexto(t) { return String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); }
  function arredonda(v) { return Math.round(v * 100) / 100; }
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
    baixarArquivo(nomeArquivo, "\uFEFF" + conteudo, "text/csv;charset=utf-8");
  }
  function baixarArquivo(nomeArquivo, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
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
    email: "",
    saldo: null,          // { saldo_inicial, saldo_desde } ou null se ainda não configurado
    editandoSaldo: false,
    previsaoMeses: 6,       // quantos meses o quadro "Próximos meses" mostra
    usoCartao: new Map(),   // cartão -> total em aberto (cache do Lançar)
    selecao: null,          // Set de parcelas marcadas em Contas (modo seleção) ou null
    inicio: { ano: 0, mes: 0 },
    contas: { lado: "despesa", situacao: "aberto", ano: 0, mes: 0, periodo: "mes", pessoa: "", categoria: "", condicao: "", forma: "", cartao: "", busca: "", base: [], entradas: [] },
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
    atualizarSugestoes();
  }
  function todasParcelas() {
    return buscarTodos(() => sb.from("parcelas").select("*").order("vencimento").order("id"));
  }
  /** Nomes de pessoa/lugar já usados (sem repetir "Mãe" e "mãe"), em ordem alfabética. */
  function pessoasConhecidas() {
    const mapa = new Map();
    for (const l of estado.lancamentos) {
      const k = chaveTexto(l.pessoa);
      if (!k) continue;
      const nome = l.pessoa.trim();
      const atual = mapa.get(k);
      // Prefere a forma escrita com maiúscula ("Mãe" em vez de "mãe").
      if (!atual || (atual === atual.toLowerCase() && nome !== nome.toLowerCase())) mapa.set(k, nome);
    }
    return [...mapa].map(([chave, nome]) => ({ chave, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  /** Sugestões nos campos de pessoa e descrição, pra escrever sempre igual. */
  function atualizarSugestoes() {
    $("#sugestoes-pessoa").replaceChildren(...pessoasConhecidas().map((p) => h("option", { value: p.nome })));
    const descricoes = new Map();
    for (const l of [...estado.lancamentos].reverse()) {
      const k = chaveTexto(l.descricao);
      if (k && !descricoes.has(k)) descricoes.set(k, l.descricao.trim());
    }
    $("#sugestoes-descricao").replaceChildren(...[...descricoes.values()].slice(0, 300).map((d) => h("option", { value: d })));
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
      // Vermelho: quantas contas estão vencidas (a pagar ou a receber). Sem nenhuma vencida,
      // amarelo: quantas a pagar vencem nos próximos dias. Fora isso, o contador some.
      abertas = abertas.filter(lancDe);
      const limite = addDiasISO(hojeISO(), DIAS_ALERTA);
      const vencidas = agrupar(abertas.filter(emAtraso)).length;
      const breve = agrupar(abertas.filter((p) => lancDe(p).tipo === "despesa" && p.vencimento >= hojeISO() && p.vencimento <= limite)).length;
      const n = vencidas || breve;
      const badge = $("#badge-contas");
      badge.hidden = n === 0;
      badge.textContent = n;
      badge.classList.toggle("breve", vencidas === 0);
      badge.setAttribute("aria-label", vencidas
        ? `${n} ${plural(n, "conta vencida", "contas vencidas")}`
        : `${n} ${plural(n, "conta vence", "contas vencem")} nos próximos ${DIAS_ALERTA} dias`);
    } catch (e) { console.error(e); }
  }

  /** Depois de qualquer alteração: recarrega lançamentos, a tela atual e o contador. */
  async function aposMudanca() {
    estado.rel.cacheAno = null;
    estado.usoCartao = new Map();
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
  // Trocar senha: confere a senha atual antes, pra quem pegar o celular
  // desbloqueado não conseguir trocar a senha de ninguém.
  function fecharFormSenha() {
    $("#form-senha").hidden = true;
    $("#btn-trocar-senha").hidden = false;
    ["#senha-atual", "#senha-nova", "#senha-nova2"].forEach((s) => { $(s).value = ""; });
  }
  $("#btn-trocar-senha").addEventListener("click", () => {
    $("#senha-usuario").value = estado.email;
    $("#form-senha").hidden = false;
    $("#btn-trocar-senha").hidden = true;
    $("#senha-atual").focus();
  });
  $("#senha-cancelar").addEventListener("click", fecharFormSenha);
  $("#form-senha").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const atual = $("#senha-atual").value, nova = $("#senha-nova").value, nova2 = $("#senha-nova2").value;
    if (!atual) { toast("Digite a senha atual.", true); return; }
    if (nova.length < 8) { toast("A nova senha precisa ter pelo menos 8 caracteres.", true); return; }
    if (nova !== nova2) { toast("As duas novas senhas não são iguais.", true); return; }
    if (nova === atual) { toast("A nova senha precisa ser diferente da atual.", true); return; }
    acao($("#senha-salvar"), async () => {
      const conferida = await sb.auth.signInWithPassword({ email: estado.email, password: atual });
      if (conferida.error) {
        toast(/invalid/i.test(conferida.error.message) ? "Senha atual incorreta." : msgErro(conferida.error), true);
        return;
      }
      const { error } = await sb.auth.updateUser({ password: nova });
      if (error) {
        toast(/weak|short|characters/i.test(error.message) ? "Senha muito fraca. Use pelo menos 8 caracteres, misturando letras e números."
          : /same|different/i.test(error.message) ? "A nova senha precisa ser diferente da atual." : msgErro(error), true);
        return;
      }
      fecharFormSenha();
      toast("Senha trocada. Use a nova no próximo login.");
    });
  });

  $("#btn-sair-conta").addEventListener("click", async () => {
    if (await confirmar("Sair da sua conta neste aparelho?", "Sair")) sb.auth.signOut();
  });

  async function entrar(usuario) {
    if (estado.iniciado) return;
    estado.iniciado = true;
    estado.email = usuario?.email || "";
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
    avisarContas();
  }

  // ---------------------------------------------------------------------------
  // Aviso ao abrir: contas vencidas (a pagar e a receber) e a pagar que vencem
  // hoje ou amanhã. Aparece uma vez por dia em cada aparelho.
  // ---------------------------------------------------------------------------
  const modalAviso = $("#modal-aviso");
  let avisoDestino = null;
  function avisoJaVisto() {
    try { return localStorage.getItem("aviso-contas") === `${estado.email}|${hojeISO()}`; } catch (e) { return false; }
  }
  function marcarAvisoVisto() {
    try { localStorage.setItem("aviso-contas", `${estado.email}|${hojeISO()}`); } catch (e) { /* sem armazenamento: avisa de novo na próxima abertura */ }
  }
  async function avisarContas() {
    if (avisoJaVisto() || document.querySelector("dialog[open]") || estado.selecao) return;
    let abertas;
    try { abertas = (await parcelasAbertas()).filter(lancDe); } catch (e) { return; }
    if (avisoJaVisto() || document.querySelector("dialog[open]")) return;
    const total = (lista, tipo) => soma(lista.filter((p) => lancDe(p).tipo === tipo), valorEfetivo);
    const vencidas = abertas.filter(emAtraso);
    const amanha = addDiasISO(hojeISO(), 1);
    const breve = abertas.filter((p) => lancDe(p).tipo === "despesa" && p.vencimento >= hojeISO() && p.vencimento <= amanha);
    if (!vencidas.length && !breve.length) return;
    const linhas = [];
    if (vencidas.length) {
      const n = agrupar(vencidas).length, pagar = total(vencidas, "despesa"), receber = total(vencidas, "receita");
      const partes = [];
      if (pagar) partes.push(`${fmtBRL(pagar)} a pagar`);
      if (receber) partes.push(`${fmtBRL(receber)} a receber`);
      linhas.push(h("li", { class: "vencidas" },
        h("strong", {}, `${n} ${plural(n, "conta vencida", "contas vencidas")}`), h("span", {}, partes.join(" · "))));
    }
    if (breve.length) {
      const entradas = agrupar(breve), n = entradas.length;
      const soHoje = breve.every((p) => p.vencimento === hojeISO()), soAmanha = breve.every((p) => p.vencimento === amanha);
      const quando = soHoje ? "hoje" : soAmanha ? "amanhã" : "hoje ou amanhã";
      const nomes = entradas.slice(0, 3).map((e) => e.tipo === "fatura" ? `Fatura ${e.cartao.nome}`
        : lancDe(e.p).descricao || estado.catPorId.get(lancDe(e.p).categoria_id)?.nome || "Conta");
      linhas.push(h("li", { class: "breve" },
        h("strong", {}, `${n} a pagar ${plural(n, "vence", "vencem")} ${quando}`),
        h("span", {}, `${fmtBRL(soma(breve, valorEfetivo))} · ${nomes.join(", ")}${n > 3 ? ` e mais ${n - 3}` : ""}`)));
    }
    $("#av-titulo").textContent = vencidas.length ? "Você tem contas vencidas" : "Contas pra pagar";
    $("#av-linhas").replaceChildren(...linhas);
    avisoDestino = vencidas.length ? { situacao: "atraso", lado: "tudo" } : { situacao: "aberto", lado: "despesa", data: breve[0].vencimento };
    modalAviso.showModal();
  }
  // Fechar de qualquer jeito (botão, Esc) conta como visto por hoje.
  modalAviso.addEventListener("close", marcarAvisoVisto);
  $("#av-ignorar").addEventListener("click", () => modalAviso.close());
  $("#av-verificar").addEventListener("click", () => {
    modalAviso.close();
    const c = estado.contas, d = avisoDestino;
    Object.assign(c, { lado: d.lado, situacao: d.situacao, periodo: "mes", pessoa: "", categoria: "", condicao: "", forma: "", cartao: "", busca: "" });
    if (d.data) { const [a, m] = partesISO(d.data); c.ano = a; c.mes = m; }
    document.querySelector(`input[name="c-lado"][value="${d.lado}"]`).checked = true;
    document.querySelector(`input[name="c-situacao"][value="${d.situacao}"]`).checked = true;
    mostrarView("contas");
  });

  // ---------------------------------------------------------------------------
  // Navegação
  // ---------------------------------------------------------------------------
  document.querySelectorAll(".menu-item").forEach((b) =>
    b.addEventListener("click", () => mostrarView(b.dataset.view)));

  function mostrarView(nome) {
    if (estado.selecao && nome !== "contas") sairSelecao();
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
    else if (v === "cadastros") { renderCadastros(); mostrarUltimoBackup(); carregarLimites(); }
  }

  // Ao voltar pro app (ex.: no dia seguinte), renova fixas e atualiza a tela.
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !estado.iniciado) return;
    try { await carregarLancamentos(); await renovarFixos(); } catch (e) { console.error(e); }
    recarregarView();
    if (estado.view !== "inicio" && estado.view !== "contas") atualizarBadge();
    avisarContas();
  });

  // ---------------------------------------------------------------------------
  // Itens de lista (parcela ou fatura)
  // ---------------------------------------------------------------------------
  function itemEntrada(e, { mostrarTipo = false, selecao = null } = {}) {
    if (e.tipo === "fatura") {
      const st = situacaoFatura(e);
      return h("li", {}, h("button", { class: "item item-clicavel " + (st.classe || "") + (selecao ? " nao-selecionavel" : ""),
        type: "button", disabled: !!selecao, onclick: selecao ? null : () => abrirFatura(e) },
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
    // Em modo seleção, só dá pra marcar parcela em aberto que não é de cartão (cartão se paga pela fatura).
    const pode = !p.baixado && !p.cartao_id;
    const marcado = !!selecao && pode && selecao.has(p.id);
    const extra = !selecao ? "" : pode ? " selecionavel" + (marcado ? " selecionado" : "") : " nao-selecionavel";
    return h("li", {}, h("button", { class: "item item-clicavel " + (st.classe || "") + extra, type: "button",
      disabled: !!selecao && !pode, "aria-pressed": selecao && pode ? String(marcado) : null,
      onclick: selecao ? (pode ? () => alternarSelecao(p.id) : null) : () => abrirParcela(p) },
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

  // ---------------------------------------------------------------------------
  // Saldo em conta
  //   saldo atual = saldo_inicial + recebimentos − pagamentos (baixas feitas a
  //   partir de saldo_desde, pela data da baixa). Compra no cartão só mexe no
  //   saldo quando a fatura é paga.
  // ---------------------------------------------------------------------------
  async function carregarSaldo() {
    const linhas = await exec(sb.from("saldo").select("*").limit(1));
    estado.saldo = linhas[0] || null;
  }
  /** Soma das baixas desde uma data: recebido entra (+), pago sai (−). */
  async function movimentosDesde(desde) {
    const baixadas = await buscarTodos(() => sb.from("parcelas").select("*").eq("baixado", true).gte("data_baixa", desde).order("id"));
    return arredonda(soma(baixadas.filter(lancDe), (p) => (lancDe(p).tipo === "receita" ? 1 : -1) * valorEfetivo(p)));
  }
  /** Grava o saldo de forma que o saldo atual fique igual a 'valorAgora'. */
  async function definirSaldo(valorAgora) {
    await carregarSaldo(); // pode ter mudado em outro aparelho
    const desde = estado.saldo?.saldo_desde ?? hojeISO();
    const inicial = arredonda(valorAgora - await movimentosDesde(desde));
    await exec(sb.from("saldo").upsert({ saldo_inicial: inicial, saldo_desde: desde, updated_at: new Date().toISOString() }, { onConflict: "user_id" }));
    await carregarSaldo();
  }

  function mostrarFormSaldo(acertando) {
    const jaAberto = !$("#i-saldo-form").hidden && estado.editandoSaldo === acertando;
    estado.editandoSaldo = acertando;
    if (jaAberto) return; // não apaga o que está sendo digitado
    $("#i-saldo-form").hidden = false;
    $("#i-saldo-info").hidden = true;
    $("#i-saldo-cancelar").hidden = !acertando;
    $("#i-saldo-form-titulo").textContent = acertando ? "Quanto você tem na conta agora?" : "Quanto você tem na conta hoje?";
    $("#i-saldo-form-dica").textContent = acertando
      ? "O app ajusta o saldo pra bater com o do banco (tarifa, rendimento...). Nenhum lançamento é alterado."
      : "Daqui pra frente, o que você receber soma e o que pagar subtrai. Pode ser negativo, se estiver no cheque especial.";
    $("#i-saldo-valor").value = "";
    if (acertando) $("#i-saldo-valor").focus();
  }

  /** Mostra o saldo e devolve o saldo atual (ou null se não configurado). */
  async function renderSaldo(abertas) {
    const s = estado.saldo;
    if (!s) { mostrarFormSaldo(false); return null; }
    let atual;
    try { atual = arredonda(Number(s.saldo_inicial) + await movimentosDesde(s.saldo_desde)); }
    catch (e) { toast(msgErro(e), true); return null; }
    if (estado.editandoSaldo) return atual;
    const [a, m] = partesISO(hojeISO());
    const fimMes = dataNoMes(a, m, 31);
    // Previsto = saldo atual + o que falta receber − o que falta pagar até o fim do mês (inclui o que está em atraso).
    let receber = 0, pagar = 0;
    for (const p of abertas) {
      const l = lancDe(p);
      if (!l || p.vencimento > fimMes) continue;
      if (l.tipo === "receita") receber += valorEfetivo(p); else pagar += valorEfetivo(p);
    }
    const previsto = arredonda(atual + receber - pagar);
    $("#i-saldo-form").hidden = true;
    $("#i-saldo-info").hidden = false;
    $("#i-saldo-atual").textContent = fmtBRL(atual);
    $("#i-saldo-atual").className = atual < 0 ? "despesa" : "";
    $("#i-previsto-rotulo").textContent = `Previsto até ${fmtDataCurta(fimMes)}`;
    $("#i-saldo-previsto").textContent = fmtBRL(previsto);
    $("#i-saldo-previsto").className = previsto < 0 ? "despesa" : "receita";
    return atual;
  }

  // ---------------------------------------------------------------------------
  // Previsão dos próximos meses: parte do saldo atual e soma, mês a mês, tudo
  // que está em aberto (o mês atual inclui o que já está em atraso).
  // ---------------------------------------------------------------------------
  function calcularPrevisao(abertas, saldoAtual, meses = 12) {
    const [a, m] = partesISO(hojeISO());
    const linhas = [];
    let saldo = saldoAtual;
    for (let i = 0; i < meses; i++) {
      const ini = dataNoMes(a, m, 1, i), fim = dataNoMes(a, m, 1, i + 1);
      const doMes = abertas.filter((p) => p.vencimento < fim && (i === 0 || p.vencimento >= ini));
      const entra = soma(doMes.filter((p) => lancDe(p).tipo === "receita"), valorEfetivo);
      const sai = soma(doMes.filter((p) => lancDe(p).tipo === "despesa"), valorEfetivo);
      saldo = arredonda(saldo + entra - sai);
      linhas.push({ ini, entra, sai, saldo });
    }
    return linhas;
  }
  function nomeMesCurto(iso) { const [a, m] = partesISO(iso); return `${MESES_CURTOS[m - 1]}/${String(a).slice(2)}`; }

  function renderPrevisao(abertas, saldoAtual) {
    const painel = $("#i-previsao-painel");
    painel.hidden = saldoAtual == null;
    if (painel.hidden) return;
    const linhas = calcularPrevisao(abertas, saldoAtual);
    // Destaca o mês mais apertado só quando ele fecha negativo.
    const pior = linhas.reduce((x, y) => (y.saldo < x.saldo ? y : x));
    const mostrar = estado.previsaoMeses;
    $("#i-previsao").replaceChildren(...linhas.slice(0, mostrar).map((l) => h("tr", { class: l === pior && pior.saldo < 0 ? "linha-pior" : "" },
      h("th", {}, nomeMesCurto(l.ini)),
      h("td", { class: "receita" }, fmtNumero(l.entra)),
      h("td", { class: "despesa" }, fmtNumero(l.sai)),
      h("td", { class: l.saldo < 0 ? "despesa" : "" }, fmtNumero(l.saldo)))));
    $("#i-previsao-mais").textContent = mostrar < 12 ? "Ver 12 meses" : "Ver só 6 meses";
  }
  $("#i-previsao-mais").addEventListener("click", () => {
    estado.previsaoMeses = estado.previsaoMeses < 12 ? 12 : 6;
    carregarInicio();
  });

  // ---------------------------------------------------------------------------
  // Limite do cartão: usado = tudo que está em aberto no cartão (inclusive
  // parcelas de faturas futuras), como os bancos calculam.
  // ---------------------------------------------------------------------------
  /** Assinatura fixa só ocupa limite depois de cobrada; as cobranças futuras ainda não existem pro banco. */
  function contaNoLimite(p) {
    const l = lancDe(p);
    return !(l && l.condicao === "fixo" && ocorrencia(l, p.numero) > hojeISO());
  }
  function usoDoCartao(cartao, abertas) {
    const usado = arredonda(soma(abertas.filter((p) => p.cartao_id === cartao.id && contaNoLimite(p)), valorEfetivo));
    const limite = cartao.limite != null ? Number(cartao.limite) : null;
    return { usado, limite, disponivel: limite != null ? arredonda(limite - usado) : null };
  }
  function linhaLimite(cartao, uso) {
    const pct = Math.min(100, Math.max(0, (uso.usado / uso.limite) * 100));
    const estourou = uso.disponivel < 0;
    return h("li", { class: estourou ? "estourou" : pct >= 80 ? "perto" : "" },
      h("div", { class: "limite-topo" },
        h("strong", {}, cartao.nome),
        h("span", {}, estourou ? `Passou ${fmtBRL(-uso.disponivel)} do limite` : `${fmtBRL(uso.disponivel)} disponível`)),
      h("div", { class: "trilho", role: "presentation" }, h("div", { class: "preenchido", style: { width: `${pct}%` } })),
      h("small", { class: "dica" }, `${fmtBRL(uso.usado)} usado de ${fmtBRL(uso.limite)}`));
  }

  $("#i-saldo-acertar").addEventListener("click", () => mostrarFormSaldo(true));
  $("#i-saldo-cancelar").addEventListener("click", () => { estado.editandoSaldo = false; carregarInicio(); });
  $("#i-saldo-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const valor = lerValor($("#i-saldo-valor").value);
    if (!Number.isFinite(valor) || Math.abs(valor) >= 100000000) { toast("Digite o saldo, por exemplo 1.250,00 ou -300,00.", true); return; }
    const acertando = estado.editandoSaldo;
    acao($("#i-saldo-salvar"), async () => {
      await definirSaldo(valor);
      estado.editandoSaldo = false;
      toast(`${acertando ? "Saldo acertado" : "Saldo salvo"}: ${fmtBRL(valor)}.`);
      carregarInicio();
    });
  });

  async function carregarInicio() {
    const { ano, mes } = estado.inicio;
    $("#i-mes-titulo").textContent = nomeMes(ano, mes);
    const ini = dataNoMes(ano, mes, 1);
    let doMes, abertas;
    try {
      // O saldo é relido a cada vez: ele pode ter sido configurado ou acertado em outro aparelho.
      [doMes, abertas] = await Promise.all([parcelasDoPeriodo(ini, dataNoMes(ano, mes, 1, 1)), parcelasAbertas(),
        estado.editandoSaldo ? null : carregarSaldo()]);
    } catch (e) { toast(msgErro(e), true); return; }
    atualizarBadge(abertas);
    doMes = doMes.filter(lancDe);
    abertas = abertas.filter(lancDe);
    renderSaldo(abertas).then((atual) => renderPrevisao(abertas, atual));

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
    // A pagar e a receber não se somam: cada lado aparece com o seu total.
    const vencidas = abertas.filter((p) => p.vencimento < hoje);
    const totalAtraso = (tipo) => soma(vencidas.filter((p) => lancDe(p).tipo === tipo), valorEfetivo);
    const aPagar = totalAtraso("despesa"), aReceber = totalAtraso("receita");
    $("#i-atraso-titulo").textContent = "Em atraso (" + [aPagar ? `${fmtBRL(aPagar)}${aReceber ? " a pagar" : ""}` : "",
      aReceber ? `${fmtBRL(aReceber)} a receber` : ""].filter(Boolean).join(" · ") + ")";
    listaOuVazio($("#i-atraso"), atrasadas, "", { mostrarTipo: true });

  }

  /** Em Cadastros: quanto do limite de cada cartão está usado. */
  async function carregarLimites() {
    const comLimite = estado.cartoes.filter((c) => c.limite != null);
    if (!comLimite.length) { $("#cad-limites").replaceChildren(); return; }
    try {
      const abertas = (await parcelasAbertas()).filter(lancDe);
      $("#cad-limites").replaceChildren(...comLimite.map((c) => linhaLimite(c, usoDoCartao(c, abertas))));
    } catch (e) { console.error(e); }
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
          h("span", {}, c.nome, h("small", { class: "dica" },
            ` fecha dia ${c.dia_fechamento}, vence dia ${c.dia_vencimento}${c.limite != null ? `, limite ${fmtBRL(c.limite)}` : ""}`)),
          h("span", { class: "li-acoes" },
            h("button", { class: "btn-remover", type: "button", "aria-label": `Editar ${c.nome}`, onclick: () => abrirCartao(c) }, "Editar"),
            remover("cartoes", c))))
      : [h("li", { class: "dica" }, "Nenhum cartão ainda.")]));
  }

  async function aposMudarCadastros() {
    await carregarCadastros();
    renderCadastros();
    carregarLimites();
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
    const limite = lerLimite($("#cartao-limite").value);
    if (!nome) { toast("Digite o nome do cartão.", true); return; }
    if (!(fecha >= 1 && fecha <= 31) || !(vence >= 1 && vence <= 31)) { toast("Dias de fechamento e vencimento devem ser entre 1 e 31.", true); return; }
    if (limite === undefined) { toast("Limite inválido. Deixe em branco ou digite um valor, ex.: 5.000,00.", true); return; }
    acao(ev.submitter, async () => {
      await exec(sb.from("cartoes").insert({ nome, dia_fechamento: fecha, dia_vencimento: vence, limite }));
      $("#cartao-nome").value = ""; $("#cartao-fecha").value = ""; $("#cartao-vence").value = ""; $("#cartao-limite").value = "";
      await aposMudarCadastros();
      toast(`Cartão “${nome}” adicionado.`);
    });
  });

  /** Limite opcional: vazio = null; inválido = undefined. */
  function lerLimite(txt) {
    if (!String(txt).trim()) return null;
    const v = lerValor(txt);
    return v > 0 && v < 10000000 ? v : undefined;
  }

  const modalCartao = $("#modal-cartao");
  let cartaoEditando = null;
  function abrirCartao(c) {
    cartaoEditando = c;
    $("#mc-nome").value = c.nome;
    $("#mc-fecha").value = c.dia_fechamento;
    $("#mc-vence").value = c.dia_vencimento;
    $("#mc-limite").value = c.limite != null ? valorParaCampo(c.limite) : "";
    modalCartao.showModal();
  }
  $("#mc-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nome = $("#mc-nome").value.trim();
    const fecha = parseInt($("#mc-fecha").value, 10);
    const vence = parseInt($("#mc-vence").value, 10);
    const limite = lerLimite($("#mc-limite").value);
    if (!nome) { toast("Digite o nome do cartão.", true); return; }
    if (!(fecha >= 1 && fecha <= 31) || !(vence >= 1 && vence <= 31)) { toast("Dias de fechamento e vencimento devem ser entre 1 e 31.", true); return; }
    if (limite === undefined) { toast("Limite inválido. Deixe em branco ou digite um valor, ex.: 5.000,00.", true); return; }
    acao($("#mc-salvar"), async () => {
      await exec(sb.from("cartoes").update({ nome, dia_fechamento: fecha, dia_vencimento: vence, limite }).eq("id", cartaoEditando.id));
      modalCartao.close();
      await aposMudarCadastros();
      toast(`Cartão “${nome}” atualizado.`);
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

  /** Mostra quanto ainda tem de limite no cartão escolhido e avisa se a compra passa. */
  async function atualizarLimiteLancar() {
    const alvo = $("#l-cartao-limite");
    const { dados, ehCartao } = lancamentoDoForm();
    const cartao = ehCartao ? estado.cartaoPorId.get(dados.cartao_id) : null;
    if (!cartao || cartao.limite == null) { alvo.textContent = ""; alvo.className = "limite-dica"; return; }
    if (!estado.usoCartao.has(cartao.id)) {
      try {
        const abertas = await exec(sb.from("parcelas").select("*").eq("cartao_id", cartao.id).eq("baixado", false));
        estado.usoCartao.set(cartao.id, arredonda(soma(abertas.filter(contaNoLimite), valorEfetivo)));
      } catch (e) { alvo.textContent = ""; return; }
    }
    const disponivel = arredonda(Number(cartao.limite) - estado.usoCartao.get(cartao.id));
    const compra = dados.valor > 0 ? soma(gerarParcelasSeguro(dados), (p) => p.valor) : 0;
    const passa = compra > 0 && compra > disponivel;
    alvo.textContent = disponivel < 0
      ? `Limite estourado em ${fmtBRL(-disponivel)}.`
      : `Disponível: ${fmtBRL(disponivel)} de ${fmtBRL(cartao.limite)}.` + (passa ? " Esta compra passa do disponível." : "");
    alvo.className = "limite-dica" + (passa || disponivel < 0 ? " texto-despesa" : "");
  }
  /** Parcelas de uma compra pra somar o total (fixo conta só a primeira). */
  function gerarParcelasSeguro(dados) {
    try {
      const ps = gerarParcelas(dados);
      return dados.condicao === "fixo" ? ps.slice(0, 1) : ps;
    } catch (e) { return []; }
  }

  function atualizarPrevia() {
    atualizarLimiteLancar();
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

  /** Copia um lançamento pro formulário (data vira hoje) pra lançar de novo. */
  function lancarDeNovo(l) {
    mostrarView("lancar");
    formLancar.querySelector(`input[name="tipo"][value="${l.tipo}"]`).checked = true;
    formLancar.querySelector(`input[name="condicao"][value="${l.condicao}"]`).checked = true;
    atualizarFormLancar();
    if ([...$("#l-forma").options].some((o) => o.value === String(l.forma_pagamento_id))) $("#l-forma").value = String(l.forma_pagamento_id);
    $("#l-data").value = hojeISO();
    atualizarFormLancar();
    if (l.cartao_id && [...$("#l-cartao").options].some((o) => o.value === String(l.cartao_id))) $("#l-cartao").value = String(l.cartao_id);
    if ([...$("#l-categoria").options].some((o) => o.value === String(l.categoria_id))) $("#l-categoria").value = String(l.categoria_id);
    if (l.condicao === "parcelado") {
      $("#l-parcelas").value = l.total_parcelas;
      formLancar.querySelector(`input[name="valor-modo"][value="${l.valor_modo}"]`).checked = true;
    }
    if (l.condicao !== "avista" && !l.cartao_id) {
      $("#l-intervalo").value = l.intervalo;
      if (l.intervalo === "dias") $("#l-intervalo-dias").value = l.intervalo_dias;
    }
    $("#l-valor").value = valorParaCampo(l.valor);
    $("#l-descricao").value = l.descricao;
    $("#l-pessoa").value = l.pessoa;
    $("#l-obs").value = l.observacao;
    atualizarFormLancar();
    window.scrollTo(0, 0);
    $("#l-valor").focus();
    $("#l-valor").select();
    toast(`Copiado de “${l.descricao || "lançamento"}”. Confira o valor e salve.`);
  }

  function carregarRecentes() {
    const recentes = [...estado.lancamentos].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, 5);
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
      return h("li", { class: "com-repetir" }, h("button", { class: "item item-clicavel", type: "button", onclick: () => abrirLancamento(l) },
        h("span", { class: "item-titulo" }, l.descricao || cat),
        h("span", { class: "item-valor " + l.tipo }, `${l.tipo === "despesa" ? "−" : "+"} ${valor}`, h("small", {}, condicao)),
        h("span", { class: "item-meta" },
          h("span", {}, fmtData(l.data_base)),
          l.descricao ? h("span", {}, cat) : null,
          h("span", {}, cartao ? `${forma} · ${cartao}` : forma),
          l.pessoa ? h("span", {}, l.pessoa) : null),
      ), h("button", { class: "btn-repetir", type: "button", title: "Lançar de novo", "aria-label": `Lançar de novo: ${l.descricao || cat}`,
        onclick: () => lancarDeNovo(l) },
        "Repetir"));
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
    // Receita não vai pra fatura de cartão.
    preencherSelect($("#mp-e-forma"), lanc.tipo === "receita" ? estado.formas.filter((f) => f.tipo !== "cartao") : estado.formas, lanc.forma_pagamento_id);
    preencherSelect($("#mp-e-cartao"), estado.cartoes, lanc.cartao_id);
    atualizarFormaEdicao();
    $("#mp-form-editar").hidden = false;
    $("#mp-acoes").hidden = true;
  });
  /** Forma e cartão escolhidos na edição; cartão só vale se a forma é do tipo cartão. */
  function formaDaEdicao() {
    const forma = estado.formaPorId.get(Number($("#mp-e-forma").value));
    const ehCartao = forma?.tipo === "cartao";
    return { forma, ehCartao, cartaoId: ehCartao ? Number($("#mp-e-cartao").value) || null : null };
  }
  function atualizarFormaEdicao() {
    const lanc = lancDe(estado.parcela);
    const { ehCartao, cartaoId } = formaDaEdicao();
    $("#mp-e-cartao-wrap").hidden = !ehCartao;
    const antes = lanc.cartao_id || null;
    const cartao = cartaoId ? estado.cartaoPorId.get(cartaoId) : null;
    $("#mp-e-aviso").textContent = ehCartao && !estado.cartoes.length ? "Cadastre um cartão em Cadastros pra usar essa forma."
      : cartaoId === antes ? ""
      : cartao ? `As parcelas em aberto vão pra fatura do ${cartao.nome}, com o vencimento da fatura. As já pagas não mudam.`
      : "As parcelas em aberto saem da fatura do cartão e voltam a vencer na data de cada uma. As já pagas não mudam.";
  }
  ["#mp-e-forma", "#mp-e-cartao"].forEach((s) => $(s).addEventListener("change", atualizarFormaEdicao));
  $("#mp-e-cancelar").addEventListener("click", () => abrirParcela(estado.parcela));
  $("#mp-form-editar").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const p = estado.parcela, lanc = lancDe(p);
    const valor = lerValor($("#mp-e-valor").value);
    const venc = $("#mp-e-venc").value;
    if (!(valor > 0)) { toast("Digite um valor maior que zero.", true); return; }
    if (!venc) { toast("Escolha o vencimento.", true); return; }
    const proximas = !$("#mp-e-proximas-wrap").hidden && $("#mp-e-proximas").checked;
    const { forma, ehCartao, cartaoId } = formaDaEdicao();
    if (!forma) { toast("Escolha a forma de pagamento.", true); return; }
    if (ehCartao && !cartaoId) { toast("Cadastre um cartão em Cadastros pra usar essa forma.", true); return; }
    const mudouCartao = (lanc.cartao_id || null) !== cartaoId;
    acao($("#mp-e-salvar"), async () => {
      // Se o cartão mudou, o vencimento desta parcela é recalculado logo abaixo.
      await exec(sb.from("parcelas").update(mudouCartao ? { valor } : { valor, vencimento: venc }).eq("id", p.id));
      if (proximas) {
        await exec(sb.from("parcelas").update({ valor }).eq("lancamento_id", lanc.id).gt("numero", p.numero).eq("baixado", false));
      }
      const mudancas = {
        descricao: $("#mp-e-desc").value.trim(),
        pessoa: $("#mp-e-pessoa").value.trim(),
        observacao: $("#mp-e-obs").value.trim(),
        categoria_id: Number($("#mp-e-categoria").value),
        forma_pagamento_id: forma.id,
      };
      if (proximas && lanc.condicao === "fixo") mudancas.valor = valor; // as próximas geradas usam o valor novo
      if (mudouCartao) {
        // Entrou, saiu ou trocou de cartão: as parcelas em aberto mudam de fatura e de
        // vencimento. As parcelas vão antes do lançamento: se a rede cair no meio, é só salvar de novo.
        Object.assign(mudancas, { cartao_id: cartaoId }, cartaoId ? { intervalo: "mensal", intervalo_dias: null } : {});
        const novo = { ...lanc, ...mudancas };
        const abertas = await exec(sb.from("parcelas").select("id,numero").eq("lancamento_id", lanc.id).eq("baixado", false));
        for (let i = 0; i < abertas.length; i += 10) {
          await Promise.all(abertas.slice(i, i + 10).map((a) =>
            exec(sb.from("parcelas").update({ cartao_id: cartaoId, vencimento: vencimentoDa(novo, a.numero) }).eq("id", a.id))));
        }
      }
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

  $("#mp-repetir").addEventListener("click", () => {
    const lanc = lancDe(estado.parcela);
    modalP.close();
    if (lanc) lancarDeNovo(lanc);
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

  // Clicar (ou tocar) fora da janela fecha, igual ao Esc. Só vale quando o clique
  // começou e terminou fora: arrastar pra selecionar um texto e soltar fora não fecha.
  document.querySelectorAll("dialog").forEach((dlg) => {
    const fora = (ev) => {
      if (ev.target !== dlg) return false;
      const r = dlg.getBoundingClientRect();
      return ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
    };
    let comecouFora = false;
    dlg.addEventListener("pointerdown", (ev) => { comecouFora = fora(ev); });
    dlg.addEventListener("click", (ev) => {
      if (comecouFora && fora(ev)) dlg.close();
      comecouFora = false;
    });
  });

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
  // Filtros: lado, situação e período mudam o que é buscado; pessoa, categoria
  // e busca só filtram o que já foi carregado.
  document.querySelectorAll('input[name="c-lado"], input[name="c-situacao"]').forEach((r) =>
    r.addEventListener("change", () => { lerFiltrosContas(); carregarContas(); }));
  $("#c-periodo").addEventListener("change", () => { lerFiltrosContas(); carregarContas(); });
  ["#c-pessoa", "#c-categoria", "#c-condicao", "#c-forma", "#c-cartao"].forEach((sel) => $(sel).addEventListener("change", () => { lerFiltrosContas(); renderContas(); }));
  let timerBusca;
  $("#c-busca").addEventListener("input", () => {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(() => { lerFiltrosContas(); renderContas(); }, 250);
  });
  $("#c-limpar").addEventListener("click", () => {
    Object.assign(estado.contas, { periodo: "mes", pessoa: "", categoria: "", condicao: "", forma: "", cartao: "", busca: "" });
    carregarContas();
  });
  $("#c-mes-ant").addEventListener("click", () => mudarMes(estado.contas, -1, carregarContas));
  $("#c-mes-prox").addEventListener("click", () => mudarMes(estado.contas, 1, carregarContas));

  function lerFiltrosContas() {
    const c = estado.contas;
    c.lado = radio("c-lado");
    c.situacao = radio("c-situacao");
    c.periodo = $("#c-periodo").value;
    c.pessoa = $("#c-pessoa").value;
    c.categoria = $("#c-categoria").value;
    c.condicao = $("#c-condicao").value;
    c.forma = $("#c-forma").value;
    c.cartao = $("#c-cartao").value;
    c.busca = $("#c-busca").value.trim();
  }

  /** Monta as opções de pessoa e categoria, mantendo o que estava escolhido. */
  function preencherFiltrosContas() {
    const c = estado.contas;
    const pessoas = pessoasConhecidas();
    if (c.pessoa && !pessoas.some((p) => p.chave === c.pessoa)) c.pessoa = "";
    $("#c-pessoa").replaceChildren(h("option", { value: "" }, "Todas"), ...pessoas.map((p) => h("option", { value: p.chave }, p.nome)));
    $("#c-pessoa").value = c.pessoa;
    const grupo = (rotulo, tipo) => h("optgroup", { label: rotulo }, ...categoriasDoTipo(tipo).map((cat) => h("option", { value: cat.id }, cat.nome)));
    if (c.categoria && !estado.catPorId.has(Number(c.categoria))) c.categoria = "";
    $("#c-categoria").replaceChildren(h("option", { value: "" }, "Todas"), grupo("Despesas", "despesa"), grupo("Receitas", "receita"));
    $("#c-categoria").value = String(c.categoria);
    $("#c-condicao").value = c.condicao;
    if (c.forma && !estado.formaPorId.has(Number(c.forma))) c.forma = "";
    $("#c-forma").replaceChildren(h("option", { value: "" }, "Todas"), ...estado.formas.map((f) => h("option", { value: f.id }, f.nome)));
    $("#c-forma").value = String(c.forma);
    if (c.cartao && c.cartao !== "nenhum" && !estado.cartaoPorId.has(Number(c.cartao))) c.cartao = "";
    $("#c-cartao").replaceChildren(h("option", { value: "" }, "Todos"), ...estado.cartoes.map((k) => h("option", { value: k.id }, k.nome)),
      h("option", { value: "nenhum" }, "Fora do cartão"));
    $("#c-cartao").value = String(c.cartao);
    $("#c-periodo").value = c.periodo;
    $("#c-busca").value = c.busca;
  }

  async function carregarContas() {
    const c = estado.contas;
    preencherFiltrosContas();
    let abertas;
    try {
      abertas = await parcelasAbertas();
      c.base = (c.periodo === "todos" || c.situacao === "atraso")
        ? await todasParcelas()
        : await parcelasDoPeriodo(dataNoMes(c.ano, c.mes, 1), dataNoMes(c.ano, c.mes, 1, 1));
    } catch (e) { toast(msgErro(e), true); return; }
    c.base = c.base.filter(lancDe);
    atualizarBadge(abertas);
    renderContas();
  }

  function renderContas() {
    const c = estado.contas;
    const ladoTxt = { despesa: "Pagos", receita: "Recebidos", tudo: "Baixados" }[c.lado];
    $("#c-rotulo-baixado").textContent = ladoTxt;
    $("#c-mes-nav").hidden = c.situacao === "atraso" || c.periodo === "todos";
    $("#c-mes-titulo").textContent = nomeMes(c.ano, c.mes);

    const busca = chaveTexto(c.busca);
    const passaFiltros = (p) => {
      const l = lancDe(p);
      if (c.pessoa && chaveTexto(l.pessoa) !== c.pessoa) return false;
      if (c.categoria && l.categoria_id !== Number(c.categoria)) return false;
      if (c.condicao && l.condicao !== c.condicao) return false;
      if (c.forma && l.forma_pagamento_id !== Number(c.forma)) return false;
      if (c.cartao === "nenhum" ? !!p.cartao_id : c.cartao && p.cartao_id !== Number(c.cartao)) return false;
      if (busca && ![l.descricao, l.pessoa, l.observacao].some((t) => chaveTexto(t).includes(busca))) return false;
      return true;
    };
    const situacao = {
      aberto: (p) => !p.baixado,
      atraso: (p) => emAtraso(p),
      baixado: (p) => p.baixado,
      tudo: () => true,
    }[c.situacao];
    const filtrado = c.base.filter(passaFiltros);
    const lista = filtrado.filter((p) => (c.lado === "tudo" || lancDe(p).tipo === c.lado) && situacao(p));
    // Com filtro de pessoa, categoria, tipo, forma ou busca, as compras do cartão aparecem uma a uma (não como fatura).
    // Só o filtro de cartão mantém as faturas agrupadas (dá pra pagar dali).
    const filtroFino = !!(c.pessoa || c.categoria || c.condicao || c.forma || busca);
    const filtroDeTexto = filtroFino || !!c.cartao;
    c.entradas = filtroFino
      ? lista.map((p) => ({ tipo: "parcela", p, vencimento: p.vencimento, valor: valorEfetivo(p) }))
          .sort((x, y) => x.vencimento.localeCompare(y.vencimento))
      : agrupar(lista);
    c.parcelas = lista;

    const ativos = [c.periodo === "todos", !!c.pessoa, !!c.categoria, !!c.condicao, !!c.forma, !!c.cartao, !!busca].filter(Boolean).length;
    $("#c-filtros-qtd").textContent = ativos ? `(${ativos})` : "";
    $("#c-limpar").hidden = ativos === 0;

    const qtd = `${c.entradas.length} ${plural(c.entradas.length, "item", "itens")}`;
    $("#c-total").textContent = !lista.length ? "" : c.lado === "tudo" ? qtd : `${qtd} · ${fmtBRL(soma(lista, valorEfetivo))}`;

    renderResumoFiltro(filtrado, filtroDeTexto);

    const vazio = filtroDeTexto || c.periodo === "todos"
      ? "Nada encontrado com esses filtros."
      : {
        aberto: c.lado === "receita" ? "Nada a receber neste mês." : c.lado === "despesa" ? "Nada a pagar neste mês." : "Nada em aberto neste mês.",
        atraso: "Nada em atraso.",
        baixado: `Nada ${ladoTxt.toLowerCase()} neste mês.`,
        tudo: "Nenhum lançamento neste mês.",
      }[c.situacao];
    if (estado.selecao) {
      const visiveis = new Set(lista.map((p) => p.id));
      for (const id of [...estado.selecao]) if (!visiveis.has(id)) estado.selecao.delete(id);
    }
    listaOuVazio($("#lista-contas"), c.entradas, vazio, { mostrarTipo: c.lado === "tudo", selecao: estado.selecao });
    atualizarBarraSelecao();
  }

  // ---- Seleção e baixa em lote ----
  function selecionaveis() { return (estado.contas.parcelas || []).filter((p) => !p.baixado && !p.cartao_id); }
  function entrarSelecao() {
    estado.selecao = new Set();
    $("#btn-selecionar").hidden = true;
    renderContas();
  }
  function sairSelecao() {
    estado.selecao = null;
    $("#btn-selecionar").hidden = false;
    $("#c-barra").hidden = true;
    if (estado.view === "contas") renderContas();
  }
  function alternarSelecao(id) {
    if (estado.selecao.has(id)) estado.selecao.delete(id); else estado.selecao.add(id);
    renderContas();
  }
  function atualizarBarraSelecao() {
    const barra = $("#c-barra");
    barra.hidden = !estado.selecao;
    if (!estado.selecao) return;
    const marcadas = (estado.contas.parcelas || []).filter((p) => estado.selecao.has(p.id));
    $("#c-sel-info").textContent = marcadas.length
      ? `${marcadas.length} ${plural(marcadas.length, "selecionada", "selecionadas")} · ${fmtBRL(soma(marcadas, valorEfetivo))}`
      : "Toque nas parcelas pra selecionar";
    $("#c-sel-baixar").disabled = marcadas.length === 0;
    const todas = selecionaveis();
    $("#c-sel-todas").hidden = todas.length === 0;
    $("#c-sel-todas").textContent = todas.length && todas.every((p) => estado.selecao.has(p.id)) ? "Desmarcar todas" : "Marcar todas da lista";
  }
  $("#btn-selecionar").addEventListener("click", entrarSelecao);
  $("#c-sel-cancelar").addEventListener("click", sairSelecao);
  $("#c-sel-todas").addEventListener("click", () => {
    const todas = selecionaveis();
    const tudoMarcado = todas.every((p) => estado.selecao.has(p.id));
    for (const p of todas) { if (tudoMarcado) estado.selecao.delete(p.id); else estado.selecao.add(p.id); }
    renderContas();
  });

  const modalLote = $("#modal-lote");
  $("#c-sel-baixar").addEventListener("click", () => {
    const marcadas = (estado.contas.parcelas || []).filter((p) => estado.selecao?.has(p.id));
    if (!marcadas.length) return;
    const pagar = soma(marcadas.filter((p) => lancDe(p).tipo === "despesa"), valorEfetivo);
    const receber = soma(marcadas.filter((p) => lancDe(p).tipo === "receita"), valorEfetivo);
    const partes = [];
    if (pagar) partes.push(`${fmtBRL(pagar)} a pagar`);
    if (receber) partes.push(`${fmtBRL(receber)} a receber`);
    $("#ml-resumo").textContent = `${marcadas.length} ${plural(marcadas.length, "parcela", "parcelas")}: ${partes.join(" e ")}.`;
    $("#ml-data").value = hojeISO();
    preencherSelect($("#ml-forma"), formasImediatas(), formaSugerida());
    modalLote.showModal();
  });
  $("#ml-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const data = $("#ml-data").value;
    if (!data) { toast("Escolha a data.", true); return; }
    const ids = [...estado.selecao];
    acao($("#ml-confirmar"), async () => {
      for (let i = 0; i < ids.length; i += 100) {
        await exec(sb.from("parcelas").update({
          baixado: true, data_baixa: data, valor_baixa: null, forma_baixa_id: Number($("#ml-forma").value) || null,
        }).in("id", ids.slice(i, i + 100)).eq("baixado", false));
      }
      modalLote.close();
      estado.selecao = null;
      $("#btn-selecionar").hidden = false;
      toast(`Baixa feita em ${ids.length} ${plural(ids.length, "parcela", "parcelas")}.`);
      aposMudanca();
    });
  });

  /** Resumo do que os filtros encontraram: em aberto e baixado, a receber e a pagar. */
  function renderResumoFiltro(filtrado, filtroDeTexto) {
    const c = estado.contas;
    const painel = $("#c-resumo");
    painel.hidden = !(filtroDeTexto || c.lado === "tudo");
    if (painel.hidden) return;
    const total = (tipo, baixado) => soma(filtrado.filter((p) => lancDe(p).tipo === tipo && p.baixado === baixado), valorEfetivo);
    const rAberto = total("receita", false), rBaixado = total("receita", true);
    const pAberto = total("despesa", false), pBaixado = total("despesa", true);
    $("#c-resumo-corpo").replaceChildren(
      h("tr", {}, h("th", {}, "A receber"), h("td", { class: "receita" }, fmtNumero(rAberto)), h("td", {}, fmtNumero(rBaixado))),
      h("tr", {}, h("th", {}, "A pagar"), h("td", { class: "despesa" }, fmtNumero(pAberto)), h("td", {}, fmtNumero(pBaixado))),
    );
    const periodo = c.periodo === "todos" || c.situacao === "atraso" ? "somando todos os meses" : `em ${MESES[c.mes - 1]} de ${c.ano}`;
    const frase = $("#c-frase");
    if (c.pessoa) {
      const nome = $("#c-pessoa").selectedOptions[0]?.textContent || "";
      const partes = [];
      if (rAberto > 0) partes.push(`${nome} te deve ${fmtBRL(rAberto)}`);
      if (pAberto > 0) partes.push(`${fmtBRL(pAberto)} a pagar ligado a ${nome}`);
      const texto = (partes.length ? partes.join(" · ") : `Nada em aberto com ${nome}`) + ` (${periodo}).`;
      frase.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
    } else {
      frase.textContent = `Em aberto ${periodo}: ${fmtBRL(rAberto)} a receber e ${fmtBRL(pAberto)} a pagar.`;
    }
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
  // Backup
  // ---------------------------------------------------------------------------
  function mostrarUltimoBackup() {
    let ultimo = null;
    try { ultimo = localStorage.getItem("ultimo-backup"); } catch (e) { /* navegador sem armazenamento */ }
    $("#backup-ultimo").textContent = ultimo
      ? `Último backup baixado neste aparelho: ${fmtData(ultimo.slice(0, 10))}.`
      : "Você ainda não baixou um backup neste aparelho.";
  }
  function registrarBackup() {
    try { localStorage.setItem("ultimo-backup", hojeISO()); } catch (e) { /* sem armazenamento: só não mostra a data */ }
    mostrarUltimoBackup();
  }

  $("#btn-backup").addEventListener("click", (ev) => acao(ev.currentTarget, async () => {
    await carregarCadastros();
    await carregarLancamentos();
    const [parcelas, saldo] = await Promise.all([
      buscarTodos(() => sb.from("parcelas").select("*").order("id")),
      exec(sb.from("saldo").select("*")),
    ]);
    const backup = {
      app: "Controle Financeiro",
      formato: 1,
      gerado_em: new Date().toISOString(),
      usuario: estado.email,
      contagem: { categorias: estado.categorias.length, formas_pagamento: estado.formas.length, cartoes: estado.cartoes.length,
        lancamentos: estado.lancamentos.length, parcelas: parcelas.length },
      categorias: estado.categorias,
      formas_pagamento: estado.formas,
      cartoes: estado.cartoes,
      lancamentos: estado.lancamentos,
      parcelas,
      saldo: saldo[0] || null,
    };
    baixarArquivo(`backup-controle-financeiro-${hojeISO()}.json`, JSON.stringify(backup, null, 2), "application/json");
    registrarBackup();
    toast(`Backup baixado: ${estado.lancamentos.length} lançamentos e ${parcelas.length} parcelas.`);
  }));

  $("#btn-backup-csv").addEventListener("click", (ev) => acao(ev.currentTarget, async () => {
    const parcelas = (await todasParcelas()).filter(lancDe);
    if (!parcelas.length) { toast("Ainda não há lançamentos pra exportar.", true); return; }
    baixarCSV(`controle-financeiro-tudo-${hojeISO()}.csv`, linhasCSV(parcelas));
    toast(`Planilha baixada com ${parcelas.length} parcelas.`);
  }));

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
    $("#r-ano").hidden = r.periodo === "sempre";
    // "Sempre" carrega tudo; mês e ano carregam o ano escolhido.
    const chave = r.periodo === "sempre" ? "sempre" : r.ano;
    if (r.cacheAno !== chave) {
      try {
        r.parcelasAno = (r.periodo === "sempre"
          ? await todasParcelas()
          : await parcelasDoPeriodo(`${r.ano}-01-01`, `${r.ano + 1}-01-01`)).filter(lancDe);
        r.cacheAno = chave;
      } catch (e) { toast(msgErro(e), true); return; }
    }
    const prefixoMes = `${r.ano}-${pad(r.mes)}`;
    const doAno = r.parcelasAno.filter((p) => passaSituacao(p, r.situacao));
    const doPeriodo = r.periodo === "mensal" ? doAno.filter((p) => p.vencimento.startsWith(prefixoMes)) : doAno;
    const periodoTxt = r.periodo === "mensal" ? `${MESES[r.mes - 1]} de ${r.ano}`
      : r.periodo === "anual" ? String(r.ano) : "todo o período";

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
      ul.replaceChildren(h("li", { class: "dica" }, r.periodo === "sempre" ? "Nada encontrado com esse filtro." : `Nada em ${periodoTxt} com esse filtro.`));
    } else {
      ul.replaceChildren(...itens.map((i) => h("li", {},
        h("span", { class: "cat-nome" }, i.nome),
        h("span", { class: "cat-valor" }, fmtBRL(i.valor), h("small", {}, `${i.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`)),
        h("div", { class: "trilho", role: "presentation" },
          h("div", { class: "preenchido", style: { width: `${Math.max(i.pct, 0.5)}%` } })))));
    }

    $("#r-titulo-evolucao").textContent = r.periodo === "sempre" ? "Receitas e despesas ano a ano" : `Receitas e despesas mês a mês em ${r.ano}`;
    desenharGrafico(doAno, r.periodo === "sempre");
  }

  /** Barras de receitas e despesas: por mês do ano, ou por ano (porAno = true). */
  function desenharGrafico(parcelas, porAno = false) {
    if (!window.Chart) return;
    let rotulos, indice;
    if (porAno) {
      const anos = [...new Set(parcelas.map((p) => p.vencimento.slice(0, 4)))].sort();
      rotulos = anos.length ? anos : [String(estado.rel.ano)];
      indice = (p) => rotulos.indexOf(p.vencimento.slice(0, 4));
    } else {
      rotulos = MESES_CURTOS;
      indice = (p) => Number(p.vencimento.slice(5, 7)) - 1;
    }
    const rec = Array(rotulos.length).fill(0), desp = Array(rotulos.length).fill(0);
    for (const p of parcelas) {
      const i = indice(p);
      if (lancDe(p).tipo === "receita") rec[i] += valorEfetivo(p); else desp[i] += valorEfetivo(p);
    }
    const css = getComputedStyle(document.documentElement);
    const cor = (v) => css.getPropertyValue(v).trim();
    const dados = {
      labels: rotulos,
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
    const sufixo = r.periodo === "mensal" ? `${r.ano}-${pad(r.mes)}` : r.periodo === "anual" ? `${r.ano}` : "sempre";
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
