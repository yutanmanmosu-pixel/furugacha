// @ts-nocheck
// 「残す」の画面side状態遷移(2026-09-11)。予算ガチャの画面モジュールを実際に動かして、
//   ・固定の付け外しだけでは共有内容・履歴を作り直さない
//   ・条件(予算・カテゴリ・点数)を変えたら固定を解除する
//   ・上のフォームからでも結果下の再ガチャからでも、条件が同じなら固定を尊重する
//   ・全件固定なら引き直しを止める / すべて解除では自動再抽選しない
// を固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installDom } from "./helpers/dom-stub.mjs";

const MUNI = JSON.parse(readFileSync(new URL("../public/assets/data/municipalities.json", import.meta.url), "utf8"));
const PRODUCTS = Array.from({ length: 20 }, (_, i) => ({
  id: `f402303-itoshima:1000${String(i).padStart(4, "0")}`,
  municipality: `自治体${i % 6}`, prefecture: "福岡県",
  title: `【ふるさと納税】返礼品${i + 1}`,
  amount: 3000 + (i % 8) * 2000,
  productUrl: `https://item.rakuten.co.jp/f/${i}/`,
  affiliateUrl: `https://hb.afl.rakuten.co.jp/x/${i}`,
  isMock: false
}));

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("municipalities.json")) return { ok: true, json: async () => MUNI };
  if (u.includes("/api/status")) return { ok: true, json: async () => ({ mode: "rakuten", hasAffiliate: true }) };
  if (u.includes("/api/products")) return { ok: true, json: async () => ({ products: PRODUCTS, source: "rakuten" }) };
  throw new Error("unexpected fetch: " + u);
};

const dom = installDom({
  "#budget-form": { tag: "form" },
  "#budget-input": { tag: "input", value: "" },
  "#budget-handoff-note": { tag: "p", hidden: true },
  "#budget-categories": { tag: "div" },
  "#budget-run": { tag: "button" },
  "#budget-error": { tag: "p", hidden: true },
  "#budget-result": { tag: "section", hidden: true },
  "#budget-summary": { tag: "p" },
  "#budget-count-field": { tag: "div", hidden: true },
  "#budget-count": { tag: "select", value: "auto" },
  "#budget-count-note": { tag: "p", hidden: true },
  "#budget-pr-badge": { tag: "span", hidden: true },
  "#budget-note": { tag: "p" },
  "#budget-grid": { tag: "div" },
  "#budget-again": { tag: "button" },
  "#budget-share": { tag: "div", hidden: true },
  "#budget-share-x": { tag: "a" },
  "#budget-share-text": { tag: "textarea", value: "" },
  "#budget-share-copy": { tag: "button" },
  "#budget-share-copied": { tag: "span" },
  "#budget-share-note": { tag: "span" },
  "#budget-share-details": { tag: "details", open: false },
  "#budget-pin-hint": { tag: "p" },
  "#budget-pin-bar": { tag: "div", hidden: true },
  "#budget-pin-count": { tag: "p" },
  "#budget-pin-clear": { tag: "button" },
  "#budget-notice": { tag: "p", hidden: true },
  "#budget-pin-all": { tag: "p", hidden: true, textContent: "引き直す返礼品がありません。変更したい返礼品の「残す」を解除してください。" }
});

await import("../public/assets/js/pages/budget.js");
const els = dom.el;

const settle = async () => {
  for (let i = 0; i < 300 && els["#budget-run"].disabled; i++) await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};
/** 上のフォームから実行 */
async function submitForm(value, count) {
  if (value != null) { els["#budget-input"].value = String(value); els["#budget-input"].fire("input"); }
  if (count != null) els["#budget-count"].value = String(count);
  els["#budget-form"].fire("submit");
  await settle();
}
/** 結果下の再ガチャから実行 */
async function again() {
  els["#budget-again"].fire("click");
  await settle();
}
const cards = () => els["#budget-grid"].children;
const pinButtons = () => cards().map((c) => c.querySelectorAll("button").find((b) => b.className === "pin-btn"));
const pinnedIds = () => cards().filter((c) => c.classList.contains("product-card--pinned"))
  .map((c) => c.querySelector(".product-card__title").textContent);
const historyCount = () => {
  try { return JSON.parse(dom.storage.getItem("furugacha:history:budget:v1") ?? "[]").length; } catch { return -1; }
};
const share = () => ({ text: els["#budget-share-text"].value, href: els["#budget-share-x"].getAttribute("href") });

test("固定の付け外しだけでは、共有内容も履歴も作り直さない", async () => {
  await submitForm(50000);
  assert.ok(cards().length >= 2, `前提: 2品以上出ている (${cards().length})`);
  const before = share();
  const histBefore = historyCount();

  pinButtons()[0].fire("click");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(share(), before, "固定しただけで共有内容が変わった");
  assert.equal(historyCount(), histBefore, "固定しただけで履歴が増えた");
  assert.equal(els["#budget-pin-bar"].hidden, false, "固定件数の表示が出ない");
  assert.match(els["#budget-pin-count"].textContent, /1品/, "固定件数が出ていない");
  assert.match(els["#budget-again"].textContent, /残した返礼品以外を引き直す/, "ボタン文言が変わらない");

  pinButtons()[0].fire("click"); // 解除
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(share(), before, "解除しただけで共有内容が変わった");
  assert.equal(historyCount(), histBefore, "解除しただけで履歴が増えた");
  assert.match(els["#budget-again"].textContent, /同じ条件でもう一回/, "解除後の文言が戻らない");
});

test("固定して引き直すと、固定分は残り、共有・履歴は新しい結果に更新される", async () => {
  await submitForm(50000);
  const first = cards().map((c) => c.querySelector(".product-card__title").textContent);
  pinButtons()[0].fire("click");
  const keptTitle = first[0];
  const histBefore = historyCount();
  const shareBefore = share().text;

  await again();
  const after = cards().map((c) => c.querySelector(".product-card__title").textContent);
  assert.equal(after[0], keptTitle, "固定した返礼品が先頭に残らない");
  assert.ok(pinnedIds().includes(keptTitle), "固定表示が維持されない");
  assert.equal(historyCount(), histBefore + 1, "引き直しが履歴に残らない");
  assert.notEqual(share().text, "", "共有内容が空");
  // 共有文の金額は必ず現在のサマリーと一致する
  const summary = els["#budget-summary"].textContent;
  const total = /合計\s*([\d,]+)円/.exec(summary)?.[1];
  const rest = /残り\s*([\d,]+)円/.exec(summary)?.[1];
  assert.ok(share().text.includes(`合計${total}円／残り${rest}円`), `共有文の金額が結果と食い違う\n${share().text}\n${summary}`);
  assert.ok(shareBefore !== share().text || first.join() === after.join(), "結果が変わったのに共有文が同じ");
});

test("全件固定: 引き直しボタンを無効にし、理由を出す", async () => {
  await submitForm(30000);
  for (const b of pinButtons()) b.fire("click");
  await new Promise((r) => setImmediate(r));
  assert.equal(els["#budget-again"].disabled, true, "全件固定なのに引き直せる");
  assert.equal(els["#budget-pin-all"].hidden, false, "全件固定の案内が出ない");
  assert.match(els["#budget-pin-all"].textContent, /引き直す返礼品がありません/);
  const n = cards().length;
  assert.ok(n > 0 && pinnedIds().length === n, "固定済み商品が消えている");
});

test("すべて解除: 固定だけ外れ、自動では引き直さない", async () => {
  await submitForm(30000);
  for (const b of pinButtons()) b.fire("click");
  await new Promise((r) => setImmediate(r));
  const before = cards().map((c) => c.querySelector(".product-card__title").textContent);
  const histBefore = historyCount();

  els["#budget-pin-clear"].fire("click");
  await new Promise((r) => setImmediate(r));
  const after = cards().map((c) => c.querySelector(".product-card__title").textContent);
  assert.deepEqual(after, before, "解除しただけで商品が入れ替わった");
  assert.equal(historyCount(), histBefore, "解除で履歴が増えた");
  assert.equal(pinnedIds().length, 0, "固定表示が残っている");
  assert.equal(els["#budget-again"].disabled, false, "解除後も引き直せない");
  assert.equal(els["#budget-pin-bar"].hidden, true, "固定件数の表示が残っている");
});

test("条件を変えると、その時点で固定・結果・共有を無効化して伝える", async () => {
  await submitForm(50000);
  pinButtons()[0].fire("click");
  const kept = cards()[0].querySelector(".product-card__title").textContent;
  assert.ok(pinnedIds().includes(kept));

  // 予算を変更しただけ(まだ submit していない)
  els["#budget-input"].value = "100000";
  els["#budget-input"].fire("input");
  assert.equal(els["#budget-notice"].hidden, false, "条件変更の案内が出ない");
  assert.match(els["#budget-notice"].textContent, /条件を変更しました/);
  assert.match(els["#budget-notice"].textContent, /残す設定も解除/, "固定を解除した旨が伝わらない");
  assert.equal(els["#budget-result"].hidden, true, "古い結果が残っている");
  assert.equal(cards().length, 0, "古い商品カードが残っている");
  assert.equal(pinnedIds().length, 0, "固定が残っている");

  // 再実行すると新しい条件で正常に表示される
  await submitForm();
  assert.equal(els["#budget-notice"].hidden, true, "実行後も案内が残っている");
  assert.match(els["#budget-summary"].textContent, /予算 100,000円/, "新しい予算で計算されていない");
  assert.ok(cards().length > 0, "新しい結果が出ない");
});

test("条件が同じなら、上のフォームからの実行でも固定を尊重する", async () => {
  await submitForm(50000);
  pinButtons()[0].fire("click");
  const kept = cards()[0].querySelector(".product-card__title").textContent;

  await submitForm(); // 値は変えずに再送信
  assert.equal(cards()[0].querySelector(".product-card__title").textContent, kept,
    "同じ条件なのに固定が無視された");
  assert.ok(pinnedIds().includes(kept), "固定表示が失われた");
});

test("入力エラーでは固定も結果もクリアされる", async () => {
  await submitForm(50000);
  els["#budget-pin-clear"].fire("click"); // 前のテストの固定状態を持ち越さない
  await new Promise((r) => setImmediate(r));
  pinButtons()[0].fire("click");
  assert.equal(pinnedIds().length, 1, "前提: 1件だけ固定できている");

  await submitForm(10); // 下限未満
  assert.equal(els["#budget-error"].hidden, false, "エラーが出ない");
  assert.equal(cards().length, 0, "エラーなのに結果が残っている");
  assert.equal(els["#budget-pin-bar"].hidden, true, "固定表示が残っている");
  assert.equal(els["#budget-again"].disabled, false, "エラー後に引き直しが無効のまま");
});

test("固定した金額の合計が表示され、予算・合計・残額と矛盾しない", async () => {
  await submitForm(50000);
  pinButtons()[0].fire("click");
  pinButtons()[1]?.fire("click");
  await new Promise((r) => setImmediate(r));
  const shown = els["#budget-pin-count"].textContent;
  const n = Number(/(\d+)品/.exec(shown)?.[1]);
  const sum = Number((/合計\s*([\d,]+)円/.exec(shown)?.[1] ?? "0").replace(/,/g, ""));
  assert.equal(n, pinnedIds().length, `固定件数の表示が実際と違う (${shown})`);
  const budgetTotal = Number((/合計\s*([\d,]+)円/.exec(els["#budget-summary"].textContent)?.[1] ?? "0").replace(/,/g, ""));
  assert.ok(sum > 0 && sum <= budgetTotal, `固定分の合計が全体の合計を超えている (${sum}/${budgetTotal})`);
});
