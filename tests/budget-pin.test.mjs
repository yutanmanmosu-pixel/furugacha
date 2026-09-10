// @ts-check
// 「この返礼品を残す」で固定した返礼品を保持したまま引き直す機能の不変条件(2026-09-11)。
//
// 固定は予算上限に直接関わるので、文字列一致ではなく【組み合わせそのもの】を多数回検査する:
//   ・合計 ≤ 予算(固定分を含めて絶対に超えない)
//   ・全体で最大5点 / 同一商品IDの重複なし
//   ・固定した返礼品が消えたり入れ替わったりしない(ID・寄附額とも同じ)
//   ・点数指定は固定分を含む全体の点数
//   ・残額で追加できないときも固定分は残る
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateBudgetSet, BUDGET_MAX_ITEMS } from "../public/assets/js/lib/budget.js";

/** 決定的な乱数(結果を再現できるようにする) @param {number} seed */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {number} n @param {number} [seed] */
function pool(n, seed = 1) {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: `shop${i % 9}:item${i}`,
    municipality: `自治体${i % 11}`, prefecture: "県",
    title: `返礼品${i}`,
    amount: 2000 + Math.floor(rng() * 20) * 1000,
    productUrl: `https://item.rakuten.co.jp/x/${i}/`,
    isMock: false
  }));
}

/** 不変条件をまとめて確認 @param {any} set @param {number} budget @param {any[]} pinned @param {string} label */
function assertInvariants(set, budget, pinned, label) {
  assert.ok(set.total <= budget, `${label}: 合計が予算を超えた (${set.total}/${budget})`);
  assert.equal(set.total, set.items.reduce((s, p) => s + p.amount, 0), `${label}: totalが商品の合計と一致しない`);
  assert.equal(set.remaining, budget - set.total, `${label}: 残額が合わない`);
  assert.ok(set.items.length <= BUDGET_MAX_ITEMS, `${label}: 5点を超えた (${set.items.length})`);
  const ids = set.items.map((/** @type {any} */ p) => p.id);
  assert.equal(new Set(ids).size, ids.length, `${label}: 同一商品IDが重複した`);
  // 固定した返礼品は必ず、同じIDと同じ寄附額で残る
  for (const keep of pinned) {
    const found = set.items.find((/** @type {any} */ p) => p.id === keep.id);
    assert.ok(found, `${label}: 固定した ${keep.id} が消えた`);
    assert.equal(found.amount, keep.amount, `${label}: 固定した ${keep.id} の寄附額が変わった`);
  }
  // 固定分は先頭に、指定した順序のまま並ぶ
  assert.deepEqual(set.items.slice(0, pinned.length).map((/** @type {any} */ p) => p.id),
    pinned.map((p) => p.id), `${label}: 固定分の並びが変わった`);
}

test("固定0件: 従来どおり全商品を対象に選ぶ", () => {
  const cands = pool(40);
  for (let seed = 1; seed <= 30; seed++) {
    const set = generateBudgetSet(cands, 50000, { rng: mulberry32(seed) });
    assertInvariants(set, 50000, [], `seed${seed}`);
    assert.ok(set.items.length >= 1, "1点も選ばれない");
    assert.equal(set.pinnedCount, 0);
  }
});

test("固定1件・複数件: 固定分は必ず残り、残額の範囲で引き直す", () => {
  const cands = pool(40);
  for (const keepCount of [1, 2, 3]) {
    for (let seed = 1; seed <= 30; seed++) {
      const first = generateBudgetSet(cands, 60000, { rng: mulberry32(seed) });
      if (first.items.length < keepCount) continue;
      const pinned = first.items.slice(0, keepCount);
      const set = generateBudgetSet(cands, 60000, { pinned, rng: mulberry32(seed + 500) });
      assertInvariants(set, 60000, pinned, `keep${keepCount}/seed${seed}`);
      assert.equal(set.pinnedCount, pinned.length);
      assert.equal(set.pinnedTotal, pinned.reduce((s, p) => s + p.amount, 0));
      // 固定した商品が「引き直したぶん」に二重で現れない
      const rest = set.items.slice(pinned.length);
      for (const p of rest) {
        assert.ok(!pinned.some((k) => k.id === p.id), "固定商品が候補として再選択された");
      }
    }
  }
});

test("全件固定: 固定分だけが残り、勝手に増えない場合もある(点数指定つき)", () => {
  const cands = pool(40);
  const first = generateBudgetSet(cands, 50000, { count: 3, rng: mulberry32(7) });
  const pinned = first.items.slice();
  const set = generateBudgetSet(cands, 50000, { count: 3, pinned, rng: mulberry32(99) });
  assertInvariants(set, 50000, pinned, "全件固定");
  // 点数指定が固定分と同数なら、新たに足さない
  assert.equal(set.items.length, pinned.length, "指定点数を超えて追加された");
});

test("固定分が予算ちょうど: 追加せず、固定分だけを返す", () => {
  const cands = pool(40);
  const keep = [{ id: "a:1", municipality: "A", prefecture: "県", title: "x", amount: 30000, productUrl: "https://x", isMock: false },
                { id: "a:2", municipality: "B", prefecture: "県", title: "y", amount: 20000, productUrl: "https://y", isMock: false }];
  const set = generateBudgetSet(cands, 50000, { pinned: keep, rng: mulberry32(3) });
  assertInvariants(set, 50000, keep, "予算ちょうど");
  assert.equal(set.items.length, 2, "残額0なのに追加された");
  assert.equal(set.remaining, 0);
});

test("固定後の残額で候補が無い: 固定分は残し、予算超過やダミーで埋めない", () => {
  // 候補はすべて10,000円。残額が5,000円しかない状況を作る
  const cands = Array.from({ length: 20 }, (_, i) => ({
    id: `c:${i}`, municipality: `M${i}`, prefecture: "県", title: `t${i}`,
    amount: 10000, productUrl: "https://x", isMock: false
  }));
  const keep = [{ id: "keep:1", municipality: "K", prefecture: "県", title: "keep", amount: 45000, productUrl: "https://k", isMock: false }];
  const set = generateBudgetSet(cands, 50000, { pinned: keep, rng: mulberry32(5) });
  assertInvariants(set, 50000, keep, "残額不足");
  assert.equal(set.items.length, 1, "残額5,000円なのに10,000円の商品が追加された");
  assert.equal(set.remaining, 5000);
});

test("点数指定は固定分を含む全体の点数(例: 3点指定・1点固定 → 追加は最大2点)", () => {
  const cands = pool(60, 4);
  const keep = [{ id: "keep:1", municipality: "K", prefecture: "県", title: "keep", amount: 10000, productUrl: "https://k", isMock: false }];
  for (let seed = 1; seed <= 40; seed++) {
    const set = generateBudgetSet(cands, 50000, { count: 3, pinned: keep, rng: mulberry32(seed) });
    assertInvariants(set, 50000, keep, `count3/seed${seed}`);
    assert.ok(set.items.length <= 3, `全体で3点を超えた (${set.items.length})`);
  }
});

test("希望点数を満たせない場合でも、固定分は守られる", () => {
  // 候補が1件しかないので、5点指定でも埋まらない
  const cands = [{ id: "only:1", municipality: "O", prefecture: "県", title: "only", amount: 3000, productUrl: "https://o", isMock: false }];
  const keep = [{ id: "keep:1", municipality: "K", prefecture: "県", title: "keep", amount: 10000, productUrl: "https://k", isMock: false }];
  const set = generateBudgetSet(cands, 50000, { count: 5, pinned: keep, rng: mulberry32(11) });
  assertInvariants(set, 50000, keep, "点数不足");
  assert.ok(set.items.length < 5, "候補が足りないのに5点になった");
  assert.ok(set.items.length >= 1);
});

test("固定5点(上限): 追加されず、5点を超えない", () => {
  const cands = pool(40);
  const keep = Array.from({ length: BUDGET_MAX_ITEMS }, (_, i) => ({
    id: `keep:${i}`, municipality: `K${i}`, prefecture: "県", title: `k${i}`,
    amount: 5000, productUrl: "https://k", isMock: false
  }));
  const set = generateBudgetSet(cands, 100000, { pinned: keep, rng: mulberry32(13) });
  assertInvariants(set, 100000, keep, "5点固定");
  assert.equal(set.items.length, BUDGET_MAX_ITEMS);
});

test("壊れた固定入力(重複・0円・予算超過)は落として不変条件を守る", () => {
  const cands = pool(30);
  const dup = { id: "d:1", municipality: "D", prefecture: "県", title: "d", amount: 10000, productUrl: "https://d", isMock: false };
  const bad = [
    dup, { ...dup },                                                        // 同一IDの重複
    { ...dup, id: "d:2", amount: 0 },                                       // 0円
    { ...dup, id: "d:3", amount: 999999 },                                  // 単体で予算超過
    /** @type {any} */ (null)                                               // 不正な値
  ];
  const set = generateBudgetSet(cands, 50000, { pinned: bad, rng: mulberry32(17) });
  assert.ok(set.total <= 50000, "予算を超えた");
  const ids = set.items.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "重複が残った");
  assert.ok(!ids.includes("d:2") && !ids.includes("d:3"), "不正な固定が採用された");
  assert.equal(set.pinnedCount, 1, "有効な固定は1件のはず");
});

test("固定解除(pinnedを空にする)と、条件そのままの再抽選は従来どおり動く", () => {
  const cands = pool(40);
  const first = generateBudgetSet(cands, 50000, { rng: mulberry32(21) });
  const pinned = first.items.slice(0, 2);
  const kept = generateBudgetSet(cands, 50000, { pinned, rng: mulberry32(22) });
  assertInvariants(kept, 50000, pinned, "固定あり");
  // すべて解除 → 全体が対象に戻る
  const released = generateBudgetSet(cands, 50000, { pinned: [], rng: mulberry32(23) });
  assertInvariants(released, 50000, [], "全解除");
  assert.equal(released.pinnedCount, 0);
});

test("多数の組み合わせで不変条件が崩れない(乱数500回)", () => {
  const cands = pool(60, 9);
  for (let seed = 1; seed <= 500; seed++) {
    const rng = mulberry32(seed);
    const budget = [10000, 30000, 50000, 100000][seed % 4] ?? 50000;
    const base = generateBudgetSet(cands, budget, { rng });
    const keepN = seed % (base.items.length + 1);
    const pinned = base.items.slice(0, keepN);
    const count = seed % 3 === 0 ? (seed % 5) + 1 : null;
    const set = generateBudgetSet(cands, budget, { pinned, count, rng: mulberry32(seed + 1000) });
    assertInvariants(set, budget, pinned, `seed${seed}(予算${budget}/固定${keepN}/点数${count})`);
  }
});
