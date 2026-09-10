// @ts-check
// サブ機能: 予算おまかせガチャの組み合わせロジック(DOM非依存)
// 方針(指示書56): 総当たりせず「シャッフル→予算内で追加→残額再探索」を複数回試し、良い候補を採用。

/** @typedef {import("./types.js").Product} Product */

/**
 * @typedef {Object} BudgetSet
 * @property {Product[]} items
 * @property {number} total
 * @property {number} remaining
 * @property {number} [pinnedCount] - 「残す」で固定されていた点数
 * @property {number} [pinnedTotal] - 固定分の合計額
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

/** 1回の提案で返す返礼品の上限(仕様: 6点以上は返さない) */
export const BUDGET_MAX_ITEMS = 5;
/** 点数指定UIを有効にする最低予算(円) */
export const BUDGET_COUNT_MIN_BUDGET = 10_000;
/** 総当たり探索に回す候補数の上限(C(24,5)=42,504通り程度で十分軽い) */
const SEARCH_POOL_SIZE = 24;

/**
 * 希望点数の正規化。予算10,000円未満・範囲外・非整数・NaN等は null(=おまかせ)。
 * @param {unknown} raw @param {number} budget
 * @returns {number | null}
 */
export function normalizeBudgetCount(raw, budget) {
  if (!Number.isFinite(budget) || budget < BUDGET_COUNT_MIN_BUDGET) return null;
  if (raw == null || raw === "" || raw === "auto") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > BUDGET_MAX_ITEMS) return null;
  return n;
}

/**
 * 探索用の候補サンプル: シャッフル後、自治体が重ならないものを先に採用してから残りを埋める
 * (毎回異なるサンプル→ガチャ性、かつ自治体の分散を促す)。
 * @param {Product[]} valid @param {() => number} rng
 */
function samplePool(valid, rng) {
  const pool = shuffled(valid, rng);
  if (pool.length <= SEARCH_POOL_SIZE) return pool;
  /** @type {Product[]} */
  const out = [];
  const seen = new Set();
  for (const p of pool) {
    if (out.length >= SEARCH_POOL_SIZE) break;
    if (seen.has(p.municipality)) continue;
    seen.add(p.municipality); out.push(p);
  }
  for (const p of pool) {
    if (out.length >= SEARCH_POOL_SIZE) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * サイズ k(1..maxItems) の組み合わせを予算内で列挙し visitor へ渡す(DFS・超過は枝刈り)。
 * @param {Product[]} pool 金額降順
 * @param {number} budget @param {number} maxItems
 * @param {(items: Product[], total: number) => void} visit
 */
function enumerate(pool, budget, maxItems, visit) {
  /** @type {Product[]} */
  const stack = [];
  /** @param {number} from @param {number} total */
  const dfs = (from, total) => {
    if (stack.length > 0) visit(stack.slice(), total);
    if (stack.length >= maxItems) return;
    for (let i = from; i < pool.length; i++) {
      const p = /** @type {Product} */ (pool[i]);
      if (total + p.amount > budget) continue; // 降順なので後続も超えるとは限らない(同額あり)→continue
      stack.push(p);
      dfs(i + 1, total + p.amount);
      stack.pop();
    }
  };
  dfs(0, 0);
}

/**
 * 「残す」で固定された返礼品の正規化。
 * 予算・点数・重複の不変条件をここで守る(壊れた入力が来ても組み合わせを壊さない)。
 * @param {Product[] | undefined} pinned @param {number} budget @param {number} maxItems
 * @returns {Product[]}
 */
function normalizePinned(pinned, budget, maxItems) {
  if (!Array.isArray(pinned) || pinned.length === 0) return [];
  const seen = new Set();
  /** @type {Product[]} */
  const out = [];
  let total = 0;
  for (const p of pinned) {
    if (!p || typeof p.id !== "string") continue;
    if (!Number.isFinite(p.amount) || p.amount <= 0) continue;
    if (seen.has(p.id)) continue;               // 同一IDの重複を作らない
    if (out.length >= maxItems) break;          // 全体で最大5点
    if (total + p.amount > budget) continue;    // 予算を絶対に超えない
    seen.add(p.id); out.push(p); total += p.amount;
  }
  return out;
}

/**
 * 予算おまかせガチャ本体(2026-09-07改訂: 最大5点・点数指定・予算最適化)。
 * 優先順位: ①予算を絶対に超えない ②指定点数(可能な範囲) ③合計を予算へ近づける
 *          ④同一商品なし ⑤ガチャとしてのランダム性(近似最良の中から抽選)。
 * @param {Product[]} candidates 条件(カテゴリ等)で絞り込み済みの候補
 * @param {number} budget 予算(円)
 * @param {{maxItems?:number, attempts?:number, count?:number|null, pinned?:Product[], rng?:() => number}} [opts]
 * @returns {BudgetSet}
 */
export function generateBudgetSet(candidates, budget, opts = {}) {
  const rng = opts.rng ?? Math.random;
  const maxItems = Math.max(1, Math.min(BUDGET_MAX_ITEMS, opts.maxItems ?? BUDGET_MAX_ITEMS));
  const empty = { items: [], total: 0, remaining: budget, pinnedCount: 0, pinnedTotal: 0 };
  if (!Number.isFinite(budget) || budget <= 0) return empty;

  // 「残す」で固定された返礼品。ここから先の探索は固定分を差し引いた残額・残枠で行う。
  const pinned = normalizePinned(opts.pinned, budget, maxItems);
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const pinnedTotal = pinned.reduce((sum, p) => sum + p.amount, 0);
  const restBudget = budget - pinnedTotal;
  const restMax = maxItems - pinned.length;
  // 点数指定は【固定分を含む全体】の点数。新しく選ぶのはその差分だけ。
  const requestedAll = opts.count != null && opts.count >= 1 && opts.count <= maxItems ? Math.floor(opts.count) : null;
  const restCount = requestedAll == null ? null : Math.max(0, requestedAll - pinned.length);
  /** 固定分だけを返す(引き直す枠・残額・指定点数のいずれかが尽きたとき) */
  const pinnedOnly = () => ({
    items: pinned.slice(), total: pinnedTotal, remaining: budget - pinnedTotal,
    pinnedCount: pinned.length, pinnedTotal
  });
  if (restMax <= 0 || restBudget <= 0 || restCount === 0) return pinnedOnly();

  // 残額内・重複IDなしの候補(固定済みは候補から外す = 同一商品の重複を防ぐ)
  const seenIds = new Set();
  /** @type {Product[]} */
  const valid = [];
  for (const p of candidates) {
    if (!Number.isFinite(p.amount) || p.amount <= 0 || p.amount > restBudget) continue;
    if (seenIds.has(p.id) || pinnedIds.has(p.id)) continue;
    seenIds.add(p.id); valid.push(p);
  }
  if (valid.length === 0) return pinned.length > 0 ? pinnedOnly() : empty;

  const pool = samplePool(valid, rng).sort((a, b) => b.amount - a.amount);
  const requested = restCount;

  // パス1: サイズ別の最良合計(残額・残枠のなかで)
  /** @type {number[]} */
  const bestBySize = new Array(restMax + 1).fill(-1);
  enumerate(pool, restBudget, restMax, (items, total) => {
    const k = items.length;
    if (total > (bestBySize[k] ?? -1)) bestBySize[k] = total;
  });

  // 採用サイズ: 指定点数 → 成立しなければ少ない点数へフォールバック。おまかせは全サイズ。
  /** @type {Set<number>} */
  let sizes = new Set();
  if (requested != null) {
    let k = requested;
    while (k >= 1 && (bestBySize[k] ?? -1) < 0) k--;
    if (k >= 1) sizes.add(k);
  } else {
    for (let k = 1; k <= restMax; k++) if ((bestBySize[k] ?? -1) >= 0) sizes.add(k);
  }
  // 残額では1点も追加できない場合でも、固定した返礼品は必ず残す
  if (sizes.size === 0) return pinned.length > 0 ? pinnedOnly() : empty;
  let bestTotal = -1;
  for (const k of sizes) bestTotal = Math.max(bestTotal, bestBySize[k] ?? -1);

  // パス2: 最良に近い組み合わせ(許容差: 予算の5%か500円の大きい方)を集め、
  //        自治体の多様性で並べたうえで上位から抽選する(=近似最良×ランダム)。
  const tolerance = Math.max(500, Math.round(restBudget * 0.05));
  /** @type {{items: Product[], total: number, score: number}[]} */
  const near = [];
  enumerate(pool, restBudget, restMax, (items, total) => {
    if (!sizes.has(items.length) || total < bestTotal - tolerance) return;
    const variety = new Set([...pinned, ...items].map((p) => p.municipality)).size;
    near.push({ items, total, score: total / restBudget + variety * 0.03 - items.length * 0.005 });
  });
  near.sort((a, b) => b.score - a.score);
  const top = near.slice(0, Math.min(near.length, 8));
  const chosen = top[Math.floor(rng() * top.length)] ?? top[0];
  if (!chosen) return pinned.length > 0 ? pinnedOnly() : empty;
  // 固定分を先頭に、引き直した分を後ろへ(固定分どうしの順序は維持する)
  const items = [...pinned, ...chosen.items];
  const total = pinnedTotal + chosen.total;
  return { items, total, remaining: budget - total, pinnedCount: pinned.length, pinnedTotal };
}
