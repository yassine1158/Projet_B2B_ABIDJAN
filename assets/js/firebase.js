/* Authentification (espaces entreprise, fournisseur, admin) + accès aux données de db.js */
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signOut, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js";
import { USE_EMULATORS } from "./config.js";
import { app, db, HOME_OF } from "./db.js";
import { readCache, writeCache, clearCache } from "./store.js";

export { app, db, configured, now, ROLES, HOME_OF, list, get, categories, where } from "./db.js";

export const auth = getAuth(app);
if (USE_EMULATORS) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });

/** Lit le profil users/{uid} sur le serveur et le garde en cache. */
async function fetchProfile(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  const profile = snap.exists() ? snap.data() : null;
  if (profile) {
    writeCache("profile:" + user.uid, { role: profile.role, displayName: profile.displayName || "" });
    writeCache("session", { role: profile.role, uid: user.uid, email: user.email, displayName: profile.displayName || "" });
  }
  return profile;
}

/**
 * Dernière session connue sur cet appareil (sans attendre Firebase Auth) : sert uniquement à afficher
 * tout de suite les données en cache de cet utilisateur ; la connexion est vérifiée juste après.
 */
export function lastSession(role) {
  const s = readCache("session");
  return s && s.uid && s.role === role ? s : null;
}

/**
 * Attend l'état de connexion initial puis renvoie { user, profile } (profile = document users/{uid}).
 * Le profil en cache est utilisé immédiatement ; il est vérifié en arrière-plan
 * (si le rôle a changé, par exemple nommé administrateur, la page se recharge).
 */
export function currentUser() {
  return new Promise(resolve => {
    const stop = onAuthStateChanged(auth, async user => {
      stop();
      if (!user) { writeCache("session", null); return resolve({ user: null, profile: null }); }
      const cached = readCache("profile:" + user.uid);
      if (cached && cached.role) {
        resolve({ user, profile: cached });
        fetchProfile(user).then(p => {
          if (p && p.role === cached.role) return;
          if (!p) writeCache("profile:" + user.uid, null); // évite toute boucle de rechargement
          location.reload();
        }).catch(() => {});
        return;
      }
      resolve({ user, profile: await fetchProfile(user).catch(() => null) });
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

export const logout = () => { clearCache(); return signOut(auth).then(() => location.replace("index.html")); };

/** Envoie un e-mail pour choisir un nouveau mot de passe. */
export const resetPassword = email => sendPasswordResetEmail(auth, email);
