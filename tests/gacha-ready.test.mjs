// @ts-nocheck
// 自治体ガチャ「準備完了までの操作封じ」の回帰テスト(2026-09-10)
//
// 守る不具合:
//   1) HTML描画〜自治体データ取得完了までの間にガチャボタンを押すと、
//      フォームのネイティブ送信が起きて ?scope-type=all へページごとリロードされる。
//      (submitハンドラが `await loadMunicipalities()` の【後】で登録されていたため)
//   2) 取得に失敗してもボタンが有効なままで、押すと同じくリロードされる。
//      失敗の表示も再試行手段も無い。
//
// 「文字列が含まれているか」では上の順序性は守れないため、
//   ・状態機械(lib/gacha-ready.js)を純関数として直接検証し、
//   ・画面モジュールをDOMスタブ上で実際に読み込み、取得を保留/失敗/再試行させて
//     submitがpreventDefaultされ続けることを確認する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gachaControlState } from "../public/assets/js/lib/gacha-ready.js";

/* ---------------- 1. 状態機械(純関数) ---------------- */

test("状態機械: 読み込み中は抽選も範囲変更もできず、準備中の案内を出す", () => {
  const s = gachaControlState({ state: "loading", spinning: false, poolSize: 0 });
  assert.equal(s.runDisabled, true);
  assert.equal(s.scopeDisabled, true);
  assert.equal(s.againDisabled, true);
  assert.equal(s.loadingVisible, true);
  assert.equal(s.errorVisible, false);
  assert.equal(s.canRun, false);
});

test("状態機械: 取得失敗は操作不可のままエラーを出す(件数があっても抽選させない)", () => {
  const s = gachaControlState({ state: "error", spinning: false, poolSize: 1741 });
  assert.equal(s.runDisabled, true);
  assert.equal(s.scopeDisabled, true);
  assert.equal(s.errorVisible, true);
  assert.equal(s.loadingVisible, false);
  assert.equal(s.canRun, false);
});

test("状態機械: 準備完了で抽選できるようになり、案内は消える", () => {
  const s = gachaControlState({ state: "ready", spinning: false, poolSize: 1741 });
  assert.equal(s.runDisabled, false);
  assert.equal(s.scopeDisabled, false);
  assert.equal(s.againDisabled, false);
  assert.equal(s.loadingVisible, false);
  assert.equal(s.errorVisible, false);
  assert.equal(s.canRun, true);
});

test("状態機械: 演出中は連打防止と範囲変更ロックが効く(既存仕様の維持)", () => {
  const s = gachaControlState({ state: "ready", spinning: true, poolSize: 1741 });
  assert.equal(s.runDisabled, true, "演出中に再実行できてしまう");
  assert.equal(s.againDisabled, true, "演出中に「もう一回」を連打できてしまう");
  assert.equal(s.scopeDisabled, true, "演出中に範囲を変えられ、結果表示と食い違う");
  assert.equal(s.canRun, false);
});

test("状態機械: 対象0件では抽選できないが、範囲の変更自体はできる", () => {
  const s = gachaControlState({ state: "ready", spinning: false, poolSize: 0 });
  assert.equal(s.runDisabled, true);
  assert.equal(s.scopeDisabled, false, "0件のとき範囲すら変えられないと詰む");
  assert.equal(s.canRun, false);
});

test("状態機械: loading → error → loading → ready と往復しても取りこぼさない", () => {
  const seq = ["loading", "error", "loading", "ready"];
  const runDisabled = seq.map((state) => gachaControlState({ state, spinning: false, poolSize: 1741 }).runDisabled);
  assert.deepEqual(runDisabled, [true, true, true, false]);
});

/* ---------------- 2. 生成HTMLの初期状態 ---------------- */

const PAGES = ["public/index.html", "public/gacha/index.html"];

test("生成HTML: JS到着前でも押せないよう、操作系がdisabledで出力されている", () => {
  for (const file of PAGES) {
    const html = readFileSync(file, "utf8");
    const runBtn = /<button id="gacha-run"[^>]*>/.exec(html)?.[0] ?? "";
    assert.match(runBtn, /\bdisabled\b/, `${file}: ガチャボタンがdisabledで出力されていない`);

    const radios = html.match(/<input type="radio" name="scope-type"[^>]*>/g) ?? [];
    assert.equal(radios.length, 3, `${file}: 範囲ラジオの数が想定外`);
    for (const r of radios) assert.match(r, /\bdisabled\b/, `${file}: 範囲ラジオがdisabledでない → ${r}`);

    for (const id of ["scope-region", "scope-pref"]) {
      const sel = new RegExp(`<select id="${id}"[^>]*>`).exec(html)?.[0] ?? "";
      assert.match(sel, /\bdisabled\b/, `${file}: #${id} がdisabledでない`);
    }

    const chipsBlock = /<div id="scope-chips"[\s\S]*?<\/div>/.exec(html)?.[0] ?? "";
    const chips = chipsBlock.match(/<button[^>]*>/g) ?? [];
    assert.equal(chips.length, 10, `${file}: 地方チップの数が想定外`);
    for (const c of chips) assert.match(c, /\bdisabled\b/, `${file}: 地方チップがdisabledでない → ${c}`);
  }
});

test("生成HTML: 準備中の案内と、失敗時のエラー+再試行ボタンが用意されている", () => {
  for (const file of PAGES) {
    const html = readFileSync(file, "utf8");
    const loading = /<p id="scope-loading"[^>]*>/.exec(html)?.[0] ?? "";
    assert.ok(loading, `${file}: 準備中の案内がない`);
    assert.match(loading, /role="status"/, `${file}: 準備中の案内が支援技術に伝わらない`);

    const err = /<div id="scope-error"[^>]*>/.exec(html)?.[0] ?? "";
    assert.ok(err, `${file}: 読み込み失敗の案内がない`);
    assert.match(err, /role="alert"/, `${file}: 失敗の案内が支援技術に伝わらない`);
    assert.match(err, /\bhidden\b/, `${file}: 失敗の案内が最初から表示されている`);
    assert.match(html, /<button id="scope-retry"[^>]*type="button"/, `${file}: 再試行ボタンがない/submitになっている`);
  }
});

/* ---------------- 3. 画面モジュールを実際に動かす ---------------- */

test("初期化順序: 取得が終わる前でも submit はキャンセルされ、失敗→再試行で復帰する", async () => {
  const { installDom } = await import("./helpers/dom-stub.mjs");
  const MUNI = JSON.parse(readFileSync(new URL("../public/assets/data/municipalities.json", import.meta.url), "utf8"));

  const chips = { tag: "div" };
  const dom = installDom({
    "#scope-form": { tag: "form" },
    'input[name="scope-type"]': [
      { tag: "input", value: "all", checked: true, disabled: true },
      { tag: "input", value: "region", disabled: true },
      { tag: "input", value: "prefecture", disabled: true }
    ],
    "#scope-region-wrap": { tag: "span", hidden: true },
    "#scope-pref-wrap": { tag: "span", hidden: true },
    "#scope-region": { tag: "select", disabled: true },
    "#scope-pref": { tag: "select", disabled: true },
    "#scope-chips": chips,
    "#scope-count": { tag: "p" },
    "#scope-loading": { tag: "p" },
    "#scope-error": { tag: "div", hidden: true },
    "#scope-retry": { tag: "button" },
    "#scope-map": { tag: "div" },
    "#gacha-run": { tag: "button", disabled: true },
    "#gacha-stage": { tag: "div", hidden: true },
    "#gacha-slot": { tag: "span" },
    "#gacha-status": { tag: "p" },
    "#gacha-confetti": { tag: "div" },
    "#gacha-result": { tag: "section", hidden: true },
    "#result-scope": { tag: "span" },
    "#result-pref": { tag: "span" },
    "#result-muni": { tag: "span" },
    "#result-note": { tag: "p" },
    "#result-genres": { tag: "ul" },
    "#result-map": { tag: "div" },
    "#btn-again": { tag: "button" },
    "#btn-change": { tag: "button" },
    "#btn-fav-muni": { tag: "button" },
    "#btn-share": { tag: "button" },
    "#share-done": { tag: "span" },
    "#result-rakuten-link": { tag: "a" },
    "#products": { tag: "section", hidden: true },
    "#products-title-name": { tag: "span" },
    "#pr-badge": { tag: "span", hidden: true },
    "#products-note": { tag: "p" },
    "#products-grid": { tag: "div" },
    "#products-more-btn": { tag: "button", hidden: true },
    "#products-empty": { tag: "div", hidden: true },
    "#products-empty-title": { tag: "p" },
    "#products-empty-sub": { tag: "p" },
    "#products-empty-again": { tag: "button" }
  });
  // 地方チップ(10個)を実DOMと同じく #scope-chips の子として置く
  for (const slug of ["all", "hokkaido", "tohoku", "kanto", "chubu", "kinki", "chugoku", "shikoku", "kyushu", "okinawa"]) {
    const b = dom.document.createElement("button");
    b.dataset.region = slug;
    b.disabled = true;
    dom.el["#scope-chips"].append(b);
  }
  globalThis.window = { matchMedia: () => ({ matches: true }), addEventListener() {} };
  globalThis.history = { replaceState() {} };

  // 取得はテスト側で任意のタイミングに解決/棄却する。
  // 失敗経路では画面モジュールが console.error を呼ぶので、テスト出力を汚さないよう黙らせる。
  const realError = console.error;
  console.error = () => {};
  let gate = null;
  globalThis.fetch = () => new Promise((resolve, reject) => { gate = { resolve, reject }; });

  await import("../public/assets/js/pages/gacha-app.js");

  const run = dom.el["#gacha-run"];
  const form = dom.el["#scope-form"];
  const radios = dom.all['input[name="scope-type"]'];
  const chipButtons = dom.el["#scope-chips"].querySelectorAll("button");

  // --- 読み込み中 ---
  assert.equal(run.disabled, true, "読み込み中にガチャボタンが押せる");
  assert.ok(radios.every((r) => r.disabled), "読み込み中に範囲ラジオを操作できる");
  assert.ok(chipButtons.every((b) => b.disabled), "読み込み中に地方チップを操作できる");
  assert.equal(dom.el["#scope-loading"].hidden, false, "準備中の案内が出ていない");
  assert.equal(dom.el["#scope-error"].hidden, true);
  assert.equal(form.fire("submit").defaultPrevented, true,
    "読み込み中のsubmitがキャンセルされていない(=?scope-type=all へリロードされる)");

  // --- 取得失敗 ---
  gate.reject(new Error("network down"));
  await tick();
  assert.equal(run.disabled, true, "取得失敗後にガチャボタンが押せる");
  assert.equal(dom.el["#scope-error"].hidden, false, "取得失敗の案内が出ていない");
  assert.equal(dom.el["#scope-loading"].hidden, true, "失敗しているのに準備中の案内が残っている");
  assert.equal(form.fire("submit").defaultPrevented, true, "取得失敗後のsubmitがキャンセルされていない");

  // --- 再試行して復帰 ---
  dom.el["#scope-retry"].click();
  await tick();
  gate.resolve({ ok: true, json: async () => MUNI });
  await tick();
  assert.equal(run.disabled, false, "再試行で復帰していない");
  assert.equal(dom.el["#scope-error"].hidden, true, "復帰後もエラー表示が残っている");
  assert.equal(dom.el["#scope-loading"].hidden, true, "復帰後も準備中の案内が残っている");
  assert.ok(radios.every((r) => !r.disabled), "復帰後も範囲ラジオが無効のまま");
  assert.ok(chipButtons.every((b) => !b.disabled), "復帰後も地方チップが無効のまま");
  assert.match(dom.el["#scope-count"].textContent, /1741自治体/, "対象件数が反映されていない");
  console.error = realError;
});

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}
