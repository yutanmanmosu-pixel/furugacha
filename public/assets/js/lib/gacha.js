// @ts-check
// メイン機能: 自治体ガチャの純粋ロジック(DOM非依存・テスト可能)
import { regionBySlug, prefBySlug } from "./regions.js";

/** @typedef {import("./types.js").Municipality} Municipality */
/** @typedef {import("./types.js").GachaScope} GachaScope */

/**
 * ガチャ範囲で自治体を絞り込む。
 * @param {Municipality[]} all
 * @param {GachaScope} scope
 * @returns {Municipality[]}
 */
export function filterByScope(all, scope) {
  if (scope.type === "all") return all.slice();
  if (scope.type === "region") {
    const region = regionBySlug(scope.slug);
    if (!region) return [];
    return all.filter((m) => region.prefs.includes(m.prefecture));
  }
  const pref = prefBySlug(scope.slug);
  if (!pref) return [];
  return all.filter((m) => m.prefecture === pref.name);
}

/**
 * 抽選: 範囲内から1自治体をランダムに選ぶ。
 * @param {Municipality[]} all
 * @param {GachaScope} scope
 * @param {() => number} [rng]
 * @returns {Municipality | null}
 */
export function drawMunicipality(all, scope, rng = Math.random) {
  const pool = filterByScope(all, scope);
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}

/**
 * 範囲の表示名 (例: "全国" / "東北" / "福岡県")
 * @param {GachaScope} scope
 */
export function scopeLabel(scope) {
  if (scope.type === "all") return "全国";
  if (scope.type === "region") return regionBySlug(scope.slug)?.name ?? "全国";
  return prefBySlug(scope.slug)?.name ?? "全国";
}

/**
 * URLクエリ → ガチャ範囲。無効値は全国にフォールバック。
 * @param {URLSearchParams} params
 * @returns {GachaScope}
 */
export function scopeFromParams(params) {
  const p = params.get("prefecture");
  if (p && prefBySlug(p)) return { type: "prefecture", slug: p };
  const r = params.get("region");
  if (r && regionBySlug(r)) return { type: "region", slug: r };
  return { type: "all" };
}

/**
 * ガチャ範囲 → URLクエリ文字列("?"なし。全国なら空文字)。
 * @param {GachaScope} scope
 */
export function scopeToQuery(scope) {
  if (scope.type === "region") return `region=${scope.slug}`;
  if (scope.type === "prefecture") return `prefecture=${scope.slug}`;
  return "";
}

/**
 * 演出用: ルーレットで高速表示する自治体名の並び(最後が当選自治体)。
 * @param {Municipality[]} pool
 * @param {Municipality} winner
 * @param {number} steps
 * @param {() => number} [rng]
 * @returns {string[]}
 */
export function rouletteNames(pool, winner, steps = 24, rng = Math.random) {
  const names = [];
  for (let i = 0; i < Math.max(steps - 1, 0); i++) {
    const m = pool[Math.floor(rng() * pool.length)];
    if (m) names.push(m.municipality);
  }
  names.push(winner.municipality);
  return names;
}
