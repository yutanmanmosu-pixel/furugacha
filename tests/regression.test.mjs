// @ts-check
// ローンチ前監査(2026-08-18)で追加した回帰防止テスト。
// 目的: 「演出は何を表示しても、結果・URL・保存データは壊れない」ことを固定化する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import { rouletteNames } from "../public/assets/js/lib/gacha.js";
import { getProductDestinationUrl, FALLBACK_PRODUCT_URL } from "../public/assets/js/lib/product-link.js";
import { parseBudget, parseSalaryMan, parseCount } from "../public/assets/js/lib/validate.js";
import { escapeHtml } from "../public/assets/js/lib/format.js";
// 静的import(ここでは localStorage 未定義の素のNode環境)
import * as storagePlain from "../public/assets/js/lib/storage.js";

const M = (code, name = "テスト市", pref = "テスト県") =>
  /** @type {any} */ ({ municipalityCode: code, municipality: name, prefecture: pref });

// ---- ガチャ演出の安全性 ----
test("ルーレット候補: 件数はsteps通り・全てプール由来・末尾は当選(演出と結果の分離)", () => {
  const pool = [M("011002", "札幌市"), M("012025", "函館市"), M("012033", "小樽市")];
  const winner = pool[1];
  for (const steps of [1, 2, 18, 26]) {
    const names = rouletteNames(pool, winner, steps);
    assert.equal(names.length, steps);
    assert.equal(names[names.length - 1], winner.municipality);
    const valid = new Set(pool.map((m) => m.municipality));
    for (const n of names) assert.ok(valid.has(n), `候補外の名前が混入: ${n}`);
  }
});

test("ルーレット候補: プール1件でも成立する", () => {
  const only = M("471018", "うるま市", "沖縄県");
  const names = rouletteNames([only], only, 18);
  assert.equal(names.length, 18);
  assert.ok(names.every((n) => n === "うるま市"));
});

// ---- 商品リンクの安全性(URL injection / 欠落) ----
test("遷移先URL: productUrl欠落・不正スキームは楽天ふるさと納税トップへフォールバック", () => {
  const base = { id: "x", municipality: "", prefecture: "", title: "t", amount: 1000 };
  assert.equal(getProductDestinationUrl(/** @type {any} */ ({ ...base, productUrl: "" })), FALLBACK_PRODUCT_URL);
  assert.equal(getProductDestinationUrl(/** @type {any} */ ({ ...base })), FALLBACK_PRODUCT_URL);
  assert.equal(
    getProductDestinationUrl(/** @type {any} */ ({ ...base, productUrl: "javascript:alert(1)" })),
    FALLBACK_PRODUCT_URL
  );
  // 不正affiliate + 正常productは通常URLを使う(疑似アフィ付加をしない)
  assert.equal(
    getProductDestinationUrl(/** @type {any} */ ({ ...base, affiliateUrl: "http://evil/", productUrl: "https://item.rakuten.co.jp/x/y/" })),
    "https://item.rakuten.co.jp/x/y/"
  );
});

// ---- 入力正規化(コピペの全角数字) ----
test("全角数字入力を受け付ける(予算・年収・人数)", () => {
  assert.equal(parseBudget("５００００"), 50000);
  assert.equal(parseBudget("５0,０00円"), 50000);
  assert.equal(parseSalaryMan("５００"), 5_000_000);
  assert.equal(parseCount("３"), 3);
});

test("予算の境界値: 2000/2000000は有効、1999/2000001はnull", () => {
  assert.equal(parseBudget(2000), 2000);
  assert.equal(parseBudget(2_000_000), 2_000_000);
  assert.equal(parseBudget(1999), null);
  assert.equal(parseBudget(2_000_001), null);
});

// ---- HTMLエスケープ ----
test("escapeHtml: タグ・引用符を無害化", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a">&'`), "&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
});

// ---- localStorage 防御 ----
test("storage: localStorageが無い環境でも例外を出さず空配列", () => {
  assert.equal(storagePlain.storageAvailable(), false);
  assert.deepEqual(storagePlain.favMunicipalities(), []);
  assert.doesNotThrow(() => storagePlain.toggleFavMunicipality(M("011002")));
  assert.deepEqual(storagePlain.gachaHistory(), []);
});

test("storage: 破損JSON・不正型が入っていても空配列に回復(クラッシュしない)", async () => {
  const bag = new Map([
    ["furugacha:fav:munis:v1", "{oops"],          // 壊れたJSON
    ["furugacha:fav:products:v1", '"文字列"'],     // 配列でない
    ["furugacha:history:gacha:v1", "null"]
  ]);
  /** @type {any} */ (globalThis).localStorage = {
    getItem: (k) => bag.get(k) ?? null,
    setItem: (k, v) => { bag.set(k, v); },
    removeItem: (k) => { bag.delete(k); }
  };
  try {
    const url = pathToFileURL("public/assets/js/lib/storage.js").href + "?case=corrupt";
    const storage = await import(url); // クエリ付きで別インスタンスとして読み込み(probe成功環境)
    assert.equal(storage.storageAvailable(), true);
    assert.deepEqual(storage.favMunicipalities(), []);
    assert.deepEqual(storage.favProducts(), []);
    assert.deepEqual(storage.gachaHistory(), []);
    // 破損状態からのtoggleで正常データに復旧できる
    assert.equal(storage.toggleFavMunicipality(M("011002", "札幌市", "北海道")), true);
    assert.equal(storage.isFavMunicipality(M("011002")), true);
  } finally {
    delete (/** @type {any} */ (globalThis)).localStorage;
  }
});
