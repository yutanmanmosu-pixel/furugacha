// @ts-check
/** 金額表示 @param {number} n */
export function yen(n) { return `${Math.floor(n).toLocaleString("ja-JP")}円`; }
/** @param {string} s */
export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c
  ));
}
