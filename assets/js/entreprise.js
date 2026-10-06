/* Espace entreprise : catalogue, demandes de devis, offres reçues, fiche entreprise */
import {
  doc, addDoc, setDoc, updateDoc, deleteDoc, collection, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, now, configured, requireRole, list, get, where, categories, logout } from "./firebase.js";
import { mountCatalogue } from "./catalogue.js";
import { APP } from "./config.js";
import {
  $, esc, brand, tabs, toast, modal, confirmBox, formData, busy, options, empty, badge, fmtDate, fmtMoney, byDateDesc, notConfigured,
} from "./ui.js";

brand();
let me, company, cats, rfqs = [], offers = [], catalogueLoaded = false;

async function init() {
  if (!configured) return notConfigured($("main"));
  const auth = await requireRole("company");
  if (!auth) return;
  me = auth.user;
  $("#logout").onclick = logout;
  [company, cats] = await Promise.all([get("companies", me.uid), categories()]);
  company ||= { name: auth.profile.displayName || me.email };
  $("#who").textContent = company.name;
  renderStatus();
  tabs(name => {
    if (name === "catalogue" && !catalogueLoaded) { catalogueLoaded = true; mountCatalogue($("#catalogue"), { onQuote: s => rfqForm(null, s) }); }
  });
  await reload();
  $("#newRfq").onclick = () => rfqForm();
  $("#newRfq2").onclick = () => rfqForm();
  renderProfile();
}

async function reload() {
  [rfqs, offers] = await Promise.all([
    list("rfqs", where("companyId", "==", me.uid)),
    list("offers", where("companyId", "==", me.uid)),
  ]);
  rfqs.sort(byDateDesc);
  renderDashboard();
  renderRfqs();
}

const offersOf = id => offers.filter(o => o.rfqId === id);
const approved = () => company.status === "approved";

function renderStatus() {
  $("#statusBox").innerHTML = {
    approved: "",
    suspended: `<div class="notice notice-danger"><strong>Compte suspendu.</strong> Vous ne pouvez plus publier de demandes de devis. Contactez-nous : <a href="mailto:${esc(APP.contactEmail)}">${esc(APP.contactEmail)}</a>.</div>`,
  }[company.status] ?? `<div class="notice notice-warn"><strong>Compte en cours de validation.</strong> Vous pouvez déjà consulter le catalogue et compléter votre fiche. Vous pourrez publier des demandes de devis dès que notre équipe aura validé votre compte.</div>`;
}

function renderDashboard() {
  const open = rfqs.filter(r => r.status === "open").length;
  const pending = offers.filter(o => o.status === "pending").length;
  $("#stats").innerHTML = `
    <div class="stat"><span>${rfqs.length}</span>Demandes publiées</div>
    <div class="stat"><span>${open}</span>Demandes ouvertes</div>
    <div class="stat"><span>${offers.length}</span>Offres reçues</div>
    <div class="stat stat-accent"><span>${pending}</span>Offres à examiner</div>`;
  const latest = offers.filter(o => o.status === "pending").sort(byDateDesc).slice(0, 5);
  $("#latestOffers").innerHTML = latest.length
    ? `<ul class="feed">${latest.map(o => `<li><button class="link" data-rfq="${esc(o.rfqId)}"><strong>${esc(o.supplierName)}</strong> a répondu à « ${esc(o.rfqTitle)} » : ${esc(fmtMoney(o.price, o.currency))}</button><span class="muted small">${fmtDate(o.createdAt)}</span></li>`).join("")}</ul>`
    : empty("Aucune nouvelle offre. Publiez une demande de devis pour recevoir des propositions.");
  $("#latestOffers").onclick = e => { const b = e.target.closest("[data-rfq]"); if (b) rfqDetail(b.dataset.rfq); };
}

function renderRfqs() {
  $("#rfqList").innerHTML = rfqs.length ? `
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Demande</th><th>Catégorie</th><th>Échéance</th><th>Offres</th><th>Statut</th></tr></thead>
      <tbody>${rfqs.map(r => {
        const n = offersOf(r.id).length, p = offersOf(r.id).filter(o => o.status === "pending").length;
        return `<tr class="row-click" data-rfq="${esc(r.id)}" tabindex="0"><td><strong>${esc(r.title)}</strong><br><span class="muted small">Publiée le ${fmtDate(r.createdAt)}</span></td>
          <td>${esc(r.category)}</td><td>${esc(r.deadline ? fmtDate(r.deadline) : "—")}</td>
          <td>${n}${p ? ` <span class="badge badge-warn">${p} nouvelle(s)</span>` : ""}</td><td>${badge(r.status)}</td></tr>`;
      }).join("")}</tbody></table></div>`
    : empty("Vous n'avez publié aucune demande de devis.", `<button class="btn btn-accent" onclick="document.getElementById('newRfq').click()">Publier ma première demande</button>`);
  $("#rfqList").onclick = e => { const r = e.target.closest("[data-rfq]"); if (r) rfqDetail(r.dataset.rfq); };
  $("#rfqList").onkeydown = e => { const r = e.target.closest("[data-rfq]"); if (r && e.key === "Enter") rfqDetail(r.dataset.rfq); };
}

function rfqForm(rfq = null, supplier = null) {
  if (!rfq && !approved()) return toast(company.status === "suspended" ? "Votre compte est suspendu." : "Votre compte doit d'abord être validé par notre équipe.", "err");
  const r = rfq || { category: supplier?.categories?.[0] || "", currency: APP.currencies[0], city: company.city || "" };
  const dlg = modal(rfq ? "Modifier la demande" : "Nouvelle demande de devis", `
    ${supplier ? `<p class="notice">Votre demande sera visible par <strong>${esc(supplier.name)}</strong> et par tous les fournisseurs validés de la catégorie choisie.</p>` : ""}
    <form class="stack" id="rfqForm">
      <label class="field"><span>Titre de la demande *</span><input class="input" name="title" required maxlength="140" value="${esc(r.title)}" placeholder="Ex. : 5 000 cartons d'emballage 40×30×20"></label>
      <div class="form-grid">
        <label class="field"><span>Catégorie *</span><select class="input" name="category" required><option value="">Choisir…</option>${options(cats, r.category)}</select></label>
        <label class="field"><span>Date limite des offres *</span><input class="input" type="date" name="deadline" required value="${esc(r.deadline)}" min="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="field"><span>Quantité</span><input class="input" type="number" min="0" step="any" name="quantity" value="${esc(r.quantity ?? "")}"></label>
        <label class="field"><span>Unité</span><input class="input" name="unit" maxlength="30" value="${esc(r.unit)}" placeholder="pièces, kg, tonnes, heures…"></label>
        <label class="field"><span>Budget indicatif</span><input class="input" type="number" min="0" step="any" name="budget" value="${esc(r.budget ?? "")}"></label>
        <label class="field"><span>Devise</span><select class="input" name="currency">${options(APP.currencies, r.currency)}</select></label>
        <label class="field span-2"><span>Lieu de livraison *</span><input class="input" name="city" required maxlength="80" value="${esc(r.city)}"></label>
      </div>
      <label class="field"><span>Description détaillée *</span><textarea class="input" name="description" rows="6" required maxlength="4000" placeholder="Spécifications, normes, conditions de livraison et de paiement…">${esc(r.description)}</textarea></label>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-accent">${rfq ? "Enregistrer" : "Publier la demande"}</button></div>
    </form>`, { wide: true });
  dlg.querySelector("[data-cancel]").onclick = () => dlg.close();
  const f = dlg.querySelector("form");
  f.onsubmit = async e => {
    e.preventDefault();
    const v = formData(f);
    const btn = f.querySelector(".btn-accent"); busy(btn, true);
    try {
      if (rfq) await updateDoc(doc(db, "rfqs", rfq.id), { ...v, updatedAt: now() });
      else await addDoc(collection(db, "rfqs"), { ...v, companyId: me.uid, companyName: company.name, status: "open", createdAt: now(), updatedAt: now() });
      dlg.close();
      toast(rfq ? "Demande mise à jour." : "Demande publiée : les fournisseurs de la catégorie peuvent maintenant répondre.");
      await reload();
    } catch (err) { toast(err.message, "err"); busy(btn, false); }
  };
}

async function rfqDetail(id) {
  const r = rfqs.find(x => x.id === id);
  if (!r) return;
  const os = offersOf(id).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  const accepted = os.find(o => o.status === "accepted");
  const sup = accepted ? await get("suppliers", accepted.supplierId).catch(() => null) : null;
  const dlg = modal(r.title, `
    <div class="detail-head">${badge(r.status)} <span class="tag">${esc(r.category)}</span></div>
    <ul class="kv">
      <li><span>Quantité</span>${r.quantity != null ? esc(r.quantity + " " + (r.unit || "")) : "—"}</li>
      <li><span>Budget</span>${r.budget != null ? esc(fmtMoney(r.budget, r.currency)) : "—"}</li>
      <li><span>Livraison</span>${esc(r.city)}</li>
      <li><span>Date limite</span>${fmtDate(r.deadline)}</li>
    </ul>
    <p class="pre">${esc(r.description)}</p>
    ${accepted && sup ? `<div class="notice notice-ok"><strong>Offre retenue : ${esc(sup.name)}</strong><br>Contact : ${esc(sup.contactName || "")} · <a href="tel:${esc(sup.phone)}">${esc(sup.phone)}</a> · <a href="mailto:${esc(sup.email)}">${esc(sup.email)}</a></div>` : ""}
    <h4>Offres reçues (${os.length})</h4>
    ${os.length ? `<div class="offers">${os.map(o => `
      <article class="offer">
        <div class="offer-head"><strong>${esc(o.supplierName)}</strong>${badge(o.status)}</div>
        <div class="offer-price">${esc(fmtMoney(o.price, o.currency))}</div>
        <p class="muted small">Délai : ${esc(o.delay || "—")} · Validité : ${esc(o.validity || "—")} · Reçue le ${fmtDate(o.createdAt)}</p>
        ${o.message ? `<p class="pre">${esc(o.message)}</p>` : ""}
        ${o.status === "pending" && r.status === "open" ? `<div class="form-actions"><button class="btn btn-sm btn-ghost" data-reject="${esc(o.id)}">Refuser</button><button class="btn btn-sm btn-primary" data-accept="${esc(o.id)}">Accepter cette offre</button></div>` : ""}
      </article>`).join("")}</div>` : `<p class="muted">Pas encore d'offre. Les fournisseurs validés de la catégorie « ${esc(r.category)} » voient votre demande.</p>`}
    <div class="form-actions">
      ${r.status === "open" ? `<button class="btn btn-ghost" data-edit>Modifier</button><button class="btn btn-ghost" data-close>Clôturer sans attribuer</button>` : ""}
      ${r.status === "closed" && approved() ? `<button class="btn btn-ghost" data-reopen>Rouvrir</button>` : ""}
      ${!os.length ? `<button class="btn btn-danger" data-del>Supprimer</button>` : ""}
    </div>`, { wide: true });

  const act = async (fn, msg) => { try { await fn(); toast(msg); dlg.close(); await reload(); } catch (err) { toast(err.message, "err"); } };
  dlg.querySelector(".modal-body").onclick = async e => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.accept) {
      if (!(await confirmBox("Accepter cette offre ? Les autres offres seront refusées et la demande sera attribuée."))) return;
      act(async () => {
        const b = writeBatch(db);
        os.forEach(o => {
          if (o.id === t.dataset.accept) b.update(doc(db, "offers", o.id), { status: "accepted", updatedAt: now() });
          else if (o.status === "pending") b.update(doc(db, "offers", o.id), { status: "rejected", updatedAt: now() });
        });
        b.update(doc(db, "rfqs", r.id), { status: "awarded", updatedAt: now() });
        await b.commit();
      }, "Offre acceptée. Les coordonnées du fournisseur sont affichées dans la demande.");
    } else if (t.dataset.reject) {
      act(() => updateDoc(doc(db, "offers", t.dataset.reject), { status: "rejected", updatedAt: now() }), "Offre refusée.");
    } else if ("edit" in t.dataset) { dlg.close(); rfqForm(r); }
    else if ("close" in t.dataset) act(() => updateDoc(doc(db, "rfqs", r.id), { status: "closed", updatedAt: now() }), "Demande clôturée.");
    else if ("reopen" in t.dataset) act(() => updateDoc(doc(db, "rfqs", r.id), { status: "open", updatedAt: now() }), "Demande rouverte.");
    else if ("del" in t.dataset) {
      if (await confirmBox("Supprimer définitivement cette demande ?")) act(() => deleteDoc(doc(db, "rfqs", r.id)), "Demande supprimée.");
    }
  };
}

function renderProfile() {
  const c = company;
  $("#profile").innerHTML = `
    <form class="stack card" id="profileForm">
      <div class="form-grid">
        <label class="field span-2"><span>Raison sociale *</span><input class="input" name="name" required maxlength="120" value="${esc(c.name)}"></label>
        <label class="field"><span>Nom du contact *</span><input class="input" name="contactName" required maxlength="80" value="${esc(c.contactName)}"></label>
        <label class="field"><span>Téléphone *</span><input class="input" name="phone" required maxlength="30" value="${esc(c.phone)}"></label>
        <label class="field"><span>Secteur d'activité</span><input class="input" name="sector" maxlength="80" value="${esc(c.sector)}"></label>
        <label class="field"><span>Adresse</span><input class="input" name="address" maxlength="160" value="${esc(c.address)}"></label>
        <label class="field"><span>Ville *</span><input class="input" name="city" required maxlength="60" value="${esc(c.city)}"></label>
        <label class="field"><span>Pays *</span><input class="input" name="country" required maxlength="60" value="${esc(c.country)}"></label>
      </div>
      <label class="field"><span>Présentation</span><textarea class="input" name="description" rows="4" maxlength="2000">${esc(c.description)}</textarea></label>
      <p class="muted small">E-mail du compte : ${esc(me.email)}</p>
      <div class="form-actions"><button class="btn btn-primary">Enregistrer</button></div>
    </form>`;
  const f = $("#profileForm");
  f.onsubmit = async e => {
    e.preventDefault();
    const v = formData(f);
    const btn = f.querySelector("button"); busy(btn, true);
    try {
      await setDoc(doc(db, "companies", me.uid), { ...v, email: me.email, updatedAt: now(), ...(company.createdAt ? {} : { createdAt: now(), status: "pending" }) }, { merge: true });
      Object.assign(company, v, { createdAt: company.createdAt || true });
      $("#who").textContent = company.name;
      toast("Fiche entreprise enregistrée.");
    } catch (err) { toast(err.message, "err"); }
    busy(btn, false);
  };
}

init().catch(err => { console.error(err); toast(err.message, "err"); });
