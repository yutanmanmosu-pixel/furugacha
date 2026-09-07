// @ts-check
// バージョンスキュー(新entry + 旧child)の回帰テスト(2026-09-08)
//
// 【防ぎたい事故】
// 旧方式では entry(pages/*.js)にだけ ?v=<hash> が付き、子モジュール(lib/, providers/)は
// リリースをまたいでURLが不変だった。配信側が長いブラウザキャッシュTTLを返すと
//   「新しい entry + 古い child」
// が同時にロードされ、named import が解決できず
//   Uncaught SyntaxError: does not provide an export named ...
// でESMグラフ全体が【評価前に】停止し、ページは描画されるのにボタンが無反応になった。
// 実例: 自治体ガチャ = getLastMunicipalityFetch / 予算ガチャ = BUDGET_COUNT_MIN_BUDGET
//
// 【このテストが固定すること】
//  1. 配信構造: HTMLが参照するentryと、そこから辿れる全ての推移的importが
//     同一リリースディレクトリ(/assets/js/v/<hash>/)に閉じていること。
//     → 旧childのURLが選ばれることが原理的に起こらない。
//  2. 検出能力: 「新entry + 旧child」を実際に組み立てると不足exportを検出できること。
//     合成fixtureで常時検証し、さらにgit履歴があれば実際の事故コミットでも検証する。
//
// git履歴に依存するテストは、浅いclone等で履歴が無いCI環境では
// 意味不明に落ちず、理由つきでskipする。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  parseModule, analyzeGraph, missingImports, VERSIONED_DIRNAME, KEEP_VERSIONS, toPosix,
} from "./helpers/esm-graph.mjs";

/** 再帰列挙。name が null なら全ファイル。 @param {string} dir @param {string|null} name @returns {string[]} */
function walkNamed(dir, name) {
  /** @type {string[]} */
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walkNamed(p, name));
    else if (name === null || e === name) out.push(p);
  }
  return out;
}

/** git コマンドを実行。失敗時は null(履歴なし・git無し環境の判定に使う)。@param {string[]} args */
function git(args) {
  try {
    return execFileSync("git", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  } catch {
    return null;
  }
}

/** 指定コミットのファイル内容を取得(存在しなければ null) @param {string} ref @param {string} path */
function showAt(ref, path) {
  return git(["show", `${ref}:${path}`]);
}

/** @param {string} ref */
function commitExists(ref) {
  return git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== null;
}

// ───────────────────────── 1. 配信構造による同一リリース保証 ─────────────────────────

test("スキュー防止: HTMLのentryと全推移的importが同一リリースディレクトリに閉じている", () => {
  const htmlFiles = [...walkNamed("public", "index.html"), join("public", "404.html")];
  assert.ok(htmlFiles.length >= 25, `HTMLが少なすぎる: ${htmlFiles.length}`);

  let checkedEntries = 0;
  let checkedModules = 0;
  for (const f of htmlFiles) {
    const html = readFileSync(f, "utf8");
    const build = html.match(/<meta name="furugacha-build" content="([0-9a-f]{10})">/);
    assert.ok(build, `furugacha-build メタがない: ${f}`);
    const version = build?.[1] ?? "";
    const prefix = `/assets/js/${VERSIONED_DIRNAME}/${version}/`;

    const srcs = [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((m) => m[1] ?? "");
    assert.ok(srcs.length >= 1, `moduleスクリプトがない: ${f}`);

    // 版の付かない生URLを直接読み込んでいないこと(旧方式への逆戻り防止)
    for (const bare of [...html.matchAll(/src="(\/assets\/js\/(?!v\/)[^"]*)"/g)]) {
      assert.fail(`${f}: リリース単位ディレクトリを経由しないJS参照がある → ${bare[1]}`);
    }

    // entryから推移的importをBFSで辿り、全てが同一リリース配下に解決されることを確認
    /** @type {string[]} */
    const queue = [];
    const seen = new Set();
    for (const src of srcs) {
      assert.ok(src.startsWith(prefix), `${f}: entryが同一リリース配下にない → ${src}`);
      queue.push(join("public", src));
      checkedEntries++;
    }
    while (queue.length) {
      const file = queue.shift() ?? "";
      const key = toPosix(file);
      if (seen.has(key)) continue;
      seen.add(key);
      assert.ok(existsSync(file), `${f}: 参照先が存在しない → ${key}`);
      checkedModules++;
      for (const imp of parseModule(readFileSync(file, "utf8")).imports) {
        const target = join(dirname(file), imp.spec);
        const url = "/" + toPosix(relative("public", target));
        // ここが本丸: 子モジュールのURLも必ず同じ v/<version>/ 配下になる
        assert.ok(
          url.startsWith(prefix),
          `${f}: 子モジュールが別リリース(または版なし)を指す → ${url} (import元: ${key})`
        );
        queue.push(target);
      }
    }
  }
  assert.ok(checkedEntries >= 30, `検査したentryが少なすぎる: ${checkedEntries}`);
  assert.ok(checkedModules >= 30, `検査したモジュールが少なすぎる: ${checkedModules}`);
});

test("スキュー防止: 現行版が必ず存在し、現行HTMLがその版を参照している(保持世代は最大4)", () => {
  const root = join("public", "assets", "js", VERSIONED_DIRNAME);
  assert.ok(existsSync(root), "リリース単位JSツリーが未生成(npm run build:pages 未実行?)");
  const versions = readdirSync(root).filter((n) => statSync(join(root, n)).isDirectory());
  const home = readFileSync(join("public", "index.html"), "utf8");
  const build = home.match(/<meta name="furugacha-build" content="([0-9a-f]{10})">/);
  const current = build?.[1] ?? "";

  assert.ok(versions.includes(current), `現行HTMLが参照する版のツリーがない: ${current}`);
  assert.ok(versions.length <= KEEP_VERSIONS,
    `保持世代が上限(${KEEP_VERSIONS})を超えている: ${versions.join(", ")}`);

  // 世代順マニフェスト(mtime非依存の決定的な順序管理)
  const manifest = JSON.parse(readFileSync(join(root, "versions.json"), "utf8"));
  assert.equal(manifest.versions[0], current, "versions[0] が現行版でない");
  assert.deepEqual([...manifest.versions].sort(), [...versions].sort(),
    "マニフェストと実ディレクトリが不一致(消し漏れ/記録漏れ)");
  // 保持中の全世代が完全なツリーであること(=旧HTMLからの参照が404にならない前提)
  for (const v of versions) {
    assert.ok(existsSync(join(root, v, "main.js")), `${v}: entryが欠けている`);
    assert.ok(existsSync(join(root, v, "pages", "gacha-app.js")), `${v}: gacha-app.js が欠けている`);
    assert.ok(existsSync(join(root, v, "pages", "budget.js")), `${v}: budget.js が欠けている`);
  }
});

test("世代保持の回帰: 1世代前のHTMLが参照する v/<previous>/ のentryと全推移的依存が404にならない", () => {
  // 「新リリース生成後も、1世代前のHTMLからのJS参照が生き残る」ことを実ファイルで検証する。
  // デプロイ切替中や中間キャッシュ上の旧HTMLが白画面にならないための最重要保証。
  const root = join("public", "assets", "js", VERSIONED_DIRNAME);
  const manifest = JSON.parse(readFileSync(join(root, "versions.json"), "utf8"));
  /** @type {string[]} */
  const versions = manifest.versions;

  // 実リポジトリに過去世代があるならそれを、無ければ一時ワークスペースに1世代前を作って検証する。
  // (この方式への移行直後は過去世代が存在しないため、常時実行できる形にしてある)
  /** @type {{label:string, root:string, previous:string, html:string}[]} */
  const targets = [];
  for (const prev of versions.slice(1)) {
    targets.push({
      label: `実リポジトリの過去世代 ${prev}`, root: "public", previous: prev,
      html: readFileSync(join("public", "gacha", "index.html"), "utf8")
        .split(`/assets/js/${VERSIONED_DIRNAME}/${versions[0]}/`)
        .join(`/assets/js/${VERSIONED_DIRNAME}/${prev}/`),
    });
  }
  if (!targets.length) {
    // 一時ワークスペース: 現行版ツリーを「1世代前」として複製し、旧HTMLをfixtureとして残す
    const ws = mkdtempSync(join(tmpdir(), "furugacha-gen-"));
    const prev = "0123456789";
    const dstRoot = join(ws, "assets", "js", VERSIONED_DIRNAME);
    for (const f of walkNamed(join(root, versions[0] ?? ""), null)) {
      const rel = relative(join(root, versions[0] ?? ""), f);
      const dst = join(dstRoot, prev, rel);
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, readFileSync(f));
    }
    // 新リリース(現行版)も同じワークスペースに置く = 「新リリース生成後」の状態
    for (const f of walkNamed(join(root, versions[0] ?? ""), null)) {
      const rel = relative(join(root, versions[0] ?? ""), f);
      const dst = join(dstRoot, versions[0] ?? "", rel);
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, readFileSync(f));
    }
    targets.push({
      label: `一時ワークスペースの1世代前 ${prev}`, root: ws, previous: prev,
      html: readFileSync(join("public", "gacha", "index.html"), "utf8")
        .split(`/assets/js/${VERSIONED_DIRNAME}/${versions[0]}/`)
        .join(`/assets/js/${VERSIONED_DIRNAME}/${prev}/`),
    });
  }

  for (const t of targets) {
    const srcs = [...t.html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((m) => m[1] ?? "");
    assert.ok(srcs.length >= 2, `${t.label}: 旧HTMLのscript参照が取れない`);
    assert.ok(srcs.some((s) => s.includes("pages/gacha-app.js")), `${t.label}: gacha-app.js の参照がない`);

    const prefix = `/assets/js/${VERSIONED_DIRNAME}/${t.previous}/`;
    /** @type {string[]} */
    const queue = [];
    const seen = new Set();
    for (const src of srcs) {
      assert.ok(src.startsWith(prefix), `${t.label}: 旧HTMLのentryが旧世代を指していない: ${src}`);
      queue.push(join(t.root, src));
    }
    let resolved = 0;
    while (queue.length) {
      const file = queue.shift() ?? "";
      const key = toPosix(file);
      if (seen.has(key)) continue;
      seen.add(key);
      // ここが本丸: 新リリース生成後も旧世代のファイルが残っている(404にならない)
      assert.ok(existsSync(file), `${t.label}: 旧世代の参照が404相当(ファイルなし) → ${key}`);
      resolved++;
      for (const imp of parseModule(readFileSync(file, "utf8")).imports) {
        const target = join(dirname(file), imp.spec);
        assert.ok(toPosix(target).includes(`/${VERSIONED_DIRNAME}/${t.previous}/`),
          `${t.label}: 旧世代のモジュールが別世代を参照している → ${imp.spec}`);
        queue.push(target);
      }
    }
    assert.ok(resolved >= 10, `${t.label}: 検査した旧世代モジュールが少なすぎる: ${resolved}`);
  }
});

// ───────────────────────── 2. 検出能力(合成fixture・常時実行) ─────────────────────────

test("スキュー検出: 新entry + 旧child を組み立てると不足exportを検出できる(合成fixture)", () => {
  // 実際の事故を最小構成で再現する。old child は「1つ前のリリース」を模す。
  const cases = [
    {
      name: "自治体ガチャ (getLastMunicipalityFetch)",
      entry: 'import { getProvider, fetchStatus , getLastMunicipalityFetch } from "../providers/index.js";\n',
      oldChild: 'export async function fetchStatus() {}\nexport async function getProvider() {}\n',
      newChild: 'export async function fetchStatus() {}\nexport async function getProvider() {}\n'
        + 'export function getLastMunicipalityFetch() { return null; }\n',
      spec: "../providers/index.js",
      expect: "getLastMunicipalityFetch",
    },
    {
      name: "予算ガチャ (BUDGET_COUNT_MIN_BUDGET)",
      entry: 'import { generateBudgetSet, normalizeBudgetCount, BUDGET_MAX_ITEMS, BUDGET_COUNT_MIN_BUDGET } from "../lib/budget.js";\n',
      oldChild: 'export function shuffled() {}\nexport function generateBudgetSet() {}\n',
      newChild: 'export function shuffled() {}\nexport function generateBudgetSet() {}\n'
        + 'export const BUDGET_MAX_ITEMS = 5;\nexport const BUDGET_COUNT_MIN_BUDGET = 10000;\n'
        + 'export function normalizeBudgetCount() {}\n',
      spec: "../lib/budget.js",
      expect: "BUDGET_COUNT_MIN_BUDGET",
    },
  ];

  for (const c of cases) {
    const withOld = missingImports(c.entry, { [c.spec]: c.oldChild });
    assert.ok(
      withOld.some((m) => m.endsWith(c.expect)),
      `${c.name}: 旧childとの組み合わせで ${c.expect} の不足を検出できていない (検出: ${withOld.join(", ") || "なし"})`
    );
    const withNew = missingImports(c.entry, { [c.spec]: c.newChild });
    assert.deepEqual(withNew, [], `${c.name}: 同一リリースのchildなら不足は出ないはず`);
  }
});

test("スキュー検出: 新childを配置した一時ツリーではimport graphが成立する(mixed-version再現)", () => {
  // 一時ディレクトリに「entry + child」を実ファイルとして作り、
  // 旧childならFAIL・新childならPASSになることを analyzeGraph で確認する。
  const base = mkdtempSync(join(tmpdir(), "furugacha-skew-"));
  /** @param {string} childSrc @returns {string[]} */
  const buildAndAnalyze = (childSrc) => {
    const root = mkdtempSync(join(base, "t-"));
    mkdirSync(join(root, "pages"), { recursive: true });
    mkdirSync(join(root, "providers"), { recursive: true });
    writeFileSync(join(root, "pages", "entry.js"),
      'import { getProvider, getLastMunicipalityFetch } from "../providers/index.js";\n'
      + "void getProvider; void getLastMunicipalityFetch;\n");
    writeFileSync(join(root, "providers", "index.js"), childSrc);
    const files = [join(root, "pages", "entry.js"), join(root, "providers", "index.js")];
    return analyzeGraph(root, files).problems;
  };

  const oldChild = "export async function getProvider() {}\n";
  const newChild = "export async function getProvider() {}\nexport function getLastMunicipalityFetch() { return null; }\n";

  const withOld = buildAndAnalyze(oldChild);
  assert.ok(
    withOld.some((p) => p.includes("getLastMunicipalityFetch")),
    `旧childとの混在を検出できていない: ${withOld.join(" / ") || "問題なし"}`
  );
  assert.deepEqual(buildAndAnalyze(newChild), [], "同一リリースの組み合わせでは問題なしのはず");
});

// ───────────────────────── 3. 実git履歴による後方互換チェック ─────────────────────────

test("スキュー検出: 直前コミットのchildに対する後方非互換なimport追加を検出し、配信構造で保護されていること", (t) => {
  if (git(["rev-parse", "--is-inside-work-tree"]) === null) {
    t.skip("gitリポジトリではない/gitが使えないため、履歴比較をskip(配信構造の保証は他テストで担保)");
    return;
  }
  if (!commitExists("HEAD~1")) {
    t.skip("HEAD~1が存在しない(shallow cloneまたは初回コミット)ため履歴比較をskip");
    return;
  }

  /** @type {string[]} */
  const incompatible = [];
  const tracked = (git(["ls-tree", "-r", "--name-only", "HEAD", "public/assets/js"]) ?? "")
    .split("\n").map((s) => s.trim())
    .filter((p) => p.endsWith(".js") && !p.includes(`/assets/js/${VERSIONED_DIRNAME}/`));

  for (const path of tracked) {
    const currentSrc = existsSync(path) ? readFileSync(path, "utf8") : showAt("HEAD", path);
    if (currentSrc === null) continue;
    /** @type {Record<string,string>} */
    const oldChildren = {};
    for (const imp of parseModule(currentSrc).imports) {
      const targetPath = toPosix(join(dirname(path), imp.spec));
      const oldSrc = showAt("HEAD~1", targetPath);
      if (oldSrc === null) continue; // 新規追加ファイル = 旧キャッシュが存在しえないので対象外
      oldChildren[imp.spec] = oldSrc;
    }
    for (const m of missingImports(currentSrc, oldChildren)) {
      incompatible.push(`${path} → ${m}`);
    }
  }

  // 配信構造が「同一リリース参照」を保証しているか(HTMLがリリース単位ディレクトリ経由か)
  const home = readFileSync(join("public", "index.html"), "utf8");
  const releaseScoped = [...home.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)]
    .every((m) => (m[1] ?? "").startsWith(`/assets/js/${VERSIONED_DIRNAME}/`));

  if (incompatible.length) {
    t.diagnostic(`後方非互換なimport追加(旧childでは解決不能): ${incompatible.join(" / ")}`);
  }
  // 後方非互換な変更それ自体は禁止しない。ただし【配信構造による保護がない状態】で
  // 行われた場合は、本番でESMグラフ全停止に直結するため必ずFAILさせる。
  assert.ok(
    releaseScoped || incompatible.length === 0,
    "後方非互換なimport追加があるのに、entryがリリース単位ディレクトリ経由で配信されていない。"
    + " 旧childがキャッシュから使われるとSyntaxErrorでページ全体が停止する:\n  "
    + incompatible.join("\n  ")
  );
});

test("スキュー検出: 実際に本番を止めた2件(getLastMunicipalityFetch / BUDGET_COUNT_MIN_BUDGET)を履歴から検出できる", (t) => {
  const cases = [
    {
      name: "自治体ガチャ",
      entryRef: "a0c42e5", entryPath: "public/assets/js/pages/gacha-app.js",
      childRef: "e5c4664", childPath: "public/assets/js/providers/index.js",
      spec: "../providers/index.js", expect: "getLastMunicipalityFetch",
    },
    {
      name: "予算ガチャ",
      entryRef: "e5c4664", entryPath: "public/assets/js/pages/budget.js",
      childRef: "3f8425b", childPath: "public/assets/js/lib/budget.js",
      spec: "../lib/budget.js", expect: "BUDGET_COUNT_MIN_BUDGET",
    },
  ];
  if (git(["rev-parse", "--is-inside-work-tree"]) === null) {
    t.skip("gitリポジトリではない/gitが使えないため履歴検証をskip(合成fixtureのテストで検出能力は担保)");
    return;
  }
  const missingRefs = cases.flatMap((c) => [c.entryRef, c.childRef]).filter((r) => !commitExists(r));
  if (missingRefs.length) {
    t.skip(`事故当時のコミットが履歴にない(${missingRefs.join(", ")})ためskip。`
      + " shallow cloneでは再現できない。合成fixtureのテストで検出能力は担保している");
    return;
  }

  for (const c of cases) {
    const entrySrc = showAt(c.entryRef, c.entryPath);
    const childSrc = showAt(c.childRef, c.childPath);
    assert.ok(entrySrc && childSrc, `${c.name}: 事故当時のソースを取得できない`);
    const missing = missingImports(entrySrc ?? "", { [c.spec]: childSrc ?? "" });
    assert.ok(
      missing.some((m) => m.endsWith(c.expect)),
      `${c.name}: 実際の事故(${c.expect})を検出できていない (検出: ${missing.join(", ") || "なし"})`
    );
  }
});
