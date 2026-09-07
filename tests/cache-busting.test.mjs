// @ts-check
// キャッシュ恒久対策(2026-08-18 導入 / 2026-09-08 改訂)の回帰テスト。
// 目的: 「デプロイ後に旧CSS/JSが残る」事故を二層で再発防止し、
//       その二層が将来の再生成でも消えないことを固定する。
//   第1層: public/_headers の Cache-Control: no-cache(ETag/304再検証)
//   第2層: 内容ハッシュ版数 —— CSS/faviconは ?v=<hash>、
//          JSは【リリース単位ディレクトリ /assets/js/v/<hash>/】で版を表す。
//
// 【2026-09-08 改訂の理由】
// 旧方式はJS entryにだけ ?v= を付け、ESM子モジュール(lib/, providers/)は素の相対URLで
// 配信していた。子のURLがリリース間で不変なため、配信側が長いTTLを返すと
// 「新entry + 旧child」が同時ロードされ、named importが解決できず
//   Uncaught SyntaxError: does not provide an export named ...
// でESMグラフ全体が評価前に停止した(自治体ガチャ/予算ガチャ同時停止の直接原因)。
// パス版数方式では相対import解決が版セグメントを引き継ぐため、この混在が起こらない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { createHash } from "node:crypto";

/** リリース単位JSツリー(生成物)のディレクトリ名。版数計算・静的検査からは必ず除外する。 */
export const VERSIONED_DIRNAME = "v";
/** v/ 配下に残す世代数(現行版 + 過去3世代)。generate-pages.py の KEEP_VERSIONS と一致させる。 */
export const KEEP_VERSIONS = 4;

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

/** 手書きJS(生成物 v/ 配下を除く)を列挙 @returns {string[]} */
export function sourceJsFiles() {
  return walk(join("public", "assets/js"), ".js")
    .filter((p) => !p.split("\\").join("/").includes(`/assets/js/${VERSIONED_DIRNAME}/`));
}

/** 改行コード差(CRLF/LF)で版数が変わらないよう正規化して読む(generate-pages.py と同一) */
function normalizedBytes(/** @type {string} */ f) {
  return Buffer.from(readFileSync(f).toString("latin1").replace(/\r\n/g, "\n"), "latin1");
}

/** generate-pages.py と同一アルゴリズムでビルド版数を再計算(独立実装によるクロスチェック) */
function computeAssetVersion() {
  const pub = "public";
  const files = [...walk(join(pub, "assets/css"), ".css"), ...sourceJsFiles()]
    .map((p) => p.split("\\").join("/"))
    .sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(posix.relative(pub, f));
    h.update("\n");
    h.update(normalizedBytes(f));
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

test("キャッシュ対策: 全生成HTMLのJS参照(main+ページJS)がリリース単位ディレクトリを指す", () => {
  for (const f of htmlFiles) {
    const html = readFileSync(f, "utf8");
    const srcs = [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((m) => m[1]);
    assert.ok(srcs.length >= 1, `moduleスクリプトがない: ${f}`);
    for (const src of srcs) {
      // パスに版数を持たせる(=相対importが同じ版セグメントを引き継ぐ)。
      assert.match(src, new RegExp(`^/assets/js/${VERSIONED_DIRNAME}/${VERSION}/.+\\.js$`), `${f}: ${src}`);
      // クエリ版数との二重付与をしない(パス版数だけが唯一の版の表現)
      assert.ok(!src.includes("?"), `パス版数方式ではクエリ版数を付けない: ${f}: ${src}`);
      assert.ok(existsSync(join("public", src)), `参照先が存在しない: ${src}`);
    }
  }
});

test("キャッシュ対策: リリース単位JSツリーが現行版を含み、最大4世代(現行+過去3)に収まっている", () => {
  const root = join("public", "assets/js", VERSIONED_DIRNAME);
  assert.ok(existsSync(root), "リリース単位JSツリーが生成されていない(build:pages未実行?)");
  const dirs = readdirSync(root).filter((n) => statSync(join(root, n)).isDirectory());

  // 【2026-09-08 改訂】旧: 「現行版のみ」→ 新: 「現行版 + 過去3世代まで」。
  // 旧リリースを即削除すると、デプロイ切替中や中間キャッシュ上の旧HTMLが要求する
  // /assets/js/v/<旧version>/... が404になり、別の形でページ全体のJSが停止するため。
  assert.ok(dirs.includes(VERSION), `現行版のツリーがない: ${VERSION}`);
  assert.ok(dirs.length <= KEEP_VERSIONS, `保持世代が上限を超えている(${dirs.length} > ${KEEP_VERSIONS}): ${dirs.join(", ")}`);
  for (const d of dirs) assert.match(d, /^[0-9a-f]{10}$/, `世代ディレクトリ名が版数形式でない: ${d}`);

  // 世代順マニフェスト(mtimeに依存しない決定的な順序管理)
  const manifest = JSON.parse(readFileSync(join(root, "versions.json"), "utf8"));
  assert.equal(manifest.keep, KEEP_VERSIONS, "keep がテストの期待と一致しない");
  assert.equal(manifest.versions[0], VERSION, "versions[0] が現行版でない");
  assert.deepEqual([...manifest.versions].sort(), [...dirs].sort(),
    "マニフェストの世代一覧と実ディレクトリが一致しない");

  const sources = sourceJsFiles();
  assert.ok(sources.length >= 25, `手書きJSが少なすぎる: ${sources.length}`);
  for (const src of sources) {
    const rel = posix.relative("public/assets/js", src.split("\\").join("/"));
    const copy = join(root, VERSION, rel);
    assert.ok(existsSync(copy), `リリースツリーに複製がない: ${rel}`);
    // 内容は一切書き換えない(import文を素の相対パスのまま保つ = TypeScriptが解決できる)
    assert.deepEqual(readFileSync(copy), readFileSync(src), `複製が手書きJSと一致しない: ${rel}`);
  }
  const copies = walk(join(root, VERSION), ".js");
  assert.equal(copies.length, sources.length, "リリースツリーに余分な(または不足した)ファイルがある");
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
  assert.ok(src.includes('js_asset(s)') && src.includes('asset("/assets/css/style.css")'),
    "スクリプト参照が js_asset() 経由、スタイル参照が asset() 経由になっていない");
  // リリース単位JSツリーの同期が生成手順に組み込まれていること(手動運用に戻さない)
  assert.match(src, /def sync_versioned_js/, "リリース単位JSツリーの同期処理がない");
  assert.match(src, /sync_versioned_js\(\)\s/, "main() から同期処理が呼ばれていない");
  // 世代保持: 旧HTMLからの参照を404にしないため、過去世代を保持する仕組みが必要
  assert.match(src, new RegExp(`KEEP_VERSIONS = ${KEEP_VERSIONS}\\b`), "保持世代数の定義がない/一致しない");
  assert.match(src, /def read_version_history/, "世代順マニフェストの読み取りがない");
  assert.match(src, /VERSIONS_MANIFEST\.write_text/, "世代順マニフェストを書き出していない");
  // 世代順は mtime に依存させない(clone/CIで容易に変わるため順序の根拠にできない)
  assert.ok(!/st_mtime|getmtime/.test(src), "世代順の決定に mtime を使ってはいけない");
  assert.match(src, /def js_asset/, "JS entry のURL付与関数がない");
  // 版数計算が生成物(v/)を巻き込むと自己参照で収束しないため、除外が必須
  assert.match(src, /def source_js_files/, "版数計算から生成物を除外する仕組みがない");
  // Windows(CRLF)とLinux CI(LF)で版数が割れないこと
  assert.match(src, /def normalized_bytes/, "改行コード正規化がない(Windows/Linuxで版数が割れる)");
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
  const jsFiles = sourceJsFiles();
  let edges = 0;
  for (const f of jsFiles) {
    const src = readFileSync(f, "utf8");
    const specs = [
      ...[...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]),
      ...[...src.matchAll(/import\("([^"]+)"\)/g)].map((m) => m[1]),
    ];
    for (const spec of specs) {
      // 【2026-09-08 改訂】この assert の意味づけを変更した(条件式は同じだが理由が逆)。
      // 旧: 「鮮度は_headersのno-cacheで担保するのでクエリ版数は不要」
      //     → 配信側TTLが長いと新entry+旧childが混在し、事故の温床になっていた。
      // 新: 「版はパス(/assets/js/v/<hash>/)で表すので、import文は素の相対パスのまま保つ」
      //     ・相対解決が版セグメントを自動的に引き継ぐため、クエリ版数は不要
      //     ・クエリを書くと TypeScript が TS2307 で解決できなくなる(typecheckが壊れる)
      //     ・手書きで版数を埋め込まない(=更新漏れによる版ズレを作らない)
      assert.ok(!spec.includes("?"), `import文にクエリを書かない設計: ${f} → ${spec}`);
      assert.ok(spec.startsWith("./") || spec.startsWith("../"), `想定外のimport: ${f} → ${spec}`);
      const resolved = join(dirname(f), spec);
      assert.ok(existsSync(resolved), `importが実在しない: ${f} → ${spec}`);
      edges++;
    }
  }
  assert.ok(edges >= 20, `importグラフが小さすぎる(検出漏れ?): ${edges}`);
});
