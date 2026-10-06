/* =========================================================
   Configuration de la plateforme
   1. Collez ici la configuration de votre projet Firebase
      (Console Firebase → Paramètres du projet → Vos applications → Application Web).
   2. Adaptez le nom, les devises et les catégories par défaut.
   ========================================================= */

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBh8g0scV5MbOJ7jzP6Ntk0HXeEoy5B0bI",
  authDomain: "b2babidjan.firebaseapp.com",
  projectId: "b2babidjan",
  storageBucket: "b2babidjan.firebasestorage.app",
  messagingSenderId: "885066302128",
  appId: "1:885066302128:web:b5c40d093c63bc07547175",
};

// Développement local avec les émulateurs Firebase (npm run dev) : ouvrir http://localhost:5000/?emu
// (le mode reste actif pour l'onglet ; ?emu=0 pour revenir au vrai projet)
export const USE_EMULATORS = (() => {
  if (!["localhost", "127.0.0.1"].includes(location.hostname)) return false;
  const p = new URLSearchParams(location.search).get("emu");
  try { if (p !== null) sessionStorage.setItem("emu", p === "0" ? "" : "1"); return !!sessionStorage.getItem("emu"); }
  catch (e) { return p !== null && p !== "0"; }
})();

export const APP = {
  name: "B2B Connect",
  tagline: "La plateforme qui relie les entreprises et les fournisseurs.",
  contactEmail: "contact@exemple.com",
  currencies: ["FCFA", "EUR", "USD", "GHS", "NGN", "MAD", "TND"],
};

// Catégories proposées tant que l'administrateur n'en a pas défini d'autres (onglet « Catégories » de l'admin)
export const DEFAULT_CATEGORIES = [
  "Matières premières",
  "Emballage",
  "Industrie & équipements",
  "Pièces détachées",
  "BTP & matériaux",
  "Agriculture & élevage",
  "Agroalimentaire",
  "Chimie & plastiques",
  "Textile",
  "Électricité & électronique",
  "Informatique & logiciels",
  "Fournitures de bureau",
  "Transport & logistique",
  "Énergie",
  "Nettoyage & hygiène",
  "Sécurité",
  "Marketing & impression",
  "Services aux entreprises",
];
