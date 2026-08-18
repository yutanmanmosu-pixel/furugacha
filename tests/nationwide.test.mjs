// @ts-check
// 全国自治体データ化(2026-08-18)の回帰テスト。
// 構成:
//  [A] 生成ロジック(xlsxパース+収録ポリシー)を合成フィクスチャで常時検証
//  [B] municipalities.json 実データへの全国版チェック
//      — meta.isStarterSubset === false のときに全項目を厳格検証。
//        スターター状態では skip 表示になり、
//        `node scripts/update-municipalities.mjs --fetch` 実行後に自動で有効化される。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildMunicipalities, NORTHERN_TERRITORIES } from "../scripts/update-municipalities.mjs";
import { checkDigit, isValidCode, PREF_BY_CODE, REGION_BY_PREF } from "../scripts/muni-utils.mjs";
import { filterByScope } from "../public/assets/js/lib/gacha.js";

const c6 = (b5) => b5 + String(checkDigit(b5));

// ---------------- [A] 生成ロジック検証(常時実行) ----------------
import { readFileSync as rf, writeFileSync as wf, unlinkSync as rmf, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import zlib from "node:zlib";
import { readXlsxRowsViaPython } from "../scripts/update-municipalities.mjs";

// A1: 収録ポリシー(行データ→レコード)。XLSX読込方式の変更に依存しない不変仕様。
test("生成ロジック: 収録ポリシー(政令区除外/23区収録/北方6村除外/都道府県行除外/検査数字)", () => {
  const rows = [
    ["団体コード", "都道府県名", "市区町村名"],
    [c6("01000"), "北海道", ""],
    [c6("01100"), "北海道", "札幌市"],
    [c6("01101"), "北海道", "札幌市中央区"],
    [c6("01695"), "北海道", "色丹村"],
    [c6("01700"), "北海道", "蘂取村"],
    [c6("08546"), "茨城県", "境町"],
    [c6("13101"), "東京都", "千代田区"],
    [c6("13104"), "東京都", "新宿区"],
    [c6("14100"), "神奈川県", "横浜市"],
    [c6("14103"), "神奈川県", "横浜市西区"],
    [c6("20602"), "長野県", "南牧村"],
    ["999999", "架空県", "存在しない市"],
  ];
  const { out, stats } = buildMunicipalities(rows);
  assert.deepEqual(out.map((m) => m.municipality), ["札幌市", "境町", "千代田区", "新宿区", "横浜市", "南牧村"]);
  assert.equal(stats.prefectureRows, 1);
  assert.equal(stats.seireiWards, 2);
  assert.equal(stats.northern, 2);
  assert.equal(stats.tokyoWards, 2);
  assert.equal(stats.cities, 2);
  assert.equal(stats.towns, 1);
  assert.equal(stats.villages, 1);
  const sakai = out.find((m) => m.municipality === "境町");
  assert.equal(sakai?.municipalityCode, "085464");
  assert.equal(sakai?.region, "関東");
  for (const m of out) assert.ok(isValidCode(m.municipalityCode));
});

// ---- 正規のZIP(central directory + EOCD, 無圧縮)をNode標準だけで合成 ----
const crc32 = typeof zlib.crc32 === "function"
  ? (/** @param {Buffer} b */ (b) => zlib.crc32(b) >>> 0)
  : (/** @param {Buffer} b */ (b) => { let c = 0xFFFFFFFF; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (~c) >>> 0; });

/** @param {{name:string,data:string}[]} entries */
function makeProperZip(entries) {
  const locals = []; const centrals = []; let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const data = Buffer.from(e.data, "utf8");
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, name]));
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

function fixtureXlsx() {
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const wb = `<?xml version="1.0"?><workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="R6.1.1現在" sheetId="1" r:id="rId9"/></sheets></workbook>`;
  const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="styles" Target="styles.xml"/><Relationship Id="rId9" Type="worksheet" Target="worksheets/sheetZZ.xml"/></Relationships>`;
  const sst = `<?xml version="1.0"?><sst ${NS}><si><t>団体コード</t></si><si><t>都道府県名</t></si><si><t>市区町村名</t></si><si><t>北海道</t></si><si><r><t>境</t></r><r><t>町</t></r></si><si><t>茨城県</t></si><si><t>東京都</t></si><si><t>千代田区</t></si></sst>`;
  const sheet = `<?xml version="1.0"?><worksheet ${NS}><sheetData>` +
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>` +
    `<row r="2"><c r="A2"><v>11002</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="inlineStr"><is><t>札幌市</t></is></c></row>` +
    `<row r="3"><c r="A3"><v>85464.0</v></c><c r="B3" t="s"><v>5</v></c><c r="C3" t="s"><v>4</v></c></row>` +
    `<row r="4"><c r="A4" t="inlineStr"><is><t>131016</t></is></c><c r="B4" t="s"><v>6</v></c><c r="C4" t="s"><v>7</v></c></row>` +
    `<row r="5"><c r="A5"/><c r="C5" t="inlineStr"><is><t>メモ</t></is></c></row>` +
    `</sheetData></worksheet>`;
  return makeProperZip([
    { name: "xl/workbook.xml", data: wb },
    { name: "xl/_rels/workbook.xml.rels", data: rels },
    { name: "xl/sharedStrings.xml", data: sst },
    { name: "xl/worksheets/sheetZZ.xml", data: sheet },
  ]);
}

// A2: Python helper結合テスト(rels解決/共有文字列ラン/inlineStr/数値セル/空セル/列位置)
test("XLSXリーダー: Python helper経由で実xlsx相当の構造を正しく読める", () => {
  const tmp = join(tmpdir(), `furugacha-fixture-${process.pid}.xlsx`);
  wf(tmp, fixtureXlsx());
  try {
    const rows = readXlsxRowsViaPython(tmp);
    assert.deepEqual(rows[1], ["11002", "北海道", "札幌市"]);
    assert.deepEqual(rows[2], ["85464", "茨城県", "境町"], "数値セル(85464.0)の正規化と<r>ラン結合");
    assert.deepEqual(rows[3], ["131016", "東京都", "千代田区"]);
    assert.deepEqual(rows[4], ["", "", "メモ"], "空セル・欠損列の位置合わせ");
    const { out, stats } = buildMunicipalities(rows);
    assert.deepEqual(out.map((m) => m.municipality), ["札幌市", "境町", "千代田区"]);
    assert.equal(out.find((m) => m.municipality === "境町")?.municipalityCode, "085464", "数値セル由来コードのゼロ埋め");
    assert.equal(stats.tokyoWards, 1);
  } finally {
    try { rmf(tmp); } catch { /* noop */ }
  }
});

// A3: 不正ZIPは分かりやすいメッセージで失敗し、municipalities.jsonは無傷
test("XLSXリーダー: 不正なZIPは『解析に失敗』として扱い、JSONを破壊しない", () => {
  const dataPath = "public/assets/data/municipalities.json";
  const before = statSync(dataPath).mtimeMs;
  const tmp = join(tmpdir(), `furugacha-broken-${process.pid}.xlsx`);
  wf(tmp, Buffer.from("PKこれはzipではない壊れたデータ", "utf8"));
  try {
    assert.throws(() => readXlsxRowsViaPython(tmp), /自治体Excelの解析に失敗しました/);
  } finally {
    try { rmf(tmp); } catch { /* noop */ }
  }
  assert.equal(statSync(dataPath).mtimeMs, before, "失敗時にJSONへ書き込んではいけない");
});

// A4: CLIは build 成功後にのみ書き込む(順序をソースで固定)
test("更新CLI: 全解析・build成功後に municipalities.json を書き込む構造", () => {
  const src = rf("scripts/update-municipalities.mjs", "utf8");
  const buildIdx = src.indexOf("buildMunicipalities(rows)");
  const writeIdx = src.indexOf("writeFileSync(dest");
  assert.ok(buildIdx > 0 && writeIdx > buildIdx, "writeはbuildの後でなければならない");
  assert.match(src, /途中失敗ではJSONを破壊しない/);
  assert.ok(!/unzipEntry|inflateRawSync/.test(src), "独自ZIPパーサが残っている");
});

// ---------------- [B] 実データの全国版チェック ----------------
const data = JSON.parse(readFileSync("public/assets/data/municipalities.json", "utf8"));
/** @type {{prefecture:string,municipality:string,municipalityCode:string,region:string}[]} */
const list = data.municipalities;
const nationwide = data.meta?.isStarterSubset === false;
const SKIP = nationwide ? false
  : "スターターデータのためスキップ(node scripts/update-municipalities.mjs --fetch で全国化後に有効)";

test("全国版: meta(counts整合・isStarterSubset=false・全国規模の件数)", { skip: SKIP }, () => {
  const c = data.meta.counts;
  assert.ok(c, "meta.countsがない(最新のupdateスクリプトで生成してください)");
  assert.equal(c.total, list.length);
  assert.equal(c.cities + c.towns + c.villages + c.tokyoWards, c.total, "内訳の合計が総数と一致しない");
  assert.equal(c.tokyoWards, 23);
  assert.equal(c.excluded.northernTerritories, 6);
  // 「公式行数 − 都道府県行 − 政令区 − 北方6村 = 収録数」を機械検証(固定値への切り詰め禁止の担保)
  assert.equal(c.sourceRows - c.excluded.prefectureRows - c.excluded.seireiWards - c.excluded.northernTerritories, c.total);
  assert.ok(c.total > 1700 && c.total < 1800, `全国規模の件数ではない: ${c.total}`);
});

test("全国版: 47都道府県すべて存在・都道府県コードと名称・地方区分の一致", { skip: SKIP }, () => {
  const prefs = new Set(list.map((m) => m.prefecture));
  assert.equal(prefs.size, 47);
  for (const m of list) {
    assert.equal(PREF_BY_CODE[m.municipalityCode.slice(0, 2)], m.prefecture, `${m.municipalityCode} ${m.municipality}`);
    assert.equal(REGION_BY_PREF[m.prefecture], m.region);
  }
});

test("全国版: 全コード6桁・チェックディジット正常・重複ゼロ", { skip: SKIP }, () => {
  const seen = new Set();
  for (const m of list) {
    assert.match(m.municipalityCode, /^\d{6}$/);
    assert.ok(isValidCode(m.municipalityCode), m.municipalityCode);
    assert.ok(!seen.has(m.municipalityCode), `コード重複: ${m.municipalityCode}`);
    seen.add(m.municipalityCode);
  }
});

test("全国版: 東京23特別区がすべて存在", { skip: SKIP }, () => {
  const tokyo = list.filter((m) => m.municipalityCode.startsWith("13") && m.municipality.endsWith("区"));
  assert.equal(tokyo.length, 23);
  const names = new Set(tokyo.map((m) => m.municipality));
  for (const w of ["千代田区", "中央区", "港区", "新宿区", "渋谷区", "世田谷区", "江戸川区"]) {
    assert.ok(names.has(w), `${w}がない`);
  }
});

test("全国版: 政令指定都市の行政区が混入していない・市本体は存在", { skip: SKIP }, () => {
  for (const m of list) {
    assert.ok(!(m.municipality.endsWith("区") && m.municipality.includes("市")), `行政区が混入: ${m.municipality}`);
    if (m.municipality.endsWith("区")) assert.ok(m.municipalityCode.startsWith("13"), `東京都以外の区: ${m.prefecture}${m.municipality}`);
  }
  const names = new Set(list.map((m) => m.municipality));
  for (const city of ["札幌市", "横浜市", "名古屋市", "大阪市", "福岡市"]) assert.ok(names.has(city), `${city}がない`);
  for (const ward of ["札幌市中央区", "横浜市西区", "名古屋市中区", "大阪市北区", "福岡市博多区"]) assert.ok(!names.has(ward), `${ward}が混入`);
});

test("全国版: 北方領土6村がポリシー通り除外されている", { skip: SKIP }, () => {
  for (const [b5, name] of NORTHERN_TERRITORIES) {
    assert.ok(!list.some((m) => m.municipalityCode.startsWith(b5)), `${name}(${b5})が混入`);
  }
});

test("全国版: 主要自治体の存在(市・町・村・特別区を各1件以上明示確認)", { skip: SKIP }, () => {
  const has = (pref, name) => list.some((m) => m.prefecture === pref && m.municipality === name);
  assert.ok(has("北海道", "札幌市"));      // 市
  assert.ok(has("茨城県", "境町"));        // 町
  assert.ok(has("長野県", "白馬村"));      // 村
  assert.ok(has("東京都", "千代田区"));    // 特別区
  assert.ok(has("福岡県", "糸島市"));
  assert.ok(has("沖縄県", "那覇市"));
});

test("全国版: 抽選スコープ(全国/9地方/47都道府県)がすべて機能し等確率プールが空にならない", { skip: SKIP }, () => {
  assert.equal(filterByScope(list, { type: "all" }).length, list.length);
  const regions = ["北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州", "沖縄"];
  const regionSlugs = { "北海道": "hokkaido", "東北": "tohoku", "関東": "kanto", "中部": "chubu", "近畿": "kinki", "中国": "chugoku", "四国": "shikoku", "九州": "kyushu", "沖縄": "okinawa" };
  for (const r of regions) {
    const n = filterByScope(list, { type: "region", slug: regionSlugs[r] }).length;
    assert.ok(n > 0, `地方scopeが0件: ${r}`);
  }
  for (const code of Object.keys(PREF_BY_CODE)) {
    const pref = PREF_BY_CODE[code];
    const n = list.filter((m) => m.prefecture === pref).length;
    assert.ok(n > 0, `都道府県scopeが0件: ${pref}`);
  }
});

test("全国版: コード直接参照(?code= 相当)で全国の自治体を引ける", { skip: SKIP }, () => {
  const byCode = new Map(list.map((m) => [m.municipalityCode, m]));
  for (const probe of ["011002", "131016", "085464", "402303", "472018"]) { // 札幌/千代田/境/糸島(公式CSVで402303確認)/那覇
    assert.ok(byCode.get(probe), `codeで引けない: ${probe}`);
  }
  assert.equal(byCode.size, list.length);
});
