// @ts-nocheck
// 2026-09-10 のレイアウト修正の回帰テスト。
//   B: 固定ヘッダーで結果が隠れる      → スクロール着地点をヘッダー高さ分ずらす
//   D: PCヘッダーナビの単語途中改行    → 折り返し禁止 + 収まる幅でのみPCナビを出す
//   E: スマホで単位「万円」が次行に落ちる → 入力欄と単位を1行のフレックスにまとめる
//   F: /about/ の緑CTAを「大切にしていること」の直前へ移動(1つだけ)
// 見た目そのものはブラウザ検証(headless Chrome + CDP)の担当。ここでは
// 「その見た目を成り立たせている構造・数値の前提」が将来の再生成で消えないことを固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("public/assets/css/style.css", "utf8");
const mainJs = readFileSync("public/assets/js/main.js", "utf8");

/** @param {string} selector 先頭一致で規則ブロックを取り出す */
function ruleBody(source, selector) {
  const i = source.indexOf(selector + " {");
  assert.notEqual(i, -1, `CSS規則が見つからない: ${selector}`);
  return source.slice(i, source.indexOf("}", i));
}
/** px値を取り出す @param {string} s */
const px = (s) => Number(/(-?\d+(?:\.\d+)?)px/.exec(s)?.[1]);

/* ---------------- B. 固定ヘッダーとスクロール着地点 ---------------- */

test("B: スクロール着地点はヘッダー高さ分だけ下げる(scroll-padding-top)", () => {
  const root = ruleBody(css, ":root");
  assert.match(root, /--header-h:\s*\d+px/, "ヘッダー高さの既定値が定義されていない");

  const html = ruleBody(css, "html");
  assert.match(html, /scroll-padding-top:\s*calc\(var\(--header-h\)/,
    "html に scroll-padding-top がない(結果がヘッダーの下に潜る)");
  // scrollIntoView / :target / アンカー遷移すべてに効かせるため、
  // 個別要素の scroll-margin ではなくスクロールコンテナ側に置くこと
  const others = [...css.matchAll(/scroll-padding-top/g)];
  assert.equal(others.length, 1, "scroll-padding-top が複数箇所にあり、どれが効くか不定");
});

test("B: ヘッダー高さは実測値で更新される(スマホ/PCで高さが違うため固定値にしない)", () => {
  assert.match(mainJs, /\.site-header/, "main.js がヘッダーを参照していない");
  assert.match(mainJs, /getBoundingClientRect\(\)\.height/, "ヘッダー高さを実測していない");
  assert.match(mainJs, /setProperty\("--header-h"/, "--header-h を更新していない");
  assert.match(mainJs, /ResizeObserver|addEventListener\("resize"/,
    "高さ変化(回転・折り返し)に追従していない");
});

/* ---------------- D. PCヘッダーナビ ---------------- */

test("D: ナビ項目は折り返さない(日本語の文字単位改行を止める)", () => {
  const link = ruleBody(css, ".site-nav a");
  assert.match(link, /white-space:\s*nowrap/, "ナビリンクが折り返し可能なまま(「自治体ガ/チャ」になる)");
  const li = ruleBody(css, ".site-nav li");
  assert.match(li, /flex:\s*none/, "flexで縮められると結局折り返す");
  const ul = ruleBody(css, ".site-nav ul");
  assert.match(ul, /flex-wrap:\s*nowrap/, "ul側で折り返しが起きうる");
});

test("D: PCナビを出す最小幅は --maxw 以上(それ未満はモバイルメニュー)", () => {
  // ヘッダー内側は max-width:--maxw で頭打ちになるため、--maxw 以上ではナビに使える幅が
  // 一定になる。「--maxw で収まる」ことさえ確かめれば、それより広い画面はすべて安全。
  const maxw = px(/--maxw:\s*(\d+px)/.exec(css)?.[1] ?? "");
  const bp = px(/@media \(max-width: (\d+px)\) \{\s*\n\s*\.nav-toggle \{ display: block; \}/.exec(css)?.[1] ?? "");
  assert.ok(Number.isFinite(maxw) && Number.isFinite(bp), `--maxw=${maxw} / ブレークポイント=${bp} を読めない`);
  assert.ok(bp + 1 >= maxw,
    `PCナビが幅 ${bp + 1}px から出るが、ヘッダー内側が最大幅(${maxw}px)に達していないため収まらない`);
  // ハンバーガー側の規則と、PCナビ側の規則が同じ境界を共有していること
  const toggleRule = ruleBody(css, ".nav-toggle");
  assert.match(toggleRule, /display:\s*none/, "既定でハンバーガーが出たままになる");
});

test("D: ナビ項目・リンク先・現在地表示は維持されている", () => {
  const html = readFileSync("public/gacha/index.html", "utf8");
  const nav = /<nav id="site-nav"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
  const items = [...nav.matchAll(/<a href="([^"]+)"([^>]*)>([^<]+)<\/a>/g)].map((m) => [m[1], m[3]]);
  assert.deepEqual(items, [
    ["/about/", "ふるガチャとは"],
    ["/gacha/", "自治体ガチャ"],
    ["/budget-gacha/", "予算ガチャ"],
    ["/search/", "返礼品検索"],
    ["/calculator/", "シミュレーター"],
    ["/municipalities/", "自治体一覧"],
    ["/guide/", "ガイド"],
    ["/faq/", "FAQ"]
  ]);
  assert.match(nav, /<a href="\/gacha\/" aria-current="page">/, "現在地表示(aria-current)が失われている");
  assert.match(html, /<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav"/,
    "モバイルメニューの開閉ボタンの属性が失われている");
});

/* ---------------- E. 入力欄と単位 ---------------- */

test("E: 控除シミュレーターの単位「万円」は入力欄と同じ行の枠に入っている", () => {
  const html = readFileSync("public/calculator/index.html", "utf8");
  const units = [...html.matchAll(/<span class="unit">([^<]*)<\/span>/g)];
  assert.equal(units.length, 4, "単位の数が想定外(年収 + 詳細3項目)");
  // すべての単位が .input-unit の枠内に、直前の <input> と対で入っていること
  const pairs = [...html.matchAll(/<div class="input-unit"><input id="([\w-]+)"[^>]*><span class="unit">万円<\/span><\/div>/g)];
  assert.deepEqual(pairs.map((m) => m[1]), ["calc-salary", "calc-social", "calc-ideco", "calc-other"]);
  // 数字キーボードは維持
  for (const id of ["calc-salary", "calc-social", "calc-ideco", "calc-other"]) {
    const tag = new RegExp(`<input id="${id}"[^>]*>`).exec(html)?.[0] ?? "";
    assert.match(tag, /inputmode="numeric"/, `${id}: 数字キーボードが外れている`);
  }
  // 「500」と入れる意味が分かる説明があること(年収500万円 → 500)
  const salaryLabel = /<label for="calc-salary">([\s\S]*?)<\/label>/.exec(html)?.[1] ?? "";
  const labelText = salaryLabel.replace(/<[^>]+>/g, "");
  assert.match(labelText, /万円単位/, `年収欄に万円単位である旨の説明がない: "${labelText}"`);
  assert.match(labelText, /500/, `「500」と入力する例が示されていない: "${labelText}"`);
});

test("E: .input-unit は1行のフレックスで、入力欄が縮んでも単位が落ちない", () => {
  const rule = ruleBody(css, ".input-unit");
  assert.match(rule, /display:\s*flex/);
  assert.ok(!/flex-wrap:\s*wrap/.test(rule), "折り返し可だと単位が次行に落ちる");
  const inner = ruleBody(css, ".input-unit input");
  assert.match(inner, /min-width:\s*0/, "min-width:0 がないと狭幅で入力欄がはみ出す");
  assert.match(inner, /max-width:\s*none/, "既定の max-width:320px を打ち消していない");
  const unit = ruleBody(css, ".input-unit .unit");
  assert.match(unit, /flex:\s*none/);
  assert.match(unit, /white-space:\s*nowrap/);
});

/* ---------------- F. /about/ のCTA位置 ---------------- */

test("F: /about/ のCTAは1つだけで、「大切にしていること」の直前にある", () => {
  const html = readFileSync("public/about/index.html", "utf8");
  const ctas = [...html.matchAll(/<div class="article-cta">[\s\S]*?<\/div>/g)];
  assert.equal(ctas.length, 1, `CTAブロックが ${ctas.length} 個ある(移動ではなく複製になっている)`);

  const cta = ctas[0][0];
  const after = html.slice(ctas[0].index + cta.length);
  assert.match(after, /^\s*<h2>大切にしていること<\/h2>/,
    "CTAの直後が「大切にしていること」ではない(移動先が違う)");

  // 文言・リンク先・見た目のクラスは維持
  assert.match(cta, /<strong>まずは1回、まわしてみませんか\?<\/strong>ログインも登録も不要です。/);
  assert.match(cta, /<a class="btn btn--primary" href="\/gacha\/">🎰 自治体ガチャをまわす<\/a>/);

  // 他の説明・注意書きが消えていないこと(見出し構成とページ末尾の段落)
  const h2s = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]);
  assert.deepEqual(h2s, ["大切にしていること", "できること", "当サイトの立ち位置"]);
  assert.match(html, /公式サイトではありません/);
  assert.match(html, /広告掲載方針/);
});

test("F: 移動先で前後に余白が確保されている(見出しに接しない)", () => {
  const rule = ruleBody(css, ".article-cta");
  const margin = /margin:\s*([^;]+);/.exec(rule)?.[1] ?? "";
  const parts = margin.trim().split(/\s+/);
  assert.equal(parts.length, 3, `margin が上下ぶん指定されていない: "${margin}"`);
  const top = Number(parts[0].replace("em", ""));
  const bottom = Number(parts[2].replace("em", ""));
  assert.ok(top > 0 && bottom > 0, `CTAの上下余白が不足: top=${top} bottom=${bottom}`);
});
