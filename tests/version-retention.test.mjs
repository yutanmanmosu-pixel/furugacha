// @ts-check
// リリース世代の保持・削除の E2E 回帰テスト(2026-09-08)
//
// 【守りたいこと】
// リリース単位ディレクトリ方式は version skew(新entry+旧child)を防ぐが、
// 新デプロイ時に旧世代ディレクトリを消してしまうと、デプロイ切替中や中間キャッシュ上の
// 旧HTMLが要求する /assets/js/v/<旧version>/pages/gacha-app.js が【404】になり、
// 別の形でページ全体のJSが停止する。
// そこで v/ 配下は「現行版 + 過去3世代」の最大4世代を保持する。
//
// このテストは実際に generate-pages.py を一時ワークスペースで5世代ぶん回し、
//   ・世代が4で頭打ちになること
//   ・5世代目の生成で【最古の1世代だけ】が削除されること
//   ・保持中の各世代が完全なツリーのままであること(旧HTMLからの参照が404にならない)
// を確認する。Pythonが無い環境では理由つきでskipする(生成器の実行が前提のため)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, cpSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { VERSIONED_DIRNAME, KEEP_VERSIONS, parseModule, toPosix } from "./helpers/esm-graph.mjs";

/** 利用可能なPythonコマンドを探す(なければ null) */
function findPython() {
  for (const cmd of ["py", "python3", "python"]) {
    try {
      execFileSync(cmd, ["-c", "import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)"], { stdio: "pipe" });
      return cmd;
    } catch { /* 次を試す */ }
  }
  return null;
}

/** @param {string} dir @returns {string[]} */
function walkFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

/** @param {string} ws @returns {string[]} 世代ディレクトリ名(名前順) */
function versionDirs(ws) {
  const root = join(ws, "public", "assets", "js", VERSIONED_DIRNAME);
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((n) => statSync(join(root, n)).isDirectory()).sort();
}

/** @param {string} ws */
function manifest(ws) {
  return JSON.parse(readFileSync(join(ws, "public", "assets", "js", VERSIONED_DIRNAME, "versions.json"), "utf8"));
}

test("世代保持E2E: generate-pages.py を5世代ぶん実行し、最大4世代で頭打ち・最古のみ削除される", (t) => {
  const python = findPython();
  if (!python) {
    t.skip("Python3が見つからないため生成器のE2E実行をskip(build:pages自体がPython前提)。"
      + " 世代保持の不変条件は version-skew.test.mjs / cache-busting.test.mjs で担保している");
    return;
  }

  // ── 一時ワークスペース: 生成器が必要とする最小構成だけを複製する ──
  const ws = mkdtempSync(join(tmpdir(), "furugacha-retention-"));
  mkdirSync(join(ws, "public", "assets"), { recursive: true });
  cpSync("scripts", join(ws, "scripts"), { recursive: true });
  cpSync(join("public", "assets", "css"), join(ws, "public", "assets", "css"), { recursive: true });
  cpSync(join("public", "assets", "js"), join(ws, "public", "assets", "js"), {
    recursive: true,
    // 生成物(v/)は持ち込まない = 完全に0世代の状態から始める
    filter: (src) => !toPosix(src).includes(`/assets/js/${VERSIONED_DIRNAME}`),
  });

  const generator = join(ws, "scripts", "generate-pages.py");
  const tweakTarget = join(ws, "public", "assets", "js", "lib", "format.js");
  assert.ok(existsSync(tweakTarget), "検証用に変更するソースJSがない");

  /** @type {{version:string, dirs:string[], html:string}[]} */
  const gens = [];
  for (let i = 1; i <= 5; i++) {
    if (i > 1) appendFileSync(tweakTarget, `\n// retention-test generation ${i}\n`); // 版数を変える
    execFileSync(python, [generator], { cwd: ws, stdio: "pipe" });
    const m = manifest(ws);
    gens.push({
      version: m.versions[0],
      dirs: versionDirs(ws),
      html: readFileSync(join(ws, "public", "gacha", "index.html"), "utf8"),
    });
  }

  const v = gens.map((g) => g.version);
  assert.equal(new Set(v).size, 5, `5世代とも異なる版数になるはず: ${v.join(", ")}`);

  // 1〜4世代目までは積み上がる
  assert.deepEqual(gens[0]?.dirs.sort(), [v[0]].sort(), "1回目: 現行版のみ");
  assert.equal(gens[1]?.dirs.length, 2, "2回目: 2世代");
  assert.equal(gens[2]?.dirs.length, 3, "3回目: 3世代");
  assert.equal(gens[3]?.dirs.length, 4, "4回目: 4世代(現行+過去3)");

  // 5世代目: 上限で頭打ちになり、【最古の1世代だけ】が削除される
  const after5 = gens[4]?.dirs ?? [];
  assert.equal(after5.length, KEEP_VERSIONS, `5回目も最大${KEEP_VERSIONS}世代のはず: ${after5.join(", ")}`);
  assert.ok(!after5.includes(v[0] ?? ""), `最古の世代(${v[0]})が削除されていない`);
  for (const keep of [v[1], v[2], v[3], v[4]]) {
    assert.ok(after5.includes(keep ?? ""), `保持されるべき世代が消えている: ${keep}`);
  }

  // マニフェストは新しい順(現行版が先頭)で、実ディレクトリと一致する
  const m5 = manifest(ws);
  assert.deepEqual(m5.versions, [v[4], v[3], v[2], v[1]], "世代順(新しい順)が一致しない");
  assert.deepEqual([...m5.versions].sort(), [...after5].sort(), "マニフェストと実ディレクトリが不一致");
  assert.equal(m5.keep, KEEP_VERSIONS);

  // 保持中の各世代が「完全なツリー」であること(=旧HTMLからの参照が404にならない)
  const vroot = join(ws, "public", "assets", "js", VERSIONED_DIRNAME);
  const sourceCount = walkFiles(join(ws, "public", "assets", "js"))
    .filter((p) => p.endsWith(".js") && !toPosix(p).includes(`/assets/js/${VERSIONED_DIRNAME}/`)).length;
  for (const ver of after5) {
    const files = walkFiles(join(vroot, ver)).filter((p) => p.endsWith(".js"));
    assert.equal(files.length, sourceCount, `${ver}: ツリーが不完全(${files.length}/${sourceCount})`);
    for (const entry of ["main.js", join("pages", "gacha-app.js"), join("pages", "budget.js")]) {
      assert.ok(existsSync(join(vroot, ver, entry)), `${ver}: ${entry} がない`);
    }
  }
});

test("世代保持E2E: 5世代目の生成後も、1〜3世代前のHTMLが参照するJSと全推移的依存が404にならない", (t) => {
  const python = findPython();
  if (!python) {
    t.skip("Python3が見つからないため生成器のE2E実行をskip。"
      + " 1世代前HTMLの404回帰は version-skew.test.mjs(一時ワークスペース版)で担保している");
    return;
  }

  const ws = mkdtempSync(join(tmpdir(), "furugacha-retention-html-"));
  mkdirSync(join(ws, "public", "assets"), { recursive: true });
  cpSync("scripts", join(ws, "scripts"), { recursive: true });
  cpSync(join("public", "assets", "css"), join(ws, "public", "assets", "css"), { recursive: true });
  cpSync(join("public", "assets", "js"), join(ws, "public", "assets", "js"), {
    recursive: true,
    filter: (src) => !toPosix(src).includes(`/assets/js/${VERSIONED_DIRNAME}`),
  });

  const generator = join(ws, "scripts", "generate-pages.py");
  const tweakTarget = join(ws, "public", "assets", "js", "lib", "format.js");

  // 各世代のHTMLを fixture として保存しておく(=利用者の端末/中間キャッシュに残る旧HTML)
  /** @type {string[]} */
  const htmlFixtures = [];
  for (let i = 1; i <= 5; i++) {
    if (i > 1) appendFileSync(tweakTarget, `\n// retention-test generation ${i}\n`);
    execFileSync(python, [generator], { cwd: ws, stdio: "pipe" });
    htmlFixtures.push(readFileSync(join(ws, "public", "gacha", "index.html"), "utf8"));
  }

  // 5世代目の生成が終わった【今】、保持されているのは 2〜5世代目。
  // その3つの旧HTML(2,3,4世代目)から、entryと全推移的依存が解決できることを確認する。
  const kept = manifest(ws).versions;   // 新しい順: [gen5, gen4, gen3, gen2]
  let checkedGenerations = 0;
  for (const oldHtml of htmlFixtures.slice(1, 4)) {   // gen2, gen3, gen4 のHTML
    const srcs = [...oldHtml.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((m) => m[1] ?? "");
    assert.ok(srcs.length >= 2, "旧HTMLのscript参照が取れない");
    const ver = (srcs[0] ?? "").split("/")[4] ?? "";
    assert.ok(kept.includes(ver), `保持対象のはずの世代が残っていない: ${ver}`);
    assert.ok(srcs.some((s) => s.includes("pages/gacha-app.js")), "gacha-app.js の参照がない");

    /** @type {string[]} */
    const queue = srcs.map((s) => join(ws, "public", s));
    const seen = new Set();
    let resolved = 0;
    while (queue.length) {
      const file = queue.shift() ?? "";
      const key = toPosix(file);
      if (seen.has(key)) continue;
      seen.add(key);
      // 本丸: 新リリース生成後も旧世代のファイルが残っている(404にならない)
      assert.ok(existsSync(file), `世代${ver}: 旧HTMLからの参照が404相当 → ${key}`);
      resolved++;
      for (const imp of parseModule(readFileSync(file, "utf8")).imports) {
        const target = join(dirname(file), imp.spec);
        // 旧世代の子モジュールも必ず同じ旧世代の中に閉じている
        assert.ok(toPosix(target).includes(`/${VERSIONED_DIRNAME}/${ver}/`),
          `世代${ver}: 世代外への参照 → ${imp.spec}`);
        queue.push(target);
      }
    }
    assert.ok(resolved >= 10, `世代${ver}: 検査したモジュールが少なすぎる: ${resolved}`);
    checkedGenerations++;
  }
  assert.equal(checkedGenerations, 3, "過去3世代ぶんのHTMLを検査できていない");

  // 逆に、削除された最古世代(gen1)のHTMLは解決できない = 5世代目以降は確かに削除されている
  const oldestHtml = htmlFixtures[0] ?? "";
  const oldestSrc = [...oldestHtml.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)][0]?.[1] ?? "";
  assert.ok(!existsSync(join(ws, "public", oldestSrc)),
    "上限を超えた最古世代が削除されていない(保持数が効いていない)");
});
