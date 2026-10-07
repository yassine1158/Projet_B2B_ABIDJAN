/* Espace fournisseur : demandes de devis ouvertes, offres, produits & services, fiche fournisseur */
import {
  doc, addDoc, setDoc, updateDoc, deleteDoc, collection, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js";
import { db, now, configured, requireRole, lastSession, list, get, where, categories, logout } from "./firebase.js";
import { APP } from "./config.js";
import { swr, readCache, writeCache } from "./store.js";
import {
  $, esc, brand, tabs, toast, modal, confirmBox, formData, busy, options, empty, badge, fmtDate, fmtMoney, byDateDesc, notConfigured,
} from "./ui.js";

brand();
let me, myName, sup = { categories: [], status: "pending" }, cats = [], rfqs = [], offers = [], products = [], onlyMine = true, profileShown = false;
const approved = () => sup.status === "approved";

async function init() {
  if (!configured) return notConfigured($("main"));
  tabs();
  // Affichage instantané des dernières données connues, pendant la vérification de la connexion
  const pre = lastSession("supplier"), cached = pre && readCache("sup:" + pre.uid);
  if (cached) { me = { uid: pre.uid, email: pre.email }; myName = pre.displayName || pre.email; apply(cached); }
  const auth = await requireRole("supplier");
  if (!auth) return;
  me = auth.user;
  myName = auth.profile.displayName || me.email;
  $("#logout").onclick = logout;
  $("#newProduct").onclick = () => productForm();
  $("#onlyMine").onchange = e => { onlyMine = e.target.checked; renderRfqs(); };
  $("#rfqQ").oninput = renderRfqs;
  categories().then(c => { cats = c; if (profileShown && !$("#profile").contains(document.activeElement)) renderProfile(); });
  await reload(true);
}

/** Fiche, offres, produits et demandes ouvertes en parallèle ; avec useCache, affichage immédiat. */
async function reload(useCache = false) {
  const key = "sup:" + me.uid;
  const fetcher = async () => {
    // Compte déjà connu comme validé : tout en parallèle. Sinon la fiche d'abord (les demandes ne sont lisibles qu'une fois validé).
    const knownApproved = (readCache(key) || {}).sup?.status === "approved";
    const openRfqs = () => list("rfqs", where("status", "==", "open")).catch(() => []);
    const [s, o, p, r] = await Promise.all([
      get("suppliers", me.uid),
      list("offers", where("supplierId", "==", me.uid)),
      list("products", where("supplierId", "==", me.uid)),
      knownApproved ? openRfqs() : null,
    ]);
    const approvedNow = s && s.status === "approved";
    return { sup: s, offers: o, products: p, rfqs: approvedNow ? (r || await openRfqs()) : [] };
  };
  if (useCache) return swr(key, fetcher, apply);
  const d = JSON.parse(JSON.stringify(await fetcher()));
  writeCache(key, d);
  apply(d);
}

function apply(d) {
  sup = d.sup || { name: myName, categories: [], status: "pending" };
  offers = d.offers.sort(byDateDesc); products = d.products.sort(byDateDesc); rfqs = d.rfqs.sort(byDateDesc);
  $("#who").textContent = sup.name;
  renderStatus(); renderDashboard(); renderRfqs(); renderOffers(); renderProducts();
  if (!profileShown || !$("#profile").contains(document.activeElement)) { renderProfile(); profileShown = true; }
}

function renderStatus() {
  const msg = {
    pending: `<div class="notice notice-warn"><strong>Compte en cours de validation.</strong> Complétez votre fiche et ajoutez vos produits : ils apparaîtront dans le catalogue et vous pourrez répondre aux demandes de devis dès que notre équipe aura validé votre compte.</div>`,
    suspended: `<div class="notice notice-danger"><strong>Compte suspendu.</strong> Votre fiche n'est plus visible. Contactez-nous : <a href="mailto:${esc(APP.contactEmail)}">${esc(APP.contactEmail)}</a>.</div>`,
  }[sup.status] || "";
  $("#statusBox").innerHTML = msg;
}

const myOffer = rfqId => offers.find(o => o.rfqId === rfqId);
const visibleRfqs = () => {
  const q = $("#rfqQ").value.trim().toLowerCase();
  return rfqs.filter(r => (!onlyMine || (sup.categories || []).includes(r.category)) &&
    (!q || [r.title, r.description, r.city, r.category, r.companyName].join(" ").toLowerCase().includes(q)));
};

function renderDashboard() {
  const mine = rfqs.filter(r => (sup.categories || []).includes(r.category) && !myOffer(r.id)).length;
  $("#stats").innerHTML = `
    <div class="stat stat-accent"><span>${mine}</span>Demandes à traiter</div>
    <div class="stat"><span>${offers.filter(o => o.status === "pending").length}</span>Offres en attente</div>
    <div class="stat"><span>${offers.filter(o => o.status === "accepted").length}</span>Offres gagnées</div>
    <div class="stat"><span>${products.length}</span>Produits publiés</div>`;
  const latest = rfqs.filter(r => (sup.categories || []).includes(r.category) && !myOffer(r.id)).slice(0, 5);
  $("#latestRfqs").innerHTML = !approved() ? empty("Les demandes de devis s'afficheront ici après la validation de votre compte.")
    : latest.length ? `<ul class="feed">${latest.map(r => `<li><button class="link" data-rfq="${esc(r.id)}"><strong>${esc(r.title)}</strong> — ${esc(r.companyName)}, ${esc(r.city)}</button><span class="muted small">avant le ${fmtDate(r.deadline)}</span></li>`).join("")}</ul>`
    : empty("Aucune nouvelle demande dans vos catégories pour le moment.");
  $("#latestRfqs").onclick = e => { const b = e.target.closest("[data-rfq]"); if (b) rfqDetail(b.dataset.rfq); };
}

function renderRfqs() {
  if (!approved()) { $("#rfqList").innerHTML = empty("Vous pourrez consulter les demandes de devis après la validation de votre compte."); return; }
  const rows = visibleRfqs();
  $("#rfqList").innerHTML = rows.length ? `<div class="grid-cards">${rows.map(r => {
    const o = myOffer(r.id);
    return `<article class="card card-click" data-rfq="${esc(r.id)}" tabindex="0">
      <div class="card-row"><span class="tag">${esc(r.category)}</span>${o ? badge(o.status).replace("En attente", "Offre envoyée") : ""}</div>
      <h3>${esc(r.title)}</h3>
      <p class="clamp">${esc(r.description)}</p>
      <p class="muted small">${esc(r.companyName)} · ${esc(r.city)}${r.quantity != null ? " · " + esc(r.quantity + " " + (r.unit || "")) : ""}</p>
      <p class="small"><strong>Date limite :</strong> ${fmtDate(r.deadline)}</p>
    </article>`;
  }).join("")}</div>` : empty(onlyMine ? "Aucune demande ouverte dans vos catégories. Décochez le filtre pour tout voir." : "Aucune demande ouverte.");
  $("#rfqList").onclick = e => { const c = e.target.closest("[data-rfq]"); if (c) rfqDetail(c.dataset.rfq); };
  $("#rfqList").onkeydown = e => { const c = e.target.closest("[data-rfq]"); if (c && e.key === "Enter") rfqDetail(c.dataset.rfq); };
}

async function rfqDetail(id) {
  const r = rfqs.find(x => x.id === id) || await get("rfqs", id).catch(() => null);
  if (!r) return toast("Cette demande n'est plus disponible.", "err");
  const o = myOffer(id);
  const editable = r.status === "open" && (!o || o.status === "pending");
  const dlg = modal(r.title, `
    <div class="detail-head">${badge(r.status)} <span class="tag">${esc(r.category)}</span></div>
    <ul class="kv">
      <li><span>Entreprise</span>${esc(r.companyName)}</li>
      <li><span>Quantité</span>${r.quantity != null ? esc(r.quantity + " " + (r.unit || "")) : "—"}</li>
      <li><span>Budget indicatif</span>${r.budget != null ? esc(fmtMoney(r.budget, r.currency)) : "—"}</li>
      <li><span>Livraison</span>${esc(r.city)}</li>
      <li><span>Date limite</span>${fmtDate(r.deadline)}</li>
    </ul>
    <p class="pre">${esc(r.description)}</p>
    <h4>${o ? "Votre offre " + badge(o.status) : "Votre offre"}</h4>
    ${editable ? `<form class="stack" id="offerForm">
      <div class="form-grid">
        <label class="field"><span>Prix total proposé *</span><input class="input" type="number" min="0" step="any" name="price" required value="${esc(o?.price ?? "")}"></label>
        <label class="field"><span>Devise</span><select class="input" name="currency">${options(APP.currencies, o?.currency || r.currency)}</select></label>
        <label class="field"><span>Délai de livraison *</span><input class="input" name="delay" required maxlength="60" value="${esc(o?.delay)}" placeholder="Ex. : 10 jours ouvrés"></label>
        <label class="field"><span>Validité de l'offre</span><input class="input" name="validity" maxlength="60" value="${esc(o?.validity)}" placeholder="Ex. : 30 jours"></label>
      </div>
      <label class="field"><span>Message / conditions</span><textarea class="input" name="message" rows="4" maxlength="3000" placeholder="Détail de l'offre, conditions de paiement, garanties…">${esc(o?.message)}</textarea></label>
      <div class="form-actions">${o ? `<button type="button" class="btn btn-danger" data-withdraw>Retirer l'offre</button>` : ""}<button class="btn btn-accent">${o ? "Mettre à jour l'offre" : "Envoyer l'offre"}</button></div>
    </form>` : o ? `<div class="offer"><div class="offer-price">${esc(fmtMoney(o.price, o.currency))}</div><p class="muted small">Délai : ${esc(o.delay)} · Validité : ${esc(o.validity || "—")}</p>${o.message ? `<p class="pre">${esc(o.message)}</p>` : ""}</div>
      ${o.status === "accepted" ? `<div class="notice notice-ok">Félicitations, votre offre a été retenue. L'entreprise va vous contacter ; ses coordonnées figurent dans l'onglet « Mes offres ».</div>` : ""}`
      : `<p class="muted">Cette demande n'accepte plus d'offres.</p>`}`, { wide: true });

  const f = dlg.querySelector("#offerForm");
  if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault();
    const v = formData(f);
    const btn = f.querySelector(".btn-accent"); busy(btn, true);
    try {
      if (o) await updateDoc(doc(db, "offers", o.id), { ...v, updatedAt: now() });
      else await setDoc(doc(db, "offers", r.id + "_" + me.uid), {
        ...v, rfqId: r.id, rfqTitle: r.title, companyId: r.companyId, companyName: r.companyName,
        supplierId: me.uid, supplierName: sup.name, status: "pending", createdAt: now(), updatedAt: now(),
      });
      dlg.close(); toast(o ? "Offre mise à jour." : "Offre envoyée à l'entreprise."); await reload();
    } catch (err) { toast(err.message, "err"); busy(btn, false); }
  };
  const w = f.querySelector("[data-withdraw]");
  if (w) w.onclick = async () => {
    if (!(await confirmBox("Retirer votre offre ?"))) return;
    try { await deleteDoc(doc(db, "offers", o.id)); dlg.close(); toast("Offre retirée."); await reload(); }
    catch (err) { toast(err.message, "err"); }
  };
}

async function renderOffers() {
  if (!offers.length) { $("#offerList").innerHTML = empty("Vous n'avez encore envoyé aucune offre."); return; }
  // Coordonnées des entreprises qui ont accepté une offre
  const won = offers.filter(o => o.status === "accepted");
  const contacts = Object.fromEntries(await Promise.all(won.map(async o => [o.companyId, await get("companies", o.companyId).catch(() => null)])));
  $("#offerList").innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Demande</th><th>Entreprise</th><th>Montant</th><th>Envoyée le</th><th>Statut</th></tr></thead>
    <tbody>${offers.map(o => {
      const c = contacts[o.companyId];
      return `<tr class="row-click" data-rfq="${esc(o.rfqId)}" tabindex="0"><td><strong>${esc(o.rfqTitle)}</strong></td>
      <td>${esc(o.companyName)}${o.status === "accepted" && c ? `<br><span class="small">${esc(c.contactName || "")} · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a> · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></span>` : ""}</td>
      <td>${esc(fmtMoney(o.price, o.currency))}</td><td>${fmtDate(o.createdAt)}</td><td>${badge(o.status)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  $("#offerList").onclick = e => { if (e.target.closest("a")) return; const r = e.target.closest("[data-rfq]"); if (r) rfqDetail(r.dataset.rfq); };
}

function renderProducts() {
  $("#productList").innerHTML = products.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Produit / service</th><th>Catégorie</th><th>Prix indicatif</th><th>Commande min.</th><th></th></tr></thead>
    <tbody>${products.map(p => `<tr><td><strong>${esc(p.name)}</strong><br><span class="muted small clamp">${esc(p.description)}</span></td>
      <td>${esc(p.category)}</td><td>${p.price != null ? esc(fmtMoney(p.price, p.currency)) + (p.unit ? " / " + esc(p.unit) : "") : "Sur devis"}</td><td>${esc(p.minOrder || "—")}</td>
      <td class="nowrap"><button class="btn btn-sm btn-ghost" data-edit="${esc(p.id)}">Modifier</button> <button class="btn btn-sm btn-danger" data-del="${esc(p.id)}">Supprimer</button></td></tr>`).join("")}
    </tbody></table></div>` : empty("Ajoutez vos produits et services pour apparaître dans les recherches des entreprises.");
  $("#productList").onclick = async e => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.edit) productForm(products.find(p => p.id === t.dataset.edit));
    if (t.dataset.del && await confirmBox("Supprimer ce produit ?")) {
      try { await deleteDoc(doc(db, "products", t.dataset.del)); toast("Produit supprimé."); await reload(); }
      catch (err) { toast(err.message, "err"); }
    }
  };
}

function productForm(p = null) {
  const list = (sup.categories || []).length ? sup.categories : cats;
  const v0 = p || { category: list[0], currency: APP.currencies[0] };
  const dlg = modal(p ? "Modifier le produit" : "Nouveau produit / service", `
    <form class="stack">
      <label class="field"><span>Nom *</span><input class="input" name="name" required maxlength="120" value="${esc(v0.name)}"></label>
      <div class="form-grid">
        <label class="field"><span>Catégorie *</span><select class="input" name="category" required>${options(list, v0.category)}</select></label>
        <label class="field"><span>Commande minimum</span><input class="input" name="minOrder" maxlength="60" value="${esc(v0.minOrder)}" placeholder="Ex. : 100 pièces"></label>
        <label class="field"><span>Prix indicatif <small class="muted">(vide = sur devis)</small></span><input class="input" type="number" min="0" step="any" name="price" value="${esc(v0.price ?? "")}"></label>
        <label class="field"><span>Devise</span><select class="input" name="currency">${options(APP.currencies, v0.currency)}</select></label>
        <label class="field span-2"><span>Unité</span><input class="input" name="unit" maxlength="30" value="${esc(v0.unit)}" placeholder="pièce, kg, tonne, heure…"></label>
      </div>
      <label class="field"><span>Description *</span><textarea class="input" name="description" rows="4" required maxlength="2000">${esc(v0.description)}</textarea></label>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
    </form>`);
  dlg.querySelector("[data-cancel]").onclick = () => dlg.close();
  const f = dlg.querySelector("form");
  f.onsubmit = async e => {
    e.preventDefault();
    const v = { ...formData(f), supplierName: sup.name, supplierApproved: approved(), updatedAt: now() };
    const btn = f.querySelector(".btn-primary"); busy(btn, true);
    try {
      if (p) await updateDoc(doc(db, "products", p.id), v);
      else await addDoc(collection(db, "products"), { ...v, supplierId: me.uid, createdAt: now() });
      dlg.close(); toast("Produit enregistré."); await reload();
    } catch (err) { toast(err.message, "err"); busy(btn, false); }
  };
}

function renderProfile() {
  const s = sup;
  $("#profile").innerHTML = `
    <form class="stack card" id="profileForm">
      <p>Statut du compte : ${badge(s.status)}</p>
      <div class="form-grid">
        <label class="field span-2"><span>Raison sociale *</span><input class="input" name="name" required maxlength="120" value="${esc(s.name)}"></label>
        <label class="field"><span>Nom du contact *</span><input class="input" name="contactName" required maxlength="80" value="${esc(s.contactName)}"></label>
        <label class="field"><span>Téléphone *</span><input class="input" name="phone" required maxlength="30" value="${esc(s.phone)}"></label>
        <label class="field"><span>Site web</span><input class="input" name="website" maxlength="120" value="${esc(s.website)}"></label>
        <label class="field"><span>Adresse</span><input class="input" name="address" maxlength="160" value="${esc(s.address)}"></label>
        <label class="field"><span>Ville *</span><input class="input" name="city" required maxlength="60" value="${esc(s.city)}"></label>
        <label class="field"><span>Pays *</span><input class="input" name="country" required maxlength="60" value="${esc(s.country)}"></label>
      </div>
      <label class="field"><span>Présentation de l'entreprise *</span><textarea class="input" name="description" rows="5" required maxlength="2000" placeholder="Activité, références, certifications, capacité de production…">${esc(s.description)}</textarea></label>
      <fieldset class="field"><legend>Catégories * <small class="muted">(vous recevez les demandes de devis de ces catégories)</small></legend>
        <div class="checks">${cats.map(c => `<label class="check"><input type="checkbox" name="categories" value="${esc(c)}" ${(s.categories || []).includes(c) ? "checked" : ""}> ${esc(c)}</label>`).join("")}</div>
      </fieldset>
      <p class="muted small">E-mail du compte (affiché aux entreprises) : ${esc(me.email)}</p>
      <div class="form-actions"><button class="btn btn-primary">Enregistrer</button></div>
    </form>`;
  const f = $("#profileForm");
  f.onsubmit = async e => {
    e.preventDefault();
    const v = formData(f);
    if (!v.categories.length) return toast("Choisissez au moins une catégorie.", "err");
    const btn = f.querySelector("button.btn-primary"); busy(btn, true);
    try {
      const renamed = v.name !== s.name;
      await setDoc(doc(db, "suppliers", me.uid), { ...v, email: me.email, updatedAt: now(), ...(s.createdAt ? {} : { createdAt: now(), status: "pending" }) }, { merge: true });
      Object.assign(sup, v, { createdAt: s.createdAt || true });
      if (renamed && products.length) {
        const b = writeBatch(db);
        products.forEach(p => b.update(doc(db, "products", p.id), { supplierName: v.name, updatedAt: now() }));
        await b.commit();
      }
      $("#who").textContent = sup.name;
      toast("Fiche fournisseur enregistrée.");
      await reload();
    } catch (err) { toast(err.message, "err"); }
    busy(btn, false);
  };
}

init().catch(err => { console.error(err); toast(err.message, "err"); });
