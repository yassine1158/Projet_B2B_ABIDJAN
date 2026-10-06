/* Initialisation Firebase et accès aux données (Auth + Firestore) */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, collection, query, where, limit, getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { FIREBASE_CONFIG, USE_EMULATORS, DEFAULT_CATEGORIES } from "./config.js";

export const configured = !String(FIREBASE_CONFIG.apiKey).startsWith("VOTRE_") || USE_EMULATORS;

// Émulateurs : projet de démonstration local « demo-b2b » (aucune donnée réelle)
export const app = initializeApp(USE_EMULATORS ? { ...FIREBASE_CONFIG, apiKey: "demo", projectId: "demo-b2b" } : FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (USE_EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export const now = serverTimestamp;

export const ROLES = { company: "Entreprise", supplier: "Fournisseur", admin: "Administrateur" };
export const HOME_OF = { company: "entreprise.html", supplier: "fournisseur.html", admin: "admin.html" };

/** Attend l'état de connexion initial puis renvoie { user, profile } (profile = document users/{uid}). */
export function currentUser() {
  return new Promise(resolve => {
    const stop = onAuthStateChanged(auth, async user => {
      stop();
      if (!user) return resolve({ user: null, profile: null });
      const snap = await getDoc(doc(db, "users", user.uid)).catch(() => null);
      resolve({ user, profile: snap && snap.exists() ? snap.data() : null });
    });
  });
}

/** Protège une page : redirige vers la connexion si besoin, ou vers le bon espace si le rôle ne correspond pas. */
export async function requireRole(role) {
  const { user, profile } = await currentUser();
  if (!user) { location.replace("connexion.html?next=" + encodeURIComponent(location.pathname.split("/").pop())); return null; }
  if (!profile) { location.replace("connexion.html?complete=1"); return null; }
  if (profile.role !== role) { location.replace(HOME_OF[profile.role] || "index.html"); return null; }
  return { user, profile };
}

export const logout = () => signOut(auth).then(() => location.replace("index.html"));

/** Lit tous les documents d'une requête sous forme de tableau [{ id, ...data }]. */
export async function list(path, ...constraints) {
  const snap = await getDocs(query(collection(db, path), ...constraints, limit(500)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function get(path, id) {
  const snap = await getDoc(doc(db, path, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function categories() {
  const s = await get("settings", "categories").catch(() => null);
  return s && Array.isArray(s.list) && s.list.length ? s.list : DEFAULT_CATEGORIES;
}

export { where };
