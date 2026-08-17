// @ts-check
// URL・入力値の安全な検証(指示書66: 負値/NaN/0/巨大値/不正文字への対応)

export const BUDGET_MIN = 2_000;
export const BUDGET_MAX = 2_000_000;

/**
 * 予算値のパース。数値以外・範囲外は null。
 * "72,000" / "72000円" のような軽い揺れは許容する。
 * @param {string | number | null | undefined} raw
 * @returns {number | null}
 */
export function parseBudget(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[,，円\s]/g, "");
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  if (n < BUDGET_MIN || n > BUDGET_MAX) return null;
  return n;
}

/**
 * 遷移元パラメータの検証(想定値のみ通す)。
 * @param {string | null} raw
 * @returns {"calculator" | null}
 */
export function parseSource(raw) {
  return raw === "calculator" ? "calculator" : null;
}

/**
 * 年収入力(万円)の検証。0〜100,000万円(=10億円)まで。
 * @param {string | number | null | undefined} raw
 * @returns {number | null} 円換算した値
 */
export function parseSalaryMan(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[,，\s]/g, "");
  if (!/^\d{1,6}$/.test(s)) return null;
  const man = Number(s);
  if (man <= 0 || man > 100_000) return null;
  return man * 10_000;
}

/** 0〜9の人数入力 @param {string | number | null | undefined} raw */
export function parseCount(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 9) return 0;
  return n;
}
