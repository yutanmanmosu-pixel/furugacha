// @ts-check
// 楽天通信層の回帰テスト(2026-08-18 本番502デバッグで追加)。
// 実ネットワークは使わず fetchImpl 注入 / globalThis.fetch 差し替えで検証する。
// 固定化する契約:
//   1) accessKey はクエリパラメータで送る(公式Test Formの成功形)・ヘッダーでは送らない
//   2) User-Agent を明示送信する
//   3) エラーは status / 楽天errorコードを保持しつつ、メッセージに資格情報・URLを含めない
//   4) 2xx+不正JSONは null(呼び出し側で0件扱い→Mockフォールバック)
//   5) budget=2000 のとき minPrice を送らない(maxPrice>minPrice制約)
import { test } from "node:test";
import assert from "node:assert/strict";
import { callRakuten, RAKUTEN_ENDPOINT, USER_AGENT } from "../functions/api/_lib/rakuten.js";
import { onRequestGet } from "../functions/api/products.js";

const CREDS = {
  RAKUTEN_APPLICATION_ID: "TEST_APP_ID_123",
  RAKUTEN_ACCESS_KEY: "TEST_ACCESS_KEY_456",
  RAKUTEN_AFFILIATE_ID: "TEST_AFF_789"
};

/** @param {number} status @param {any} body */
const jsonRes = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** fetchImplの呼び出しをキャプチャするヘルパー */
function capture(responder) {
  /** @type {{url: URL, init: RequestInit}[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const impl = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init: init ?? {} });
    return responder(url, init ?? {});
  };
  return { calls, impl };
}

test("送信形式: accessKey/applicationId/affiliateId/formatVersion=2はクエリ、UAヘッダーあり、accessKeyヘッダーなし", async () => {
  const { calls, impl } = capture(() => jsonRes(200, { items: [] }));
  await callRakuten(CREDS, { keyword: "ふるさと納税 境町", hits: "30" }, { fetchImpl: impl });
  assert.equal(calls.length, 1);
  const first = calls[0];
  assert.ok(first, "fetchが呼ばれていない");
  const { url, init } = first;
  assert.ok(url.toString().startsWith(RAKUTEN_ENDPOINT));
  assert.equal(url.searchParams.get("applicationId"), CREDS.RAKUTEN_APPLICATION_ID);
  assert.equal(url.searchParams.get("accessKey"), CREDS.RAKUTEN_ACCESS_KEY);
  assert.equal(url.searchParams.get("affiliateId"), CREDS.RAKUTEN_AFFILIATE_ID);
  assert.equal(url.searchParams.get("format"), "json");
  assert.equal(url.searchParams.get("formatVersion"), "2");
  assert.equal(url.searchParams.get("keyword"), "ふるさと納税 境町");
  const headers = new Headers(init.headers);
  assert.equal(headers.get("user-agent"), USER_AGENT);
  assert.equal(headers.get("accesskey"), null, "accessKeyをヘッダーで送ってはいけない");
});

test("affiliateId未設定なら付与しない(疑似アフィ禁止)・空クエリ値は送らない", async () => {
  const { calls, impl } = capture(() => jsonRes(200, {}));
  const creds = { RAKUTEN_APPLICATION_ID: "A", RAKUTEN_ACCESS_KEY: "K" };
  await callRakuten(creds, { keyword: "x", minPrice: "" }, { fetchImpl: impl });
  const url = calls[0]?.url;
  assert.ok(url);
  assert.equal(url.searchParams.has("affiliateId"), false);
  assert.equal(url.searchParams.has("minPrice"), false);
});

test("200: v1形式(Items[].Item)/v2形式(items[])のボディをそのまま返す", async () => {
  const v1 = { Items: [{ Item: { itemName: "a" } }] };
  const v2 = { items: [{ itemName: "b" }] };
  for (const body of [v1, v2]) {
    const { impl } = capture(() => jsonRes(200, body));
    const got = await callRakuten(CREDS, { keyword: "x" }, { fetchImpl: impl });
    assert.deepEqual(got, body);
  }
});

test("エラー系: 400/401/403/429/503でstatusと楽天errorコードを保持しthrow", async () => {
  for (const [status, code] of [[400, "wrong_parameter"], [401, "access_key_invalid"], [403, "forbidden"], [429, "too_many_requests"], [503, "maintenance"]]) {
    const { impl } = capture(() => jsonRes(Number(status), { error: code, error_description: "desc" }));
    await assert.rejects(
      () => callRakuten(CREDS, { keyword: "x" }, { fetchImpl: impl }),
      (/** @type {any} */ e) => e.status === status && e.rakutenError === code && String(e.message).includes(String(code))
    );
  }
});

test("秘密保持: 例外メッセージに資格情報やエンドポイントURLを含めない", async () => {
  const { impl } = capture(() => jsonRes(401, { error: "access_key_invalid", error_description: "invalid" }));
  try {
    await callRakuten(CREDS, { keyword: "x" }, { fetchImpl: impl });
    assert.fail("throwされるべき");
  } catch (/** @type {any} */ e) {
    const msg = String(e.message);
    for (const secret of Object.values(CREDS)) assert.ok(!msg.includes(secret), `メッセージに秘密が混入: ${secret}`);
    assert.ok(!msg.includes("openapi.rakuten.co.jp"), "メッセージにURLを含めない");
  }
});

test("2xxだが不正JSON → nullを返す(throwしない: 呼び出し側で0件→Mockフォールバック)", async () => {
  /** @type {typeof fetch} */
  const impl = async () => new Response("<html>oops</html>", { status: 200, headers: { "content-type": "text/html" } });
  const got = await callRakuten(CREDS, { keyword: "x" }, { fetchImpl: impl });
  assert.equal(got, null);
});

test("timeout: 応答が来なければAbortErrorでthrow(タイマーは残留しない)", async () => {
  /** @type {typeof fetch} */
  const impl = (input, init) => new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      reject(e);
    });
  });
  await assert.rejects(
    () => callRakuten(CREDS, { keyword: "x" }, { fetchImpl: impl, timeoutMs: 25 }),
    (/** @type {any} */ e) => e.name === "AbortError"
  );
});

// ---------- products.js 統合(globalThis.fetch差し替え) ----------
const ENV = { RAKUTEN_APPLICATION_ID: "A", RAKUTEN_ACCESS_KEY: "K", RAKUTEN_AFFILIATE_ID: "AF" };
/** @param {string} qs */
const req = (qs) => /** @type {any} */ ({ request: new Request(`https://furugacha.jp/api/products?${qs}`), env: ENV });

/** @param {(url:URL)=>Response} responder */
async function withFetch(responder, fn) {
  const orig = globalThis.fetch;
  /** @type {URL[]} */
  const urls = [];
  globalThis.fetch = /** @type {any} */ (async (input, init) => {
    const u = new URL(String(input));
    urls.push(u);
    return responder(u);
  });
  try { return await fn(urls); } finally { globalThis.fetch = orig; }
}

test("products: budget=2000ではminPriceを送らず、3000では送る(maxPrice>minPrice制約)", async () => {
  const ok = () => jsonRes(200, { items: [] });
  await withFetch(ok, async (/** @type {URL[]} */ urls) => {
    await onRequestGet(req("mode=budget&budget=2000&category=food&limit=6"));
    await onRequestGet(req("mode=budget&budget=3000&category=food&limit=6"));
    assert.equal(urls[0]?.searchParams.has("minPrice"), false);
    assert.equal(urls[0]?.searchParams.get("maxPrice"), "2000");
    assert.equal(urls[1]?.searchParams.get("minPrice"), "2000");
    assert.equal(urls[1]?.searchParams.get("maxPrice"), "3000");
  });
});

test("products: 正常系はsource:'rakuten'で商品を返し(v1形式入力)、上流401は502 upstream_status付きJSON", async () => {
  const v1item = { Item: { itemName: "【ふるさと納税】テスト米", itemPrice: 8500, itemUrl: "https://item.rakuten.co.jp/f085464-sakai/x/", itemCode: "f085464-sakai:1", shopCode: "f085464-sakai", mediumImageUrls: [{ imageUrl: "https://thumbnail.image.rakuten.co.jp/x?_ex=128x128" }] } };
  await withFetch(() => jsonRes(200, { Items: [v1item] }), async () => {
    const res = await onRequestGet(req("mode=municipality&name=境町&pref=茨城県&code=085464&limit=6"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, "rakuten");
    assert.equal(body.products.length, 1);
    assert.equal(body.products[0].title, "【ふるさと納税】テスト米");
    assert.equal(body.products[0].isMock, false);
  });
  await withFetch(() => jsonRes(401, { error: "access_key_invalid", error_description: "x" }), async () => {
    const res = await onRequestGet(req("mode=municipality&name=境町&pref=茨城県&code=085464&limit=6"));
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, "upstream_error");
    assert.equal(body.upstream_status, 401);
    const text = JSON.stringify(body);
    for (const secret of Object.values(ENV)) assert.ok(!text.includes(secret), "502ボディに秘密が混入");
  });
});

test("products: 資格情報なしは楽天を呼ばず502(クライアントがMockへ)", async () => {
  await withFetch(() => { throw new Error("呼ばれてはいけない"); }, async (/** @type {URL[]} */ urls) => {
    const res = await onRequestGet(/** @type {any} */ ({ request: new Request("https://furugacha.jp/api/products?mode=budget&budget=5000&category=food"), env: {} }));
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error, "provider_unavailable");
    assert.equal(urls.length, 0);
  });
});
