/* Pages publiques : accueil (site vitrine) et catalogue */
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, configured, list, where, categories, currentUser, HOME_OF } from "./firebase.js";
import { mountCatalogue } from "./catalogue.js";
import { $, esc, brand, notConfigured } from "./ui.js";

brand();

// En-tête : « Mon espace » si l'utilisateur est connecté
if (configured) {
  onAuthStateChanged(auth, async user => {
    if (!user) return;
    const { profile } = await currentUser();
    const link = $("#navAccount");
    if (profile && link) { link.textContent = "Mon espace"; link.href = HOME_OF[profile.role]; }
    const reg = $("#navRegister");
    if (reg) reg.hidden = true;
  });
}

async function home() {
  const cats = await categories();
  $("#categories").innerHTML = cats.map(c => `<a class="cat" href="catalogue.html?cat=${encodeURIComponent(c)}">${esc(c)}</a>`).join("");
  const sup = await list("suppliers", where("status", "==", "approved")).catch(() => []);
  if (sup.length) {
    $("#statSuppliers").textContent = sup.length;
    $("#featured").innerHTML = sup.slice(0, 6).map(s => `
      <a class="card" href="catalogue.html?q=${encodeURIComponent(s.name)}">
        <div class="card-top"><div class="avatar">${esc(s.name.slice(0, 1).toUpperCase())}</div>
        <div><h3>${esc(s.name)}</h3><p class="muted small">${esc([s.city, s.country].filter(Boolean).join(", "))}</p></div></div>
        <div class="tags">${(s.categories || []).slice(0, 3).map(c => `<span class="tag">${esc(c)}</span>`).join("")}</div>
      </a>`).join("");
    $("#featuredWrap").hidden = false;
  }
}

const page = document.body.dataset.page;
if (!configured) {
  const box = $("#catalogue") || $("#configNotice");
  if (box) notConfigured(box);
} else if (page === "home") {
  home();
} else if (page === "catalogue") {
  mountCatalogue($("#catalogue"), {}).then(() => {
    const q = new URLSearchParams(location.search).get("q");
    if (q) { const i = $("#catQ"); i.value = q; i.dispatchEvent(new Event("input")); }
  });
}
