/* Effets de la page d'accueil : apparitions, compteurs, mots qui tournent, carte animée, inclinaison 3D, boutons magnétiques */
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = matchMedia("(pointer: fine)").matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// En-tête opaque après le hero
const header = $("#siteHeader");
const onScroll = () => header && header.classList.toggle("scrolled", scrollY > 40);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Montant en FCFA qui défile jusqu'à sa valeur
const fcfa = n => Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ") + " FCFA";
function countTo(el, to, ms = 1400, fmt = n => Math.round(n).toLocaleString("fr-FR")) {
  if (reduce) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = t => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Apparitions au défilement (+ déclencheurs : carte, compteurs, offres)
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add("in");
    io.unobserve(e.target);
    $$("[data-count]", e.target).forEach(c => countTo(c, +c.dataset.count));
  }
}, { threshold: .18, rootMargin: "0px 0px -6% 0px" });
$$(".reveal, .map-wrap").forEach(el => io.observe(el));

// Carte « demande de devis » : les offres arrivent une à une
const deal = $("#deal");
if (deal) {
  setTimeout(() => {
    deal.classList.add("play");
    $$(".amt", deal).forEach((a, i) => setTimeout(() => countTo(a, +a.dataset.to, 1100, fcfa), reduce ? 0 : 300 + i * 550));
  }, reduce ? 0 : 700);
}

// Mot qui tourne dans le titre
const rot = $("#rotator");
const WORDS = ["cacao & café", "BTP", "emballage", "logistique", "anacarde", "agro-industrie", "informatique"];
if (rot && !reduce) {
  let i = 0;
  setInterval(() => {
    const cur = rot.firstElementChild;
    i = (i + 1) % WORDS.length;
    const next = document.createElement("span");
    next.textContent = WORDS[i];
    next.className = "rot-in";
    cur.className = "rot-out";
    rot.append(next);
    setTimeout(() => cur.remove(), 460);
  }, 2600);
}

// Onglets Entreprise / Fournisseur de « Comment ça marche »
$$("[data-how]").forEach(b => (b.onclick = () => {
  $$("[data-how]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  $$("[data-how-panel]").forEach(p => {
    const show = p.dataset.howPanel === b.dataset.how;
    p.hidden = !show;
    if (show) { p.classList.remove("swap"); void p.offsetWidth; p.classList.add("swap"); $$("li", p).forEach((li, k) => li.style.setProperty("--k", k)); }
  });
  const cta = $("#howCta");
  if (cta) cta.href = "connexion.html?role=" + b.dataset.how;
}));

if (fine && !reduce) {
  // Halo qui suit la souris dans le hero
  const hero = $("#hero");
  hero && hero.addEventListener("pointermove", e => {
    const r = hero.getBoundingClientRect();
    hero.style.setProperty("--mx", e.clientX - r.left + "px");
    hero.style.setProperty("--my", e.clientY - r.top + "px");
  });

  // Inclinaison 3D des cartes
  $$(".tilt").forEach(el => {
    el.addEventListener("pointermove", e => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      el.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateZ(0)`;
    });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });

  // Boutons magnétiques
  $$(".magnetic").forEach(el => {
    el.addEventListener("pointermove", e => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px, ${(e.clientY - r.top - r.height / 2) * .3}px)`;
    });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });
}
