#!/usr/bin/env node
// ============================================================
// 総務省「全国地方公共団体コード」から自治体データを全件更新するスクリプト
//
// 使い方(推奨: 公式Excelを直接取得して全自動生成):
//   node scripts/update-municipalities.mjs --fetch
//
// 手動ダウンロード済みファイルから生成する場合:
//   node scripts/update-municipalities.mjs path/to/code.xlsx
//   node scripts/update-municipalities.mjs path/to/code.csv   (UTF-8/Shift_JIS)
//
// 公式ソース(一次情報):
//   総務省「都道府県コード及び市区町村コード」
//   https://www.soumu.go.jp/denshijiti/code.html
//   Excel: https://www.soumu.go.jp/main_content/000925835.xlsx (令和6年1月1日更新)
//
// 収録ポリシー:
//   - 市・町・村・東京都23特別区を収録(基礎自治体)
//   - 都道府県行(市区町村名なし)は除外
//   - 政令指定都市の行政区(例: 011011 札幌市中央区)は除外(市本体は収録)
//   - 北方領土6村(色丹村・泊村・留夜別村・留別村・紗那村・蘂取村
//     /コード016951〜017001)は除外
//     …統計上コードは存在するが、実際のふるさと納税の寄附先を探す
//       本サービスの目的に合わないため(除外はデータ生成ルールとしてのみ扱う)
//   - 自治体コードは公式値のみ使用(チェックディジット検証あり・推測生成なし)
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isValidCode, REGION_BY_PREF, PREF_BY_CODE } from "./muni-utils.mjs";

export const OFFICIAL_XLSX_URL = "https://www.soumu.go.jp/main_content/000925835.xlsx";
export const OFFICIAL_PAGE_URL = "https://www.soumu.go.jp/denshijiti/code.html";
export const OFFICIAL_REVISION = "令和6年1月1日更新"; // 総務省ページ記載の基準(取得時に要確認)

/** 北方領土6村(5桁コード)。名称も照合し、想定外なら除外せず警告する。 */
export const NORTHERN_TERRITORIES = new Map([
  ["01695", "色丹村"], ["01696", "泊村"], ["01697", "留夜別村"],
  ["01698", "留別村"], ["01699", "紗那村"], ["01700", "蘂取村"]
]);

// ---------------- xlsx読み込み: Python標準ライブラリhelperへ委譲 ----------------
// 独自ZIPパーサは実際の総務省xlsx(data descriptor使用)でZ_BUF_ERRORとなったため撤去。
// zipfile/ElementTreeによる scripts/read-municipality-xlsx.py が安全に行データを返す。
import { spawnSync } from "node:child_process";
import { writeFileSync as writeTmp, unlinkSync, readFileSync as readHead } from "node:fs";
import { tmpdir } from "node:os";

const HELPER = join(dirname(fileURLToPath(import.meta.url)), "read-municipality-xlsx.py");

/** Python実行コマンドの候補(Windowsはpyランチャー優先) */
const PY_CANDIDATES = process.platform === "win32"
  ? [["py", ["-3"]], ["python", []], ["python3", []]]
  : [["python3", []], ["python", []]];

/**
 * xlsxファイルをPython helperで読み、行(二次元配列)を返す。
 * 失敗時はユーザー向けメッセージ付きErrorをthrow(呼び出し側はjsonを書き換えない)。
 * @param {string} xlsxPath
 * @returns {string[][]}
 */
export function readXlsxRowsViaPython(xlsxPath) {
  let lastErr = "";
  for (const [cmd, pre] of PY_CANDIDATES) {
    const r = spawnSync(cmd, [...pre, HELPER, xlsxPath], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    if (r.error) {
      if (/** @type {any} */ (r.error).code === "ENOENT") { lastErr = `${cmd} が見つかりません`; continue; }
      throw new Error(`自治体Excelの解析に失敗しました:\n原因: Python起動エラー(${cmd}): ${r.error.message}`);
    }
    if (r.status !== 0) {
      const summary = (r.stderr || "").trim().split(/\r?\n/).slice(-3).join(" / ") || `exit code ${r.status}`;
      throw new Error(`自治体Excelの解析に失敗しました:\n原因: ${summary}`);
    }
    try {
      const rows = JSON.parse(r.stdout);
      if (!Array.isArray(rows)) throw new Error("形式不正");
      return rows;
    } catch {
      throw new Error("自治体Excelの解析に失敗しました:\n原因: helper出力(JSON)を解釈できません");
    }
  }
  throw new Error(`自治体Excelの解析に失敗しました:\n原因: Pythonが見つかりません(${lastErr})。Python 3をインストールするか、xlsxをCSVで保存して指定してください`);
}

// ---------------- 行 → 自治体レコード(収録ポリシー適用) ----------------
/**
 * @param {string[][]} rows 先頭3列 = 団体コード / 都道府県名 / 市区町村名
 * @returns {{ out: {prefecture:string,municipality:string,municipalityCode:string,region:string}[],
 *             stats: Record<string, number> }}
 */
export function buildMunicipalities(rows) {
  const out = [];
  const seen = new Set();
  const stats = { sourceRows: 0, prefectureRows: 0, seireiWards: 0, northern: 0,
                  cities: 0, towns: 0, villages: 0, tokyoWards: 0 };
  for (const cols of rows) {
    let [code, pref, name] = [cols[0] ?? "", cols[1] ?? "", cols[2] ?? ""].map((c) => String(c).trim());
    if (/^\d{4,6}$/.test(code)) code = code.padStart(6, "0"); // 数値セルで先頭0が落ちた場合の補正
    if (!/^\d{6}$/.test(code)) continue;                       // ヘッダ・注記行
    stats.sourceRows++;
    if (!name) { stats.prefectureRows++; continue; }            // 都道府県そのものの行
    if (!isValidCode(code)) { console.warn(`検査数字不一致のためスキップ: ${code} ${pref}${name}`); continue; }
    if (PREF_BY_CODE[code.slice(0, 2)] !== pref) { console.warn(`都道府県コード不一致のためスキップ: ${code} ${pref}${name}`); continue; }
    // 政令指定都市の行政区(「◯◯市△△区」)は除外。東京都特別区(131xx)は収録。
    const cityPart = Number(code.slice(2, 5));
    const isTokyoSpecialWard = code.startsWith("13") && cityPart >= 101 && cityPart <= 123;
    if (name.endsWith("区") && !isTokyoSpecialWard) { stats.seireiWards++; continue; }
    // 北方領土6村の除外(コード+名称の両方が一致した場合のみ)
    const expectNorthern = NORTHERN_TERRITORIES.get(code.slice(0, 5));
    if (expectNorthern) {
      if (expectNorthern === name) { stats.northern++; continue; }
      console.warn(`北方領土コード帯に想定外の名称: ${code} ${name}(除外せず収録)`);
    }
    const region = REGION_BY_PREF[pref];
    if (!region) { console.warn(`地方区分不明のためスキップ: ${pref}`); continue; }
    if (seen.has(code)) continue;
    seen.add(code);
    if (isTokyoSpecialWard) stats.tokyoWards++;
    else if (name.endsWith("市")) stats.cities++;
    else if (name.endsWith("町")) stats.towns++;
    else if (name.endsWith("村")) stats.villages++;
    out.push({ prefecture: pref, municipality: name, municipalityCode: code, region });
  }
  out.sort((a, b) => a.municipalityCode.localeCompare(b.municipalityCode));
  return { out, stats };
}

// ---------------- CLI ----------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const arg = process.argv[2];
  /** @type {string | null} */
  let tmpXlsx = null;
  try {
    /** @type {string[][]} */
    let rows;
    let sourceDesc;

    if (!arg || arg === "--fetch") {
      console.log(`公式Excelを取得中: ${OFFICIAL_XLSX_URL}`);
      const res = await fetch(OFFICIAL_XLSX_URL, { headers: { "user-agent": "furugacha-data-updater/1.0 (+https://furugacha.jp)" } });
      if (!res.ok) throw new Error(`公式Excelの取得に失敗しました: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // ダウンロード検証: サイズ・PKシグネチャ・Content-Type(HTMLエラーページの誤解析防止)
      const ctype = res.headers.get("content-type") ?? "";
      if (buf.length < 20_000) throw new Error(`公式Excelの取得結果が小さすぎます(${buf.length} bytes)。ネットワークやURLをご確認ください`);
      if (!(buf[0] === 0x50 && buf[1] === 0x4b)) {
        throw new Error(`取得したファイルがxlsx(ZIP)ではありません(content-type: ${ctype || "不明"})。HTMLエラーページの可能性があります`);
      }
      if (/text\/html/i.test(ctype)) throw new Error(`取得したファイルのcontent-typeがHTMLです(${ctype})`);
      console.log(`公式Excel取得完了: ${buf.length} bytes`);
      tmpXlsx = join(tmpdir(), `furugacha-soumu-code-${process.pid}-${Date.now()}.xlsx`);
      writeTmp(tmpXlsx, buf);
      rows = readXlsxRowsViaPython(tmpXlsx);
      sourceDesc = `総務省「都道府県コード及び市区町村コード」(${OFFICIAL_REVISION}) ${OFFICIAL_XLSX_URL}`;
    } else {
      const head = readHead(arg).subarray(0, 2);
      if (head[0] === 0x50 && head[1] === 0x4b) {
        rows = readXlsxRowsViaPython(arg);                       // ローカルxlsx
      } else {
        const buf = readFileSync(arg);                            // CSV(UTF-8 / Shift_JIS)
        let text;
        try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
        catch { text = new TextDecoder("shift_jis").decode(buf); }
        rows = text.split(/\r?\n/).map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "").trim()));
      }
      sourceDesc = `総務省「都道府県コード及び市区町村コード」(ローカルファイル: ${arg})`;
    }

    const { out, stats } = buildMunicipalities(rows);
    const total = out.length;
    if (total === 0) throw new Error("解析結果が0件でした。入力ファイルの形式をご確認ください(municipalities.jsonは変更していません)");

    const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "public/assets/data/municipalities.json");
    const payload = {
      meta: {
        note: `総務省「都道府県コード及び市区町村コード」(${OFFICIAL_REVISION})から生成した全国版。市・町・村・東京都23特別区を収録し、都道府県行・政令指定都市の行政区・北方領土6村は収録対象外。`,
        source: sourceDesc,
        sourcePage: OFFICIAL_PAGE_URL,
        updatedAt: new Date().toISOString().slice(0, 10),
        isStarterSubset: false,
        counts: {
          total,
          cities: stats.cities, towns: stats.towns, villages: stats.villages, tokyoWards: stats.tokyoWards,
          excluded: { prefectureRows: stats.prefectureRows, seireiWards: stats.seireiWards, northernTerritories: stats.northern },
          sourceRows: stats.sourceRows
        }
      },
      municipalities: out
    };
    // 全解析・build・sanityが成功したここで初めて書き換える(途中失敗ではJSONを破壊しない)
    writeFileSync(dest, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log("---- 生成結果 ----");
    console.log(`A. 公式元データのコード行数        : ${stats.sourceRows}`);
    console.log(`B. 都道府県行の除外                : ${stats.prefectureRows}`);
    console.log(`C. 政令指定都市の行政区の除外      : ${stats.seireiWards}`);
    console.log(`D. 北方領土6村の除外               : ${stats.northern}`);
    console.log(`E. 東京都特別区の収録              : ${stats.tokyoWards}`);
    console.log(`F. 収録自治体数(市${stats.cities}/町${stats.towns}/村${stats.villages}/特別区${stats.tokyoWards}) : ${total}`);
    console.log(`書き出し完了 → ${dest}`);
    console.log("続けて npm run validate:data と npm test を実行してください。");
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    if (tmpXlsx) { try { unlinkSync(tmpXlsx); } catch { /* noop */ } }
  }
}

