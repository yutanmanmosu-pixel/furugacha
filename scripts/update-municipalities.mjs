#!/usr/bin/env node
// ============================================================
// 総務省「全国地方公共団体コード」から自治体データを全件更新するスクリプト
//
// 使い方:
//   1. 総務省の公式ページから最新の一覧(Excel)を取得
//      https://www.soumu.go.jp/denshijiti/code.html
//   2. Excelを開き「都道府県コード及び市区町村コード」シートを
//      CSV(UTF-8)で保存する (列: 団体コード, 都道府県名, 市区町村名, ...)
//   3. node scripts/update-municipalities.mjs path/to/code.csv
//
// 政令指定都市の行政区(例: 011011 札幌市中央区)は除外し、
// 市区町村単位(東京23区は特別区として収録)で出力します。
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isValidCode, REGION_BY_PREF } from "./muni-utils.mjs";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("使い方: node scripts/update-municipalities.mjs <総務省コード一覧CSV>");
  process.exit(1);
}

const buf = readFileSync(csvPath);
// Shift_JISで保存された場合にも対応(Node同梱ICUでデコード)
let text;
try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
catch { text = new TextDecoder("shift_jis").decode(buf); }

const rows = text.split(/\r?\n/).map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "").trim()));

const out = [];
const seen = new Set();
for (const cols of rows) {
  const [code, pref, name] = cols;
  if (!code || !/^\d{6}$/.test(code)) continue;      // ヘッダ等をスキップ
  if (!name) continue;                                // 都道府県自体の行(市区町村名なし)を除外
  if (!isValidCode(code)) { console.warn(`検査数字不一致のためスキップ: ${code} ${pref}${name}`); continue; }
  const cityPart = Number(code.slice(2, 5));
  // 政令市の行政区(101〜199で「区」だが特別区を除く)を除外: 東京都(13)の1xx区は特別区として収録
  const isWard = name.endsWith("区");
  const isTokyoSpecialWard = code.startsWith("13") && cityPart >= 101 && cityPart <= 123;
  if (isWard && !isTokyoSpecialWard) continue;
  const region = REGION_BY_PREF[pref];
  if (!region) { console.warn(`地方区分不明のためスキップ: ${pref}`); continue; }
  if (seen.has(code)) continue;
  seen.add(code);
  out.push({ prefecture: pref, municipality: name, municipalityCode: code, region });
}

out.sort((a, b) => a.municipalityCode.localeCompare(b.municipalityCode));

const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "public/assets/data/municipalities.json");
const payload = {
  meta: {
    note: "総務省『全国地方公共団体コード』より生成。",
    source: "https://www.soumu.go.jp/denshijiti/code.html",
    updatedAt: new Date().toISOString().slice(0, 10),
    isStarterSubset: false
  },
  municipalities: out
};
writeFileSync(dest, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`書き出し完了: ${out.length}自治体 → ${dest}`);
console.log("続けて npm run validate:data で整合性を確認してください。");
