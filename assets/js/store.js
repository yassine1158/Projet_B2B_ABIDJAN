/* Cache local (localStorage) : les pages s'affichent tout de suite avec les dernières données connues,
   puis se mettent à jour dès que le serveur répond (« stale-while-revalidate »). */
const P = "b2b:";

export function readCache(key) {
  try { const v = localStorage.getItem(P + key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
export function writeCache(key, value) {
  try { localStorage.setItem(P + key, JSON.stringify(value)); } catch (e) { /* stockage plein ou bloqué */ }
}
export function clearCache() {
  try { Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignoré */ }
}

/**
 * Affiche d'abord la version en cache (si elle existe), puis la version du serveur si elle a changé.
 * Les données passent toujours par JSON : même forme qu'elles viennent du cache ou du serveur.
 * @returns la version du serveur
 */
export async function swr(key, fetcher, render) {
  const cached = readCache(key);
  if (cached !== null) render(cached, true);
  const fresh = JSON.parse(JSON.stringify(await fetcher()));
  if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
    writeCache(key, fresh);
    render(fresh, false);
  }
  return fresh;
}
