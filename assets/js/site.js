/* Pages publiques : accueil (site vitrine) et catalogue — sans le module de connexion, pour un chargement rapide */
import { configured, list, where, categories, HOME_OF } from "./db.js";
import { mountCatalogue } from "./catalogue.js";
import { readCache, swr } from "./store.js";
import { $, esc, brand, notConfigured } from "./ui.js";

brand();

// En-tête : « Mon espace » si l'utilisateur s'est déjà connecté sur cet appareil
const session = readCache("session");
if (session && HOME_OF[session.role]) {
  const link = $("#navAccount");
  if (link) { link.textContent = "Mon espace"; link.href = HOME_OF[session.role]; }
  const reg = $("#navRegister");
  if (reg) reg.hidden = true;
}

function renderFeatured(sup) {
  if (!sup.length) return;
  const st = $("#statSuppliers"); if (st) st.textContent = sup.length;
  $("#featured").innerHTML = sup.slice(0, 6).map(s => `
      <a class="card" href="catalogue.html?q=${encodeURIComponent(s.name)}">
        <div class="card-top"><div class="avatar">${esc(s.name.slice(0, 1).toUpperCase())}</div>
        <div><h3>${esc(s.name)}</h3><p class="muted small">${esc([s.city, s.country].filter(Boolean).join(", "))}</p></div></div>
        <div class="tags">${(s.categories || []).slice(0, 3).map(c => `<span class="tag">${esc(c)}</span>`).join("")}</div>
      </a>`).join("");
  $("#featuredWrap").hidden = false;
}

async function home() {
  categories().then(cats => {
    $("#categories").innerHTML = cats.map(c => `<a class="cat" href="catalogue.html?cat=${encodeURIComponent(c)}">${esc(c)}</a>`).join("");
  });
  swr("featured", () => list("suppliers", where("status", "==", "approved")).then(l => l.slice(0, 6)), renderFeatured).catch(() => {});
}

const page = document.body.dataset.page;
if (!configured) {
  const box = $("#catalogue") || $("#configNotice");
  if (box) notConfigured(box);
} else if (page === "home") {
  home();
} else if (page === "catalogue") {
  mountCatalogue($("#catalogue"), {});
  const q = new URLSearchParams(location.search).get("q");
  if (q) $("#catQ").value = q; // appliqué dès le premier affichage (cache compris)
}
