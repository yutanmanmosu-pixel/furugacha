// @ts-check
// 共有結果ページの状態をURLで往復させる部分(2026-09-11)。
// ここが壊れると「共有リンクを開いても同じ結果が出ない」= 機能の前提が崩れるので、
// 復元・検証・有効期限を固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gachaShareQuery, parseGachaShare, budgetShareQuery, parseBudgetShare,
  shareStamp, isExpired, stampToDate, SHARE_TTL_DAYS, SHARE_MAX_ITEMS, isValidItemCode
} from "../public/assets/js/lib/share-state.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 11); // 2026-09-11
const today = shareStamp(NOW);

/* ---------------- 自治体ガチャ ---------------- */

test("自治体ガチャ: 範囲は抽選時のものが復元される(当選県で上書きしない)", () => {
  /** @type {import("../public/assets/js/lib/types.js").GachaScope[]} */
  const scopes = [{ type: "all" }, { type: "region", slug: "shikoku" }, { type: "prefecture", slug: "fukuoka" }];
  for (const scope of scopes) {
    const q = gachaShareQuery({ scope, municipalityCode: "402303", stamp: today });
    const got = parseGachaShare(new URLSearchParams(q), NOW);
    assert.ok(got.ok, `復元できない: ${JSON.stringify(scope)}`);
    assert.deepEqual(got.scope, scope, "範囲が変わっている");
    assert.equal(got.municipalityCode, "402303");
  }
  // 全国抽選の共有URLに都道府県は入らない(開いた側で「福岡県から抽選」にすり替わらない)
  const all = gachaShareQuery({ scope: { type: "all" }, municipalityCode: "402303", stamp: today });
  assert.ok(!all.includes("prefecture=") && !all.includes("region="), all);
});

test("自治体ガチャ: 壊れたURL・存在しない範囲は受け付けない", () => {
  const bad = [
    "?t=" + today,                                   // コードなし
    "?code=abc&t=" + today,                          // 数字でない
    "?code=40230&t=" + today,                        // 桁数不足
    "?code=402303",                                  // 共有日なし
    "?code=402303&region=atlantis&t=" + today,       // 存在しない地方
    "?code=402303&prefecture=narnia&t=" + today      // 存在しない都道府県
  ];
  for (const q of bad) {
    const got = parseGachaShare(new URLSearchParams(q), NOW);
    assert.equal(got.ok, false, `受け付けてしまった: ${q}`);
    if (!got.ok) assert.equal(got.reason, "invalid");
  }
});

test("自治体ガチャ: 有効期限を過ぎたら expired として扱う", () => {
  const q = (/** @type {number} */ stamp) => gachaShareQuery({ scope: { type: "all" }, municipalityCode: "402303", stamp });
  assert.equal(parseGachaShare(new URLSearchParams(q(today - SHARE_TTL_DAYS)), NOW).ok, true, "期限内なのに切れている");
  const over = parseGachaShare(new URLSearchParams(q(today - SHARE_TTL_DAYS - 1)), NOW);
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.reason, "expired");
  // 未来日付(改ざん)も無効
  assert.equal(parseGachaShare(new URLSearchParams(q(today + 2)), NOW).ok, false);
});

/* ---------------- 予算ガチャ ---------------- */

const ITEMS = [
  { code: "f402303-itoshima:10000123", amount: 12000 },
  { code: "f012025-hakodate:20000456", amount: 18000 }
];

test("予算ガチャ: 予算・カテゴリ・商品と金額がそのまま復元され、合計と残額が導出される", () => {
  const q = budgetShareQuery({ budget: 50000, category: "food", items: ITEMS, stamp: today });
  const got = parseBudgetShare(new URLSearchParams(q), NOW);
  assert.ok(got.ok);
  if (!got.ok) return;
  assert.equal(got.budget, 50000);
  assert.equal(got.category, "food");
  assert.deepEqual(got.items, ITEMS, "商品コード・共有時点の寄附額が変わっている");
  assert.equal(got.total, 30000, "合計が結果と一致しない");
  assert.equal(got.remaining, 20000, "残額が結果と一致しない");
  assert.equal(got.stamp, today);
});

test("予算ガチャ: 1〜5品まで往復できる", () => {
  for (let n = 1; n <= SHARE_MAX_ITEMS; n++) {
    const items = Array.from({ length: n }, (_, i) => ({ code: `shop${i}:item${i}`, amount: 3000 + i }));
    const got = parseBudgetShare(new URLSearchParams(budgetShareQuery({ budget: 100000, category: "random", items, stamp: today })), NOW);
    assert.ok(got.ok, `${n}品で復元できない`);
    if (got.ok) assert.equal(got.items.length, n);
  }
});

test("予算ガチャ: 不正な入力は受け付けない(勝手な商品・金額を表示させない)", () => {
  const base = { budget: 50000, category: "food", items: ITEMS, stamp: today };
  const bad = [
    budgetShareQuery({ ...base, budget: 1000 }),                                   // 下限未満
    budgetShareQuery({ ...base, budget: 3000000 }),                                // 上限超過
    budgetShareQuery({ ...base, category: "gold" }),                               // 未知のカテゴリ
    budgetShareQuery({ ...base, items: [{ code: "javascript:alert(1)", amount: 1 }] }),  // コードの形が不正
    budgetShareQuery({ ...base, items: [{ code: "https://evil.example/x", amount: 1 }] }), // URLを渡そうとする
    budgetShareQuery({ ...base, items: [{ code: "shop:item", amount: -1 }] }),      // 負の金額
    budgetShareQuery({ ...base, items: [{ code: "shop:item", amount: 60000 }] }),   // 予算超過(保証と矛盾)
    "?b=50000&c=food&t=" + today,                                                   // 商品なし
    "?b=50000&c=food&i=shop:a~1&t=abc"                                              // 共有日が不正
  ];
  for (const q of bad) {
    const got = parseBudgetShare(new URLSearchParams(q), NOW);
    assert.equal(got.ok, false, `受け付けてしまった: ${q}`);
  }
  // 6品(上限超え)も拒否
  const six = Array.from({ length: 6 }, (_, i) => `shop${i}:item${i}~1000`).join(",");
  assert.equal(parseBudgetShare(new URLSearchParams(`?b=50000&c=food&t=${today}&i=${six}`), NOW).ok, false);
});

test("予算ガチャ: 有効期限を過ぎたら expired(壊れたURLは invalid のまま)", () => {
  const q = budgetShareQuery({ budget: 50000, category: "food", items: ITEMS, stamp: today - SHARE_TTL_DAYS - 1 });
  const got = parseBudgetShare(new URLSearchParams(q), NOW);
  assert.equal(got.ok, false);
  if (!got.ok) assert.equal(got.reason, "expired");
  // 形が壊れているものは期限切れと案内しない(利用者に誤った説明をしない)
  const broken = parseBudgetShare(new URLSearchParams(`?b=50000&c=food&i=bad&t=${today - 999}`), NOW);
  assert.equal(broken.ok, false);
  if (!broken.ok) assert.equal(broken.reason, "invalid");
});

/* ---------------- 共通 ---------------- */

test("共有日は日単位のみ(時刻など余分な情報を持たない)", () => {
  const morning = shareStamp(Date.UTC(2026, 8, 11, 1, 23));
  const night = shareStamp(Date.UTC(2026, 8, 11, 23, 59));
  assert.equal(morning, night, "同じ日なのに違う値になっている");
  assert.equal(stampToDate(morning), "2026/9/11");
});

test("有効期限は30日", () => {
  assert.equal(SHARE_TTL_DAYS, 30);
  assert.equal(isExpired(today, NOW), false);
  assert.equal(isExpired(today - 30, NOW), false);
  assert.equal(isExpired(today - 31, NOW), true);
  assert.equal(isExpired(today - 31, NOW - 2 * DAY), false, "基準時刻を無視している");
});

test("itemCodeの検証はURLやスクリプトを弾く", () => {
  assert.equal(isValidItemCode("f402303-itoshima:10000123"), true);
  assert.equal(isValidItemCode("shop:item"), true);
  for (const bad of ["", "shop", "shop:", ":item", "javascript:alert(1)", "https://x.example/a",
    "shop:item/../x", "shop:item?a=b", "mock:sample-1"]) {
    assert.equal(isValidItemCode(bad), bad === "mock:sample-1", `判定が不適切: ${bad}`);
  }
});
