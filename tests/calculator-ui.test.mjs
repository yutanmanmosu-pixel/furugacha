// @ts-nocheck
// 控除上限シミュレーター画面の状態遷移テスト(2026-09-10)
//
// 守る不具合: 一度正常に結果を出したあと無効な値で再計算すると、
//   ・エラーと【前回の控除額】が同時に表示される
//   ・前回の金額のまま「◯◯円分をおまかせガチャで組む」CTAが押せて、
//     sessionStorage/URL 経由で古い金額を予算ガチャへ引き継げてしまう
// が起きていた。文字列一致では検出できないため、画面モジュールを実際に読み込み、
// submit を発火させて表示状態そのものを検証する(計算式には触れない)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { installDom, StubElement } from "./helpers/dom-stub.mjs";

const HANDOFF_KEY = "furugacha:budget:handoff:v1";

const dom = installDom({
  "#calc-form": { tag: "form" },
  "#calc-salary": { tag: "input", value: "" },
  "#calc-spouse": { tag: "select", value: "no" },
  "#calc-dep": { tag: "select", value: "0" },
  "#calc-dep-spec": { tag: "select", value: "0" },
  "#calc-detail": { tag: "details", open: false },
  "#calc-social": { tag: "input", value: "" },
  "#calc-ideco": { tag: "input", value: "" },
  "#calc-other": { tag: "input", value: "" },
  "#calc-error": { tag: "p", hidden: true },
  "#calc-result": { tag: "section", hidden: true },
  "#calc-amount": { tag: "p" },
  "#calc-zero-note": { tag: "p", hidden: true },
  "#calc-breakdown": { tag: "tbody" },
  "#calc-assumptions": { tag: "ul" },
  "#calc-cta-budget": { tag: "a" },
  "#calc-cta-budget-amount": { tag: "span" }
});

// 実HTMLと同じく、引き継ぎCTAは <div> でくるまれている(この div の hidden で出し分ける)
const ctaWrap = new StubElement("div");
ctaWrap.append(dom.el["#calc-cta-budget"]);
dom.el["#calc-cta-budget"].href = "/budget-gacha/";

await import("../public/assets/js/pages/calculator.js");

const els = dom.el;
const submit = () => els["#calc-form"].fire("submit");
const state = () => ({
  errorShown: !els["#calc-error"].hidden,
  resultShown: !els["#calc-result"].hidden,
  amount: els["#calc-amount"].textContent,
  zeroNote: !els["#calc-zero-note"].hidden,
  ctaShown: !ctaWrap.hidden,
  ctaHref: els["#calc-cta-budget"].href,
  ctaAmount: els["#calc-cta-budget-amount"].textContent,
  rows: els["#calc-breakdown"].children.length
});
/** CTAを押したときに実際に引き継がれる金額(押されなければ null) */
function clickCtaAndReadHandoff() {
  dom.storage.removeItem(HANDOFF_KEY);
  els["#calc-cta-budget"].click();
  return dom.storage.getItem(HANDOFF_KEY);
}

test("正常入力: 控除額とCTA(金額つき)が表示され、押すと金額を引き継ぐ", () => {
  els["#calc-salary"].value = "500";
  submit();
  const s = state();
  assert.equal(s.errorShown, false);
  assert.equal(s.resultShown, true);
  assert.match(s.amount, /^約[\d,]+円$/, `控除額が表示されていない: ${s.amount}`);
  assert.equal(s.ctaShown, true);
  assert.match(s.ctaHref, /^\/budget-gacha\/\?budget=\d+&source=calculator$/);
  assert.ok(s.rows > 0, "内訳が出ていない");
  assert.equal(clickCtaAndReadHandoff(), s.ctaHref.match(/budget=(\d+)/)[1]);
});

test("無効入力: エラーだけになり、前回の控除額・引き継ぎCTAは残らない", () => {
  const before = state();
  assert.equal(before.resultShown, true, "前提: 直前に結果が出ている");

  els["#calc-salary"].value = "あ";
  submit();
  const s = state();
  assert.equal(s.errorShown, true, "エラーが出ていない");
  assert.equal(s.resultShown, false, "エラーなのに前回の結果が残っている");
  assert.notEqual(s.amount, before.amount, "前回の控除額がそのまま残っている");
  assert.equal(s.rows, 0, "前回の内訳が残っている");
  assert.equal(s.ctaShown, false, "前回の金額のCTAが押せる状態で残っている");
  assert.equal(s.ctaHref, "/budget-gacha/", "CTAのURLに前回の金額が残っている");
  assert.equal(clickCtaAndReadHandoff(), null, "古い金額が予算ガチャへ引き継がれてしまう");
});

test("入力を直すと再び正常に結果が出る(前回のエラー表示は消える)", () => {
  els["#calc-salary"].value = "600";
  submit();
  const s = state();
  assert.equal(s.errorShown, false);
  assert.equal(s.resultShown, true);
  assert.match(s.amount, /^約[\d,]+円$/);
  assert.equal(s.ctaShown, true);
  assert.match(s.ctaHref, /budget=\d+/);
  assert.equal(clickCtaAndReadHandoff(), s.ctaHref.match(/budget=(\d+)/)[1]);
});

test("控除額が出ないケース: 注記のみで、以前の金額のCTAは使えない", () => {
  els["#calc-salary"].value = "1"; // 年収1万円 → 自己負担2,000円を上回る控除は出ない
  submit();
  const s = state();
  assert.equal(s.resultShown, true, "結果カード自体は出す(0円の説明のため)");
  assert.equal(s.amount, "—");
  assert.equal(s.zeroNote, true, "0円の注記が出ていない");
  assert.equal(s.ctaShown, false, "控除額ゼロなのにCTAが残っている");
  assert.equal(s.ctaHref, "/budget-gacha/");
  assert.equal(clickCtaAndReadHandoff(), null, "控除額ゼロなのに古い金額を引き継いでしまう");
});

test("無効入力 → 正常入力 を繰り返しても状態が混ざらない", () => {
  const seen = [];
  for (const v of ["700", "-1", "800", "", "900"]) {
    els["#calc-salary"].value = v;
    submit();
    const s = state();
    // 「エラー表示」と「結果表示」は決して同時に立たない
    assert.ok(!(s.errorShown && s.resultShown), `エラーと結果が同時表示: value=${JSON.stringify(v)}`);
    seen.push(s.errorShown ? "error" : "result");
  }
  assert.deepEqual(seen, ["result", "error", "result", "error", "result"]);
});
