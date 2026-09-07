// @ts-check
// 予算おまかせガチャ 最大5点・点数指定・予算最適化(2026-09-07)の回帰テスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateBudgetSet, normalizeBudgetCount, BUDGET_MAX_ITEMS, BUDGET_COUNT_MIN_BUDGET } from "../public/assets/js/lib/budget.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const P = (id, amount, muni = `自治体${id}`) => /** @type {any} */ ({ id: String(id), municipality: muni, prefecture: "県", title: `商品${id}`, amount, productUrl: "https://example.com" });
const makeProducts = (n) => Array.from({ length: n }, (_, i) => P(`p${i}`, 3000 + (i % 20) * 2500, `自治体${i % 12}`));

// ---- A. 最大点数・予算超過ゼロ・重複なし(乱数多数回) ----
test("最大5点: 乱数300回・様々な予算/候補数で 6点以上ゼロ・予算超過ゼロ・重複ゼロ(maxItems=6を渡しても5に丸める)", () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 300; i++) {
    const n = 5 + Math.floor(rng() * 115);
    const budget = 2000 + Math.floor(rng() * 200) * 1000;
    const set = generateBudgetSet(makeProducts(n), budget, { maxItems: 6, rng });
    assert.ok(set.items.length <= BUDGET_MAX_ITEMS, `6点以上: ${set.items.length}`);
    assert.ok(set.total <= budget, "予算超過");
    assert.equal(set.items.reduce((s, p) => s + p.amount, 0), set.total);
    assert.equal(new Set(set.items.map((p) => p.id)).size, set.items.length, "重複");
  }
  assert.equal(BUDGET_MAX_ITEMS, 5);
});

// ---- B. 点数指定 ----
test("点数指定の受付: 10,000円以上で1〜5を受け付け、0/6/負数/NaN/小数/文字列ゴミ/10,000円未満は null(おまかせ)", () => {
  for (const ok of [1, 2, 3, 4, 5, "3", " 5 "]) assert.equal(normalizeBudgetCount(ok, 10_000), Number(ok));
  for (const ng of [0, 6, -1, NaN, 2.5, "abc", "", "auto", null, undefined]) assert.equal(normalizeBudgetCount(ng, 30_000), null, String(ng));
  assert.equal(normalizeBudgetCount(3, BUDGET_COUNT_MIN_BUDGET - 1), null, "10,000円未満は指定不可");
  assert.equal(normalizeBudgetCount(3, NaN), null);
});

test("3点指定で3点が成立する候補なら3点を返す(乱数50回・超過なし)", () => {
  const rng = mulberry32(11);
  const cands = [P("a", 9000), P("b", 8000), P("c", 7000), P("d", 6000), P("e", 5000), P("f", 4000), P("g", 12000), P("h", 15000)];
  for (let i = 0; i < 50; i++) {
    const set = generateBudgetSet(cands, 30_000, { count: 3, rng });
    assert.equal(set.items.length, 3);
    assert.ok(set.total <= 30_000);
  }
});

test("指定点数が成立しない場合は少ない点数へ安全にフォールバック(予算超過なし・架空商品なし)", () => {
  const rng = mulberry32(3);
  const cands = [P("a", 9000), P("b", 8000), P("c", 5000)]; // 3点合計は最小でも22,000
  const set = generateBudgetSet(cands, 12_000, { count: 3, rng });
  assert.ok(set.items.length >= 1 && set.items.length < 3, `フォールバックされていない: ${set.items.length}`);
  assert.ok(set.total <= 12_000);
  for (const p of set.items) assert.ok(cands.some((c) => c.id === p.id), "候補外の商品が混入");
  // 候補が1件しかなければ1点
  const one = generateBudgetSet([P("z", 3000)], 50_000, { count: 5, rng });
  assert.equal(one.items.length, 1);
});

// ---- C. 予算最適化(壊れやすい完全一致にしない) ----
test("予算最適化: 3点指定で、予算から遠い組(3,000円)より近い組(≥25,000円)を選ぶ(乱数40回)", () => {
  const rng = mulberry32(21);
  const cands = [P("x1", 10000), P("x2", 10000, "自治体B"), P("x3", 9000, "自治体C"), P("x4", 1000, "自治体D"), P("x5", 1000, "自治体E"), P("x6", 1000, "自治体F"), P("x7", 8000, "自治体G")];
  for (let i = 0; i < 40; i++) {
    const set = generateBudgetSet(cands, 30_000, { count: 3, rng });
    assert.equal(set.items.length, 3);
    assert.ok(set.total >= 25_000, `予算から遠い組み合わせを選んだ: ${set.total}`);
    assert.ok(set.total <= 30_000);
  }
});

test("おまかせ: 予算消化率が高い提案を返しつつ、乱数で提案が変わる(ガチャ性維持)", () => {
  const rng = mulberry32(5);
  const cands = makeProducts(60);
  /** @type {Set<string>} */
  const signatures = new Set();
  for (let i = 0; i < 30; i++) {
    const set = generateBudgetSet(cands, 50_000, { rng });
    assert.ok(set.total >= 50_000 * 0.85, `予算消化率が低い: ${set.total}`);
    signatures.add(set.items.map((p) => p.id).sort().join(","));
  }
  assert.ok(signatures.size >= 3, "提案が固定化している(ランダム性なし)");
});
