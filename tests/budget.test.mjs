import { test } from "node:test";
import assert from "node:assert/strict";
import { generateBudgetSet, shuffled } from "../public/assets/js/lib/budget.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const makeProducts = (n) => Array.from({ length: n }, (_, i) => ({
  id: `p${i}`,
  municipality: `自治体${i % 12}`,
  prefecture: "テスト県",
  title: `商品${i}`,
  amount: 3000 + (i % 20) * 2500,
  productUrl: "https://example.com"
}));

test("指定予算を絶対に超えない(乱数1000回)", () => {
  const products = makeProducts(60);
  for (let seed = 0; seed < 1000; seed++) {
    const set = generateBudgetSet(products, 30000, { rng: mulberry32(seed) });
    assert.ok(set.total <= 30000, `total=${set.total}`);
    assert.equal(set.total + set.remaining, 30000);
  }
});

test("同一商品の重複なし", () => {
  const products = makeProducts(40);
  for (let seed = 0; seed < 300; seed++) {
    const set = generateBudgetSet(products, 72000, { rng: mulberry32(seed) });
    const ids = set.items.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("予算内商品ゼロなら空セット", () => {
  const set = generateBudgetSet(makeProducts(10).map((p) => ({ ...p, amount: 999999 })), 10000);
  assert.equal(set.items.length, 0);
  assert.equal(set.remaining, 10000);
});

test("自治体はある程度ばらける(平均で2自治体以上)", () => {
  const products = makeProducts(60);
  let variety = 0;
  const N = 200;
  for (let seed = 0; seed < N; seed++) {
    const set = generateBudgetSet(products, 50000, { rng: mulberry32(seed) });
    variety += new Set(set.items.map((p) => p.municipality)).size;
  }
  assert.ok(variety / N >= 2, `avg=${variety / N}`);
});

test("shuffledは元配列を壊さない", () => {
  const a = [1, 2, 3, 4];
  shuffled(a, Math.random);
  assert.deepEqual(a, [1, 2, 3, 4]);
});
