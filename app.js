import { createStore, IS_DEMO } from "./store.js";
import { USUARIOS, PESSOAS, GESTOR } from "./config.js";

// ============ utilidades ============
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const brDate = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const toMin = (hm) => { if (!hm || !/^\d{1,2}:\d{2}/.test(hm)) return null; const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const diffMin = (a, b) => { const x = toMin(a), y = toMin(b); if (x == null || y == null) return 0; let d = y - x; if (d < 0) d += 1440; return d; };
const fmtMin = (m) => { m = Math.round(m || 0); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const startOfWeek = (d = new Date()) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return isoDate(x); };
const endOfWeek = () => { const x = new Date(startOfWeek() + "T12:00"); x.setDate(x.getDate() + 6); return isoDate(x); };
const monthStart = () => today().slice(0, 8) + "01";
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

const stClass = (s) => { const n = norm(s); if (n.startsWith("concl")) return "st-concluido"; if (n.includes("andamento")) return "st-andamento"; if (n.startsWith("aguard")) return "st-aguardando"; return "st-cancelado"; };
const prClass = (p) => ({ alta: "pr-alta", media: "pr-media", baixa: "pr-baixa" }[norm(p)] || "");
const isDone = (a) => norm(a.status).startsWith("concl");
const isOpen = (a) => !isDone(a) && !norm(a.status).startsWith("cancel");

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600); }
const fill = (sel, items, { all } = {}) => { sel.innerHTML = (all ? `<option value="">${esc(all)}</option>` : "") + items.map((i) => `<option>${esc(i)}</option>`).join(""); };
const keepVal = (sel, fn) => { const v = sel.value; fn(); if ([...sel.options].some((o) => o.value === v)) sel.value = v; };

// ============ estado ============
const S = { store: null, me: null, atv: [], cad: null, editing: null, charts: {} };

// ============ boot ============
(async function boot() {
  S.store = await createStore();
  if (IS_DEMO) { $("#sync").className = "sync demo"; $("#sync").title = "Modo demo — dados só neste navegador"; }

  S.store.onAuth((user) => {
    if (!user) { show("login"); return; }
    let who = USUARIOS[user.email] || (IS_DEMO ? lsGet("rda_who", "") : "");
    if (!IS_DEMO && !who) { semAcesso(user.email); return; }
    if (!PESSOAS.includes(who)) { show("who"); return; }
    start(who, user);
  });

  $("#btnLogin").onclick = async () => { try { await S.store.login(); } catch (e) { $("#loginErr").textContent = "Não foi possível entrar: " + (e.code || e.message); } };
  $("#btnLogout").onclick = () => { lsSet("rda_who", ""); S.store.logout(); };
  $$(".who").forEach((b) => (b.onclick = () => { lsSet("rda_who", b.dataset.who); start(b.dataset.who, {}); }));
})();

// e-mail Google que não está liberado: explica e oferece trocar de conta
function semAcesso(email) {
  show("login");
  $("#btnLogout").hidden = false;
  $("#btnLogin").textContent = "Entrar com outra conta Google";
  $("#btnLogin").onclick = async () => { try { await S.store.logout(); await S.store.login(); } catch (e) { $("#loginErr").textContent = "Não foi possível entrar: " + (e.code || e.message); } };
  const lib = Object.keys(USUARIOS).join(" ou ");
  $("#loginErr").innerHTML = `A conta <b>${esc(email)}</b> não tem acesso a este sistema.<br>Entre com ${esc(lib)}.`;
}

function show(view) {
  $("#loginView").hidden = view !== "login";
  $("#whoView").hidden = view !== "who";
  $("#app").hidden = view !== "app";
  $("#btnLogout").hidden = view !== "app" && view !== "who";
}

let started = false;
function start(who, user) {
  S.me = who;
  $("#userName").textContent = `${who}${IS_DEMO ? " · modo demo" : ""}`;
  show("app");
  if (started) { renderAll(); return; }
  started = true;
  setupTabs(); setupForm(); setupRegistros(); setupDashboard(); setupRelatorio(); setupCadastros();

  S.store.subscribeCadastros((cad) => { S.cad = cad; applyCadastros(); renderAll(); });
  S.store.subscribeAtividades((list) => {
    S.atv = list.map(sanitize).sort((a, b) => (a.data + a.horaInicial).localeCompare(b.data + b.horaInicial));
    renderAll();
  }, (st, err) => {
    const el = $("#sync");
    if (st === "demo") return;
    el.className = "sync " + (st === "on" ? "on" : st === "off" ? "off" : "");
    el.title = st === "on" ? "Sincronizado em tempo real" : st === "off" ? "Erro de conexão: " + (err?.code || "") : "Sincronizando…";
    if (st === "off" && err?.code === "permission-denied") toast("Sem permissão: confira os e-mails no firestore.rules");
  });
}

function sanitize(a) {
  const minutos = a.horaInicial && a.horaFinal ? diffMin(a.horaInicial, a.horaFinal) : Number(a.minutos) || 0;
  return {
    ...a,
    responsavel: a.responsavel || "",
    data: a.data || "",
    horaInicial: a.horaInicial || "",
    horaFinal: a.horaFinal || "",
    minutos,
    empresa: (a.empresa || "").trim(),
    categoria: (a.categoria || "").trim(),
    prioridade: (a.prioridade || "").trim(),
    status: (a.status || "").trim(),
  };
}

function renderAll() {
  if (!S.cad) return;
  renderHoje(); renderRegistros(); renderDashboard(); renderRelatorio();
}

// ============ abas ============
function setupTabs() {
  const go = (t) => {
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
    $$(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + t));
    lsSet("rda_tab", t);
    if (t === "dashboard") renderDashboard();
  };
  $$(".tab").forEach((b) => (b.onclick = () => go(b.dataset.tab)));
  S.goTab = go;
  const last = lsGet("rda_tab", "nova");
  if ($(`.tab[data-tab="${last}"]`)) go(last);
}

function applyCadastros() {
  const f = $("#formAtv");
  keepVal(f.responsavel, () => fill(f.responsavel, PESSOAS));
  keepVal(f.empresa, () => fill(f.empresa, S.cad.empresas));
  keepVal(f.categoria, () => fill(f.categoria, S.cad.categorias));
  keepVal(f.prioridade, () => fill(f.prioridade, S.cad.prioridades));
  keepVal(f.status, () => fill(f.status, S.cad.status));
  $("#dlSolicitantes").innerHTML = S.cad.solicitantes.map((s) => `<option value="${esc(s)}">`).join("");
  if (!S.editing) resetForm(S._formInit); S._formInit = true;

  keepVal($("#fStatus"), () => fill($("#fStatus"), S.cad.status, { all: "Todos os status" }));
  const emps = [...new Set([...S.cad.empresas, ...S.atv.map((a) => a.empresa).filter(Boolean)])];
  keepVal($("#fEmpresa"), () => fill($("#fEmpresa"), emps, { all: "Todas as empresas" }));
  renderCadEditor();
}

// ============ formulário ============
function setupForm() {
  const f = $("#formAtv");
  const recalc = () => { f.tempo.value = f.horaInicial.value && f.horaFinal.value ? fmtMin(diffMin(f.horaInicial.value, f.horaFinal.value)) : ""; };
  f.horaInicial.oninput = recalc; f.horaFinal.oninput = recalc;
  $("#btnNowEnd").onclick = () => { f.horaFinal.value = nowHM(); recalc(); };
  $("#btnStartNow").onclick = () => {
    resetForm(); f.horaInicial.value = nowHM(); f.horaFinal.value = ""; f.status.value = pick(S.cad.status, "andamento"); recalc(); f.atividade.focus();
  };
  $("#btnCancelEdit").onclick = () => resetForm();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const o = Object.fromEntries(new FormData(f));
    const id = o.id; delete o.id; delete o.tempo;
    o.minutos = o.horaFinal ? diffMin(o.horaInicial, o.horaFinal) : 0;
    if (isDoneVal(o.status) && !o.horaFinal) { toast("Informe a hora final para concluir"); f.horaFinal.focus(); return; }
    $("#btnSave").disabled = true;
    try {
      if (id) await S.store.update(id, o); else await S.store.add(o);
      toast(id ? "Atividade atualizada" : "Atividade salva");
      const keep = { responsavel: o.responsavel, data: o.data, empresa: o.empresa, horaInicial: o.horaFinal || "" };
      resetForm(); if (!id) Object.entries(keep).forEach(([k, v]) => v && (f[k].value = v));
    } catch (err) { console.error(err); toast("Erro ao salvar: " + (err.code || err.message)); }
    finally { $("#btnSave").disabled = false; }
  };
}
const isDoneVal = (s) => norm(s).startsWith("concl");
const pick = (list, frag) => list.find((x) => norm(x).includes(frag)) || list[0];

function resetForm(soft) {
  const f = $("#formAtv");
  if (!soft) f.reset();
  S.editing = null;
  f.id.value = "";
  f.responsavel.value = S.me;
  if (!f.data.value || !soft) f.data.value = today();
  if (!soft) { f.status.value = pick(S.cad.status, "concl"); f.prioridade.value = pick(S.cad.prioridades, "medi"); }
  f.tempo.value = "";
  $("#formTitle").textContent = "Nova atividade";
  $("#btnSave").textContent = "Salvar atividade";
  $("#btnCancelEdit").hidden = true;
}

function editAtv(id) {
  const a = S.atv.find((x) => x.id === id); if (!a) return;
  const f = $("#formAtv");
  S.editing = id;
  for (const k of ["responsavel", "data", "horaInicial", "horaFinal", "empresa", "categoria", "prioridade", "status", "solicitante", "atividade", "resultado", "proximaAcao", "observacoes"]) {
    const el = f[k]; if (!el) continue;
    if (el.tagName === "SELECT" && a[k] && ![...el.options].some((o) => o.value === a[k])) el.add(new Option(a[k], a[k]));
    el.value = a[k] || "";
  }
  f.id.value = id;
  f.tempo.value = a.horaFinal ? fmtMin(a.minutos) : "";
  $("#formTitle").textContent = `Editando atividade de ${a.responsavel} (${brDate(a.data)})`;
  $("#btnSave").textContent = "Salvar alterações";
  $("#btnCancelEdit").hidden = false;
  S.goTab("nova"); window.scrollTo({ top: 0, behavior: "smooth" });
}

async function concluir(id) {
  const a = S.atv.find((x) => x.id === id); if (!a) return;
  const horaFinal = a.horaFinal || nowHM();
  await S.store.update(id, { status: pick(S.cad.status, "concl"), horaFinal, minutos: diffMin(a.horaInicial, horaFinal) });
  toast("Atividade concluída");
}
async function excluir(id, btn) {
  // confirmação em dois cliques: 1º clique arma o botão, 2º exclui
  if (!btn.classList.contains("armed")) {
    btn.classList.add("armed"); btn.textContent = "Excluir?"; btn.title = "Clique de novo para confirmar";
    setTimeout(() => { if (btn.isConnected) { btn.classList.remove("armed"); btn.textContent = "🗑️"; } }, 3000);
    return;
  }
  await S.store.remove(id); toast("Atividade excluída");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  ({ edit: editAtv, done: concluir, del: excluir })[b.dataset.act]?.(b.dataset.id, b);
});

function renderHoje() {
  const d = today();
  const list = S.atv.filter((a) => a.data === d && a.responsavel === S.me).reverse();
  const tot = list.reduce((s, a) => s + a.minutos, 0);
  $("#hojeResumo").textContent = `${list.length} atividade(s) · ${fmtMin(tot)} trabalhadas`;
  $("#hojeLista").innerHTML = list.length ? list.map((a) => `
    <div class="item">
      <div class="time">${esc(a.horaInicial)}–${esc(a.horaFinal || "…")}<br><b>${a.horaFinal ? fmtMin(a.minutos) : ""}</b></div>
      <div><div class="what">${esc(a.atividade)}</div>
        <div class="meta">${esc(a.empresa)} · ${esc(a.categoria)} · <span class="${prClass(a.prioridade)}">${esc(a.prioridade)}</span> · <span class="badge ${stClass(a.status)}">${esc(a.status)}</span></div></div>
      <div class="acts">
        ${isOpen(a) ? `<button class="btn ghost small" data-act="done" data-id="${a.id}">✔ Concluir</button>` : ""}
        <button class="iconbtn" title="Editar" data-act="edit" data-id="${a.id}">✏️</button>
        <button class="iconbtn" title="Excluir" data-act="del" data-id="${a.id}">🗑️</button>
      </div>
    </div>`).join("") : `<p class="muted">Nenhuma atividade registrada hoje ainda.</p>`;
}

// ============ registros ============
function setupRegistros() {
  fill($("#fPessoa"), PESSOAS, { all: "Todos" });
  $("#fDe").value = monthStart(); $("#fAte").value = today();
  ["#fPessoa", "#fDe", "#fAte", "#fStatus", "#fEmpresa", "#fBusca"].forEach((s) => ($(s).oninput = renderRegistros));
  $("#btnCsv").onclick = exportCsv;
}
function filtrarRegistros() {
  const p = $("#fPessoa").value, de = $("#fDe").value, ate = $("#fAte").value, st = $("#fStatus").value, em = $("#fEmpresa").value, q = norm($("#fBusca").value);
  return S.atv.filter((a) => (!p || a.responsavel === p) && (!de || a.data >= de) && (!ate || a.data <= ate) && (!st || a.status === st) && (!em || a.empresa === em) &&
    (!q || norm([a.atividade, a.resultado, a.proximaAcao, a.solicitante, a.observacoes, a.categoria].join(" ")).includes(q))).slice().reverse();
}
function renderRegistros() {
  const list = filtrarRegistros();
  const tot = list.reduce((s, a) => s + a.minutos, 0);
  $("#regCount").textContent = `${list.length} registro(s) · ${fmtMin(tot)} trabalhadas`;
  const MAX = 500;
  $("#tblReg tbody").innerHTML = list.slice(0, MAX).map((a) => `<tr>
    <td>${esc(a.responsavel)}</td><td class="nowrap">${brDate(a.data)}</td><td class="nowrap">${esc(a.horaInicial)}</td><td class="nowrap">${esc(a.horaFinal)}</td>
    <td class="nowrap"><b>${fmtMin(a.minutos)}</b></td><td>${esc(a.empresa)}</td><td>${esc(a.categoria)}</td><td class="${prClass(a.prioridade)}">${esc(a.prioridade)}</td>
    <td class="wrap">${esc(a.atividade)}</td><td class="wrap">${esc(a.resultado)}</td><td><span class="badge ${stClass(a.status)}">${esc(a.status)}</span></td>
    <td class="wrap">${esc(a.proximaAcao)}</td><td>${esc(a.solicitante)}</td>
    <td class="nowrap">${isOpen(a) ? `<button class="iconbtn" title="Concluir" data-act="done" data-id="${a.id}">✔</button>` : ""}<button class="iconbtn" title="Editar" data-act="edit" data-id="${a.id}">✏️</button><button class="iconbtn" title="Excluir" data-act="del" data-id="${a.id}">🗑️</button></td>
  </tr>`).join("") + (list.length > MAX ? `<tr><td colspan="14" class="muted">Mostrando ${MAX} de ${list.length}. Refine os filtros ou exporte o CSV.</td></tr>` : "");
}
function exportCsv() {
  const cols = [["responsavel", "Responsável"], ["data", "Data"], ["horaInicial", "Hora Inicial"], ["horaFinal", "Hora Final"], ["tempo", "Tempo"], ["empresa", "Empresa"], ["categoria", "Categoria"], ["prioridade", "Prioridade"], ["atividade", "Atividade Executada"], ["resultado", "Resultado Obtido"], ["status", "Status"], ["proximaAcao", "Próxima Ação"], ["solicitante", "Solicitante"], ["observacoes", "Observações"]];
  const rows = filtrarRegistros().reverse().map((a) => cols.map(([k]) => (k === "tempo" ? fmtMin(a.minutos) : k === "data" ? brDate(a.data) : a[k] ?? "")));
  const csv = [cols.map((c) => c[1]), ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: `atividades_${today()}.csv` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============ dashboard ============
function setupDashboard() {
  fill($("#dPessoa"), PESSOAS, { all: "Luis + Carlos" });
  $("#dPessoa").value = lsGet("rda_dp", "");
  $("#dPeriodo").value = lsGet("rda_dper", "mes");
  $("#dDe").value = monthStart(); $("#dAte").value = today();
  ["#dPessoa", "#dPeriodo", "#dDe", "#dAte"].forEach((s) => ($(s).oninput = () => { lsSet("rda_dp", $("#dPessoa").value); lsSet("rda_dper", $("#dPeriodo").value); renderDashboard(); }));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderDashboard);
  $("#pdfData").value = today();
  $("#btnPdf").onclick = gerarPdfDia;
}
function periodo() {
  const p = $("#dPeriodo").value;
  const custom = p === "custom"; $("#dDe").hidden = !custom; $("#dAte").hidden = !custom;
  if (p === "hoje") return [today(), today()];
  if (p === "semana") return [startOfWeek(), endOfWeek()];
  if (p === "mes") return [monthStart(), today().slice(0, 8) + "31"];
  if (custom) return [$("#dDe").value || "0000", $("#dAte").value || "9999"];
  return ["0000", "9999"];
}
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function renderDashboard() {
  if (!$("#tab-dashboard").classList.contains("active") || !S.cad) return;
  const pessoa = $("#dPessoa").value;
  const [de, ate] = periodo();
  const base = S.atv.filter((a) => !pessoa || a.responsavel === pessoa);
  const L = base.filter((a) => a.data >= de && a.data <= ate);
  $("#dLabel").textContent = de === "0000" ? `${L.length} registros` : `${brDate(de)} a ${brDate(ate > today() ? today() : ate)} · ${L.length} registros`;

  const cnt = (fn) => L.filter(fn).length;
  const cat = (frag) => cnt((a) => norm(a.categoria).includes(frag));
  const st = (frag) => cnt((a) => norm(a.status).includes(frag));
  const mins = L.reduce((s, a) => s + a.minutos, 0);
  const comTempo = L.filter((a) => a.minutos > 0).length;
  const empresas = new Set(L.map((a) => a.empresa).filter(Boolean)).size;
  const t = today(), ws = startOfWeek(), ms = monthStart();

  const kpis = [
    ["🗂️", "Total de tarefas", L.length],
    ["✅", "Tarefas concluídas", st("conclu")],
    ["🔄", "Em andamento", st("andamento")],
    ["⏳", "Aguardando cliente", st("aguardando cliente")],
    ["📦", "Aguardando fornecedor", st("fornecedor")],
    ["⏱️", "Horas trabalhadas", fmtMin(mins)],
    ["🏢", "Empresas atendidas", empresas],
    ["🚗", "Visitas técnicas", cat("visita")],
    ["💻", "Suportes remotos", cat("suporte remoto")],
    ["🗣️", "Reuniões realizadas", cat("reuni")],
    ["📁", "Atividades administrativas", cat("administr")],
    ["📏", "Tempo médio / atividade", fmtMin(comTempo ? mins / comTempo : 0)],
    ["📅", "Produtividade diária (hoje)", base.filter((a) => a.data === t).length],
    ["📆", "Produtividade semanal", base.filter((a) => a.data >= ws && a.data <= t).length],
    ["🗓️", "Produtividade mensal", base.filter((a) => a.data >= ms && a.data <= t).length],
  ];
  if (!pessoa) PESSOAS.forEach((p) => {
    const m = L.filter((a) => a.responsavel === p);
    kpis.push(["👤", `${p}: tarefas · horas`, `${m.length} · ${fmtMin(m.reduce((s, a) => s + a.minutos, 0))}`]);
  });
  $("#kpis").innerHTML = kpis.map(([i, l, v]) => `<div class="kpi"><div class="k-label">${i} ${esc(l)}</div><div class="k-val">${esc(v)}</div></div>`).join("");

  if (!window.Chart) return;
  const C = { s1: cssVar("--s1"), s2: cssVar("--s2"), text: cssVar("--text-2"), grid: cssVar("--border"), surface: cssVar("--surface") };
  Chart.defaults.color = C.text;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

  const group = (key, order) => {
    const m = new Map(); (order || []).forEach((k) => m.set(k, 0));
    L.forEach((a) => { const k = a[key] || "(vazio)"; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].filter(([, v]) => v > 0 || !order);
  };
  const sortDesc = (e) => e.sort((a, b) => b[1] - a[1]);

  hbar("chCategoria", sortDesc(group("categoria", S.cad.categorias)), C, "atividades");
  hbar("chStatus", group("status", S.cad.status), C, "atividades");
  hbar("chEmpresa", sortDesc(group("empresa")).slice(0, 10), C, "atividades");
  hbar("chPrioridade", group("prioridade", S.cad.prioridades), C, "atividades");

  // horas por dia (empilhado por pessoa)
  const dias = [...new Set(L.map((a) => a.data))].sort();
  const pessoas = pessoa ? [pessoa] : PESSOAS;
  const cores = [C.s1, C.s2];
  const ds = pessoas.map((p, i) => ({
    label: p,
    data: dias.map((d) => +(L.filter((a) => a.data === d && a.responsavel === p).reduce((s, a) => s + a.minutos, 0) / 60).toFixed(2)),
    backgroundColor: cores[PESSOAS.indexOf(p) % 2] || cores[i % 2],
    borderColor: C.surface, borderWidth: { top: i ? 2 : 0, bottom: 0, left: 0, right: 0 },
    borderRadius: 4, borderSkipped: "bottom", maxBarThickness: 28,
  }));
  $("#lgDia").innerHTML = pessoas.length > 1 ? pessoas.map((p) => `<span><i style="background:${cores[PESSOAS.indexOf(p) % 2]}"></i>${esc(p)}</span>`).join("") : "";
  draw("chDia", {
    type: "bar",
    data: { labels: dias.map((d) => brDate(d).slice(0, 5)), datasets: ds },
    options: baseOpts(C, {
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
        y: { stacked: true, beginAtZero: true, grid: { color: C.grid }, border: { display: false }, title: { display: true, text: "horas" } },
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMin(c.raw * 60)} h` } } },
    }),
  });
}
function baseOpts(C, extra) {
  return { responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, interaction: { mode: "nearest", intersect: false }, ...extra };
}
function hbar(id, entries, C, unit) {
  draw(id, {
    type: "bar",
    data: { labels: entries.map((e) => e[0]), datasets: [{ data: entries.map((e) => e[1]), backgroundColor: C.s1, borderRadius: 4, borderSkipped: "start", maxBarThickness: 22 }] },
    options: baseOpts(C, {
      indexAxis: "y",
      layout: { padding: { right: 34 } },
      interaction: { mode: "nearest", axis: "y", intersect: false },
      scales: { x: { beginAtZero: true, grid: { color: C.grid }, border: { display: false }, ticks: { precision: 0 } }, y: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw} ${unit}` } } },
    }),
    plugins: [valueLabels],
  });
}
// rótulo de valor na ponta de cada barra
const valueLabels = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart; const meta = chart.getDatasetMeta(0);
    ctx.save(); ctx.fillStyle = cssVar("--text-2"); ctx.font = "12px " + Chart.defaults.font.family; ctx.textBaseline = "middle";
    meta.data.forEach((bar, i) => { const v = chart.data.datasets[0].data[i]; if (v) ctx.fillText(v, bar.x + 6, bar.y); });
    ctx.restore();
  },
};
function draw(id, cfg) {
  if (S.charts[id]) S.charts[id].destroy();
  S.charts[id] = new Chart($("#" + id), cfg);
}

// ============ relatório do dia ============
function setupRelatorio() {
  fill($("#rPessoa"), PESSOAS);
  $("#rPessoa").value = S.me; $("#rData").value = today();
  $("#rPessoa").oninput = $("#rData").oninput = renderRelatorio;
  $("#relObs").oninput = () => { lsSet(`rda_obs_${$("#rPessoa").value}_${$("#rData").value}`, $("#relObs").value); buildMsg(); };
  $("#btnCopy").onclick = async () => {
    try { await navigator.clipboard.writeText($("#relMsg").value); } catch { $("#relMsg").select(); document.execCommand("copy"); }
    toast("Mensagem copiada");
  };
}
let relCache = null;
function renderRelatorio() {
  const p = $("#rPessoa").value, d = $("#rData").value;
  const L = S.atv.filter((a) => a.responsavel === p && a.data === d);
  const mins = L.reduce((s, a) => s + a.minutos, 0);
  const clientes = [...new Set(L.map((a) => a.empresa).filter(Boolean))];
  const entregas = L.filter(isDone).sort((a, b) => b.minutos - a.minutos);
  const pend = L.filter(isOpen);
  relCache = { p, d, L, mins, clientes, entregas, pend };
  $("#relKpis").innerHTML = [["Total de atividades", L.length], ["Tempo trabalhado", fmtMin(mins)], ["Clientes atendidos", clientes.length]]
    .map(([l, v]) => `<div class="kpi"><div class="k-label">${l}</div><div class="k-val">${v}</div></div>`).join("");
  const li = (a, extra = "") => `<li>${esc(a.atividade)} <span class="muted small">— ${esc(a.empresa)}${extra}</span></li>`;
  $("#relEntregas").innerHTML = entregas.length ? entregas.map((a) => li(a, a.resultado ? ` · ${esc(a.resultado)}` : "")).join("") : `<li class="muted">Nenhuma entrega concluída.</li>`;
  $("#relPend").innerHTML = pend.length ? pend.map((a) => li(a, ` · ${esc(a.status)}${a.proximaAcao ? " · " + esc(a.proximaAcao) : ""}`)).join("") : `<li class="muted">Sem pendências.</li>`;
  $("#relObs").value = lsGet(`rda_obs_${p}_${d}`, "");
  buildMsg();
}
function buildMsg() {
  if (!relCache) return;
  const { d, L, mins, clientes, entregas, pend } = relCache;
  const h = new Date().getHours();
  const saud = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const obs = $("#relObs").value.trim();
  const linhas = [
    `${saud}, ${GESTOR}!`,
    `Segue meu relatório das atividades realizadas ${d === today() ? "hoje" : "em"} (${brDate(d)}).`,
    "",
    `• Total de atividades: ${L.length}`,
    `• Horas trabalhadas: ${fmtMin(mins)}`,
    `• Clientes atendidos: ${clientes.length}${clientes.length ? ` (${clientes.join(", ")})` : ""}`,
    "",
    "Principais atividades:",
    ...(entregas.length ? entregas.map((a) => `• ${a.atividade}${a.resultado ? ` — ${a.resultado}` : ""}`) : ["• —"]),
    "",
    "Pendências:",
    ...(pend.length ? pend.map((a) => `• ${a.atividade} (${a.status}${a.proximaAcao ? `; próxima ação: ${a.proximaAcao}` : ""})`) : ["• Nenhuma"]),
    ...(obs ? ["", "Observações:", obs] : []),
    "",
    "Permaneço à disposição para qualquer esclarecimento.",
  ];
  $("#relMsg").value = linhas.join("\n");
  $("#btnWpp").href = "https://wa.me/?text=" + encodeURIComponent($("#relMsg").value);
}

// ============ cadastros + importação ============
const CAD_LABELS = { categorias: "Categorias", prioridades: "Prioridades", status: "Status", empresas: "Empresas", solicitantes: "Solicitantes" };
function setupCadastros() {
  $("#btnSaveCad").onclick = async () => {
    const o = {};
    $$("#cadGrid textarea").forEach((t) => (o[t.dataset.k] = t.value.split("\n").map((s) => s.trim()).filter(Boolean)));
    try { await S.store.saveCadastros(o); toast("Cadastros salvos"); } catch (e) { toast("Erro: " + (e.code || e.message)); }
  };
  $("#fileImport").onchange = () => ($("#btnImport").disabled = !$("#fileImport").files.length);
  $("#btnImport").onclick = importar;
}
function renderCadEditor() {
  if ($("#cadGrid").contains(document.activeElement)) return;
  $("#cadGrid").innerHTML = Object.entries(CAD_LABELS).map(([k, l]) => `<label>${l}<textarea data-k="${k}">${esc((S.cad[k] || []).join("\n"))}</textarea></label>`).join("");
}

async function importar() {
  const file = $("#fileImport").files[0]; if (!file) return;
  const msg = $("#importMsg");
  if (!window.XLSX) { msg.textContent = "Biblioteca de leitura de Excel não carregou."; return; }
  msg.textContent = "Lendo arquivo…";
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const out = [];
    for (const name of wb.SheetNames) {
      const pessoa = PESSOAS.find((p) => norm(name).includes("registro") && norm(name).includes(norm(p)));
      if (!pessoa) continue;
      out.push(...parseSheet(wb.Sheets[name], pessoa));
    }
    if (!out.length) { msg.textContent = "Nenhum registro encontrado. As abas devem se chamar \"Registro Diário Luis\" / \"Registro Diário Carlos\"."; return; }
    const existing = new Set(S.atv.map((a) => a.id));
    msg.textContent = `Importando ${out.length} registros…`;
    const added = await S.store.bulkImport(out, existing);
    const porPessoa = PESSOAS.map((p) => `${p}: ${out.filter((x) => x.responsavel === p).length}`).join(" · ");
    msg.textContent = `Pronto! ${added} novos registros importados (${out.length - added} já existiam). Lidos — ${porPessoa}.`;
    toast("Importação concluída");
  } catch (e) { console.error(e); msg.textContent = "Erro ao importar: " + (e.code || e.message); }
}

function parseSheet(ws, pessoa) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  const hi = rows.findIndex((r) => r.some((c) => norm(c).includes("atividade executada")));
  if (hi < 0) return [];
  const H = rows[hi].map(norm);
  const col = (frag, fb) => { const i = H.findIndex((h) => h.includes(frag)); return i >= 0 ? i : fb; };
  const C = {
    data: col("data", 0), hi: col("hora inicial", 1), hf: col("hora final", 2), tempo: col("tempo", 3), empresa: col("empresa", 4),
    categoria: col("categoria", 5), prioridade: col("prioridade", 6), atividade: col("atividade executada", 7), resultado: col("resultado", 8),
    status: col("status", 9), proxima: col("proxima", 10), solicitante: col("solicitante", 11), obs: col("observ", 12),
  };
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const data = parseDate(r[C.data]);
    const atividade = String(r[C.atividade] ?? "").trim();
    if (!data || !atividade) continue;
    const horaInicial = parseTime(r[C.hi]), horaFinal = parseTime(r[C.hf]);
    const minutos = horaInicial && horaFinal ? diffMin(horaInicial, horaFinal) : toMin(parseTime(r[C.tempo])) || 0;
    const o = {
      responsavel: pessoa, data, horaInicial, horaFinal, minutos,
      empresa: String(r[C.empresa]).trim(), categoria: String(r[C.categoria]).trim(), prioridade: String(r[C.prioridade]).trim(),
      atividade, resultado: String(r[C.resultado]).trim(), status: String(r[C.status]).trim(), proximaAcao: String(r[C.proxima]).trim(),
      solicitante: String(r[C.solicitante]).trim(), observacoes: String(r[C.obs]).trim(),
    };
    o.id = "imp_" + hash([pessoa, data, horaInicial, horaFinal, atividade].join("|"));
    out.push(o);
  }
  return out;
}
function parseDate(v) {
  if (v instanceof Date) return isoDate(v);
  if (typeof v === "number" && v > 20000) { const d = XLSX.SSF.parse_date_code(v); return `${d.y}-${pad(d.m)}-${pad(d.d)}`; }
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  const iso = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : "";
}
function parseTime(v) {
  if (v === "" || v == null) return "";
  if (typeof v === "number") { const mins = Math.round((v % 1) * 1440); return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`; }
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? `${pad(m[1])}:${m[2]}` : "";
}
function hash(s) { let h1 = 0x811c9dc5, h2 = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (Math.imul(h2, 31) + c) | 0; } return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36); }

// ============ relatório PDF do dia ============
function gerarPdfDia() {
  const JS = window.jspdf?.jsPDF;
  if (!JS) { toast("Biblioteca de PDF não carregou. Recarregue a página."); return; }
  const dia = $("#pdfData").value || today();
  const pessoa = $("#dPessoa").value; // "" = Luis + Carlos
  const pessoas = pessoa ? [pessoa] : PESSOAS;
  const L = S.atv.filter((a) => a.data === dia && pessoas.includes(a.responsavel));
  if (!L.length && !window.__pdfConfirm) { window.__pdfConfirm = true; setTimeout(() => (window.__pdfConfirm = false), 4000); toast("Nenhuma atividade nesse dia. Clique de novo para gerar mesmo assim."); return; }
  window.__pdfConfirm = false;

  const doc = new JS({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), M = 14;
  const AZUL = [11, 61, 110], CINZA = [90, 100, 115], LINHA = [221, 227, 234];
  const mins = L.reduce((s, a) => s + a.minutos, 0);
  const comTempo = L.filter((a) => a.minutos > 0).length;
  const empresas = [...new Set(L.map((a) => a.empresa).filter(Boolean))];
  const n = (fn) => L.filter(fn).length;
  const txt = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[^\x00-\xFF]/g, "");

  // Cabeçalho
  doc.setFillColor(...AZUL); doc.rect(0, 0, W, 26, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Relatório Diário de Atividades", M, 12);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`${brDate(dia)}  ·  ${pessoas.join(" e ")}  ·  Para: ${GESTOR}`.replace(/·/g, "|"), M, 20);
  let y = 34;

  // Indicadores
  const kp = [
    ["Atividades", L.length], ["Concluídas", n(isDone)], ["Pendentes", n(isOpen)],
    ["Horas trabalhadas", fmtMin(mins)], ["Tempo médio", fmtMin(comTempo ? mins / comTempo : 0)], ["Empresas", empresas.length],
  ];
  const cw = (W - 2 * M - 5 * 3) / 6;
  kp.forEach(([l, v], i) => {
    const x = M + i * (cw + 3);
    doc.setDrawColor(...LINHA); doc.setFillColor(247, 249, 252); doc.roundedRect(x, y, cw, 18, 1.5, 1.5, "FD");
    doc.setFillColor(...AZUL); doc.rect(x, y, 1.2, 18, "F");
    doc.setTextColor(...CINZA); doc.setFontSize(7.5); doc.text(l, x + 3.5, y + 5.5);
    doc.setTextColor(20, 32, 46); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(String(v), x + 3.5, y + 14);
    doc.setFont("helvetica", "normal");
  });
  y += 25;

  const titulo = (t) => {
    if (y > 270) { doc.addPage(); y = 18; }
    doc.setTextColor(...AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.text(t, M, y);
    doc.setFont("helvetica", "normal"); y += 3;
  };
  const tabela = (head, body, opts = {}) => {
    doc.autoTable({
      startY: y, head: [head], body, margin: { left: M, right: M }, theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 1.8, lineColor: LINHA, lineWidth: 0.2, textColor: [20, 32, 46], valign: "top" },
      headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [247, 249, 252] }, ...opts,
    });
    y = doc.lastAutoTable.finalY + 8;
  };

  // Resumo por pessoa (quando são os dois)
  if (pessoas.length > 1) {
    titulo("Resumo por pessoa");
    tabela(["Pessoa", "Atividades", "Concluídas", "Pendentes", "Horas"], pessoas.map((p) => {
      const m = L.filter((a) => a.responsavel === p);
      return [p, m.length, m.filter(isDone).length, m.filter(isOpen).length, fmtMin(m.reduce((s, a) => s + a.minutos, 0))];
    }), { columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" } } });
  }

  // Por categoria
  const cats = {}; L.forEach((a) => { const k = a.categoria || "(sem categoria)"; cats[k] = cats[k] || [0, 0]; cats[k][0]++; cats[k][1] += a.minutos; });
  if (L.length) {
    titulo("Tempo por categoria");
    tabela(["Categoria", "Atividades", "Horas", "% do tempo"], Object.entries(cats).sort((a, b) => b[1][1] - a[1][1])
      .map(([k, [c, m]]) => [txt(k), c, fmtMin(m), mins ? Math.round((m / mins) * 100) + "%" : "-"]),
      { columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" } } });
  }

  // Atividades do dia
  titulo("Atividades realizadas");
  const multi = pessoas.length > 1;
  const head = [...(multi ? ["Resp."] : []), "Início", "Fim", "Tempo", "Empresa", "Categoria", "Atividade", "Resultado", "Status"];
  tabela(head, L.length ? L.map((a) => [...(multi ? [a.responsavel] : []), a.horaInicial, a.horaFinal || "-", a.horaFinal ? fmtMin(a.minutos) : "-",
    txt(a.empresa), txt(a.categoria), txt(a.atividade), txt(a.resultado), txt(a.status)]) : [[{ content: "Nenhuma atividade registrada.", colSpan: head.length }]],
    { styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.5, lineColor: LINHA, lineWidth: 0.2, textColor: [20, 32, 46], valign: "top" },
      columnStyles: multi
        ? { 0: { cellWidth: 13 }, 1: { cellWidth: 11 }, 2: { cellWidth: 11 }, 3: { cellWidth: 11 }, 4: { cellWidth: 24 }, 5: { cellWidth: 22 }, 8: { cellWidth: 22 } }
        : { 0: { cellWidth: 11 }, 1: { cellWidth: 11 }, 2: { cellWidth: 11 }, 3: { cellWidth: 26 }, 4: { cellWidth: 24 }, 7: { cellWidth: 22 } } });

  // Pendências
  const pend = L.filter(isOpen);
  titulo("Pendências");
  tabela([...(multi ? ["Resp."] : []), "Atividade", "Status", "Próxima ação", "Solicitante"],
    pend.length ? pend.map((a) => [...(multi ? [a.responsavel] : []), txt(a.atividade), txt(a.status), txt(a.proximaAcao) || "-", txt(a.solicitante) || "-"])
      : [[{ content: "Sem pendências.", colSpan: multi ? 5 : 4 }]]);

  // Rodapé
  const pages = doc.getNumberOfPages();
  const agora = new Date();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(...CINZA);
    doc.text(`Gerado em ${brDate(isoDate(agora))} às ${nowHM()} | Registro Diário de Atividades`, M, 290);
    doc.text(`Página ${i} de ${pages}`, W - M, 290, { align: "right" });
  }

  const nome = `Relatorio_${pessoa || "Luis_Carlos"}_${dia}.pdf`;
  doc.save(nome);
  toast("PDF gerado: " + nome);
}
