// @ts-check
// ESM import graph 解析ヘルパ(2026-09-08 / テスト専用・依存追加なし)
//
// 「文字列が含まれているか」ではなく【importが実際に解決できるか】を検証するための最小解析器。
// import文・export文はトップレベルにしか書けないため行頭アンカーで拾う。
// これによりJSDocの型参照(/** @typedef {import("./types.js").X} */)を誤検出しない。
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";

/** リリース単位JSツリー(生成物)のディレクトリ名。静的検査からは必ず除外する。 */
export const VERSIONED_DIRNAME = "v";
/** v/ 配下に残す世代数(現行版 + 過去3世代)。generate-pages.py の KEEP_VERSIONS と一致させる。
    旧HTML・中間キャッシュからの参照を404にしないために過去世代を残す。 */
export const KEEP_VERSIONS = 4;
export const JS_ROOT = join("public", "assets", "js");

/** @param {string} p */
export const toPosix = (p) => p.split("\\").join("/");

/** @param {string} dir @returns {string[]} */
export function walkJs(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkJs(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

/** 手書きJS(生成物 v/ 配下を除く) @returns {string[]} */
export function sourceJsFiles() {
  return walkJs(JS_ROOT).filter((p) => !toPosix(p).includes(`/assets/js/${VERSIONED_DIRNAME}/`));
}

/**
 * 1ファイル分のimport/exportを解析する。
 * @param {string} src
 */
export function parseModule(src) {
  /** @type {{spec:string, named:{imported:string, local:string}[], def:string|null, ns:string|null}[]} */
  const imports = [];
  /** @type {Set<string>} */
  const localExports = new Set();
  /** @type {{spec:string, names:{imported:string, exported:string}[]|"*"}[]} */
  const reExports = [];

  // import ... from "spec"  (複数行の名前リストにも対応)
  for (const m of src.matchAll(/^[ \t]*import\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/gm)) {
    const clause = m[1] ?? "";
    const spec = m[2] ?? "";
    /** @type {{imported:string, local:string}[]} */
    const named = [];
    let def = null;
    let ns = null;
    const braced = clause.match(/\{([\s\S]*?)\}/);
    if (braced) {
      for (const raw of (braced[1] ?? "").split(",")) {
        const t = raw.trim();
        if (!t) continue;
        const parts = t.split(/\s+as\s+/);
        named.push({ imported: (parts[0] ?? "").trim(), local: (parts[1] ?? parts[0] ?? "").trim() });
      }
    }
    const nsm = clause.match(/\*\s+as\s+([A-Za-z0-9_$]+)/);
    if (nsm) ns = nsm[1] ?? null;
    const head = clause.replace(/\{[\s\S]*?\}/, "").replace(/\*\s+as\s+[A-Za-z0-9_$]+/, "");
    const defm = head.match(/^\s*([A-Za-z0-9_$]+)\s*,?\s*$/);
    if (defm) def = defm[1] ?? null;
    imports.push({ spec, named, def, ns });
  }
  // 副作用import: import "spec"
  for (const m of src.matchAll(/^[ \t]*import\s*["']([^"']+)["']/gm)) {
    imports.push({ spec: m[1] ?? "", named: [], def: null, ns: null });
  }

  for (const m of src.matchAll(/^[ \t]*export\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z0-9_$]+)/gm)) {
    localExports.add(m[1] ?? "");
  }
  for (const m of src.matchAll(/^[ \t]*export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm)) {
    localExports.add(m[1] ?? "");
  }
  if (/^[ \t]*export\s+default\b/m.test(src)) localExports.add("default");

  // export * from "spec" / export * as ns from "spec"
  for (const m of src.matchAll(/^[ \t]*export\s+\*\s*(?:as\s+([A-Za-z0-9_$]+)\s*)?from\s*["']([^"']+)["']/gm)) {
    if (m[1]) localExports.add(m[1]);
    else reExports.push({ spec: m[2] ?? "", names: "*" });
  }

  // export { ... } / export { ... } from "spec"
  for (const m of src.matchAll(/^[ \t]*export\s*\{([\s\S]*?)\}\s*(?:from\s*["']([^"']+)["'])?/gm)) {
    /** @type {{imported:string, exported:string}[]} */
    const names = [];
    for (const raw of (m[1] ?? "").split(",")) {
      const t = raw.trim();
      if (!t) continue;
      const parts = t.split(/\s+as\s+/);
      names.push({ imported: (parts[0] ?? "").trim(), exported: (parts[1] ?? parts[0] ?? "").trim() });
    }
    if (m[2]) reExports.push({ spec: m[2], names });
    else for (const n of names) localExports.add(n.exported);
  }

  return { imports, localExports, reExports };
}

/**
 * ファイルの「実効export名の集合」。`export * from` は再帰的に解決する。
 * @param {string} file
 * @param {Map<string, Set<string>>} [memo]
 * @param {Set<string>} [visiting]
 * @returns {Set<string>}
 */
export function effectiveExports(file, memo = new Map(), visiting = new Set()) {
  const key = toPosix(file);
  const cached = memo.get(key);
  if (cached) return cached;
  if (visiting.has(key)) return new Set(); // export * の循環は空集合で打ち切る
  visiting.add(key);
  const parsed = parseModule(readFileSync(file, "utf8"));
  const names = new Set(parsed.localExports);
  for (const re of parsed.reExports) {
    const target = join(dirname(file), re.spec);
    if (!existsSync(target)) continue;
    const targetNames = effectiveExports(target, memo, visiting);
    if (re.names === "*") {
      for (const n of targetNames) if (n !== "default") names.add(n);
    } else {
      for (const n of re.names) names.add(n.exported);
    }
  }
  visiting.delete(key);
  memo.set(key, names);
  return names;
}

/**
 * ツリー全体のimport graphを検証し、問題の一覧を返す。
 * @param {string} root
 * @param {string[]} files
 */
export function analyzeGraph(root, files) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string, string[]>} */
  const edges = new Map();
  const memo = new Map();
  let edgeCount = 0;

  for (const f of files) {
    const rel = toPosix(relative(root, f));
    const parsed = parseModule(readFileSync(f, "utf8"));
    /** @type {string[]} */
    const out = [];
    for (const imp of parsed.imports) {
      // 外部URL(http/https)やbare specifierには手を出さない設計。あれば検出する。
      if (!imp.spec.startsWith("./") && !imp.spec.startsWith("../")) {
        problems.push(`${rel}: 相対import以外が使われている → ${imp.spec}`);
        continue;
      }
      const target = join(dirname(f), imp.spec);
      if (!existsSync(target)) {
        problems.push(`${rel}: import先が存在しない → ${imp.spec}`);
        continue;
      }
      out.push(target);
      edgeCount++;
      const provided = effectiveExports(target, memo);
      for (const n of imp.named) {
        if (!provided.has(n.imported)) {
          problems.push(
            `${rel}: '${imp.spec}' は export '${n.imported}' を提供していない ` +
            `(提供: ${[...provided].sort().join(", ") || "なし"})`
          );
        }
      }
      if (imp.def && !provided.has("default")) {
        problems.push(`${rel}: '${imp.spec}' に default export がない (import ${imp.def})`);
      }
    }
    edges.set(toPosix(f), out.map(toPosix));
  }
  return { problems, edges, edgeCount };
}

/** DFSで循環importを検出 @param {Map<string,string[]>} edges */
export function findCycles(edges) {
  /** @type {string[][]} */
  const cycles = [];
  /** @type {Map<string, number>} */
  const state = new Map();
  /** @param {string} n @param {string[]} stack */
  function dfs(n, stack) {
    state.set(n, 1);
    for (const next of edges.get(n) ?? []) {
      if (state.get(next) === 1) cycles.push([...stack.slice(stack.indexOf(next)), next]);
      else if (!state.has(next)) dfs(next, [...stack, next]);
    }
    state.set(n, 2);
  }
  for (const n of edges.keys()) if (!state.has(n)) dfs(n, [n]);
  return cycles;
}

/**
 * 「entryのソース」と「childのソース(specifier→中身)」を突き合わせ、
 * childが提供していないimport名を列挙する。＝バージョンスキュー事故の検出器。
 * 注: 本プロジェクトには `export * from` が無いため、ここでは再エクスポートの推移解決は行わない。
 * @param {string} entrySrc
 * @param {Record<string, string>} childSrcBySpec
 * @returns {string[]}
 */
export function missingImports(entrySrc, childSrcBySpec) {
  /** @type {string[]} */
  const missing = [];
  for (const imp of parseModule(entrySrc).imports) {
    const childSrc = childSrcBySpec[imp.spec];
    if (childSrc === undefined) continue;
    const provided = parseModule(childSrc).localExports;
    for (const n of imp.named) {
      if (!provided.has(n.imported)) missing.push(`${imp.spec}: ${n.imported}`);
    }
    if (imp.def && !provided.has("default")) missing.push(`${imp.spec}: default`);
  }
  return missing;
}
