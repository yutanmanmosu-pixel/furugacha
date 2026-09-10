// @ts-check
// 2026-09-07 UI改善(検索サブ導線2行 / ホームティーザー注記 / 点数選択UI)の静的回帰テスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CTA_RE = /<p class="search-fallback-cta"><span class="search-fallback-cta__lead">やっぱり普通に探したい方は<\/span><a class="search-fallback-cta__link" href="\/search\/">返礼品をキーワードから探す ›<\/a><\/p>/;

test("検索サブ導線: 自治体ガチャ結果・予算ガチャ結果の両方に同一構造の2行CTA(リンク先/search/)", () => {
  for (const f of ["public/gacha/index.html", "public/budget-gacha/index.html", "public/index.html"]) {
    const html = readFileSync(f, "utf8");
    assert.match(html, CTA_RE, f);
    assert.ok(!html.includes("やっぱり普通に探したい方は <a"), `旧1行CTAが残っている: ${f}`);
  }
  const css = readFileSync("public/assets/css/style.css", "utf8");
  assert.match(css, /\.search-fallback-cta__lead \{ display: block; \}/);
  assert.match(css, /\.search-fallback-cta__link \{[^}]*font-weight: 700/);
});

test("ホーム: 予算注記は2行構造を維持+左右共通の上余白 / 控除注記は意味単位の2スパンで『税理士等に』を分断しない", () => {
  const html = readFileSync("public/index.html", "utf8");
  // 予算カード: 2行構造(改行スパン)・ガチャ玉回避(--clear)・ボタンとの余白(--spaced)
  assert.ok(html.includes('<p class="note teaser__note--clear teaser__note--spaced">※提案はランダムです。<span class="teaser__note-break">何度でも引き直せます。</span></p>'));
  // 控除カード: 文言は不変。「詳細は税理士等にご相談ください。」を1つの意味単位として保持する
  assert.ok(html.includes('<p class="note teaser__note--spaced teaser__disclaimer"><span class="teaser__note-break">※控除額は目安です。</span><span class="teaser__note-break">詳細は税理士等にご相談ください。</span></p>'));
  assert.ok(!/税理士等に<\/span>/.test(html) && !/<span[^>]*>ご相談ください/.test(html), "『税理士等に』と『ご相談ください』を分断してはいけない");
  assert.ok(!/nowrap[^"]*">詳細は税理士等に/.test(html), "nowrapで横スクロールを起こしてはいけない");
  const css = readFileSync("public/assets/css/style.css", "utf8");
  // PC: 左右で共通(整合した)上余白ルールが1箇所で定義され、片側だけの旧ルールは残っていない
  assert.match(css, /\.teaser__note--spaced \{ margin-top: 14px; \}/);
  assert.ok(!/\.teaser__disclaimer \{ margin-top/.test(css), "片側だけの余白ルールが残っている");
  // 2カラム時は左CTAの白枠(3px×2)ぶんだけ右カード注記を下げ、左右の開始位置を揃える
  const two = css.slice(css.indexOf("@media (min-width: 861px) {"));
  assert.match(two, /\.teaser--budget \.teaser__note--spaced \{ margin-top: 20px; \}/);
  // 狭幅(≤640px): 余白拡大・ガチャ玉回避・意味単位改行・控除カードは装飾を注記の下へ逃がす
  const mobile = css.slice(css.lastIndexOf("@media (max-width: 640px) {"));
  assert.match(mobile, /\.teaser__note--spaced \{ margin-top: 18px; \}/);
  assert.match(mobile, /\.teaser__note--clear \{ padding-right: 98px; \}/);
  assert.match(mobile, /\.teaser__note-break \{ display: block; \}/);
  assert.match(mobile, /\.teaser--calc \{ padding-bottom: 84px; \}/);
  // 文字サイズは小さくしない(.note の既定を上書きしていない)
  assert.ok(!/\.teaser__note--spaced \{[^}]*font-size/.test(css));
});

test("予算ガチャ: 10,000円以上用の点数選択UI(おまかせ+1〜5点)と説明用noteが存在し、初期は非表示", () => {
  const html = readFileSync("public/budget-gacha/index.html", "utf8");
  assert.ok(html.includes('<div id="budget-count-field" class="field" hidden>'));
  assert.ok(html.includes('<select id="budget-count" name="budget-count">'));
  for (const v of ["auto", "1", "2", "3", "4", "5"]) assert.ok(html.includes(`<option value="${v}"`), `option ${v}`);
  assert.ok(!html.includes('<option value="6"'), "6点の選択肢があってはいけない");
  assert.ok(html.includes('id="budget-count-note"'));
  const js = readFileSync("public/assets/js/pages/budget.js", "utf8");
  assert.ok(js.includes("normalizeBudgetCount(") && js.includes("maxItems: BUDGET_MAX_ITEMS"), "ページ側が最大5点/点数指定を使っていない");
  assert.ok(!js.includes("maxItems: 6"), "旧maxItems:6が残っている");
});

/* ---------- 2026-09-08: 軽微UI改善(範囲UI・結果CTA・注記の改行) ---------- */

test("範囲UI: 「都道府県から」選択中だけ地方ボタン群を隠す(範囲・抽選ロジックには手を入れない)", () => {
  const js = readFileSync("public/assets/js/pages/gacha-app.js", "utf8");
  assert.match(js, /els\.chips\.hidden = scope\.type === "prefecture";/, "都道府県選択時にチップを隠していない");
  // 隠す判定は表示同期(syncScopeUi)の中だけで、抽選・範囲計算には影響させない
  const sync = js.slice(js.indexOf("function syncScopeUi"), js.indexOf("function setScopeControlsDisabled"));
  assert.ok(sync.includes('els.chips.hidden = scope.type === "prefecture";'), "syncScopeUi以外で切り替えている");
  // 抽選・範囲計算(drawMunicipality / filterByScope)はチップの表示状態を参照しない
  const runGacha = js.slice(js.indexOf("async function runGacha"), js.indexOf("async function playRoulette"));
  assert.ok(!runGacha.includes("els.chips"), "抽選処理がチップの表示状態に依存している");
  const css = readFileSync("public/assets/css/style.css", "utf8");
  // .scope-chips は display:flex のため、[hidden] を効かせる打ち消しが必要
  assert.match(css, /\.scope-chips\[hidden\] \{ display: none; \}/);
});

test("結果画面: 緑の大CTAは上のボタン群から余白を取る(PC16px/狭幅22px)", () => {
  const html = readFileSync("public/gacha/index.html", "utf8");
  assert.match(html, /<p class="result-cta"><a id="result-rakuten-link" class="btn btn--green"/);
  const css = readFileSync("public/assets/css/style.css", "utf8");
  assert.match(css, /\.result-cta \{ margin-top: 16px; \}/);
  assert.match(css, /@media \(max-width: 640px\) \{ \.result-cta \{ margin-top: 22px; \} \}/);
});

test("範囲注記: 意味単位の3スパンに分かれ、文言は変わっていない", () => {
  const html = readFileSync("public/gacha/index.html", "utf8");
  const expected = '<p class="scope-note">'
    + '<span class="scope-note__line">※ 自治体そのものは選べません。</span>'
    + '<span class="scope-note__line">「どこに決まるか」までがガチャです。</span>'
    + '<span class="scope-note__line">気に入らなければ何度でも回せます。</span></p>';
  assert.ok(html.includes(expected), "3行構成になっていない");
  // 文言(結合後のテキスト)は従来どおり
  const text = expected.replace(/<[^>]+>/g, "");
  assert.equal(text, "※ 自治体そのものは選べません。「どこに決まるか」までがガチャです。気に入らなければ何度でも回せます。");
  const css = readFileSync("public/assets/css/style.css", "utf8");
  assert.match(css, /\.scope-note__line \{ display: block; \}/);
});

test("ホーム: 検索導線は「〜方は」/「返礼品キーワード検索へ。」の2スパンで、狭幅のみ2行にする", () => {
  const html = readFileSync("public/index.html", "utf8");
  assert.ok(html.includes('<span class="search-cta__line">🔍 欲しい返礼品が決まっている方は</span>'), "1行目のスパンがない");
  assert.ok(html.includes('<span class="search-cta__line"><a href="/search/">返礼品キーワード検索</a>へ。</span>'), "2行目(リンク+へ。)のスパンがない");
  const css = readFileSync("public/assets/css/style.css", "utf8");
  assert.match(css, /@media \(max-width: 640px\) \{ \.search-cta__line \{ display: block; \} \}/);
});
