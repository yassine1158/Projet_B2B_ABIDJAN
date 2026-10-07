/* Espace administrateur : validation des fournisseurs, entreprises, demandes, catégories */
import { doc, setDoc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js";
import { db, now, configured, requireRole, lastSession, list, where, categories, logout } from "./firebase.js";
import { swr, readCache, writeCache } from "./store.js";
import {
  $, esc, brand, tabs, toast, modal, confirmBox, empty, badge, fmtDate, fmtMoney, byDateDesc, notConfigured,
} from "./ui.js";

brand();
let me, suppliers = [], companies = [], rfqs = [], offers = [], products = [], admins = [], supFilter = "pending", coFilter = "pending";
// Entreprises inscrites avant la validation des entreprises : considérées « en attente »
const coStatus = c => c.status || "pending";

async function init() {
  if (!configured) return notConfigured($("main"));
  // Affichage instantané des dernières données connues, pendant la vérification de la connexion
  const pre = lastSession("admin"), cached = pre && readCache("admin");
  tabs();
  if (cached) { me = { uid: pre.uid, email: pre.email }; $("#who").textContent = pre.email; apply(cached); }
  const auth = await requireRole("admin");
  if (!auth) return;
  me = auth.user;
  $("#who").textContent = me.email;
  $("#logout").onclick = logout;
  reload(true).catch(err => toast(err.message, "err"));
  document.querySelectorAll("[data-sf]").forEach(b => (b.onclick = () => {
    supFilter = b.dataset.sf;
    document.querySelectorAll("[data-sf]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderSuppliers();
  }));
  document.querySelectorAll("[data-cf]").forEach(b => (b.onclick = () => {
    coFilter = b.dataset.cf;
    document.querySelectorAll("[data-cf]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderCompanies();
  }));
  $("#teamForm").onsubmit = addAdmin;
  renderCategories();
}

/** Toutes les collections en parallèle ; avec useCache, affichage immédiat de la dernière version connue. */
async function reload(useCache = false) {
  const fetcher = async () => {
    const [s, c, r, o, p, a] = await Promise.all([
      ...["suppliers", "companies", "rfqs", "offers", "products"].map(col => list(col)),
      list("users", where("role", "==", "admin")),
    ]);
    return { suppliers: s, companies: c, rfqs: r, offers: o, products: p, admins: a };
  };
  if (useCache) return swr("admin", fetcher, apply);
  const d = JSON.parse(JSON.stringify(await fetcher()));
  writeCache("admin", d);
  apply(d);
}

function apply(d) {
  ({ suppliers, companies, rfqs, offers, products, admins } = d);
  [suppliers, companies, rfqs, offers].forEach(a => a.sort(byDateDesc));
  renderOverview(); renderSuppliers(); renderCompanies(); renderRfqs(); renderTeam();
}

function renderOverview() {
  const n = s => suppliers.filter(x => x.status === s).length;
  const nc = s => companies.filter(c => coStatus(c) === s).length;
  $("#stats").innerHTML = `
    <div class="stat"><span>${nc("approved")}</span>Entreprises validées</div>
    <div class="stat stat-accent"><span>${nc("pending")}</span>Entreprises à valider</div>
    <div class="stat"><span>${n("approved")}</span>Fournisseurs validés</div>
    <div class="stat stat-accent"><span>${n("pending")}</span>Fournisseurs à valider</div>
    <div class="stat"><span>${products.length}</span>Produits</div>
    <div class="stat"><span>${rfqs.filter(r => r.status === "open").length}</span>Demandes ouvertes</div>
    <div class="stat"><span>${offers.length}</span>Offres envoyées</div>
    <div class="stat"><span>${offers.filter(o => o.status === "accepted").length}</span>Offres acceptées</div>`;
  $("#pendingCount").textContent = n("pending") || "";
  $("#coPendingCount").textContent = nc("pending") || "";
  const recent = [
    ...suppliers.map(s => ({ t: s.createdAt, html: `Nouveau fournisseur : <strong>${esc(s.name)}</strong> ${badge(s.status)}` })),
    ...companies.map(c => ({ t: c.createdAt, html: `Nouvelle entreprise : <strong>${esc(c.name)}</strong> ${badge(coStatus(c))}` })),
    ...rfqs.map(r => ({ t: r.createdAt, html: `Demande « ${esc(r.title)} » par ${esc(r.companyName)}` })),
  ].sort((a, b) => (b.t?.seconds || 0) - (a.t?.seconds || 0)).slice(0, 10);
  $("#activity").innerHTML = recent.length ? `<ul class="feed">${recent.map(a => `<li><span>${a.html}</span><span class="muted small">${fmtDate(a.t)}</span></li>`).join("")}</ul>` : empty("Aucune activité pour le moment.");
}

function renderSuppliers() {
  const rows = suppliers.filter(s => supFilter === "all" || s.status === supFilter);
  $("#supplierList").innerHTML = rows.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Fournisseur</th><th>Contact</th><th>Catégories</th><th>Inscrit le</th><th>Statut</th><th></th></tr></thead>
    <tbody>${rows.map(s => `<tr>
      <td><button class="link" data-view="${esc(s.id)}"><strong>${esc(s.name)}</strong></button><br><span class="muted small">${esc([s.city, s.country].filter(Boolean).join(", "))}</span></td>
      <td class="small">${esc(s.contactName)}<br>${esc(s.email)}<br>${esc(s.phone)}</td>
      <td class="small">${esc((s.categories || []).join(", "))}</td>
      <td>${fmtDate(s.createdAt)}</td><td>${badge(s.status)}</td>
      <td class="nowrap">${s.status !== "approved" ? `<button class="btn btn-sm btn-primary" data-status="approved" data-id="${esc(s.id)}">Valider</button>` : ""}
        ${s.status !== "suspended" ? `<button class="btn btn-sm btn-danger" data-status="suspended" data-id="${esc(s.id)}">Suspendre</button>` : ""}</td>
    </tr>`).join("")}</tbody></table></div>` : empty(supFilter === "pending" ? "Aucun fournisseur en attente de validation." : "Aucun fournisseur.");
  $("#supplierList").onclick = async e => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.view) return viewSupplier(t.dataset.view);
    if (t.dataset.status) setSupplierStatus(t.dataset.id, t.dataset.status);
  };
}

/** Change le statut d'un fournisseur et la visibilité de ses produits dans le catalogue. */
async function setSupplierStatus(id, status) {
  const s = suppliers.find(x => x.id === id);
  if (status === "suspended" && !(await confirmBox(`Suspendre ${s.name} ? Sa fiche et ses produits ne seront plus visibles.`))) return;
  try {
    const b = writeBatch(db);
    b.update(doc(db, "suppliers", id), { status, updatedAt: now() });
    products.filter(p => p.supplierId === id).forEach(p => b.update(doc(db, "products", p.id), { supplierApproved: status === "approved" }));
    await b.commit();
    toast(status === "approved" ? `${s.name} est validé et visible dans le catalogue.` : `${s.name} est suspendu.`);
    await reload();
  } catch (err) { toast(err.message, "err"); }
}

function viewSupplier(id) {
  const s = suppliers.find(x => x.id === id);
  const prods = products.filter(p => p.supplierId === id);
  const os = offers.filter(o => o.supplierId === id);
  modal(s.name, `
    <div class="detail-head">${badge(s.status)}</div>
    <ul class="kv">
      <li><span>Contact</span>${esc(s.contactName)}</li><li><span>E-mail</span>${esc(s.email)}</li>
      <li><span>Téléphone</span>${esc(s.phone)}</li><li><span>Site web</span>${esc(s.website || "—")}</li>
      <li><span>Adresse</span>${esc([s.address, s.city, s.country].filter(Boolean).join(", "))}</li>
      <li><span>Catégories</span>${esc((s.categories || []).join(", "))}</li>
      <li><span>Offres</span>${os.length} envoyée(s), ${os.filter(o => o.status === "accepted").length} acceptée(s)</li>
    </ul>
    <p class="pre">${esc(s.description || "Aucune présentation.")}</p>
    <h4>Produits (${prods.length})</h4>
    ${prods.length ? `<ul class="feed">${prods.map(p => `<li><span><strong>${esc(p.name)}</strong> — ${esc(p.category)}</span><span>${p.price != null ? esc(fmtMoney(p.price, p.currency)) : "Sur devis"}</span></li>`).join("")}</ul>` : `<p class="muted">Aucun produit.</p>`}`, { wide: true });
}

function renderCompanies() {
  const rows = companies.filter(c => coFilter === "all" || coStatus(c) === coFilter);
  $("#companyList").innerHTML = rows.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Entreprise</th><th>Contact</th><th>Secteur</th><th>Demandes</th><th>Inscrite le</th><th>Statut</th><th></th></tr></thead>
    <tbody>${rows.map(c => `<tr><td><strong>${esc(c.name)}</strong><br><span class="muted small">${esc([c.city, c.country].filter(Boolean).join(", "))}</span>
        ${c.description ? `<br><span class="muted small clamp">${esc(c.description)}</span>` : ""}</td>
      <td class="small">${esc(c.contactName)}<br>${esc(c.email)}<br>${esc(c.phone)}</td><td>${esc(c.sector || "—")}</td>
      <td>${rfqs.filter(r => r.companyId === c.id).length}</td><td>${fmtDate(c.createdAt)}</td><td>${badge(coStatus(c))}</td>
      <td class="nowrap">${coStatus(c) !== "approved" ? `<button class="btn btn-sm btn-primary" data-status="approved" data-id="${esc(c.id)}">Valider</button>` : ""}
        ${coStatus(c) !== "suspended" ? `<button class="btn btn-sm btn-danger" data-status="suspended" data-id="${esc(c.id)}">Suspendre</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : empty(coFilter === "pending" ? "Aucune entreprise en attente de validation." : "Aucune entreprise.");
  $("#companyList").onclick = async e => {
    const t = e.target.closest("[data-status]");
    if (!t) return;
    const c = companies.find(x => x.id === t.dataset.id);
    if (t.dataset.status === "suspended" && !(await confirmBox(`Suspendre ${c.name} ? Elle ne pourra plus publier de demandes de devis.`))) return;
    try {
      await updateDoc(doc(db, "companies", c.id), { status: t.dataset.status, updatedAt: now() });
      toast(t.dataset.status === "approved" ? `${c.name} est validée : elle peut publier des demandes de devis.` : `${c.name} est suspendue.`);
      await reload();
    } catch (err) { toast(err.message, "err"); }
  };
}

const ROLE_LABEL = { company: "Entreprise", supplier: "Fournisseur" };

function renderTeam() {
  $("#teamList").innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Membre</th><th>Compte d'origine</th><th>Depuis</th><th></th></tr></thead>
    <tbody>${admins.map(a => `<tr><td><strong>${esc(a.displayName || "—")}</strong><br><span class="small">${esc(a.email)}</span></td>
      <td>${esc(ROLE_LABEL[a.previousRole] || "—")}</td><td>${fmtDate(a.promotedAt || a.createdAt)}</td>
      <td class="nowrap">${a.id === me.uid ? `<span class="muted small">Vous</span>` : `<button class="btn btn-sm btn-danger" data-remove="${esc(a.id)}">Retirer</button>`}</td></tr>`).join("")}
    </tbody></table></div>`;
  $("#teamList").onclick = async e => {
    const t = e.target.closest("[data-remove]");
    if (!t) return;
    const a = admins.find(x => x.id === t.dataset.remove);
    if (!(await confirmBox(`Retirer ${a.email} de l'équipe ? Son compte redevient un compte ${(ROLE_LABEL[a.previousRole] || "entreprise").toLowerCase()}.`))) return;
    try {
      await updateDoc(doc(db, "users", a.id), { role: a.previousRole || "company", previousRole: null, updatedAt: now() });
      toast(`${a.email} ne fait plus partie de l'équipe.`);
      await reload();
    } catch (err) { toast(err.message, "err"); }
  };
}

/** Nomme administrateur un utilisateur déjà inscrit, retrouvé par son e-mail. */
async function addAdmin(e) {
  e.preventDefault();
  const email = e.target.email.value.trim().toLowerCase();
  if (!email) return;
  try {
    const found = (await list("users", where("email", "==", email)))[0];
    if (!found) return toast("Aucun compte avec cet e-mail. La personne doit d'abord s'inscrire sur le site.", "err");
    if (found.role === "admin") return toast("Cette personne fait déjà partie de l'équipe.", "err");
    if (!(await confirmBox(`Nommer ${email} administrateur ? Il pourra valider les fournisseurs et les entreprises.`))) return;
    await updateDoc(doc(db, "users", found.id), { role: "admin", previousRole: found.role, promotedAt: now(), updatedAt: now() });
    e.target.reset();
    toast(`${email} fait maintenant partie de l'équipe. Il doit se déconnecter puis se reconnecter.`);
    await reload();
  } catch (err) { toast(err.message, "err"); }
}

function renderRfqs() {
  $("#rfqList").innerHTML = rfqs.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Demande</th><th>Entreprise</th><th>Catégorie</th><th>Offres</th><th>Statut</th><th></th></tr></thead>
    <tbody>${rfqs.map(r => `<tr><td><strong>${esc(r.title)}</strong><br><span class="muted small">${fmtDate(r.createdAt)} · limite ${fmtDate(r.deadline)}</span></td>
      <td>${esc(r.companyName)}</td><td>${esc(r.category)}</td><td>${offers.filter(o => o.rfqId === r.id).length}</td><td>${badge(r.status)}</td>
      <td class="nowrap">${r.status === "open" ? `<button class="btn btn-sm btn-ghost" data-close="${esc(r.id)}">Clôturer</button>` : ""}
        <button class="btn btn-sm btn-danger" data-del="${esc(r.id)}">Supprimer</button></td></tr>`).join("")}</tbody></table></div>`
    : empty("Aucune demande de devis.");
  $("#rfqList").onclick = async e => {
    const t = e.target.closest("button");
    if (!t) return;
    try {
      if (t.dataset.close) { await updateDoc(doc(db, "rfqs", t.dataset.close), { status: "closed", updatedAt: now() }); toast("Demande clôturée."); }
      else if (t.dataset.del) {
        if (!(await confirmBox("Supprimer cette demande et ses offres ?"))) return;
        const b = writeBatch(db);
        offers.filter(o => o.rfqId === t.dataset.del).forEach(o => b.delete(doc(db, "offers", o.id)));
        b.delete(doc(db, "rfqs", t.dataset.del));
        await b.commit();
        toast("Demande supprimée.");
      }
      await reload();
    } catch (err) { toast(err.message, "err"); }
  };
}

async function renderCategories() {
  const cats = await categories();
  $("#catForm").innerHTML = `
    <label class="field"><span>Une catégorie par ligne</span><textarea class="input" name="list" rows="16">${esc(cats.join("\n"))}</textarea></label>
    <p class="muted small">Renommer une catégorie ne modifie pas les fiches et demandes existantes qui utilisent l'ancien nom.</p>
    <div class="form-actions"><button class="btn btn-primary">Enregistrer les catégories</button></div>`;
  $("#catForm").onsubmit = async e => {
    e.preventDefault();
    const list = [...new Set(e.target.list.value.split("\n").map(s => s.trim()).filter(Boolean))];
    if (!list.length) return toast("Ajoutez au moins une catégorie.", "err");
    try { await setDoc(doc(db, "settings", "categories"), { list, updatedAt: now() }); toast("Catégories enregistrées."); }
    catch (err) { toast(err.message, "err"); }
  };
}

init().catch(err => { console.error(err); toast(err.message, "err"); });
