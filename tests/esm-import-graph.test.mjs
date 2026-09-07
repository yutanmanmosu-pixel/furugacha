// @ts-check
// ESM import graph の静的検証(2026-09-08)
// 目的: 「文字列が含まれているか」ではなく、【importが実際に解決できるか】を機械的に確認する。
//
// 背景: 本番で自治体ガチャ・予算ガチャが同時停止した事故は
//   Uncaught SyntaxError: does not provide an export named ...
// というESMの【リンクエラー】だった。従来のテストは
//   assert.ok(app.includes("getLastMunicipalityFetch()"))
// のような文字列一致だったため、そのexport名が実在するかを一切検証できていなかった。
// このテストは import 側が要求する名前と export 側が提供する名前を突き合わせる。
//
// 依存追加なし(Node標準のみ)。解析器は tests/helpers/esm-graph.mjs に分離してある。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import {
  JS_ROOT, VERSIONED_DIRNAME, sourceJsFiles, walkJs,
  parseModule, analyzeGraph, findCycles, toPosix,
} from "./helpers/esm-graph.mjs";

test("ESM: 手書きJSの全importが解決でき、要求するexport名が実在する", () => {
  const files = sourceJsFiles();
  assert.ok(files.length >= 25, `対象JSが少なすぎる(検出漏れ?): ${files.length}`);
  const { problems, edgeCount } = analyzeGraph(JS_ROOT, files);
  assert.deepEqual(problems, [], `import graphに不整合:\n  ${problems.join("\n  ")}`);
  assert.ok(edgeCount >= 20, `importグラフが小さすぎる(検出漏れ?): ${edgeCount}`);
});

test("ESM: 保持中の【全世代】のリリースツリーでimport graphが成立し、各世代が自世代に閉じている", () => {
  const root = join(JS_ROOT, VERSIONED_DIRNAME);
  assert.ok(existsSync(root), "リリース単位JSツリーが未生成(npm run build:pages 未実行?)");
  const versions = readdirSync(root).filter((n) => statSync(join(root, n)).isDirectory());
  assert.ok(versions.length >= 1, "世代ディレクトリが1つもない");
  assert.ok(versions.length <= 4, `保持世代が上限(4)を超えている: ${versions.join(", ")}`);

  for (const version of versions) {
    const versionRoot = join(root, version);
    const files = walkJs(versionRoot);
    assert.ok(files.length >= 25, `${version}: ツリーが不完全(${files.length}ファイル)`);
    const { problems, edgeCount } = analyzeGraph(versionRoot, files);
    assert.deepEqual(problems, [], `${version}: 配信ツリーのimport graphに不整合:\n  ${problems.join("\n  ")}`);
    assert.ok(edgeCount >= 20, `${version}: importグラフが小さすぎる: ${edgeCount}`);

    // 世代の独立性: この世代のモジュールが解決する先は必ず【同じ世代のディレクトリ配下】。
    // 過去世代が現行版の子モジュールを参照してしまうと、世代を残す意味がなくなる。
    const prefix = toPosix(versionRoot) + "/";
    for (const f of files) {
      for (const imp of parseModule(readFileSync(f, "utf8")).imports) {
        const resolved = toPosix(join(dirname(f), imp.spec));
        assert.ok(resolved.startsWith(prefix),
          `${version}: 世代外への参照 ${toPosix(f)} → ${imp.spec}`);
        assert.ok(existsSync(resolved), `${version}: 参照先が存在しない ${imp.spec}`);
      }
    }
  }
});

test("ESM: 循環importが存在しない(新規発生させない)", () => {
  const { edges } = analyzeGraph(JS_ROOT, sourceJsFiles());
  const cycles = findCycles(edges).map((c) => c.map((p) => toPosix(relative(JS_ROOT, p))).join(" → "));
  assert.deepEqual(cycles, [], "循環importが検出された");
});

test("ESM: 全モジュールがESMとして構文上成立する(node --check)", () => {
  /** @type {string[]} */
  const failed = [];
  for (const f of sourceJsFiles()) {
    try {
      execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
    } catch (e) {
      failed.push(`${f}: ${e instanceof Error ? e.message.split("\n").slice(0, 3).join(" ") : String(e)}`);
    }
  }
  assert.deepEqual(failed, [], `構文エラー:\n  ${failed.join("\n  ")}`);
});

test("ESM解析器の自己検査: named/default/名前空間importとJSDoc型参照を正しく扱える", () => {
  // 解析器そのものが機能していることを保証する(検出漏れで無言PASSするのを防ぐ)
  const child = parseModule("export const A = 1;\nexport function b() {}\nexport default 5;\n");
  assert.deepEqual([...child.localExports].sort(), ["A", "b", "default"]);

  const entry = parseModule('import d, { A, B as C } from "./child.js";\nimport * as ns from "./x.js";\n');
  assert.equal(entry.imports.length, 2);
  assert.equal(entry.imports[0]?.def, "d");
  assert.deepEqual(entry.imports[0]?.named.map((n) => n.imported), ["A", "B"]);
  assert.equal(entry.imports[1]?.ns, "ns");

  // JSDocの型参照をimportとして誤検出しないこと(誤検出すると本物の不整合が埋もれる)
  const jsdoc = parseModule('/** @typedef {import("./types.js").Product} Product */\nconst x = 1;\n');
  assert.equal(jsdoc.imports.length, 0);

  // 再エクスポートの解決
  const reexp = parseModule('export { a, b as c } from "./other.js";\nexport * from "./all.js";\n');
  assert.equal(reexp.reExports.length, 2);
});
