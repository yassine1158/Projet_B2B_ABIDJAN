/* Connexion, inscription (entreprise ou fournisseur) et mot de passe oublié */
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db, now, configured, currentUser, categories, HOME_OF, logout } from "./firebase.js";
import { $, $$, esc, brand, toast, busy, formData, notConfigured } from "./ui.js";

brand();
const params = new URLSearchParams(location.search);
const box = $("#authBox");

const AUTH_ERRORS = {
  "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  "auth/wrong-password": "E-mail ou mot de passe incorrect.",
  "auth/user-not-found": "Aucun compte avec cet e-mail.",
  "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail. Connectez-vous.",
  "auth/weak-password": "Mot de passe trop faible (8 caractères minimum).",
  "auth/invalid-email": "Adresse e-mail invalide.",
  "auth/too-many-requests": "Trop de tentatives. Réessayez dans quelques minutes.",
  "auth/network-request-failed": "Problème de connexion internet.",
};
const errMsg = e => AUTH_ERRORS[e.code] || e.message;

const goHome = role => {
  const next = params.get("next");
  location.replace(next && next === HOME_OF[role] ? next : HOME_OF[role] || "index.html");
};

/** Crée le document users/{uid} puis la fiche entreprise ou fournisseur. */
async function createProfile(user, v) {
  await setDoc(doc(db, "users", user.uid), { role: v.role, email: user.email, displayName: v.contactName, createdAt: now() });
  const base = {
    name: v.name, contactName: v.contactName, email: user.email, phone: v.phone, city: v.city, country: v.country,
    address: "", description: "", createdAt: now(), updatedAt: now(),
  };
  if (v.role === "supplier") {
    await setDoc(doc(db, "suppliers", user.uid), { ...base, website: "", categories: v.categories || [], status: "pending" });
  } else {
    await setDoc(doc(db, "companies", user.uid), { ...base, sector: v.sector || "", status: "pending" });
  }
}

function registerFields(cats, role) {
  return `
    <fieldset class="role-pick">
      <legend>Vous êtes</legend>
      <label class="role-opt"><input type="radio" name="role" value="company" ${role !== "supplier" ? "checked" : ""}>
        <span><strong>Une entreprise</strong><small>Je cherche des fournisseurs et je demande des devis</small></span></label>
      <label class="role-opt"><input type="radio" name="role" value="supplier" ${role === "supplier" ? "checked" : ""}>
        <span><strong>Un fournisseur</strong><small>Je présente mes produits et je réponds aux demandes</small></span></label>
    </fieldset>
    <div class="form-grid">
      <label class="field span-2"><span>Raison sociale *</span><input class="input" name="name" required maxlength="120"></label>
      <label class="field"><span>Nom du contact *</span><input class="input" name="contactName" required maxlength="80"></label>
      <label class="field"><span>Téléphone *</span><input class="input" name="phone" type="tel" required maxlength="30"></label>
      <label class="field"><span>Ville *</span><input class="input" name="city" required maxlength="60"></label>
      <label class="field"><span>Pays *</span><input class="input" name="country" required maxlength="60"></label>
      <label class="field span-2" data-for="company"><span>Secteur d'activité</span><input class="input" name="sector" maxlength="80" placeholder="Ex. : industrie agroalimentaire"></label>
    </div>
    <fieldset class="field" data-for="supplier">
      <legend>Catégories de produits / services * <small class="muted">(au moins une)</small></legend>
      <div class="checks">${cats.map(c => `<label class="check"><input type="checkbox" name="categories" value="${esc(c)}"> ${esc(c)}</label>`).join("")}</div>
    </fieldset>`;
}

function toggleRole(form) {
  const role = form.querySelector("[name=role]:checked").value;
  $$("[data-for]", form).forEach(el => {
    el.hidden = el.dataset.for !== role;
    el.querySelectorAll("input").forEach(i => (i.disabled = el.hidden));
  });
}

function validRegister(v) {
  if (v.role === "supplier" && !(v.categories || []).length) { toast("Choisissez au moins une catégorie.", "err"); return false; }
  return true;
}

async function init() {
  if (!configured) return notConfigured(box);
  const cats = await categories();
  const { user, profile } = await currentUser();

  // Compte créé mais fiche incomplète (inscription interrompue)
  if (user && !profile) {
    box.innerHTML = `
      <h1>Finaliser votre inscription</h1>
      <p class="muted">Connecté en tant que <strong>${esc(user.email)}</strong>. Complétez votre fiche pour accéder à votre espace.</p>
      <form id="completeForm" class="stack">${registerFields(cats, params.get("role"))}
        <div class="form-actions"><button type="button" class="btn btn-ghost" id="out">Se déconnecter</button><button class="btn btn-primary">Valider</button></div>
      </form>`;
    const f = $("#completeForm");
    f.onchange = () => toggleRole(f); toggleRole(f);
    $("#out").onclick = logout;
    f.onsubmit = async e => {
      e.preventDefault();
      const v = formData(f);
      if (!validRegister(v)) return;
      const btn = f.querySelector("button.btn-primary"); busy(btn, true);
      try { await createProfile(user, v); goHome(v.role); }
      catch (err) { toast(errMsg(err), "err"); busy(btn, false); }
    };
    return;
  }
  if (user && profile) return goHome(profile.role);

  const mode = params.get("mode") === "register" || params.get("role") ? "register" : "login";
  box.innerHTML = `
    <div class="seg seg-full" role="tablist">
      <button type="button" class="seg-btn" data-mode="login">Connexion</button>
      <button type="button" class="seg-btn" data-mode="register">Créer un compte</button>
    </div>

    <form id="loginForm" class="stack" data-m="login">
      <h1>Bon retour</h1>
      <label class="field"><span>E-mail</span><input class="input" name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>Mot de passe</span><input class="input" name="password" type="password" required autocomplete="current-password"></label>
      <button class="btn btn-primary btn-block">Se connecter</button>
      <button type="button" class="link" id="forgot">Mot de passe oublié ?</button>
    </form>

    <form id="registerForm" class="stack" data-m="register">
      <h1>Créer votre compte</h1>
      ${registerFields(cats, params.get("role"))}
      <div class="form-grid">
        <label class="field"><span>E-mail professionnel *</span><input class="input" name="email" type="email" required autocomplete="email"></label>
        <label class="field"><span>Mot de passe * <small class="muted">(8 caractères min.)</small></span><input class="input" name="password" type="password" required minlength="8" autocomplete="new-password"></label>
      </div>
      <label class="check"><input type="checkbox" name="terms" value="ok" required> J'accepte les conditions d'utilisation de la plateforme.</label>
      <p class="muted small" data-for="supplier">Votre fiche fournisseur sera visible dans le catalogue après validation par notre équipe.</p>
      <p class="muted small" data-for="company">Vous pourrez publier des demandes de devis dès que notre équipe aura validé votre compte (vous pouvez déjà consulter le catalogue).</p>
      <button class="btn btn-accent btn-block">Créer mon compte</button>
    </form>`;

  const setMode = m => {
    $$("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    $$("[data-m]").forEach(f => (f.hidden = f.dataset.m !== m));
  };
  $$("[data-mode]").forEach(b => (b.onclick = () => setMode(b.dataset.mode)));
  setMode(mode);

  const lf = $("#loginForm");
  lf.onsubmit = async e => {
    e.preventDefault();
    const v = formData(lf);
    const btn = lf.querySelector("button.btn-primary"); busy(btn, true);
    try {
      await signInWithEmailAndPassword(auth, v.email, v.password);
      const { profile: p } = await currentUser();
      if (!p) location.replace("connexion.html?complete=1"); else goHome(p.role);
    } catch (err) { toast(errMsg(err), "err"); busy(btn, false); }
  };
  $("#forgot").onclick = async () => {
    const email = lf.email.value.trim();
    if (!email) return toast("Saisissez d'abord votre e-mail.", "err");
    try { await sendPasswordResetEmail(auth, email); toast("Un e-mail de réinitialisation vous a été envoyé."); }
    catch (err) { toast(errMsg(err), "err"); }
  };

  const rf = $("#registerForm");
  rf.onchange = () => toggleRole(rf); toggleRole(rf);
  rf.onsubmit = async e => {
    e.preventDefault();
    const v = formData(rf);
    if (!validRegister(v)) return;
    const btn = rf.querySelector("button.btn-accent"); busy(btn, true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, v.email, v.password);
      await updateProfile(cred.user, { displayName: v.contactName }).catch(() => {});
      await createProfile(cred.user, v);
      goHome(v.role);
    } catch (err) { toast(errMsg(err), "err"); busy(btn, false); }
  };
}

init();
