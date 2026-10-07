/* Couche « application » (uniquement dans l'APK) : onglets en bas avec icônes, bouton retour Android, tableaux en cartes */
(function () {
  document.documentElement.classList.add("native");

  var ICONS = {
    accueil: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    demandes: '<path d="M9 2h6v4H9zM6 4H5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-1M8 11h8M8 15h5"/>',
    catalogue: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    fiche: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M2 21h20M8 8h3M8 12h3M8 16h3"/>',
    entreprises: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M2 21h20M8 8h3M8 12h3M8 16h3"/>',
    offres: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
    produits: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
    fournisseurs: '<path d="M2 6h12v10H2zM14 9h4l4 4v3h-8"/><circle cx="6" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
    categories: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
    messages: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    equipe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 4 6"/>'
  };
  var SHORT = { accueil: "Accueil", demandes: "Demandes", catalogue: "Catalogue", fiche: "Profil", offres: "Offres", produits: "Produits", fournisseurs: "Fourn.", entreprises: "Entreprises", categories: "Catégories", equipe: "Équipe", messages: "Messages" };

  document.querySelectorAll("[data-tab]").forEach(function (b) {
    var k = b.dataset.tab;
    if (!ICONS[k]) return;
    var count = b.querySelector(".count");
    b.textContent = "";
    b.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 24 24" class="tab-ico" aria-hidden="true">' + ICONS[k] + '</svg><span class="tab-label">' + SHORT[k] + "</span>");
    if (count) b.append(count);
  });

  // Tableaux → cartes : chaque cellule reçoit le titre de sa colonne
  function labelTables() {
    document.querySelectorAll("table.table").forEach(function (t) {
      var heads = Array.prototype.map.call(t.querySelectorAll("thead th"), function (th) { return th.textContent.trim(); });
      t.querySelectorAll("tbody tr").forEach(function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) { if (heads[i] && !td.dataset.label) td.dataset.label = heads[i]; });
      });
    });
  }
  new MutationObserver(labelTables).observe(document.documentElement, { childList: true, subtree: true });

  // iPhone : texte de la barre d'état en sombre sur les pages blanches, en clair sur les pages sombres
  var SB = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.StatusBar;
  if (SB && Capacitor.getPlatform && Capacitor.getPlatform() === "ios") {
    var dark = document.body.classList.contains("home") || document.body.classList.contains("auth-page");
    SB.setStyle({ style: dark ? "DARK" : "LIGHT" }).catch(function () {});
  }

  // Bouton retour Android : ferme la fenêtre ouverte, sinon revient en arrière, sinon quitte l'application
  var Cap = window.Capacitor;
  var App = Cap && Cap.Plugins && Cap.Plugins.App;
  if (App && App.addListener) {
    App.addListener("backButton", function () {
      var dlg = document.querySelector("dialog[open]");
      if (dlg) { dlg.close(); return; }
      if (document.body.classList.contains("nav-open")) { document.body.classList.remove("nav-open"); return; }
      var page = location.pathname.split("/").pop() || "index.html";
      var roots = ["connexion.html", "entreprise.html", "fournisseur.html", "admin.html", "index.html"];
      if (roots.indexOf(page) >= 0) App.minimizeApp ? App.minimizeApp() : App.exitApp();
      else history.back();
    });
  }
})();
