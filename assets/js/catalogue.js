/* Catalogue des fournisseurs validés et de leurs produits (page publique + espace entreprise) */
import { list, where, categories } from "./db.js";
import { swr } from "./store.js";
import { $, esc, modal, options, empty, fmtMoney } from "./ui.js";

const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * @param {HTMLElement} root  conteneur
 * @param {{ onQuote?: (supplier) => void, onMessage?: (supplier) => void }} opts  boutons « Demander un devis » / « Envoyer un message » (espace entreprise)
 */
export async function mountCatalogue(root, opts = {}) {
  root.innerHTML = `
    <div class="filters">
      <input type="search" class="input" id="catQ" placeholder="Rechercher un fournisseur, un produit, une ville…" aria-label="Recherche">
      <select class="input" id="catCat" aria-label="Catégorie"><option value="">Toutes les catégories</option></select>
      <div class="seg" role="group" aria-label="Affichage">
        <button type="button" class="seg-btn" data-view="suppliers" aria-pressed="true">Fournisseurs</button>
        <button type="button" class="seg-btn" data-view="products" aria-pressed="false">Produits</button>
      </div>
    </div>
    <p class="muted small" id="catCount"></p>
    <div class="grid-cards" id="catList">${'<div class="card skel-card"></div>'.repeat(6)}</div>`;

  let view = "suppliers", suppliers = [], products = [], byId = {}, loaded = false;
  const preset = new URLSearchParams(location.search).get("cat");
  categories().then(cats => {
    $("#catCat", root).insertAdjacentHTML("beforeend", options(cats));
    if (preset && cats.includes(preset)) { $("#catCat", root).value = preset; if (loaded) render(); }
  });

  const render = () => {
    if (!loaded) return; // garder le squelette tant qu'aucune donnée n'est arrivée
    const q = norm($("#catQ", root).value);
    const cat = $("#catCat", root).value;
    let html, n;
    if (view === "suppliers") {
      const rows = suppliers.filter(s =>
        (!cat || (s.categories || []).includes(cat)) &&
        (!q || norm([s.name, s.city, s.country, s.description, ...(s.categories || [])].join(" ")).includes(q) ||
          products.some(p => p.supplierId === s.id && norm(p.name).includes(q))));
      rows.sort((a, b) => a.name.localeCompare(b.name, "fr"));
      n = rows.length;
      html = rows.map(s => `
        <article class="card card-click" data-sup="${esc(s.id)}" tabindex="0">
          <div class="card-top"><div class="avatar">${esc(s.name.slice(0, 1).toUpperCase())}</div>
            <div><h3>${esc(s.name)}</h3><p class="muted small">${esc([s.city, s.country].filter(Boolean).join(", "))}</p></div></div>
          <p class="clamp">${esc(s.description)}</p>
          <div class="tags">${(s.categories || []).slice(0, 4).map(c => `<span class="tag">${esc(c)}</span>`).join("")}</div>
          <p class="muted small">${products.filter(p => p.supplierId === s.id).length} produit(s) / service(s)</p>
        </article>`).join("");
    } else {
      const rows = products.filter(p => byId[p.supplierId] &&
        (!cat || p.category === cat) &&
        (!q || norm([p.name, p.description, p.category, p.supplierName].join(" ")).includes(q)));
      rows.sort((a, b) => a.name.localeCompare(b.name, "fr"));
      n = rows.length;
      html = rows.map(p => `
        <article class="card card-click" data-sup="${esc(p.supplierId)}" tabindex="0">
          <span class="tag">${esc(p.category)}</span>
          <h3>${esc(p.name)}</h3>
          <p class="clamp">${esc(p.description)}</p>
          <p class="price">${p.price ? esc(fmtMoney(p.price, p.currency)) + (p.unit ? " / " + esc(p.unit) : "") : "Prix sur devis"}</p>
          <p class="muted small">par <strong>${esc(p.supplierName)}</strong>${p.minOrder ? " · min. " + esc(p.minOrder) : ""}</p>
        </article>`).join("");
    }
    $("#catCount", root).textContent = n + (view === "suppliers" ? " fournisseur(s)" : " produit(s) / service(s)");
    $("#catList", root).innerHTML = html || empty("Aucun résultat. Essayez une autre recherche ou catégorie.");
  };

  const open = id => {
    const s = byId[id];
    if (!s) return;
    const prods = products.filter(p => p.supplierId === id);
    const contact = [
      s.phone && `<li><span>Téléphone</span><a href="tel:${esc(s.phone)}">${esc(s.phone)}</a></li>`,
      s.email && `<li><span>E-mail</span><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>`,
      s.website && `<li><span>Site web</span><a href="${esc(/^https?:\/\//.test(s.website) ? s.website : "https://" + s.website)}" target="_blank" rel="noopener">${esc(s.website)}</a></li>`,
      `<li><span>Ville</span>${esc([s.address, s.city, s.country].filter(Boolean).join(", ") || "—")}</li>`,
    ].filter(Boolean).join("");
    const dlg = modal(s.name, `
      <div class="tags">${(s.categories || []).map(c => `<span class="tag">${esc(c)}</span>`).join("")}</div>
      <p class="pre">${esc(s.description)}</p>
      <ul class="kv">${contact}</ul>
      <h4>Produits & services (${prods.length})</h4>
      ${prods.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Produit</th><th>Catégorie</th><th>Prix indicatif</th><th>Min.</th></tr></thead><tbody>
        ${prods.map(p => `<tr><td><strong>${esc(p.name)}</strong><br><span class="muted small">${esc(p.description)}</span></td><td>${esc(p.category)}</td>
        <td>${p.price ? esc(fmtMoney(p.price, p.currency)) + (p.unit ? " / " + esc(p.unit) : "") : "Sur devis"}</td><td>${esc(p.minOrder || "—")}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">Aucun produit publié pour le moment.</p>`}
      ${opts.onQuote || opts.onMessage ? `<div class="form-actions">${opts.onMessage ? `<button class="btn btn-ghost" data-msg>💬 Envoyer un message</button>` : ""}${opts.onQuote ? `<button class="btn btn-accent" data-quote>Publier une demande de devis</button>` : ""}</div>` : ""}`, { wide: true });
    const q = dlg.querySelector("[data-quote]");
    if (q) q.onclick = () => { dlg.close(); opts.onQuote(s); };
    const m = dlg.querySelector("[data-msg]");
    if (m) m.onclick = () => { dlg.close(); opts.onMessage(s); };
  };

  $("#catQ", root).oninput = render;
  $("#catCat", root).onchange = render;
  root.querySelectorAll("[data-view]").forEach(b => (b.onclick = () => {
    view = b.dataset.view;
    root.querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    render();
  }));
  $("#catList", root).onclick = e => { const c = e.target.closest("[data-sup]"); if (c) open(c.dataset.sup); };
  $("#catList", root).onkeydown = e => { const c = e.target.closest("[data-sup]"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(c.dataset.sup); } };

  // Affichage immédiat depuis le cache, puis données fraîches du serveur
  await swr("catalogue", async () => {
    const [sup, prod] = await Promise.all([
      list("suppliers", where("status", "==", "approved")),
      list("products", where("supplierApproved", "==", true)),
    ]);
    return { suppliers: sup, products: prod };
  }, d => {
    suppliers = d.suppliers; products = d.products;
    byId = Object.fromEntries(suppliers.map(s => [s.id, s]));
    loaded = true;
    render();
  }).catch(err => { if (!suppliers.length) $("#catList", root).innerHTML = empty("Impossible de charger le catalogue : " + err.message); });
  return { suppliers, products };
}
