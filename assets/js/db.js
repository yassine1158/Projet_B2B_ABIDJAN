/* Firebase côté données (Firestore Lite : 3× plus léger que la version complète, pas de connexion requise).
   Utilisé seul par les pages publiques ; firebase.js y ajoute l'authentification pour les espaces. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, collection, query, where, limit, getDocs, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js";
import { FIREBASE_CONFIG, USE_EMULATORS, DEFAULT_CATEGORIES } from "./config.js";
import { readCache, writeCache } from "./store.js";

export const configured = !String(FIREBASE_CONFIG.apiKey).startsWith("VOTRE_") || USE_EMULATORS;

// Émulateurs : projet de démonstration local « demo-b2b » (aucune donnée réelle)
export const app = initializeApp(USE_EMULATORS ? { ...FIREBASE_CONFIG, apiKey: "demo", projectId: "demo-b2b" } : FIREBASE_CONFIG);
export const db = getFirestore(app);
if (USE_EMULATORS) connectFirestoreEmulator(db, "127.0.0.1", 8080);

export const now = serverTimestamp;
export const ROLES = { company: "Entreprise", supplier: "Fournisseur", admin: "Administrateur" };
export const HOME_OF = { company: "entreprise.html", supplier: "fournisseur.html", admin: "admin.html" };

/** Lit tous les documents d'une requête sous forme de tableau [{ id, ...data }]. */
export async function list(path, ...constraints) {
  const snap = await getDocs(query(collection(db, path), ...constraints, limit(500)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function get(path, id) {
  const snap = await getDoc(doc(db, path, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Catégories : réponse immédiate depuis le cache, mise à jour en arrière-plan. */
export async function categories() {
  const refresh = get("settings", "categories").then(s => {
    const cats = s && Array.isArray(s.list) && s.list.length ? s.list : DEFAULT_CATEGORIES;
    writeCache("categories", cats);
    return cats;
  }).catch(() => DEFAULT_CATEGORIES);
  return readCache("categories") || refresh;
}

export { where };
