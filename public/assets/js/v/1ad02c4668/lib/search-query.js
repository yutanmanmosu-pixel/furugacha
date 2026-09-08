// @ts-check
// 返礼品キーワード検索の入力正規化(純関数)。サーバー側の制限(functions/api/products.js)と一致させる。

export const SEARCH_QUERY_MAX = 50;

/**
 * @param {unknown} raw
 * @returns {{ ok: true, q: string } | { ok: false, q: string, reason: "empty" | "too_long" }}
 */
export function normalizeSearchQuery(raw) {
  const q = String(raw ?? "").trim();
  if (!q) return { ok: false, q: "", reason: "empty" };
  if (q.length > SEARCH_QUERY_MAX) return { ok: false, q, reason: "too_long" };
  return { ok: true, q };
}
