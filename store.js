// Camada de dados: Firebase (tempo real) ou Demo (localStorage)
import { firebaseConfig, CADASTROS_PADRAO } from "./config.js";

// ?demo no endereço abre o modo demonstração (dados de exemplo, só neste navegador)
export const IS_DEMO = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("COLE") || new URLSearchParams(location.search).has("demo");

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";

export async function createStore() {
  return IS_DEMO ? createDemoStore() : createFirebaseStore();
}

// ---------------- FIREBASE ----------------
async function createFirebaseStore() {
  const { initializeApp } = await import(FB + "firebase-app.js");
  const auth = await import(FB + "firebase-auth.js");
  const fs = await import(FB + "firebase-firestore.js");

  const app = initializeApp(firebaseConfig);
  const a = auth.getAuth(app);
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.getFirestore(app);
  }
  const colAtv = fs.collection(db, "atividades");
  const docCad = fs.doc(db, "config", "cadastros");

  return {
    mode: "firebase",
    onAuth(cb) {
      auth.onAuthStateChanged(a, (u) => cb(u ? { email: (u.email || "").toLowerCase(), name: u.displayName } : null));
    },
    async login() {
      const p = new auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: "select_account" });
      await auth.signInWithPopup(a, p);
    },
    logout: () => auth.signOut(a),

    subscribeAtividades(cb, onStatus) {
      return fs.onSnapshot(
        colAtv,
        { includeMetadataChanges: true },
        (snap) => {
          cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          onStatus?.(snap.metadata.hasPendingWrites || snap.metadata.fromCache ? "pending" : "on");
        },
        (err) => { console.error(err); onStatus?.("off", err); }
      );
    },
    async add(obj) {
      const user = a.currentUser;
      await fs.addDoc(colAtv, { ...obj, createdAt: fs.serverTimestamp(), createdBy: user?.email || "" });
    },
    async update(id, obj) {
      await fs.updateDoc(fs.doc(db, "atividades", id), { ...obj, updatedAt: fs.serverTimestamp(), updatedBy: a.currentUser?.email || "" });
    },
    async remove(id) {
      await fs.deleteDoc(fs.doc(db, "atividades", id));
    },
    async bulkImport(list, existingIds) {
      let added = 0;
      const todo = list.filter((x) => !existingIds.has(x.id));
      for (let i = 0; i < todo.length; i += 400) {
        const batch = fs.writeBatch(db);
        for (const { id, ...rest } of todo.slice(i, i + 400)) {
          batch.set(fs.doc(db, "atividades", id), { ...rest, importado: true, createdAt: fs.serverTimestamp(), createdBy: a.currentUser?.email || "" });
          added++;
        }
        await batch.commit();
      }
      return added;
    },
    subscribeCadastros(cb) {
      return fs.onSnapshot(docCad, (s) => cb(s.exists() ? { ...CADASTROS_PADRAO, ...s.data() } : { ...CADASTROS_PADRAO }));
    },
    saveCadastros: (obj) => fs.setDoc(docCad, obj),
  };
}

// ---------------- DEMO (localStorage) ----------------
function createDemoStore() {
  const K_ATV = "rda_demo_atividades";
  const K_CAD = "rda_demo_cadastros";
  const K_WHO = "rda_demo_user";
  const read = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  let atvSubs = [], cadSubs = [];
  const emitAtv = () => { const l = read(K_ATV, []); atvSubs.forEach((cb) => cb(l)); };
  const emitCad = () => { const c = { ...CADASTROS_PADRAO, ...read(K_CAD, {}) }; cadSubs.forEach((cb) => cb(c)); };
  // sincroniza entre abas do mesmo navegador
  window.addEventListener("storage", (e) => { if (e.key === K_ATV) emitAtv(); if (e.key === K_CAD) emitCad(); });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  let authCb = null;

  return {
    mode: "demo",
    onAuth(cb) { authCb = cb; cb(read(K_WHO, null) ? { email: "demo", name: "Demo" } : { email: "demo", name: "Demo" }); },
    async login() { authCb?.({ email: "demo", name: "Demo" }); },
    async logout() { try { localStorage.removeItem("rda_who"); } catch {} location.reload(); },
    subscribeAtividades(cb, onStatus) {
      if (read(K_ATV, null) === null) write(K_ATV, exemplos());
      atvSubs.push(cb); cb(read(K_ATV, [])); onStatus?.("demo"); return () => {};
    },
    async add(obj) { const l = read(K_ATV, []); l.push({ id: uid(), ...obj, createdAt: Date.now() }); write(K_ATV, l); emitAtv(); },
    async update(id, obj) { const l = read(K_ATV, []).map((x) => (x.id === id ? { ...x, ...obj } : x)); write(K_ATV, l); emitAtv(); },
    async remove(id) { write(K_ATV, read(K_ATV, []).filter((x) => x.id !== id)); emitAtv(); },
    async bulkImport(list, existingIds) {
      const l = read(K_ATV, []);
      const todo = list.filter((x) => !existingIds.has(x.id)).map((x) => ({ ...x, importado: true }));
      write(K_ATV, l.concat(todo)); emitAtv(); return todo.length;
    },
    subscribeCadastros(cb) { cadSubs.push(cb); cb({ ...CADASTROS_PADRAO, ...read(K_CAD, {}) }); return () => {}; },
    async saveCadastros(obj) { write(K_CAD, obj); emitCad(); },
  };
}

// Dados de EXEMPLO só para o modo demo (não são registros reais)
function exemplos() {
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const tarefas = [
    ["Desenvolvimento", "Ajuste no fluxo de atendimento do chatbot", "Fluxo publicado e testado"],
    ["Configuração", "Configuração de novo número no ChatGuru", "Número ativo"],
    ["Reunião", "Alinhamento semanal com o gestor", "Prioridades definidas"],
    ["Manutenção", "Correção de mensagens automáticas duplicadas", "Duplicidade resolvida"],
    ["Planejamento", "Levantamento de requisitos do sistema de ponto", "Requisitos documentados"],
    ["Treinamento", "Treinamento da equipe de SAC no novo painel", "Equipe treinada"],
    ["Suporte Remoto", "Suporte remoto a condômino com acesso ao app", "Acesso liberado"],
  ];
  const sts = ["Concluído", "Concluído", "Concluído", "Concluído", "Em andamento", "Aguardando Cliente"];
  const emps = ["Azul Administradora", "Azul Administradora", "Ayel", "Azul Administradora", "Peglev"];
  const out = []; let k = 0;
  for (let back = 9; back >= 0; back--) {
    const d = new Date(); d.setDate(d.getDate() - back);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    for (const pessoa of ["Luis", "Carlos"]) {
      let h = 8 * 60;
      const n = 3 + (k % 3);
      for (let i = 0; i < n; i++, k++) {
        const t = tarefas[k % tarefas.length], dur = [30, 45, 60, 90, 120][k % 5];
        const st = back === 0 && i === n - 1 ? "Em andamento" : sts[k % sts.length];
        const fim = h + dur;
        out.push({
          id: "ex" + k, exemplo: true, responsavel: pessoa, data: iso(d),
          horaInicial: `${pad(Math.floor(h / 60))}:${pad(h % 60)}`,
          horaFinal: st === "Em andamento" ? "" : `${pad(Math.floor(fim / 60))}:${pad(fim % 60)}`,
          minutos: st === "Em andamento" ? 0 : dur, empresa: emps[k % emps.length], categoria: t[0],
          prioridade: ["Alta", "Média", "Média", "Baixa"][k % 4], atividade: "[Exemplo] " + t[1],
          resultado: st === "Concluído" ? t[2] : "", status: st, proximaAcao: st === "Concluído" ? "" : "Retornar ao cliente",
          solicitante: "Bruno Tavares", observacoes: "",
        });
        h = fim + 15;
      }
    }
  }
  return out;
}
