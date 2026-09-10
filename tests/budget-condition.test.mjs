// @ts-nocheck
// 予算おまかせガチャ: 条件変更時の無効化と、全件固定時の実行停止(2026-09-11)。
//
// 守る不具合:
//   1) 予算・カテゴリ・点数を変えても、次に実行するまで古い結果・固定・共有が有効なまま残る。
//      → 50,000円の結果を見ながら10,000円と入力した状態で、共有もできてしまう。
//   2) 全件固定で下の再ガチャは無効になるのに、上のフォーム(submit/Enter)からは実行できてしまう。
//      → 履歴が増え、「残り予算では追加できる返礼品が見つかりませんでした」と別の理由が出る。
//
// 画面モジュールを実際に動かし、DOMの状態・履歴件数・共有内容の変化で検証する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installDom } from "./helpers/dom-stub.mjs";

const MUNI = JSON.parse(readFileSync(new URL("../public/assets/data/municipalities.json", import.meta.url), "utf8"));
const PRODUCTS = Array.from({ length: 20 }, (_, i) => ({
  id: `f402303-itoshima:2000${String(i).padStart(4, "0")}`,
  municipality: `自治体${i % 6}`, prefecture: "福岡県",
  title: `【ふるさと納税】返礼品${i + 1}`,
  amount: 3000 + (i % 7) * 1000,
  productUrl: `https://item.rakuten.co.jp/f/${i}/`,
  affiliateUrl: `https://hb.afl.rakuten.co.jp/x/${i}`,
  isMock: false
}));

/** 商品取得の応答を遅らせられるようにしておく(遅延応答中の条件変更を試すため) */
let productsDelay = 0;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("municipalities.json")) return { ok: true, json: async () => MUNI };
  if (u.includes("/api/status")) return { ok: true, json: async () => ({ mode: "rakuten", hasAffiliate: true }) };
  if (u.includes("/api/products")) {
    if (productsDelay > 0) await new Promise((r) => setTimeout(r, productsDelay));
    return { ok: true, json: async () => ({ products: PRODUCTS, source: "rakuten" }) };
  }
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

const tick = () => new Promise((r) => setImmediate(r));
/** 実行完了まで待つ。応答を遅延させる場合があるので実時間でも待つ。 */
const settle = async () => {
  for (let i = 0; i < 200 && els["#budget-run"].disabled; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  await tick();
};
/** 予算入力(inputイベントのみ。submitはしない) */
function typeBudget(v) {
  els["#budget-input"].value = String(v);
  els["#budget-input"].fire("input");
}
async function submitForm(v) {
  if (v != null) typeBudget(v);
  els["#budget-form"].fire("submit");
  await settle();
}
async function clickAgain() {
  els["#budget-again"].fire("click");
  await settle();
}
const cards = () => els["#budget-grid"].children;
const pinBtns = () => cards().map((c) => c.querySelectorAll("button").find((b) => b.className === "pin-btn"));
const pinnedCount = () => cards().filter((c) => c.classList.contains("product-card--pinned")).length;
const historyCount = () => {
  try { return JSON.parse(dom.storage.getItem("furugacha:history:budget:v1") ?? "[]").length; } catch { return -1; }
};
const state = () => ({
  resultHidden: els["#budget-result"].hidden,
  cards: cards().length,
  summary: els["#budget-summary"].textContent,
  notice: els["#budget-notice"].hidden ? "" : els["#budget-notice"].textContent,
  shareShown: !els["#budget-share"].hidden,
  shareHref: els["#budget-share-x"].getAttribute("href"),
  shareText: els["#budget-share-text"].value,
  pinBar: !els["#budget-pin-bar"].hidden,
  again: els["#budget-again"].disabled,
  error: els["#budget-error"].hidden ? "" : els["#budget-error"].textContent,
  busyStuck: els["#budget-run"].disabled
});
/** すべての固定を外して、次のテストへ状態を持ち越さない */
async function reset(budget = 50000) {
  els["#budget-pin-clear"].fire("click");
  await tick();
  await submitForm(budget);
}

/* ---------------- 修正1: 条件変更で即時に無効化 ---------------- */

test("予算のinputだけで、古い結果・固定・共有が無効化される(submitはまだしない)", async () => {
  await submitForm(50000);
  pinBtns()[0].fire("click");
  await tick();
  const before = state();
  assert.equal(before.resultHidden, false, "前提: 結果が出ている");
  assert.ok(before.shareShown && before.shareHref, "前提: 共有が使える");
  assert.ok(before.pinBar, "前提: 固定している");
  const hist = historyCount();

  typeBudget(10000); // 入力だけ。submitしない
  const after = state();
  assert.equal(after.resultHidden, true, "古い結果が表示されたまま残っている");
  assert.equal(after.cards, 0, "古い商品カードが残っている");
  assert.equal(after.summary, "", "古いサマリーが残っている");
  assert.equal(pinnedCount(), 0, "固定状態が残っている");
  assert.equal(after.pinBar, false, "固定件数の表示が残っている");
  assert.equal(after.shareShown, false, "古い共有ブロックが残っている");
  assert.equal(after.shareHref, null, "古い共有リンクを押せてしまう");
  assert.equal(after.shareText, "", "古い投稿文が残っている");
  assert.match(after.notice, /条件を変更しました/, "条件変更の案内が出ない");
  assert.match(after.notice, /残す設定も解除/, "固定を解除した旨が伝わらない");
  assert.equal(after.error, "", "入力途中で検証エラーを強く出している");
  assert.equal(historyCount(), hist, "条件変更だけで履歴が増えた");
  assert.equal(after.busyStuck, false, "操作不能になっている");
});

test("カテゴリ変更だけでも無効化される", async () => {
  await reset(50000);
  assert.equal(state().resultHidden, false);
  const foodRadio = els["#budget-categories"].querySelectorAll("input").find((i) => i.value === "food");
  assert.ok(foodRadio, "カテゴリのラジオが見つからない");
  foodRadio.checked = true;
  foodRadio.fire("change");
  const s = state();
  assert.equal(s.resultHidden, true, "カテゴリを変えても古い結果が残る");
  assert.match(s.notice, /条件を変更しました/);
  assert.equal(s.shareHref, null, "古い共有リンクが残る");
});

test("希望点数の変更だけでも無効化される", async () => {
  // 予算10,000円以上で点数UIが出る
  els["#budget-categories"].querySelectorAll("input").find((i) => i.value === "random").checked = true;
  els["#budget-categories"].querySelectorAll("input").find((i) => i.value === "random").fire("change");
  await reset(50000);
  assert.equal(els["#budget-count-field"].hidden, false, "前提: 点数UIが出ている");
  assert.equal(state().resultHidden, false);

  els["#budget-count"].value = "3";
  els["#budget-count"].fire("change");
  const s = state();
  assert.equal(s.resultHidden, true, "点数を変えても古い結果が残る");
  assert.match(s.notice, /条件を変更しました/);
  assert.equal(s.shareHref, null);
});

test("空欄・無効な予算にしても古い結果と共有は残らない(検証エラーは出さない)", async () => {
  els["#budget-count"].value = "auto";
  els["#budget-count"].fire("change");
  await reset(50000);
  for (const bad of ["", "abc", "10"]) {
    await reset(50000);
    typeBudget(bad);
    const s = state();
    assert.equal(s.resultHidden, true, `"${bad}" で古い結果が残る`);
    assert.equal(s.shareHref, null, `"${bad}" で古い共有リンクが残る`);
    assert.equal(s.shareText, "", `"${bad}" で古い投稿文が残る`);
    assert.equal(s.error, "", `"${bad}" の入力途中で検証エラーを出している`);
    assert.match(s.notice, /条件を変更しました/);
  }
});

test("同じ実効条件の表記変更(50000 → 50,000)では解除しない", async () => {
  await reset(50000);
  pinBtns()[0].fire("click");
  await tick();
  const before = state();
  const pins = pinnedCount();

  typeBudget("50,000"); // カンマ区切り = 同じ予算
  const after = state();
  assert.equal(after.resultHidden, false, "表記を変えただけで結果が消えた");
  assert.equal(after.notice, "", "表記を変えただけで案内が出た");
  assert.equal(pinnedCount(), pins, "表記を変えただけで固定が解除された");
  assert.equal(after.shareHref, before.shareHref, "表記を変えただけで共有が変わった");
});

test("条件を元に戻しても、古い結果や解除済みの固定は復活しない", async () => {
  await reset(50000);
  pinBtns()[0].fire("click");
  await tick();
  typeBudget(10000);            // 変更 → 無効化
  assert.equal(state().resultHidden, true);
  typeBudget(50000);            // 元に戻す
  const s = state();
  assert.equal(s.resultHidden, true, "条件を戻したら古い結果が復活した");
  assert.equal(s.cards, 0, "古い商品カードが復活した");
  assert.equal(pinnedCount(), 0, "解除した固定が復活した");
  assert.equal(s.shareHref, null, "古い共有リンクが復活した");
});

test("条件変更後に再実行すると、新しい条件で正常に表示される", async () => {
  await reset(50000);
  typeBudget(100000);
  assert.equal(state().resultHidden, true);
  await submitForm();
  const s = state();
  assert.equal(s.resultHidden, false, "再実行しても結果が出ない");
  assert.ok(s.cards > 0, "商品が出ない");
  assert.match(s.summary, /予算 100,000円/, "新しい予算で計算されていない");
  assert.equal(s.notice, "", "実行後も条件変更の案内が残っている");
  assert.ok(s.shareShown && s.shareHref, "共有が復帰しない");
});

test("遅延応答の途中で条件を変えても、古い応答が結果・共有・履歴を復活させない", async () => {
  await reset(50000);
  const hist = historyCount();
  productsDelay = 60;
  try {
    // 実行を開始し、応答が返る前に条件を変える
    els["#budget-input"].value = "30000";
    els["#budget-input"].fire("input");
    els["#budget-form"].fire("submit");
    await tick();
    typeBudget(80000);                     // 応答待ちの最中に変更
    await new Promise((r) => setTimeout(r, 200)); // 古い応答が届くのを待つ
    await tick();
    const s = state();
    assert.equal(s.resultHidden, true, "古い応答が結果を復活させた");
    assert.equal(s.cards, 0, "古い応答の商品が描画された");
    assert.equal(s.shareHref, null, "古い応答が共有を復活させた");
    assert.equal(historyCount(), hist, "古い応答が履歴を増やした");
    assert.equal(s.busyStuck, false, "無効化のあと操作不能になっている");
    assert.equal(els["#budget-again"].disabled, false, "再ガチャが押せないまま固まっている");
    // その後の実行は通る
    await submitForm();
    assert.equal(state().resultHidden, false, "無効化後に実行できない");
    assert.match(state().summary, /予算 80,000円/, "最新の条件で実行されていない");
  } finally {
    productsDelay = 0;
  }
});

/* ---------------- 修正2: 全件固定なら実行しない ---------------- */

test("全件固定: フォームのsubmitを直接発火しても処理されない", async () => {
  await reset(20000);
  for (const b of pinBtns()) b.fire("click");
  await tick();
  const before = {
    titles: cards().map((c) => c.querySelector(".product-card__title").textContent),
    pins: pinnedCount(), hist: historyCount(),
    share: els["#budget-share-text"].value, href: els["#budget-share-x"].getAttribute("href"),
    summary: els["#budget-summary"].textContent
  };
  assert.ok(before.pins > 0 && before.pins === before.titles.length, "前提: 全件固定");

  els["#budget-form"].fire("submit"); // 上のフォーム(Enter送信と同じ経路)
  await settle();

  assert.deepEqual(cards().map((c) => c.querySelector(".product-card__title").textContent), before.titles,
    "全件固定なのに商品が入れ替わった");
  assert.equal(pinnedCount(), before.pins, "固定状態が変わった");
  assert.equal(historyCount(), before.hist, "履歴が増えた");
  assert.equal(els["#budget-share-text"].value, before.share, "共有内容が変わった");
  assert.equal(els["#budget-share-x"].getAttribute("href"), before.href, "共有リンクが変わった");
  assert.equal(els["#budget-summary"].textContent, before.summary, "サマリーが変わった");
  // 別の理由(候補なし・予算不足)ではなく、固定の案内を出す
  assert.match(els["#budget-notice"].textContent, /引き直す返礼品がありません/, "固定の案内が出ない");
  assert.ok(!/追加できる返礼品が見つかりません|組み合わせを作れません/.test(els["#budget-notice"].textContent + els["#budget-count-note"].textContent),
    "全件固定を「候補なし」として説明している");
  assert.equal(els["#budget-again"].disabled, true, "下のボタンも無効のまま");
  assert.equal(els["#budget-run"].disabled, false, "上のボタンが押せないまま固まっている");
});

test("全件固定: 下の再ガチャボタン経由でも処理されない", async () => {
  await reset(20000);
  for (const b of pinBtns()) b.fire("click");
  await tick();
  const hist = historyCount();
  const titles = cards().map((c) => c.querySelector(".product-card__title").textContent);
  await clickAgain();
  assert.deepEqual(cards().map((c) => c.querySelector(".product-card__title").textContent), titles);
  assert.equal(historyCount(), hist);
});

test("固定を1件解除すれば、同じ条件で再実行できる", async () => {
  await reset(20000);
  for (const b of pinBtns()) b.fire("click");
  await tick();
  assert.equal(els["#budget-again"].disabled, true);

  pinBtns()[0].fire("click"); // 1件だけ解除
  await tick();
  assert.equal(els["#budget-again"].disabled, false, "1件解除しても引き直せない");
  assert.equal(els["#budget-notice"].hidden, true, "解除したのに固定の案内が残っている");

  const hist = historyCount();
  await clickAgain();
  assert.equal(historyCount(), hist + 1, "解除後の引き直しが実行されない");
  assert.equal(state().resultHidden, false);
});

test("すべて解除: 自動再抽選はせず、次の実行が可能になる", async () => {
  await reset(20000);
  for (const b of pinBtns()) b.fire("click");
  await tick();
  const titles = cards().map((c) => c.querySelector(".product-card__title").textContent);
  const hist = historyCount();

  els["#budget-pin-clear"].fire("click");
  await tick();
  assert.deepEqual(cards().map((c) => c.querySelector(".product-card__title").textContent), titles,
    "すべて解除で自動的に引き直された");
  assert.equal(historyCount(), hist, "すべて解除で履歴が増えた");
  assert.equal(els["#budget-notice"].hidden, true, "解除後も固定の案内が残っている");
  assert.equal(els["#budget-again"].disabled, false);

  await clickAgain();
  assert.equal(historyCount(), hist + 1, "すべて解除のあと実行できない");
});

test("全件固定のあと条件を変えると、制限が残らず新条件で実行できる", async () => {
  await reset(20000);
  for (const b of pinBtns()) b.fire("click");
  await tick();
  assert.equal(els["#budget-again"].disabled, true, "前提: 全件固定で無効");

  typeBudget(60000); // 条件変更 → 修正1で無効化
  assert.equal(pinnedCount(), 0, "条件変更で固定が解除されない");
  assert.match(els["#budget-notice"].textContent, /条件を変更しました/);

  await submitForm();
  const s = state();
  assert.equal(s.resultHidden, false, "新条件で実行できない");
  assert.match(s.summary, /予算 60,000円/);
  assert.equal(s.again, false, "全件固定の制限が残っている");
  assert.equal(s.notice, "", "案内が残っている");
});

test("全件固定でも、予算・最大点数・重複なしの不変条件は崩れない", async () => {
  await reset(50000);
  for (const b of pinBtns()) b.fire("click");
  await tick();
  els["#budget-form"].fire("submit");
  await settle();
  const prices = cards().map((c) => Number((c.querySelector(".product-card__price").textContent.match(/[\d,]+/) ?? ["0"])[0].replace(/,/g, "")));
  const titles = cards().map((c) => c.querySelector(".product-card__title").textContent);
  const total = Number((/合計\s*([\d,]+)円/.exec(els["#budget-summary"].textContent)?.[1] ?? "0").replace(/,/g, ""));
  assert.ok(prices.reduce((a, b) => a + b, 0) === total, "カード合計とサマリーが食い違う");
  assert.ok(total <= 50000, "予算を超えている");
  assert.ok(titles.length <= 5, "5点を超えている");
  assert.equal(new Set(titles).size, titles.length, "重複がある");
});
