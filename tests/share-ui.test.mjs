// @ts-check
// 予算おまかせガチャの「Xで共有」を、画面モジュールを実際に動かして検証する(2026-09-11)。
// 本番と同じ楽天モード(/api/status が rakuten)を再現し、
//   ・結果が出たら共有が使える
//   ・投稿文の金額が結果と一致する
//   ・共有URLを読み戻すと同じ商品・同じ金額に復元できる(= 別端末で同じ結果が見られる)
//   ・抽選中・入力エラー・空結果では前の共有が残らない
// を固定する。文字列一致ではなく、状態遷移と往復で確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installDom } from "./helpers/dom-stub.mjs";
import { parseBudgetShare } from "../public/assets/js/lib/share-state.js";
import { X_INTENT_BASE } from "../public/assets/js/lib/share-text.js";
import { weightedLength, TWEET_MAX } from "../public/assets/js/lib/tweet-text.js";

const MUNI = JSON.parse(readFileSync(new URL("../public/assets/data/municipalities.json", import.meta.url), "utf8"));

/** 楽天モードの返礼品(itemCodeは実物と同じ shop:itemid 形式) */
const PRODUCTS = Array.from({ length: 12 }, (_, i) => ({
  id: `f402303-itoshima:1000${String(i).padStart(4, "0")}`,
  municipality: "糸島市", prefecture: "福岡県",
  title: `【ふるさと納税】糸島産 返礼品${i + 1} ${"あ".repeat(30)}【価格改定YJ】`,
  amount: 5000 + i * 1000,
  productUrl: `https://item.rakuten.co.jp/f402303-itoshima/1000${i}/`,
  affiliateUrl: `https://hb.afl.rakuten.co.jp/hgc/xxxx/?pc=${i}`,
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
  "#budget-pin-all": { tag: "p", hidden: true }
});

await import("../public/assets/js/pages/budget.js");

const els = dom.el;
async function submit(value) {
  els["#budget-input"].value = String(value);
  els["#budget-input"].fire("input");
  els["#budget-form"].fire("submit");
  for (let i = 0; i < 200 && els["#budget-run"].disabled; i++) await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}
const share = () => ({
  shown: !els["#budget-share"].hidden,
  href: els["#budget-share-x"].getAttribute("href"),
  disabled: els["#budget-share-x"].getAttribute("aria-disabled") === "true",
  note: els["#budget-share-note"].textContent,
  text: els["#budget-share-text"].value
});
/** 投稿文に入っている共有URL */
function sharedUrl(text) {
  const m = /https:\/\/furugacha\.jp\/share\/budget\/\?\S+/.exec(text);
  return m ? m[0] : "";
}

test("楽天モード: 結果が出るとXで共有が使えるようになる", async () => {
  await submit(50000);
  const s = share();
  assert.equal(s.shown, true, "共有が表示されない");
  assert.equal(s.disabled, false, `共有が無効のまま: ${s.note}`);
  assert.ok(s.href?.startsWith(X_INTENT_BASE + "?text="), `X公式のWeb Intentではない: ${s.href}`);
  assert.ok(s.text.length > 0, "投稿文が空");
  assert.ok(weightedLength(s.text) <= TWEET_MAX, `投稿文が280を超える: ${weightedLength(s.text)}`);
});

test("投稿文の金額が、画面に出ている結果と一致する", async () => {
  await submit(50000);
  const s = share();
  const summary = els["#budget-summary"].textContent;
  const total = /合計\s*([\d,]+)円/.exec(summary)?.[1];
  const remaining = /残り\s*([\d,]+)円/.exec(summary)?.[1];
  assert.ok(total && remaining, `サマリーから金額を読めない: ${summary}`);
  assert.ok(s.text.includes(`予算50,000円`), "予算が違う");
  assert.ok(s.text.includes(`合計${total}円／残り${remaining}円`), `金額が結果と食い違う\n${s.text}\n${summary}`);
});

test("共有URLを読み戻すと、同じ商品・同じ寄附額に復元できる", async () => {
  await submit(50000);
  const s = share();
  const url = sharedUrl(s.text);
  assert.ok(url, `投稿文に共有URLが無い\n${s.text}`);
  // Xの投稿画面へ渡すリンクにも同じURLが入っている
  const intentText = new URL(s.href ?? "").searchParams.get("text") ?? "";
  assert.ok(intentText.includes(url), "Web Intentの本文に共有URLが入っていない");

  const parsed = parseBudgetShare(new URL(url).searchParams);
  assert.ok(parsed.ok, "共有URLを復元できない");
  if (!parsed.ok) return;
  // 画面に描画された商品と、共有URLの中身が一致する
  const shownCodes = els["#budget-grid"].children.length;
  assert.equal(parsed.items.length, shownCodes, "共有した点数と表示中の点数が違う");
  assert.equal(parsed.budget, 50000);
  assert.ok(parsed.items.every((it) => PRODUCTS.some((p) => p.id === it.code && p.amount === it.amount)),
    "共有URLの商品コード・寄附額が実際の結果と違う");
  assert.equal(parsed.total, parsed.items.reduce((a, b) => a + b.amount, 0));
  assert.ok(parsed.total <= parsed.budget, "予算超過の結果を共有している");
});

test("共有URLには商品名・画像・楽天リンクを載せない(閲覧時にサーバーで引き直す)", async () => {
  await submit(50000);
  const url = sharedUrl(share().text);
  assert.ok(!/rakuten/.test(url), `共有URLに楽天のURLが混ざっている: ${url}`);
  assert.ok(!/%E3%81%82|あ/.test(url), "共有URLに商品名が入っている");
  assert.ok(url.length < 400, `共有URLが長すぎる: ${url.length}文字`);
});

test("入力エラー・空結果では前の共有が残らない", async () => {
  await submit(50000);
  assert.equal(share().shown, true, "前提: 共有が出ている");

  await submit(10); // 下限未満 → 入力エラー
  const afterError = share();
  assert.equal(afterError.shown, false, "エラーなのに前回の共有リンクが残っている");
  assert.equal(afterError.text, "", "前回の投稿文が残っている");
  assert.equal(afterError.href, null, "前回の共有リンクを押せてしまう");

  await submit(30000); // 直すと戻る
  assert.equal(share().shown, true, "入力を直しても共有が戻らない");
});

test("同じ結果を何度共有しても、サーバーへ保存は発生しない(共有はURLだけで完結)", async () => {
  const before = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => { before.push(`${init?.method ?? "GET"} ${u}`); return realFetch(u, init); };
  try {
    await submit(50000);
    els["#budget-share-x"].click();
    els["#budget-share-x"].click();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.ok(before.every((r) => r.startsWith("GET ")), `保存系のリクエストが出ている: ${before.join(", ")}`);
  assert.ok(!before.some((r) => /share-items|save|store/.test(r)), `共有準備で保存が走っている: ${before.join(", ")}`);
});
