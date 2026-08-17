// @ts-check
// お気に入り・ガチャ履歴の保存(ログイン不要・端末内localStorageのみ)。
// プライベートブラウズ等で使えない環境でも落ちないよう全て安全に包む。

/** @typedef {import("./types.js").Municipality} Municipality */
/** @typedef {import("./types.js").Product} Product */

const KEYS = {
  favMunis: "furugacha:fav:munis:v1",
  favProducts: "furugacha:fav:products:v1",
  gachaHistory: "furugacha:history:gacha:v1",
  budgetHistory: "furugacha:history:budget:v1"
};
const HISTORY_LIMIT = 50;
const FAV_LIMIT = 100;

/** @type {Storage | null} */
let store = null;
try {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("furugacha:probe", "1");
    localStorage.removeItem("furugacha:probe");
    store = localStorage;
  }
} catch { store = null; }

export function storageAvailable() { return store != null; }

/** @param {string} key @returns {any[]} */
function read(key) {
  if (!store) return [];
  try {
    const v = JSON.parse(store.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
/** @param {string} key @param {any[]} value */
function write(key, value) {
  if (!store) return;
  try { store.setItem(key, JSON.stringify(value)); } catch { /* 容量超過等は無視 */ }
}

// ---- お気に入り: 自治体 ----
export function favMunicipalities() { return /** @type {Municipality[]} */ (read(KEYS.favMunis)); }
/** @param {Municipality} m */
export function isFavMunicipality(m) { return favMunicipalities().some((x) => x.municipalityCode === m.municipalityCode); }
/** @param {Municipality} m @returns {boolean} 追加後の状態 */
export function toggleFavMunicipality(m) {
  const list = favMunicipalities();
  const i = list.findIndex((x) => x.municipalityCode === m.municipalityCode);
  if (i >= 0) { list.splice(i, 1); write(KEYS.favMunis, list); return false; }
  list.unshift(m);
  write(KEYS.favMunis, list.slice(0, FAV_LIMIT));
  return true;
}

// ---- お気に入り: 返礼品 ----
export function favProducts() { return /** @type {Product[]} */ (read(KEYS.favProducts)); }
/** @param {Product} p */
export function isFavProduct(p) { return favProducts().some((x) => x.id === p.id); }
/** @param {Product} p @returns {boolean} */
export function toggleFavProduct(p) {
  const list = favProducts();
  const i = list.findIndex((x) => x.id === p.id);
  if (i >= 0) { list.splice(i, 1); write(KEYS.favProducts, list); return false; }
  list.unshift(p);
  write(KEYS.favProducts, list.slice(0, FAV_LIMIT));
  return true;
}

// ---- 履歴 ----
/** @param {{scopeLabel:string, municipality:Municipality}} entry */
export function pushGachaHistory(entry) {
  const list = read(KEYS.gachaHistory);
  list.unshift({ ...entry, ts: Date.now() });
  write(KEYS.gachaHistory, list.slice(0, HISTORY_LIMIT));
}
export function gachaHistory() { return read(KEYS.gachaHistory); }

/** @param {{budget:number, categoryLabel:string, total:number, count:number}} entry */
export function pushBudgetHistory(entry) {
  const list = read(KEYS.budgetHistory);
  list.unshift({ ...entry, ts: Date.now() });
  write(KEYS.budgetHistory, list.slice(0, HISTORY_LIMIT));
}
export function budgetHistory() { return read(KEYS.budgetHistory); }

export function clearHistory() { write(KEYS.gachaHistory, []); write(KEYS.budgetHistory, []); }
