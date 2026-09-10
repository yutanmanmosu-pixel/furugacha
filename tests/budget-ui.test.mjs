// @ts-nocheck
// 予算おまかせガチャ画面の状態遷移テスト(2026-09-10)
//
// 守る不具合: 一度正常に結果を出したあと無効な予算で再実行すると、
// エラーと【前回の組み合わせ】が同時に表示され、今回の結果と誤解しうる状態になっていた。
// 組み合わせアルゴリズム(lib/budget.js)には触れず、画面の表示状態だけを検証する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installDom } from "./helpers/dom-stub.mjs";

const MUNI = JSON.parse(readFileSync(new URL("../public/assets/data/municipalities.json", import.meta.url), "utf8"));

// ネットワークはスタブ。/api/status は無い環境(=モック動作)として扱う。
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("municipalities.json")) return { ok: true, json: async () => MUNI };
  throw new Error("no server (mock mode)"); // /api/status → fetchStatus 側で mock にフォールバック
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
  "#budget-share-details": { tag: "details", open: false }
});

await import("../public/assets/js/pages/budget.js");

const els = dom.el;
/** submitを発火し、非同期の描画完了まで待つ */
async function submit(value) {
  els["#budget-input"].value = value;
  els["#budget-input"].fire("input");
  els["#budget-form"].fire("submit");
  for (let i = 0; i < 200 && els["#budget-run"].disabled; i++) await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}
const state = () => ({
  errorShown: !els["#budget-error"].hidden,
  resultShown: !els["#budget-result"].hidden,
  summary: els["#budget-summary"].textContent,
  cards: els["#budget-grid"].children.length,
  note: els["#budget-note"].textContent,
  prBadgeShown: !els["#budget-pr-badge"].hidden
});

test("正常な予算: 組み合わせが表示される", async () => {
  await submit("50000");
  const s = state();
  assert.equal(s.errorShown, false);
  assert.equal(s.resultShown, true);
  assert.ok(s.cards > 0, `返礼品カードが描画されていない (summary=${s.summary})`);
  assert.match(s.summary, /予算/);
});

test("無効な予算: エラーだけになり、前回の組み合わせは残らない", async () => {
  const before = state();
  assert.ok(before.cards > 0, "前提: 直前に結果が出ている");

  await submit("10"); // 下限2,000円未満 → 入力エラー
  const s = state();
  assert.equal(s.errorShown, true, "エラーが出ていない");
  assert.equal(s.resultShown, false, "エラーなのに前回の結果が残っている");
  assert.equal(s.cards, 0, "前回の返礼品カードが残っている");
  assert.equal(s.summary, "", "前回のサマリー(合計金額)が残っている");
  assert.equal(s.note, "", "前回の注記が残っている");
  assert.equal(s.prBadgeShown, false, "前回のPRバッジが残っている");
});

test("予算を直すと再び正常に結果が出る", async () => {
  await submit("30000");
  const s = state();
  assert.equal(s.errorShown, false);
  assert.equal(s.resultShown, true);
  assert.ok(s.cards > 0);
});

test("正常 → 無効 → 正常 を繰り返しても、エラーと結果が同時に立たない", async () => {
  const seen = [];
  for (const v of ["20000", "abc", "40000", "9999999", "12000"]) {
    await submit(v);
    const s = state();
    assert.ok(!(s.errorShown && s.resultShown), `エラーと結果が同時表示: value=${v}`);
    seen.push(s.errorShown ? "error" : "result");
  }
  assert.deepEqual(seen, ["result", "error", "result", "error", "result"]);
});

test("サンプル(モック)表示中は、Xでの共有を理由つきで無効にする", async () => {
  await submit("50000");
  // このテストは /api/status が無い環境 = モック動作。実在しない商品を共有させない。
  const root = els["#budget-share"];
  const link = els["#budget-share-x"];
  assert.equal(root.hidden, false, "共有できない理由が画面に出ていない");
  assert.equal(link.getAttribute("aria-disabled"), "true", "モックなのに共有リンクが有効");
  assert.equal(link.getAttribute("href"), null, "モックなのに共有リンクを押せてしまう");
  assert.match(els["#budget-share-note"].textContent, /サンプル/, "無効の理由が分からない");
  assert.equal(els["#budget-share-text"].value, "", "投稿文が作られている");
});
