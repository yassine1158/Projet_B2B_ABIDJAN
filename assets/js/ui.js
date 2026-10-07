/* Petits utilitaires d'interface partagés par toutes les pages */
import { APP } from "./config.js";

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function fmtDate(v) {
  if (!v) return "—";
  // Timestamp Firestore, ou sa version en cache { seconds, nanoseconds }, ou date texte
  const d = v.toDate ? v.toDate() : v.seconds != null ? new Date(v.seconds * 1000) : new Date(v);
  return isNaN(d) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtMoney(n, cur) {
  if (n === null || n === undefined || n === "") return "—";
  return Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 3 }) + " " + (cur || "");
}

export const byDateDesc = (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);

export function toast(msg, type = "ok") {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; box.className = "toasts"; box.setAttribute("role", "status"); document.body.append(box); }
  const t = document.createElement("div");
  t.className = "toast toast-" + type;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), 4500);
}

/** Ouvre une fenêtre modale ; renvoie l'élément <dialog>. */
export function modal(title, html, { wide = false } = {}) {
  const dlg = document.createElement("dialog");
  dlg.className = "modal" + (wide ? " modal-wide" : "");
  dlg.innerHTML = `<div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="modal-x" aria-label="Fermer">×</button></div><div class="modal-body">${html}</div>`;
  document.body.append(dlg);
  dlg.querySelector(".modal-x").onclick = () => dlg.close();
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  dlg.showModal();
  return dlg;
}

export function confirmBox(text) {
  return new Promise(resolve => {
    const dlg = modal("Confirmation", `<p>${esc(text)}</p><div class="form-actions"><button class="btn btn-ghost" data-no>Annuler</button><button class="btn btn-primary" data-yes>Confirmer</button></div>`);
    let ok = false;
    dlg.querySelector("[data-yes]").onclick = () => { ok = true; dlg.close(); };
    dlg.querySelector("[data-no]").onclick = () => dlg.close();
    dlg.addEventListener("close", () => resolve(ok));
  });
}

/** Valeurs d'un formulaire ; les champs multiples (cases à cocher) deviennent des tableaux. */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === "checkbox") { (out[el.name] ||= []); if (el.checked) out[el.name].push(el.value); continue; }
    if (el.type === "radio") { if (el.checked) out[el.name] = el.value; continue; }
    out[el.name] = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value.trim();
  }
  return out;
}

export function busy(btn, on, label = "Patientez…") {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.textContent = label; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

export const options = (list, selected) => list.map(v => `<option${v === selected ? " selected" : ""}>${esc(v)}</option>`).join("");

export const empty = (text, action = "") => `<div class="empty"><p>${esc(text)}</p>${action}</div>`;

export const badge = (status) => {
  const map = {
    pending: ["En attente", "warn"], approved: ["Validé", "ok"], suspended: ["Suspendu", "danger"],
    open: ["Ouverte", "ok"], closed: ["Fermée", "muted"], awarded: ["Attribuée", "info"],
    accepted: ["Acceptée", "ok"], rejected: ["Refusée", "danger"],
  };
  const [label, cls] = map[status] || [status, "muted"];
  return `<span class="badge badge-${cls}">${esc(label)}</span>`;
};

/** Onglets d'un espace : boutons [data-tab] et panneaux [data-panel] ; l'onglet actif est gardé dans l'URL (#onglet). */
export function tabs(onChange) {
  const show = name => {
    const btn = $(`[data-tab="${name}"]`) || $("[data-tab]");
    name = btn.dataset.tab;
    $$("[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b === btn)));
    $$("[data-panel]").forEach(p => (p.hidden = p.dataset.panel !== name));
    history.replaceState(null, "", "#" + name);
    onChange && onChange(name);
  };
  $$("[data-tab]").forEach(b => (b.onclick = () => show(b.dataset.tab)));
  show(location.hash.slice(1));
  return show;
}

/** Nom de la plateforme dans les éléments [data-app-name] et le pied de page. */
export function brand() {
  $$("[data-app-name]").forEach(el => (el.textContent = APP.name));
  $$("[data-app-tagline]").forEach(el => (el.textContent = APP.tagline));
  $$("[data-year]").forEach(el => (el.textContent = new Date().getFullYear()));
  $$("[data-contact]").forEach(el => { el.textContent = APP.contactEmail; el.href = "mailto:" + APP.contactEmail; });
  document.title = document.title.replace("{app}", APP.name);
  const toggle = $("#navToggle");
  if (toggle) toggle.onclick = () => { const open = document.body.classList.toggle("nav-open"); toggle.setAttribute("aria-expanded", String(open)); };
}

export function notConfigured(container) {
  container.innerHTML = `<div class="notice notice-warn"><strong>Firebase n'est pas encore configuré.</strong> Renseignez votre configuration dans <code>assets/js/config.js</code> (voir le README).</div>`;
}

/** Télécharge un fichier CSV (séparateur « ; » et BOM UTF-8 : s'ouvre directement dans Excel). */
export function downloadCSV(filename, rows) {
  const cell = v => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = "﻿" + rows.map(r => r.map(cell).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Étoiles de notation (note sur 5) */
export function stars(avg, count) {
  if (!count) return `<span class="stars muted small">Pas encore d'avis</span>`;
  const full = Math.round(avg);
  return `<span class="stars" title="${avg.toFixed(1)} / 5">${"★".repeat(full)}<i>${"★".repeat(5 - full)}</i> <small>${avg.toFixed(1)} (${count} avis)</small></span>`;
}

/** Moyennes des avis par fournisseur : { [supplierId]: { avg, count } } */
export function ratingsBySupplier(reviews) {
  const out = {};
  for (const r of reviews) { const o = (out[r.supplierId] ||= { sum: 0, count: 0 }); o.sum += r.rating; o.count++; }
  for (const k in out) out[k].avg = out[k].sum / out[k].count;
  return out;
}

/** Échéance d'une demande : libellé court et style (expirée, aujourd'hui, J-n) */
export function deadline(dateStr) {
  if (!dateStr) return { label: "—", cls: "muted" };
  const d = new Date(dateStr + "T23:59:59"), days = Math.ceil((d - Date.now()) / 86400000);
  if (days < 0) return { label: "Expirée", cls: "danger" };
  if (days === 0) return { label: "Aujourd'hui", cls: "warn" };
  if (days <= 3) return { label: `J-${days}`, cls: "warn" };
  return { label: `J-${days}`, cls: "muted" };
}

/** Taux de remplissage d'une fiche : { pct, missing: [libellés] } */
export function completeness(obj, fields) {
  const missing = fields.filter(([k]) => { const v = obj[k]; return Array.isArray(v) ? !v.length : !String(v ?? "").trim(); }).map(([, label]) => label);
  return { pct: Math.round(100 * (fields.length - missing.length) / fields.length), missing };
}

export function completenessCard(c, tabName) {
  if (c.pct >= 100) return "";
  return `<div class="card complete-card"><div class="complete-head"><b>Fiche complétée à ${c.pct} %</b><button class="link" data-goto="${tabName}">Compléter →</button></div>
    <div class="progress"><i style="width:${c.pct}%"></i></div>
    <p class="muted small">À ajouter : ${c.missing.map(esc).join(", ")}. Une fiche complète inspire confiance et reçoit plus de réponses.</p></div>`;
}
