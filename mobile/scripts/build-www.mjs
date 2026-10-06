// Prépare mobile/www à partir du site : mêmes pages, même code Firebase,
// + une couche « application » (app.css / app.js) qui n'existe que dans l'APK.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..", "..");
const www = join(here, "..", "www");

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
cpSync(join(site, "assets"), join(www, "assets"), { recursive: true });
cpSync(join(here, "..", "app"), join(www, "app"), { recursive: true });

const pages = readdirSync(site).filter(f => f.endsWith(".html"));
for (const page of pages) {
  let html = readFileSync(join(site, page), "utf8");
  // La vitrine devient « accueil.html » ; index.html ouvre directement la connexion (ou l'espace si déjà connecté)
  html = html.replace(/href="index\.html/g, 'href="accueil.html');
  html = html.replace("</head>", '  <link rel="stylesheet" href="app/app.css">\n</head>');
  html = html.replace("</body>", '<script src="app/app.js"></script>\n</body>');
  html = html.replace('content="width=device-width, initial-scale=1"', 'content="width=device-width, initial-scale=1, viewport-fit=cover"');
  writeFileSync(join(www, page === "index.html" ? "accueil.html" : page), html);
}
// Les redirections du code (déconnexion…) pointent vers index.html : on renvoie vers la connexion,
// qui envoie elle-même vers l'espace de l'utilisateur s'il est déjà connecté
writeFileSync(join(www, "index.html"), `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>html,body{margin:0;height:100%;background:#07170f}</style>
<script>location.replace("connexion.html")</script></head><body></body></html>`);
console.log(`www prêt : ${pages.length} pages`);
