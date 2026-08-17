// @ts-check
/** @typedef {import("./types.js").Municipality} Municipality */

/** @param {Municipality} m */
export function shareText(m) {
  return `ふるガチャを回したら、今年の運命の自治体は${m.prefecture}${m.municipality}でした🎰 #ふるガチャ`;
}
/** @param {Municipality} m */
export function shareUrl(m) {
  const u = new URL("/gacha/", location.origin);
  u.searchParams.set("code", m.municipalityCode);
  return u.toString();
}
/**
 * Web Share API → 失敗時はクリップボード。
 * @param {Municipality} m
 * @returns {Promise<"shared"|"copied"|"failed">}
 */
export async function shareResult(m) {
  const text = shareText(m);
  const url = shareUrl(m);
  if (navigator.share) {
    try { await navigator.share({ text, url }); return "shared"; }
    catch { /* キャンセル等 → フォールバックへ */ }
  }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); return "copied"; }
  catch { return "failed"; }
}
