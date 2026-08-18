// @ts-check
// キャッシュ恒久対策(2026-08-18)の回帰テスト。
// 目的: 「デプロイ後にスマホ通常タブで旧CSS/JSが残る」事故を二層で再発防止し、
//       その二層(①no-cache/ETag再検証 ②内容ハッシュ版数)が将来の再生成でも消えないことを固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { createHash } from "node:crypto";

/** ディレクトリ配下のファイルを再帰列挙 @param {string} dir @param {string} ext */
function walk(dir, ext) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

/** generate-pages.py と同一アルゴリズムでビルド版数を再計算(独立実装によるクロスチェック) */
function computeAssetVersion() {
  const pub = "public";
  const files = [...walk(join(pub, "assets/css"), ".css"), ...walk(join(pub, "assets/js"), ".js")]
    .map((p) => p.split("\\").join("/"))
    .sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(posix.relative(pub, f));
    h.update("\n");
    h.update(readFileSync(f));
  }
  return h.digest("hex").slice(0, 10);
}

const VERSION = computeAssetVersion();
const htmlFiles = [...walk("public", "index.html"), "public/404.html"];

test("キャッシュ対策: 全生成HTMLのCSS参照が内容ハッシュ版数つき(?v=)である", () => {
  assert.ok(htmlFiles.length >= 25, `HTMLが少なすぎる: ${htmlFiles.length}`); // 全index.html+404を対象(現構成26+1)
  assert.match(VERSION, /^[0-9a-f]{10}$/);
  for (const f of htmlFiles) {
    const html = readFileSync(f, "utf8");
    const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(links.length, 1, f);
    assert.equal(links[0], `/assets/css/style.css?v=${VERSION}`, f);
  }
});

test("キャッシュ対策: 全生成HTMLのJS参照(main+ページJS)が同一版数つきである", () => {
  for (const f of htmlFiles) {
    const html = readFileSync(f, "utf8");
    const srcs = [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((m) => m[1]);
    assert.ok(srcs.length >= 1, `moduleスクリプトがない: ${f}`);
    for (const src of srcs) {
      assert.match(src, new RegExp(`^/assets/js/.+\\.js\\?v=${VERSION}$`), `${f}: ${src}`);
      const path = join("public", src.split("?")[0]);
      assert.ok(existsSync(path), `参照先が存在しない: ${src}`);
    }
  }
});

test("キャッシュ対策: 全ページにビルド確認用メタ(furugacha-build)があり版数が一致する", () => {
  for (const f of htmlFiles) {
    const html = readFileSync(f, "utf8");
    const m = html.match(/<meta name="furugacha-build" content="([0-9a-f]{10})">/);
    assert.ok(m, `metaがない: ${f}`);
    assert.equal(m && m[1], VERSION, f);
  }
});

test("キャッシュ対策: generate-pages.py が版数生成・付与を内蔵し再生成後も対策が維持される構造", () => {
  const src = readFileSync("scripts/generate-pages.py", "utf8");
  assert.match(src, /def compute_asset_version/);
  assert.match(src, /ASSET_VERSION = compute_asset_version\(\)/);
  assert.match(src, /furugacha-build/);
  assert.ok(src.includes('asset(s)') && src.includes('asset("/assets/css/style.css")'),
    "スクリプト・スタイル参照が asset() 経由になっていない");
});

test("キャッシュ対策(_headers): HTML/CSS/JS/データは no-cache(ETag/304再検証)・長期固定は画像のみ", () => {
  const text = readFileSync("public/_headers", "utf8");
  /** @type {{path:string, headers:Record<string,string>}[]} */
  const blocks = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (!raw.startsWith(" ") && !raw.startsWith("\t")) {
      cur = { path: raw.trim(), headers: {} };
      blocks.push(cur);
    } else if (cur) {
      const i = raw.indexOf(":");
      cur.headers[raw.slice(0, i).trim().toLowerCase()] = raw.slice(i + 1).trim();
    }
  }
  const root = blocks.find((b) => b.path === "/*");
  assert.ok(root, "/* ブロックがない");
  assert.equal(root?.headers["cache-control"], "no-cache", "HTML/アセット共通のno-cacheがない");
  // セキュリティヘッダの巻き添え消失を防ぐ
  for (const k of ["content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy"]) {
    assert.ok(root?.headers[k], `セキュリティヘッダ消失: ${k}`);
  }
  // JS/CSS/データに長期max-ageを与える規則が存在しないこと(子モジュールの旧キャッシュ防止の要)
  for (const b of blocks) {
    const cc = b.headers["cache-control"] ?? "";
    if (/max-age=(?!0)\d+/.test(cc)) {
      assert.match(b.path, /^\/assets\/img\//, `画像以外に長期キャッシュ: ${b.path} → ${cc}`);
    }
  }
  const img = blocks.find((b) => b.path === "/assets/img/*");
  assert.ok(img && /max-age=86400/.test(img.headers["cache-control"] ?? ""), "画像の適正キャッシュ規則がない");
});

test("キャッシュ対策: 子モジュールの旧キャッシュ問題を残さない構成(import graphの健全性)", () => {
  const jsFiles = walk("public/assets/js", ".js");
  let edges = 0;
  for (const f of jsFiles) {
    const src = readFileSync(f, "utf8");
    const specs = [
      ...[...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]),
      ...[...src.matchAll(/import\("([^"]+)"\)/g)].map((m) => m[1]),
    ];
    for (const spec of specs) {
      // 相対import(＝配信URLが固定)なので、鮮度は_headersのno-cacheで担保する設計。
      // クエリ付与でごまかしていない(付けても全子には波及しない)ことを固定。
      assert.ok(!spec.includes("?v="), `import文にクエリ版数を書かない設計: ${f} → ${spec}`);
      assert.ok(spec.startsWith("./") || spec.startsWith("../"), `想定外のimport: ${f} → ${spec}`);
      const resolved = join(dirname(f), spec);
      assert.ok(existsSync(resolved), `importが実在しない: ${f} → ${spec}`);
      edges++;
    }
  }
  assert.ok(edges >= 20, `importグラフが小さすぎる(検出漏れ?): ${edges}`);
});
