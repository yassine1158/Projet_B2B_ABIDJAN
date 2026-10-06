/* Espace administrateur : validation des fournisseurs, entreprises, demandes, catégories */
import { doc, setDoc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, now, configured, requireRole, list, categories, logout } from "./firebase.js";
import {
  $, esc, brand, tabs, toast, modal, confirmBox, empty, badge, fmtDate, fmtMoney, byDateDesc, notConfigured,
} from "./ui.js";

brand();
let suppliers = [], companies = [], rfqs = [], offers = [], products = [], supFilter = "pending";

async function init() {
  if (!configured) return notConfigured($("main"));
  const auth = await requireRole("admin");
  if (!auth) return;
  $("#who").textContent = auth.user.email;
  $("#logout").onclick = logout;
  tabs();
  await reload();
  document.querySelectorAll("[data-sf]").forEach(b => (b.onclick = () => {
    supFilter = b.dataset.sf;
    document.querySelectorAll("[data-sf]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderSuppliers();
  }));
  renderCategories();
}

async function reload() {
  [suppliers, companies, rfqs, offers, products] = await Promise.all(
    ["suppliers", "companies", "rfqs", "offers", "products"].map(c => list(c)));
  [suppliers, companies, rfqs, offers].forEach(a => a.sort(byDateDesc));
  renderOverview(); renderSuppliers(); renderCompanies(); renderRfqs();
}

function renderOverview() {
  const n = s => suppliers.filter(x => x.status === s).length;
  $("#stats").innerHTML = `
    <div class="stat"><span>${companies.length}</span>Entreprises</div>
    <div class="stat"><span>${n("approved")}</span>Fournisseurs validés</div>
    <div class="stat stat-accent"><span>${n("pending")}</span>Fournisseurs à valider</div>
    <div class="stat"><span>${products.length}</span>Produits</div>
    <div class="stat"><span>${rfqs.filter(r => r.status === "open").length}</span>Demandes ouvertes</div>
    <div class="stat"><span>${offers.length}</span>Offres envoyées</div>
    <div class="stat"><span>${offers.filter(o => o.status === "accepted").length}</span>Offres acceptées</div>`;
  $("#pendingCount").textContent = n("pending") || "";
  const recent = [
    ...suppliers.map(s => ({ t: s.createdAt, html: `Nouveau fournisseur : <strong>${esc(s.name)}</strong> ${badge(s.status)}` })),
    ...companies.map(c => ({ t: c.createdAt, html: `Nouvelle entreprise : <strong>${esc(c.name)}</strong>` })),
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
  $("#companyList").innerHTML = companies.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Entreprise</th><th>Contact</th><th>Secteur</th><th>Demandes</th><th>Inscrite le</th></tr></thead>
    <tbody>${companies.map(c => `<tr><td><strong>${esc(c.name)}</strong><br><span class="muted small">${esc([c.city, c.country].filter(Boolean).join(", "))}</span></td>
      <td class="small">${esc(c.contactName)}<br>${esc(c.email)}<br>${esc(c.phone)}</td><td>${esc(c.sector || "—")}</td>
      <td>${rfqs.filter(r => r.companyId === c.id).length}</td><td>${fmtDate(c.createdAt)}</td></tr>`).join("")}</tbody></table></div>`
    : empty("Aucune entreprise inscrite.");
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
