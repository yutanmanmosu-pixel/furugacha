// @ts-check
// 自治体ガチャ: 返礼品0件(楽天正常応答) / 楽天APIエラー時の案内(2026-09-08 再実装)。
// 重要: itemsとstatusは同一requestの戻り値として扱い、module-levelの可変stateは持たない
//       (旧 getLastMunicipalityFetch 方式は本番停止の一因になったため復活させない)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchMunicipalityProducts, productsEmptyState } from "../public/assets/js/lib/municipality-products.js";

const FORBIDDEN = ["返礼品がありません", "返礼品はありません", "実施していません", "寄附できません"];

/** console.warn を黙らせて fn を実行する(取得エラー系テストのノイズ抑止) */
async function quiet(fn) {
  const orig = console.warn;
  console.warn = () => {};
  try { return await fn(); } finally { console.warn = orig; }
}

/* ---------- A. 正常0件 ---------- */

test("A: 楽天正常0件 → status:empty、『楽天ふるさと納税で確認できませんでした』に限定し断定しない", async () => {
  const r = await fetchMunicipalityProducts(async () => []);
  assert.deepEqual(r, { items: [], status: "empty" });

  const st = productsEmptyState(r.status);
  assert.equal(st.kind, "empty");
  assert.ok(st.title.includes("楽天ふるさと納税で"), "「楽天で確認できなかった」範囲に限定していない");
  assert.ok(st.title.includes("確認できませんでした"));
  assert.equal(st.title, "現在、楽天ふるさと納税でこの自治体の返礼品を確認できませんでした。");
  assert.equal(st.sub, "掲載状況は変更される場合があります。");
  for (const ng of FORBIDDEN) assert.ok(!(st.title + st.sub).includes(ng), `断定表現を含んではいけない: ${ng}`);
});

test("A: 生成物に案内ブロック・再ガチャ導線・/search/ CTAが揃っている(検索CTAは既存を再利用)", () => {
  for (const f of ["public/gacha/index.html", "public/index.html"]) {
    const html = readFileSync(f, "utf8");
    const start = html.indexOf('id="products"');
    const sec = html.slice(start, html.indexOf("</section>", start));
    assert.ok(sec.includes('<div id="products-empty" class="products-empty" hidden>'), `案内ブロックがない/初期非表示でない: ${f}`);
    assert.ok(sec.includes('id="products-empty-title"') && sec.includes('id="products-empty-sub"'), f);
    assert.ok(sec.includes('<button id="products-empty-again" type="button" class="btn btn--ghost">'), `再ガチャ導線がない: ${f}`);
    assert.ok(sec.includes('class="search-fallback-cta__link" href="/search/"'), `/search/ CTAが同セクションにない: ${f}`);
    assert.equal((html.match(/search-fallback-cta__link/g) ?? []).length, 1, `検索CTAを複製してはいけない(既存を再利用): ${f}`);
  }
  const css = readFileSync("public/assets/css/style.css", "utf8");
  assert.match(css, /\.products-empty \{[^}]*background: var\(--cream\)/, "エラー色ではなく淡い背景にする");
  assert.ok(!/\.products-empty \{[^}]*(red|#[fF][0-9a-fA-F]{0,1}[0-9a-fA-F]{2}0{2})/.test(css), "赤系で強調してはいけない");
});

/* ---------- B. APIエラー ---------- */

test("B: 取得失敗 → status:error、『返礼品を取得できませんでした』で0件文言と混同しない", async () => {
  const r = await quiet(() => fetchMunicipalityProducts(async () => { throw new Error("products API 500"); }));
  assert.deepEqual(r, { items: [], status: "error" });

  const st = productsEmptyState(r.status);
  assert.equal(st.kind, "error");
  assert.equal(st.title, "返礼品を取得できませんでした。");
  assert.equal(st.sub, "時間をおいてもう一度お試しください。");
  assert.ok(!st.title.includes("確認できませんでした"), "APIエラー時に0件文言を出してはいけない");
  assert.ok(!st.title.includes("楽天ふるさと納税で"), "APIエラーを楽天0件と読ませてはいけない");
  for (const ng of FORBIDDEN) assert.ok(!(st.title + st.sub).includes(ng), `断定表現を含んではいけない: ${ng}`);
});

/* ---------- C. requestとstatusの結び付き ---------- */

test("C: itemsとstatusが同一requestの戻り値として一緒に返る", async () => {
  const items = [{ id: "x", title: "テスト", amount: 10000, municipality: "テスト市", prefecture: "テスト県" }];
  const r = await fetchMunicipalityProducts(async () => /** @type {any} */ (items));
  assert.equal(r.status, "ok");
  assert.equal(r.items, items, "同一requestで取得したitemsがそのまま返っていない");
});

test("C: 連続した非同期requestで、後発の結果と先発のstatusが混ざらない", async () => {
  const later = [{ id: "b", title: "後発", amount: 12000, municipality: "後発市", prefecture: "後発県" }];
  // 先発: 遅く失敗する / 後発: 速く成功する(先発の完了前に後発が解決する)
  const slowError = quiet(() => fetchMunicipalityProducts(async () => {
    await new Promise((r) => setTimeout(r, 40));
    throw new Error("upstream down");
  }));
  const fastOk = fetchMunicipalityProducts(async () => {
    await new Promise((r) => setTimeout(r, 1));
    return /** @type {any} */ (later);
  });
  const [a, b] = await Promise.all([slowError, fastOk]);
  assert.deepEqual(a, { items: [], status: "error" }, "先発requestが後発の結果を拾ってしまっている");
  assert.equal(b.status, "ok");
  assert.deepEqual(b.items, later, "後発requestが先発のstatus/itemsに汚染されている");
});

test("C: module-levelの last-fetch state / getLastMunicipalityFetch を復活させていない", () => {
  const lib = readFileSync("public/assets/js/lib/municipality-products.js", "utf8");
  const prov = readFileSync("public/assets/js/providers/index.js", "utf8");
  const app = readFileSync("public/assets/js/pages/gacha-app.js", "utf8");
  for (const [name, src] of [["lib", lib], ["providers", prov], ["gacha-app", app]]) {
    assert.ok(!src.includes("getLastMunicipalityFetch"), `旧方式が復活している: ${name}`);
    assert.ok(!/^\s*let\s+last[A-Za-z]*Fetch/m.test(src), `module-levelの可変last-fetch stateがある: ${name}`);
  }
  // 取得結果の状態は戻り値で受け取る
  assert.ok(app.includes("searchByMunicipalityDetailed("), "同一requestのitems+statusを使っていない");
  assert.ok(app.includes('if (result.status !== "ok")'), "0件/エラーの分岐がない");
  assert.ok(app.includes('showProductsEmpty("error")'), "例外時のエラー案内がない");
  assert.ok(app.includes("els.btnAgain.click()"), "既存の再抽選導線を再利用していない");
  assert.ok(lib.includes('status: items.length > 0 ? "ok" : "empty"'), "正常0件と成功を区別していない");
});

test("C: 楽天モードの詳細取得はmockへフォールバックしない / 予算ガチャのフォールバックは従来どおり", () => {
  const prov = readFileSync("public/assets/js/providers/index.js", "utf8");
  assert.ok(prov.includes("withMunicipalityDetail(withFallback, rakuten)"),
    "自治体ガチャの詳細取得が楽天の実応答を使っていない(サンプルを実返礼品に見せてはいけない)");
  assert.ok(prov.includes("return mock.searchByBudget(q);"), "予算ガチャのフォールバック仕様を変更してはいけない");
  assert.ok(prov.includes("return mock.searchByMunicipality(q);"), "既存 searchByMunicipality の後方互換を壊してはいけない");
  // 楽天クライアント・認証の複製をしていない
  assert.equal((prov.match(/new RakutenFurusatoProductProvider\(\)/g) ?? []).length, 1);
  const lib = readFileSync("public/assets/js/lib/municipality-products.js", "utf8");
  assert.ok(!/fetch\(|accessKey|applicationId|\/api\/products/.test(lib), "楽天API呼び出しを複製してはいけない");
});

/* ---------- 統合: Provider経由で0件/エラー/正常を区別する ---------- */

test("統合: 楽天モードのProviderが 0件→empty / 500→error / 商品あり→ok を返す", async () => {
  const g = /** @type {any} */ (globalThis);
  const origFetch = g.fetch;
  const origLocation = Object.getOwnPropertyDescriptor(g, "location");
  g.location = { search: "" };
  /** @type {{status:number, products?:any[]}} */
  let next = { status: 200, products: [] };
  g.fetch = async (/** @type {any} */ url) => {
    const u = String(url);
    if (u.startsWith("/api/status")) {
      return { ok: true, json: async () => ({ mode: "rakuten", hasAffiliate: false }) };
    }
    if (next.status !== 200) return { ok: false, status: next.status, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ products: next.products ?? [] }) };
  };
  try {
    const { getProvider } = await import("../public/assets/js/providers/index.js");
    const { provider, mode } = await getProvider();
    assert.equal(mode, "rakuten");
    const q = { municipality: "テスト市", prefecture: "テスト県", municipalityCode: "012345", limit: 12 };

    next = { status: 200, products: [] };
    const empty = await provider.searchByMunicipalityDetailed(q);
    assert.deepEqual(empty, { items: [], status: "empty" }, "楽天0件でサンプル商品を返してはいけない");

    next = { status: 500 };
    const err = await quiet(() => provider.searchByMunicipalityDetailed(q));
    assert.deepEqual(err, { items: [], status: "error" });

    next = { status: 200, products: [{ id: "r1", title: "本物", amount: 10000 }] };
    const ok = await provider.searchByMunicipalityDetailed(q);
    assert.equal(ok.status, "ok");
    assert.equal(ok.items.length, 1);
    assert.ok(!ok.items.some((/** @type {any} */ p) => p.isMock), "サンプル商品が混ざってはいけない");
  } finally {
    g.fetch = origFetch;
    if (origLocation) Object.defineProperty(g, "location", origLocation); else delete g.location;
  }
});
