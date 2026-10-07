/* Messagerie en temps réel entre entreprises et fournisseurs (espaces entreprise et fournisseur).
   Le temps réel utilise la version complète de Firestore, chargée seulement à l'ouverture de la messagerie. */
import { app } from "./db.js";
import { USE_EMULATORS } from "./config.js";
import { $, esc, toast } from "./ui.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
let fs = null, rt = null;

async function realtime() {
  if (rt) return rt;
  fs = await import(SDK);
  rt = fs.getFirestore(app);
  if (USE_EMULATORS) { try { fs.connectFirestoreEmulator(rt, "127.0.0.1", 8080); } catch (e) { /* déjà connecté */ } }
  return rt;
}

const ms = v => (v && v.toMillis ? v.toMillis() : v && v.seconds ? v.seconds * 1000 : 0);
function when(v) {
  const t = ms(v);
  if (!t) return "";
  const d = new Date(t), today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();

/**
 * Messagerie d'un utilisateur.
 * @param {HTMLElement} root
 * @param {{ me: {uid}, role: "company"|"supplier", myName: string, onUnread?: (n:number) => void }} opts
 * @returns {{ start(other: {id, name}): Promise<void> }} — ouvre (ou crée) la conversation avec l'autre partie
 */
export function mountChat(root, opts) {
  const { me, role } = opts;
  let convs = [], current = null, stopThread = null, ready = null;

  root.innerHTML = `
    <div class="chat" data-view="list">
      <aside class="chat-list">
        <div class="chat-search"><input class="input" type="search" placeholder="Rechercher une conversation…" aria-label="Rechercher"></div>
        <div class="chat-convs"><div class="chat-empty">Chargement…</div></div>
      </aside>
      <section class="chat-thread">
        <div class="chat-placeholder"><div class="chat-ph-ico">💬</div><p>Choisissez une conversation</p>
          <p class="muted small">${role === "company" ? "Pour écrire à un fournisseur : Catalogue → fiche du fournisseur → « Envoyer un message »." : "Pour écrire à une entreprise : ouvrez une de ses demandes de devis → « Contacter l'entreprise »."}</p></div>
      </section>
    </div>`;
  const chat = $(".chat", root);
  const other = c => role === "company" ? { id: c.supplierId, name: c.supplierName } : { id: c.companyId, name: c.companyName };
  const unread = c => c.lastSender && c.lastSender !== me.uid && ms(c.lastAt) > ms((c.readAt || {})[me.uid]);

  function renderList() {
    const q = $(".chat-search input", root).value.trim().toLowerCase();
    const rows = convs.filter(c => !q || other(c).name.toLowerCase().includes(q))
      .sort((a, b) => (ms(b.lastAt) || ms(b.createdAt)) - (ms(a.lastAt) || ms(a.createdAt)));
    $(".chat-convs", root).innerHTML = rows.length ? rows.map(c => {
      const o = other(c);
      return `<button class="conv${current === c.id ? " active" : ""}${unread(c) ? " unread" : ""}" data-conv="${esc(c.id)}">
        <span class="conv-av">${esc(initials(o.name))}</span>
        <span class="conv-body"><span class="conv-top"><b>${esc(o.name)}</b><small>${when(c.lastAt || c.createdAt)}</small></span>
        <span class="conv-last">${c.lastSender === me.uid ? "Vous : " : ""}${esc(c.lastMessage || "Nouvelle conversation")}</span></span>
        ${unread(c) ? '<span class="conv-dot" aria-label="Non lu"></span>' : ""}
      </button>`;
    }).join("") : `<div class="chat-empty">Aucune conversation pour le moment.</div>`;
    opts.onUnread && opts.onUnread(convs.filter(unread).length);
  }

  async function markRead(id) {
    try { await fs.updateDoc(fs.doc(rt, "conversations", id), { ["readAt." + me.uid]: fs.serverTimestamp() }); } catch (e) { /* hors ligne */ }
  }

  async function open(id) {
    await ready;
    const c = convs.find(x => x.id === id);
    if (!c) return;
    current = id;
    chat.dataset.view = "thread";
    const o = other(c);
    const th = $(".chat-thread", root);
    th.innerHTML = `
      <header class="thread-head"><button class="thread-back" aria-label="Retour">←</button>
        <span class="conv-av">${esc(initials(o.name))}</span><div><b>${esc(o.name)}</b><small>${role === "company" ? "Fournisseur" : "Entreprise"}</small></div></header>
      <div class="thread-msgs" aria-live="polite"><div class="chat-empty">Chargement…</div></div>
      <form class="thread-form"><textarea class="input" rows="1" maxlength="2000" placeholder="Écrire un message…" aria-label="Message"></textarea>
        <button class="btn btn-accent thread-send" aria-label="Envoyer">➤</button></form>`;
    $(".thread-back", th).onclick = () => { chat.dataset.view = "list"; current = null; stopThread && stopThread(); renderList(); };
    const box = $(".thread-msgs", th), ta = $("textarea", th), form = $(".thread-form", th);
    ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; };
    ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } };
    form.onsubmit = async e => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) return;
      ta.value = ""; ta.oninput();
      try {
        const b = fs.writeBatch(rt);
        b.set(fs.doc(fs.collection(rt, "conversations", id, "messages")), { senderId: me.uid, senderName: opts.myName, text, createdAt: fs.serverTimestamp() });
        b.update(fs.doc(rt, "conversations", id), { lastMessage: text.slice(0, 200), lastAt: fs.serverTimestamp(), lastSender: me.uid, ["readAt." + me.uid]: fs.serverTimestamp() });
        await b.commit();
      } catch (err) { ta.value = text; toast("Message non envoyé : " + err.message, "err"); }
    };
    renderList();
    stopThread && stopThread();
    stopThread = fs.onSnapshot(
      fs.query(fs.collection(rt, "conversations", id, "messages"), fs.orderBy("createdAt"), fs.limitToLast(300)),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
        let lastDay = "";
        box.innerHTML = list.length ? list.map(m => {
          const day = new Date(ms(m.createdAt) || Date.now()).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
          const sep = day !== lastDay ? `<div class="day-sep"><span>${esc(day)}</span></div>` : "";
          lastDay = day;
          return `${sep}<div class="msg ${m.senderId === me.uid ? "mine" : "theirs"}"><p>${esc(m.text)}</p><small>${when(m.createdAt)}</small></div>`;
        }).join("") : `<div class="chat-empty">Dites bonjour 👋<br><small>Les messages sont visibles par les deux entreprises et par l'équipe de la plateforme.</small></div>`;
        box.scrollTop = box.scrollHeight;
        if (current === id && document.visibilityState === "visible") markRead(id);
      },
      err => { box.innerHTML = `<div class="chat-empty">Impossible de charger les messages : ${esc(err.message)}</div>`; });
    ta.focus({ preventScroll: true });
  }

  $(".chat-convs", root).onclick = e => { const b = e.target.closest("[data-conv]"); if (b) open(b.dataset.conv); };
  $(".chat-search input", root).oninput = renderList;
  document.addEventListener("visibilitychange", () => { if (current && document.visibilityState === "visible") markRead(current); });

  ready = realtime().then(() => new Promise(resolve => {
    fs.onSnapshot(fs.query(fs.collection(rt, "conversations"), fs.where("participants", "array-contains", me.uid)), snap => {
      convs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
      renderList();
      resolve();
    }, err => { $(".chat-convs", root).innerHTML = `<div class="chat-empty">Messagerie indisponible : ${esc(err.message)}</div>`; resolve(); });
  }));

  return {
    /** Ouvre la conversation avec l'autre partie, en la créant si besoin. */
    async start(o) {
      await ready;
      const companyId = role === "company" ? me.uid : o.id;
      const supplierId = role === "company" ? o.id : me.uid;
      const id = companyId + "_" + supplierId;
      if (!convs.some(c => c.id === id)) {
        const ref = fs.doc(rt, "conversations", id);
        const snap = await fs.getDoc(ref);
        if (!snap.exists()) {
          await fs.setDoc(ref, {
            companyId, supplierId, participants: [companyId, supplierId],
            companyName: role === "company" ? opts.myName : o.name,
            supplierName: role === "company" ? o.name : opts.myName,
            createdAt: fs.serverTimestamp(), lastAt: fs.serverTimestamp(), lastMessage: "", lastSender: "", readAt: {},
          });
        }
        // attendre que la conversation apparaisse dans la liste en temps réel
        for (let i = 0; i < 40 && !convs.some(c => c.id === id); i++) await new Promise(r => setTimeout(r, 100));
      }
      await open(id);
    },
  };
}
