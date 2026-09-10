// @ts-check
// 共有結果ページの状態(=抽選結果そのもの)をURLに載せて往復させる。
//
// 方針: 別端末・未ログインでも同じ結果を開けることが要件なので、端末内(localStorage /
// sessionStorage)には置かない。一方で新しい保存基盤(KV等)を足さずに済むよう、
// 【再現に必要な最小限の識別子だけ】をURLに入れる:
//   ・自治体ガチャ … 抽選時の範囲 + 自治体コード6桁(自治体名は同梱のマスタから引く)
//   ・予算ガチャ  … 予算・カテゴリ・楽天のitemCodeと共有時点の寄附額
// 商品名・画像・リンクはURLに入れない。閲覧時にサーバー(/api/share-items)が
// itemCode で楽天APIに問い合わせ、正規の商品情報とアフィリエイトURLを取得する。
// (クライアントから渡されたURLをそのまま楽天リンクとして出さないため)
//
// 有効期限: 寄附額・在庫は変動し、楽天のデータを長期に保持し続けない方針のため、
// 共有日(日単位)を持たせて SHARE_TTL_DAYS を過ぎたら期限切れ表示に切り替える。

import { regionBySlug, prefBySlug } from "./regions.js";
import { BUDGET_MIN, BUDGET_MAX } from "./validate.js";

/** @typedef {import("./types.js").GachaScope} GachaScope */

/** 共有リンクの有効期限(日)。寄附額・在庫の変動と楽天データの保持方針から30日。 */
export const SHARE_TTL_DAYS = 30;
const DAY_MS = 86_400_000;

/** 予算ガチャの共有に載せる最大点数(結果の最大点数と一致させる) */
export const SHARE_MAX_ITEMS = 5;
/** 楽天のitemCodeの形(shop:itemid)。これ以外は受け付けない。 */
const ITEM_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}:[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CATEGORIES = new Set(["random", "food", "life", "travel"]);

/** 共有日(1970-01-01からの日数)。時刻は持たない(必要以上の情報を残さない)。 @param {number} [now] */
export function shareStamp(now = Date.now()) {
  return Math.floor(now / DAY_MS);
}

/**
 * クエリの共有日を数値にする。未指定・数字以外は null(= URLとして壊れている)。
 * Number(null) が 0 になる罠を避ける("期限切れ"と"壊れたURL"を取り違えないため)。
 * @param {string | null} raw
 * @returns {number | null}
 */
function parseStamp(raw) {
  if (raw == null || !/^\d{1,7}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** @param {number} stamp @param {number} [now] */
export function isExpired(stamp, now = Date.now()) {
  if (!Number.isInteger(stamp) || stamp <= 0) return true;
  const age = shareStamp(now) - stamp;
  return age < 0 || age > SHARE_TTL_DAYS;
}

/** 共有日 → 表示用の日付(YYYY/M/D) @param {number} stamp */
export function stampToDate(stamp) {
  const d = new Date(stamp * DAY_MS);
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/* ---------------- 自治体ガチャ ---------------- */

/**
 * @param {{scope: GachaScope, municipalityCode: string, stamp?: number}} r
 * @returns {string} "?" から始まるクエリ
 */
export function gachaShareQuery(r) {
  const p = new URLSearchParams();
  p.set("code", r.municipalityCode);
  if (r.scope.type === "region") p.set("region", r.scope.slug);
  else if (r.scope.type === "prefecture") p.set("prefecture", r.scope.slug);
  p.set("t", String(r.stamp ?? shareStamp()));
  return `?${p.toString()}`;
}

/**
 * 共有URLの復元。範囲は【抽選時のもの】をそのまま復元する
 * (当選県で上書きしない。全国抽選なら全国のまま)。
 * @param {URLSearchParams} params
 * @param {number} [now]
 * @returns {{ok:true, scope:GachaScope, municipalityCode:string, stamp:number}
 *          | {ok:false, reason:"invalid"|"expired"}}
 */
export function parseGachaShare(params, now = Date.now()) {
  const code = params.get("code") ?? "";
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "invalid" };
  const stamp = parseStamp(params.get("t"));
  if (stamp == null) return { ok: false, reason: "invalid" };

  /** @type {GachaScope} */
  let scope = { type: "all" };
  const pref = params.get("prefecture");
  const region = params.get("region");
  if (pref) {
    if (!prefBySlug(pref)) return { ok: false, reason: "invalid" };
    scope = { type: "prefecture", slug: pref };
  } else if (region) {
    if (!regionBySlug(region)) return { ok: false, reason: "invalid" };
    scope = { type: "region", slug: region };
  }
  // 期限判定は形の検証が通ってから(壊れたURLを期限切れと誤って案内しない)
  if (isExpired(stamp, now)) return { ok: false, reason: "expired" };
  return { ok: true, scope, municipalityCode: code, stamp };
}

/* ---------------- 予算おまかせガチャ ---------------- */

/**
 * @param {{budget:number, category:string, items:{code:string, amount:number}[], stamp?:number}} r
 * @returns {string} "?" から始まるクエリ
 */
export function budgetShareQuery(r) {
  const p = new URLSearchParams();
  p.set("b", String(r.budget));
  p.set("c", r.category);
  p.set("i", r.items.slice(0, SHARE_MAX_ITEMS).map((it) => `${it.code}~${it.amount}`).join(","));
  p.set("t", String(r.stamp ?? shareStamp()));
  return `?${p.toString()}`;
}

/**
 * @param {URLSearchParams} params
 * @param {number} [now]
 * @returns {{ok:true, budget:number, category:string, items:{code:string, amount:number}[],
 *            total:number, remaining:number, stamp:number}
 *          | {ok:false, reason:"invalid"|"expired"}}
 */
export function parseBudgetShare(params, now = Date.now()) {
  const budget = Number(params.get("b"));
  if (!Number.isInteger(budget) || budget < BUDGET_MIN || budget > BUDGET_MAX) return { ok: false, reason: "invalid" };
  const category = params.get("c") ?? "";
  if (!CATEGORIES.has(category)) return { ok: false, reason: "invalid" };
  const stamp = parseStamp(params.get("t"));
  if (stamp == null) return { ok: false, reason: "invalid" };

  const raw = (params.get("i") ?? "").split(",").filter(Boolean);
  if (raw.length === 0 || raw.length > SHARE_MAX_ITEMS) return { ok: false, reason: "invalid" };
  /** @type {{code:string, amount:number}[]} */
  const items = [];
  for (const part of raw) {
    const sep = part.lastIndexOf("~");
    if (sep <= 0) return { ok: false, reason: "invalid" };
    const code = part.slice(0, sep);
    const amount = Number(part.slice(sep + 1));
    if (!ITEM_CODE_RE.test(code)) return { ok: false, reason: "invalid" };
    if (!Number.isInteger(amount) || amount <= 0 || amount > BUDGET_MAX) return { ok: false, reason: "invalid" };
    items.push({ code, amount });
  }
  const total = items.reduce((s, it) => s + it.amount, 0);
  if (total > budget) return { ok: false, reason: "invalid" }; // 予算超過は「予算を超えない」保証と矛盾する
  // 期限判定は形の検証が通ってから(壊れたURLを期限切れと誤って案内しない)
  if (isExpired(stamp, now)) return { ok: false, reason: "expired" };
  return { ok: true, budget, category, items, total, remaining: budget - total, stamp };
}

/** サーバーへ渡す前のitemCode検証(APIと同じ規則をクライアント側でも使う) @param {string} code */
export function isValidItemCode(code) {
  return ITEM_CODE_RE.test(code);
}
