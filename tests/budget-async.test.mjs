// @ts-nocheck
// 予算おまかせガチャ: 古い通信の応答が新しい実行を壊さないこと(2026-09-11)。
//
// 守る不具合:
//   run() の catch に実行世代(runSeq)の確認が無く、古い実行の失敗が
//   新しい実行の要約を「取得に失敗しました」で上書きし、共有ブロックも隠していた。
//   さらに候補キャッシュ(poolCache/poolKey)を世代確認より前に書いていたため、
//   古い実行の成功応答が新しい条件のキャッシュを別の商品一覧で上書きできた。
//
// 応答順序はDeferred(手で解決・失敗させるPromise)で完全に制御する。
// 短いsleepのタイミングには依存しない。
//
// 検証はローカル・スタブ。楽天API・実ネットワークにはアクセスしない。
// /api/products を失敗させると、実装は既存方針どおりモックへフォールバックする。
// ここでは municipalities.json も失敗させ、フォールバックまで含めて失敗した状態
// (= run() の catch に到達する状態)を作る。フォールバック方針自体は変更していない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom-stub.mjs";

/** /api/products の呼び出しごとに積まれるDeferred。テスト側が解決・失敗の順序を決める。 */
const queue = [];
globalThis.fetch = async (url) => {
  const u = String(url);
  // モックProviderのデータ源。常に失敗させ、フォールバックも失敗した状態を作る。
  if (u.includes("municipalities.json")) throw new Error("stub: municipalities unavailable");
  if (u.includes("/api/status")) return { ok: true, json: async () => ({ mode: "rakuten", hasAffiliate: true }) };
  if (u.includes("/api/products")) {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    queue.push({ url: u, resolve, reject });
    return promise;
  }
  throw new Error("unexpected fetch: " + u);
};

// 意図的に失敗させるので、テスト出力を汚さないように記録だけする
const logged = [];
console.error = (...a) => logged.push(a);
console.warn = (...a) => logged.push(a);

/** @param {string} tag 商品一覧の識別子(どちらの応答が使われたか見分ける) */
function makeList(tag) {
  return Array.from({ length: 14 }, (_, i) => ({
    id: `f402303-itoshima:${tag}0000${String(i).padStart(2, "0")}`,
    municipality: `${tag}自治体${i % 6}`, prefecture: "福岡県",
    title: `【ふるさと納税】${tag}-返礼品${i + 1}`,
    amount: 3000 + (i % 7) * 1000,
    productUrl: `https://item.rakuten.co.jp/f/${tag}${i}/`,
    affiliateUrl: `https://hb.afl.rakuten.co.jp/x/${tag}${i}`,
    isMock: false
  }));
}
const LIST_A = makeList("A");
const LIST_B = makeList("B");

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

const tick = () => new Promise((r) => setImmediate(r));
/** マイクロタスクを出し切る(応答の反映待ち)。実時間には依存しない。 */
async function flush(n = 6) { for (let i = 0; i < n; i++) await tick(); }
/** 新しい /api/products リクエストが積まれるまで待ち、そのDeferredを返す */
async function nextRequest() {
  const before = queue.length;
  for (let i = 0; i < 300 && queue.length === before; i++) await tick();
  assert.equal(queue.length, before + 1, "商品取得のリクエストが発行されていない");
  return queue[queue.length - 1];
}
function succeed(d, products) {
  d.resolve({ ok: true, json: async () => ({ products, source: "rakuten" }) });
}
function failRequest(d) { d.reject(new Error("stub: products network error")); }

function typeBudget(v) {
  els["#budget-input"].value = String(v);
  els["#budget-input"].fire("input");
}
function chooseCount(v) {
  els["#budget-count"].value = String(v);
  els["#budget-count"].fire("change");
}
const submit = () => els["#budget-form"].fire("submit");
const clickAgain = () => els["#budget-again"].fire("click");

const grid = () => els["#budget-grid"];
const cardTitles = () => grid().querySelectorAll(".product-card__title").map((t) => t.textContent);
/** 表示中カードがどちらの一覧由来か("A" / "B" / 混在・空なら null) */
function listTag() {
  const titles = cardTitles();
  if (titles.length === 0) return null;
  const tags = new Set(titles.map((t) => (t.includes("A-返礼品") ? "A" : t.includes("B-返礼品") ? "B" : "?")));
  return tags.size === 1 ? [...tags][0] : null;
}
const historyCount = () => {
  try { return JSON.parse(dom.storage.getItem("furugacha:history:budget:v1") ?? "[]").length; } catch { return -1; }
};
const snapshot = () => ({
  resultHidden: els["#budget-result"].hidden,
  summary: els["#budget-summary"].textContent,
  cards: grid().children.length,
  listTag: listTag(),
  ariaBusy: grid().getAttribute("aria-busy"),
  notice: els["#budget-notice"].hidden ? "" : els["#budget-notice"].textContent,
  shareShown: !els["#budget-share"].hidden,
  shareHref: els["#budget-share-x"].getAttribute("href"),
  shareText: els["#budget-share-text"].value,
  runDisabled: els["#budget-run"].disabled,
  againDisabled: els["#budget-again"].disabled,
  history: historyCount()
});

const FAIL_SUMMARY = "取得に失敗しました。時間をおいて再度お試しください。";

// ---------------------------------------------------------------- A
test("A: 新しい実行が成功した後に古い実行が失敗しても、結果・共有・履歴が壊れない", async () => {
  typeBudget(50000);
  submit();
  const old = await nextRequest();          // 実行A(50,000円)の取得が進行中

  typeBudget(30000);                        // 条件変更 → 実行Aは無効化される
  submit();
  const fresh = await nextRequest();        // 実行B(30,000円)
  succeed(fresh, LIST_B);
  await flush();

  const good = snapshot();
  assert.equal(good.resultHidden, false);
  assert.ok(good.cards > 0, "新しい実行の結果が表示されていない");
  assert.equal(good.listTag, "B");
  assert.equal(good.shareShown, true, "新しい実行の共有ブロックが出ていない");
  assert.ok(good.summary.includes("予算"), `要約が結果になっていない: ${good.summary}`);

  failRequest(old);                         // 古い実行の失敗が遅れて返る
  await flush();

  assert.deepEqual(snapshot(), good, "古い実行の失敗が新しい画面状態を書き換えた");
});

// ---------------------------------------------------------------- B
test("B: 新しい実行の処理中に古い実行が失敗しても、ロック解除やエラー表示が起きない", async () => {
  typeBudget(60000);
  submit();
  const old = await nextRequest();

  typeBudget(45000);
  submit();
  const fresh = await nextRequest();        // 実行Bはまだ応答待ち

  failRequest(old);
  await flush();

  assert.equal(els["#budget-run"].disabled, true, "古い失敗が新しい実行のロックを解除した");
  assert.equal(grid().getAttribute("aria-busy"), "true", "aria-busyが解除された");
  assert.equal(els["#budget-summary"].textContent, "組み合わせを考えています…", "処理中にエラーが表示された");
  assert.equal(els["#budget-share"].hidden, true);

  succeed(fresh, LIST_B);                   // 新しい実行はそのまま完了できる
  await flush();

  const s = snapshot();
  assert.equal(s.runDisabled, false);
  assert.equal(s.ariaBusy, "false");
  assert.equal(s.listTag, "B");
  assert.equal(s.shareShown, true);
  assert.notEqual(s.summary, FAIL_SUMMARY);
});

// ---------------------------------------------------------------- C
test("C: 条件変更で無効化した後に古い実行が失敗しても、結果・共有が復活せず案内も消えない", async () => {
  typeBudget(70000);
  submit();
  const old = await nextRequest();

  typeBudget(25000);                        // 実行せずに条件だけ変える
  await flush();
  const afterChange = snapshot();
  assert.equal(afterChange.resultHidden, true, "条件変更で結果が消えていない");
  assert.ok(afterChange.notice.includes("もう一度ガチャ"), "条件変更の案内が出ていない");
  assert.equal(afterChange.shareShown, false);

  failRequest(old);
  await flush();

  assert.deepEqual(snapshot(), afterChange, "無効化した後に古い失敗が画面を書き換えた");
  assert.equal(els["#budget-summary"].textContent, "", "隠れた結果の要約にエラーが書き込まれた");
});

// ---------------------------------------------------------------- D
test("D: 古い実行の成功応答が、新しい条件の候補キャッシュを上書きしない", async () => {
  typeBudget(80000);
  submit();
  const old = await nextRequest();          // 実行A: 80,000円・おまかせ

  chooseCount(3);                           // 点数だけ変更(候補プールのキーは同じ)
  submit();
  const fresh = await nextRequest();        // 実行B: 80,000円・3点
  succeed(fresh, LIST_B);
  await flush();
  assert.equal(listTag(), "B");

  succeed(old, LIST_A);                     // 古い実行の成功が遅れて返る
  await flush();
  assert.equal(listTag(), "B", "古い成功応答が画面を書き換えた");

  const before = queue.length;
  clickAgain();                             // 同じ条件で引き直す(キャッシュを使う経路)
  await flush();
  assert.equal(queue.length, before, "キャッシュがあるのに再取得している");
  assert.equal(listTag(), "B", "引き直しで古い実行の商品一覧が使われた");
});

// ---------------------------------------------------------------- E
test("E: 現在の実行が失敗したときは、エラーを出し、前回の共有を有効にせず、再試行できる", async () => {
  chooseCount("auto");
  typeBudget(95000);
  submit();
  succeed(await nextRequest(), LIST_B);
  await flush();
  assert.equal(els["#budget-share"].hidden, false, "前提の成功結果が作れていない");
  const historyBefore = historyCount();

  typeBudget(96000);
  submit();
  const req = await nextRequest();
  failRequest(req);
  await flush();

  const s = snapshot();
  assert.equal(s.summary, FAIL_SUMMARY, "失敗した実行のエラーが出ていない");
  assert.equal(s.shareShown, false, "失敗したのに前回の共有が有効になっている");
  assert.equal(s.shareHref, null);
  assert.equal(s.runDisabled, false, "失敗後に操作不能のまま");
  assert.equal(s.againDisabled, false);
  assert.equal(s.ariaBusy, "false");
  assert.equal(s.history, historyBefore, "失敗した実行が履歴に残った");
  assert.equal(els["#budget-error"].hidden, true, "入力エラー欄が誤って出ている");

  submit();                                 // 同じ条件で再試行できる
  succeed(await nextRequest(), LIST_B);
  await flush();

  const r = snapshot();
  assert.equal(r.listTag, "B");
  assert.equal(r.shareShown, true, "再試行後に共有が使えない");
  assert.notEqual(r.summary, FAIL_SUMMARY);
  assert.equal(r.history, historyBefore + 1);
});
