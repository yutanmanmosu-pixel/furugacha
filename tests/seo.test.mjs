// @ts-check
// SEO回帰テスト(2026-08-18 第1弾)。
// 生成HTMLのhead不変条件と、新規ページ /guide/furusato-random/ の存在・内部リンク・
// sitemap収載を固定し、将来の再生成・改修でSEO要件が壊れないようにする。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/** @param {string} dir */
function htmlPages(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlPages(p));
    else if (p.endsWith("index.html")) out.push(p);
  }
  return out;
}

const pages = htmlPages("public");
const NOINDEX_PATHS = new Set(["public/favorites/index.html", "public/history/index.html"]);
const norm = (/** @type {string} */ p) => p.split("\\").join("/");

test("SEO: 全indexableページで title / meta description / canonical / H1 が各1つ", () => {
  assert.ok(pages.length >= 26, `ページ数が想定より少ない: ${pages.length}`);
  for (const f of pages) {
    const html = readFileSync(f, "utf8");
    assert.equal((html.match(/<title>/g) ?? []).length, 1, `title数: ${f}`);
    assert.equal((html.match(/<meta name="description"/g) ?? []).length, 1, `description数: ${f}`);
    assert.equal((html.match(/<link rel="canonical"/g) ?? []).length, 1, `canonical数: ${f}`);
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, `H1数: ${f}`);
  }
});

test("SEO: canonicalは https://furugacha.jp の自ページURLと一致する", () => {
  for (const f of pages) {
    const html = readFileSync(f, "utf8");
    const m = html.match(/<link rel="canonical" href="([^"]+)"/);
    assert.ok(m, f);
    const expected = "https://furugacha.jp" + norm(f).replace(/^public/, "").replace(/index\.html$/, "");
    assert.equal(m && m[1], expected, f);
  }
});

test("SEO: noindexは favorites / history のみ(重要ページに誤付与なし)", () => {
  for (const f of pages) {
    const html = readFileSync(f, "utf8");
    const hasNoindex = /<meta name="robots" content="noindex">/.test(html);
    assert.equal(hasNoindex, NOINDEX_PATHS.has(norm(f)), `noindex不整合: ${f}`);
  }
});

test("SEO: AdSense所有確認metaが全ページで維持されている", () => {
  for (const f of [...pages, "public/404.html"]) {
    const html = readFileSync(f, "utf8");
    assert.match(html, /<meta name="google-adsense-account" content="ca-pub-6256751733136266">/, f);
  }
});

test("SEO: 新規ページ /guide/furusato-random/ が生成され、title・H1・説明が意図どおり", () => {
  const f = "public/guide/furusato-random/index.html";
  assert.ok(existsSync(f), "新規ページが生成されていない");
  const html = readFileSync(f, "utf8");
  assert.match(html, /<title>ふるさと納税をランダムで選ぶ\|全国1,741自治体からガチャで決定[^<]*<\/title>/);
  assert.ok(!/ふるガチャ.*ふるガチャ/.test(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ""), "titleにサイト名が二重");
  assert.match(html, /<h1>ふるさと納税の自治体をランダムで選ぶ方法<\/h1>/);
  assert.match(html, /"@type": ?"Article"/, "Article構造化データがない");
});

test("SEO: 新規ページから /gacha/ へ複数の説明的アンカーで内部リンクしている", () => {
  const html = readFileSync("public/guide/furusato-random/index.html", "utf8");
  const anchors = [...html.matchAll(/<a[^>]+href="\/gacha\/"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  assert.ok(anchors.length >= 2, `\/gacha\/へのリンクが少ない: ${anchors.length}`);
  for (const a of anchors) {
    assert.ok(a.length >= 6 && !/^こちら$/.test(a), `説明的でないアンカー: "${a}"`);
  }
  assert.ok(new Set(anchors).size >= 2, "アンカーテキストがすべて同一");
  // 役割分担する既存記事・関連ツールへの内部リンク
  for (const href of ["/guide/cant-decide/", "/calculator/", "/budget-gacha/"]) {
    assert.ok(html.includes(`href="${href}"`), `内部リンク欠落: ${href}`);
  }
});

test("SEO: 新規ページが孤立していない(トップ・/guide/・/gacha/・cant-decide からリンク)", () => {
  for (const f of ["public/index.html", "public/guide/index.html", "public/gacha/index.html", "public/guide/cant-decide/index.html"]) {
    const html = readFileSync(f, "utf8");
    assert.ok(html.includes('href="/guide/furusato-random/"'), `リンク元にない: ${f}`);
  }
});

test("SEO: sitemap.xml に新規ページを含み、noindexページを含まない", () => {
  const xml = readFileSync("public/sitemap.xml", "utf8");
  assert.ok(xml.includes("<loc>https://furugacha.jp/guide/furusato-random/</loc>"), "sitemapに新規ページがない");
  assert.ok(!xml.includes("/favorites/") && !xml.includes("/history/"), "noindexページがsitemapに混入");
  const locs = (xml.match(/<loc>/g) ?? []).length;
  assert.equal(locs, pages.length - NOINDEX_PATHS.size, `sitemapのURL数不一致: ${locs}`);
});
