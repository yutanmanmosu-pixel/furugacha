// @ts-nocheck
// 控除上限シミュレーター画面の状態遷移テスト(2026-09-10)
//
// 守る不具合:
//   1) 一度正常に結果を出したあと無効な値で再計算すると、エラーと【前回の控除額】が
//      同時に表示され、前回の金額のままCTAを押せてしまう。
//   2) 画面から金額を消しても sessionStorage(furugacha:budget:handoff:v1)に
//      保存済みの金額が残り、予算指定なしの /budget-gacha/ を開くと復元されてしまう。
//      → 保存値は「消したつもり」で生き残るため、事前に消してから確認するテストでは
//        検出できない。以下のテストは【押した時点の保存値を消さずに】観測する。
// 文字列一致では検出できないため、画面モジュールを実際に読み込み、
// submit を発火させて表示状態と保存値そのものを検証する(計算式には触れない)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { installDom, StubElement } from "./helpers/dom-stub.mjs";

const HANDOFF_KEY = "furugacha:budget:handoff:v1";
/** 「CTAを押したが何も書かれなかった」を「たまたま同じ値が残っていた」と区別するための番兵 */
const SENTINEL = "__not-written__";
/** 引き継ぎとは無関係の保存データ(巻き添えで消されないことの確認用) */
const OTHER_KEY = "furugacha:se-enabled";

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

/** 予算ガチャが復元に使う保存値(消さずにそのまま読む) */
const storedHandoff = () => dom.storage.getItem(HANDOFF_KEY);
const clickCta = () => els["#calc-cta-budget"].click();
/** CTAのURLに載っている金額 */
const hrefAmount = () => /budget=(\d+)/.exec(els["#calc-cta-budget"].href)?.[1] ?? null;

/**
 * CTAを押したときに【新しく書き込まれる】金額を返す。
 * 事前に番兵を置くので、押しても書かれなければ番兵がそのまま返る
 * (保存値を消してから確認すると「書かれなかった」と「古い値が残っている」を
 *  区別できないうえ、残存そのものを見逃す)。
 */
function clickCtaAndReadWrite() {
  dom.storage.setItem(HANDOFF_KEY, SENTINEL);
  clickCta();
  return storedHandoff();
}

/** 「正常に計算してCTAを押し、金額を引き継いだ」状態を作る */
function handOff(salaryMan) {
  els["#calc-salary"].value = String(salaryMan);
  submit();
  clickCta();
  const stored = storedHandoff();
  assert.equal(stored, hrefAmount(), `前提づくり失敗: 年収${salaryMan}万で金額を保存できていない`);
  return stored;
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
  assert.equal(clickCtaAndReadWrite(), hrefAmount(), "CTAを押しても金額が引き継がれない");
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
  assert.equal(clickCtaAndReadWrite(), SENTINEL, "無効入力後にCTAを押すと金額が書き込まれてしまう");
});

test("無効入力: 保存済みの金額も消える(予算指定なしの /budget-gacha/ で復元されない)", () => {
  const carried = handOff(500);
  assert.equal(storedHandoff(), carried, "前提: 予算ガチャへ金額を引き継いである");

  els["#calc-salary"].value = "abc";
  submit();

  assert.equal(storedHandoff(), null,
    `再計算がエラーになったのに保存値が残っている(=/budget-gacha/ で ${carried} が復元される)`);
  assert.equal(state().ctaShown, false);
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
  assert.equal(clickCtaAndReadWrite(), hrefAmount(), "無効入力のあと、新しい金額を引き継げない");
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
  assert.equal(clickCtaAndReadWrite(), SENTINEL, "控除額ゼロなのにCTAを押すと金額が書き込まれる");
});

test("控除額が出ないケース: 保存済みの金額も消える", () => {
  const carried = handOff(500);
  assert.equal(storedHandoff(), carried, "前提: 予算ガチャへ金額を引き継いである");

  els["#calc-salary"].value = "1"; // 控除額が出ない条件で再計算
  submit();

  assert.equal(state().zeroNote, true, "前提: 控除額ゼロのケースになっている");
  assert.equal(storedHandoff(), null,
    `控除額が出ないのに保存値が残っている(=/budget-gacha/ で ${carried} が復元される)`);
});

test("引き継ぎの取り消しで、関係のない保存データは消さない", () => {
  handOff(500);
  dom.storage.setItem(OTHER_KEY, "1");

  els["#calc-salary"].value = "あ";
  submit();

  assert.equal(storedHandoff(), null, "引き継ぎの保存値が消えていない");
  assert.equal(dom.storage.getItem(OTHER_KEY), "1", "無関係な保存データまで消している");
});

test("sessionStorageが拒否されても、結果のクリアとCTAの無効化は完了する", () => {
  handOff(500);
  assert.equal(state().ctaShown, true, "前提: CTAが出ている");

  // プライベートモード等、保存領域そのものへのアクセスが例外になる環境を再現
  const real = globalThis.sessionStorage;
  let attempted = 0;
  globalThis.sessionStorage = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
    removeItem() { attempted++; throw new Error("denied"); }
  };
  try {
    els["#calc-salary"].value = "あ";
    submit(); // ここで例外が外へ漏れると、以降の画面クリアが止まる
  } finally {
    globalThis.sessionStorage = real;
  }

  assert.equal(attempted, 1, "保存値の削除を試みていない");
  const s = state();
  assert.equal(s.errorShown, true, "エラー表示に到達していない");
  assert.equal(s.resultShown, false, "結果のクリアが完了していない");
  assert.equal(s.amount, "—", "控除額のクリアが完了していない");
  assert.equal(s.rows, 0, "内訳のクリアが完了していない");
  assert.equal(s.ctaShown, false, "CTAの無効化が完了していない");
  assert.equal(s.ctaHref, "/budget-gacha/", "CTAのURLから金額が外れていない");
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
