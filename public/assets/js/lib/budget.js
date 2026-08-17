// @ts-check
// サブ機能: 予算おまかせガチャの組み合わせロジック(DOM非依存)
// 方針(指示書56): 総当たりせず「シャッフル→予算内で追加→残額再探索」を複数回試し、良い候補を採用。

/** @typedef {import("./types.js").Product} Product */

/**
 * @typedef {Object} BudgetSet
 * @property {Product[]} items
 * @property {number} total
 * @property {number} remaining
 */

/**
 * Fisher–Yates シャッフル(非破壊)
 * @template T @param {T[]} arr @param {() => number} rng @returns {T[]}
 */
export function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]; a[i] = /** @type {any} */ (a[j]); a[j] = /** @type {any} */ (tmp);
  }
  return a;
}

/**
 * 1パターン生成: 予算を超えない範囲で貪欲に追加。
 * 同一商品は入れない。同一自治体の偏りには軽いペナルティ(確率的スキップ)をかける。
 * @param {Product[]} candidates
 * @param {number} budget
 * @param {number} maxItems
 * @param {() => number} rng
 * @returns {BudgetSet}
 */
function buildOne(candidates, budget, maxItems, rng) {
  /** @type {Product[]} */
  const picked = [];
  const usedIds = new Set();
  const usedMunis = new Map();
  let remaining = budget;

  const pool = shuffled(candidates, rng);
  for (let pass = 0; pass < 2 && picked.length < maxItems; pass++) {
    for (const p of pool) {
      if (picked.length >= maxItems) break;
      if (p.amount > remaining) continue;
      if (usedIds.has(p.id)) continue;
      const muniCount = usedMunis.get(p.municipality) ?? 0;
      // 同一自治体2件目以降は確率的に見送り(1パス目のみ)。複雑化させないための軽い分散策。
      if (pass === 0 && muniCount >= 1 && rng() < 0.7) continue;
      picked.push(p);
      usedIds.add(p.id);
      usedMunis.set(p.municipality, muniCount + 1);
      remaining -= p.amount;
    }
  }
  return { items: picked, total: budget - remaining, remaining };
}

/**
 * 予算おまかせガチャ本体。複数パターンを生成し、
 * 「予算消化率が高く」「自治体がばらけている」候補を採用する。
 * 指定予算は決して超えない。
 * @param {Product[]} candidates 条件(カテゴリ等)で絞り込み済みの候補
 * @param {number} budget 予算(円)
 * @param {{maxItems?:number, attempts?:number, rng?:() => number}} [opts]
 * @returns {BudgetSet}
 */
export function generateBudgetSet(candidates, budget, opts = {}) {
  const { maxItems = 6, attempts = 10, rng = Math.random } = opts;
  const valid = candidates.filter((p) => Number.isFinite(p.amount) && p.amount > 0 && p.amount <= budget);
  if (valid.length === 0) return { items: [], total: 0, remaining: budget };

  /** @type {BudgetSet | null} */
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < attempts; i++) {
    const set = buildOne(valid, budget, maxItems, rng);
    if (set.items.length === 0) continue;
    const muniVariety = new Set(set.items.map((p) => p.municipality)).size;
    // 予算消化率を主軸に、自治体の多様性を加点。品数過多は軽く減点。
    const score = set.total / budget + muniVariety * 0.03 - set.items.length * 0.005;
    if (score > bestScore) { bestScore = score; best = set; }
  }
  return best ?? { items: [], total: 0, remaining: budget };
}
