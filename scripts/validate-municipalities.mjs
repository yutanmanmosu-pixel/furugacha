#!/usr/bin/env node
// 自治体データ整合性チェック
//  - 6桁コード形式・検査数字
//  - コード上2桁と都道府県名の一致
//  - 都道府県と地方区分の一致
//  - コード重複
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isValidCode, PREF_BY_CODE, REGION_BY_PREF } from "./muni-utils.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = JSON.parse(readFileSync(join(root, "public/assets/data/municipalities.json"), "utf8"));
const list = raw.municipalities;

const errors = [];
const seen = new Set();
for (const m of list) {
  const tag = `${m.prefecture} ${m.municipality} (${m.municipalityCode})`;
  if (!isValidCode(m.municipalityCode)) errors.push(`検査数字エラー: ${tag}`);
  const pref = PREF_BY_CODE[m.municipalityCode.slice(0, 2)];
  if (pref !== m.prefecture) errors.push(`都道府県不一致: ${tag} → コード上は ${pref}`);
  if (REGION_BY_PREF[m.prefecture] !== m.region) errors.push(`地方区分不一致: ${tag} region=${m.region}`);
  if (seen.has(m.municipalityCode)) errors.push(`コード重複: ${tag}`);
  seen.add(m.municipalityCode);
}
console.log(`収録自治体数: ${list.length}`);
const prefs = new Set(list.map((m) => m.prefecture));
console.log(`都道府県カバー: ${prefs.size}/47`);
if (errors.length) {
  console.error(`NG (${errors.length}件):`);
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
}
console.log("OK: すべてのコード検査に合格しました。");
