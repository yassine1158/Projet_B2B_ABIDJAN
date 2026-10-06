/* Application installable (PWA) + confort sur smartphone, chargé sur toutes les pages */

const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
document.documentElement.classList.toggle("standalone", standalone);

// Hors connexion : service worker (pas en local avec les émulateurs, pour éviter tout cache pendant le développement)
if ("serviceWorker" in navigator && !["localhost", "127.0.0.1"].includes(location.hostname)) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

// ---------- Bouton « Installer l'application » ----------
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let deferred = null;
const buttons = () => document.querySelectorAll("[data-install]");
const showButtons = on => buttons().forEach(b => (b.hidden = !on));

addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; showButtons(true); });
addEventListener("appinstalled", () => { deferred = null; showButtons(false); });

function iosHelp() {
  const dlg = document.createElement("dialog");
  dlg.className = "modal install-sheet";
  dlg.innerHTML = `<div class="modal-head"><h3>Installer sur iPhone</h3><button type="button" class="modal-x" aria-label="Fermer">×</button></div>
    <div class="modal-body">
      <ol class="install-steps">
        <li>Touchez le bouton <b>Partager</b> <span class="ios-share" aria-hidden="true"></span> en bas de Safari.</li>
        <li>Choisissez <b>« Sur l'écran d'accueil »</b>.</li>
        <li>Touchez <b>Ajouter</b> : l'application apparaît avec vos autres apps.</li>
      </ol>
    </div>`;
  document.body.append(dlg);
  dlg.querySelector(".modal-x").onclick = () => dlg.close();
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  dlg.showModal();
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-install]");
  if (!b) return;
  e.preventDefault();
  if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; showButtons(false); }
  else if (isIOS) iosHelp();
});

document.addEventListener("DOMContentLoaded", () => showButtons(!standalone && isIOS));
if (document.readyState !== "loading") showButtons(!standalone && isIOS);

// ---------- Tableaux lisibles sur smartphone : chaque cellule reçoit le titre de sa colonne ----------
function labelTables(root = document) {
  root.querySelectorAll("table.table").forEach(t => {
    const heads = [...t.querySelectorAll("thead th")].map(th => th.textContent.trim());
    t.querySelectorAll("tbody tr").forEach(tr => [...tr.children].forEach((td, i) => { if (heads[i] && !td.dataset.label) td.dataset.label = heads[i]; }));
  });
}
new MutationObserver(() => labelTables()).observe(document.documentElement, { childList: true, subtree: true });
labelTables();
