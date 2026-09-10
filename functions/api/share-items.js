// @ts-check
// 共有結果ページ用: itemCode から正規の商品情報を引き直すAPI (Cloudflare Pages Function)
//
// なぜサーバーで引き直すか:
//   共有URLに載っているのは「楽天のitemCodeと共有時点の寄附額」だけ。商品名・画像・
//   リンクはここで楽天API(itemCode検索)から取得する。クライアントから渡された任意のURLを
//   そのまま楽天の正規リンクとして公開しないため、また アフィリエイトURLを推測生成・改変
//   しないため(楽天APIが返した affiliateUrl をそのまま使う)。
//
// 乱用対策: itemCodeの形を厳格に検証 / 1リクエスト最大5件 / 読み取り専用(保存しない) /
//   同じ組み合わせはエッジキャッシュ(600秒)で楽天への問い合わせを抑える。

import { callRakuten } from "./_lib/rakuten.js";
import { mapRakutenItem } from "./_lib/mapper.js";

/** 共有できる最大点数(public/assets/js/lib/share-state.js の SHARE_MAX_ITEMS と一致させる) */
const MAX_CODES = 5;
/** 楽天のitemCode: shop:itemid */
const ITEM_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}:[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CACHE_TTL_SECONDS = 600;

/** @param {any} body @param {number} status @param {HeadersInit} [extra] */
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra }
  });
}

/**
 * @param {{request: Request, env: Record<string, string|undefined>, waitUntil?: (p:Promise<any>)=>void}} ctx
 */
export async function onRequestGet(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);

  const codes = (url.searchParams.get("codes") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (codes.length === 0 || codes.length > MAX_CODES) {
    return json({ error: "bad_request", detail: `codes は1〜${MAX_CODES}件で指定してください` }, 400, { "cache-control": "no-store" });
  }
  if (!codes.every((c) => ITEM_CODE_RE.test(c))) {
    return json({ error: "bad_request", detail: "codes の形式が不正です" }, 400, { "cache-control": "no-store" });
  }

  const creds = {
    RAKUTEN_APPLICATION_ID: env.RAKUTEN_APPLICATION_ID ?? "",
    RAKUTEN_ACCESS_KEY: env.RAKUTEN_ACCESS_KEY ?? "",
    ...(env.RAKUTEN_AFFILIATE_ID ? { RAKUTEN_AFFILIATE_ID: env.RAKUTEN_AFFILIATE_ID } : {})
  };
  const mockMode = String(env.MOCK_MODE ?? "").toLowerCase() === "true";
  if (mockMode || !creds.RAKUTEN_APPLICATION_ID || !creds.RAKUTEN_ACCESS_KEY) {
    // サンプル動作中は「共有された実商品」を出しようがないので、その旨を返す
    return json({ error: "provider_unavailable", detail: "Rakuten credentials not configured" }, 502, {
      "cache-control": "no-store"
    });
  }

  // キャッシュキーは正規化(順序と重複で別キャッシュにしない)
  const keyUrl = new URL(url.origin + url.pathname);
  keyUrl.searchParams.set("codes", [...new Set(codes)].sort().join(","));

  try {
    return await withEdgeCache(ctx, async () => {
      // itemCode検索は1件ずつの問い合わせ(楽天APIの仕様)。最大5件に制限済み。
      const results = await Promise.all(codes.map(async (code) => {
        try {
          const body = await callRakuten(creds, { itemCode: code, hits: "1" });
          const items = /** @type {any[]} */ (Array.isArray(body?.Items) ? body.Items : Array.isArray(body?.items) ? body.items : []);
          const first = items[0];
          if (!first) return null;
          const p = mapRakutenItem(first, { municipality: "", prefecture: "" });
          if (!p) return null;
          // 自治体は楽天ふるさと納税の公式ショップコード(f+自治体コード6桁)から取る。
          // 名前の解決はクライアント側の自治体マスタで行う(推測での命名はしない)。
          const shopCode = typeof first?.shopCode === "string" ? first.shopCode
            : typeof first?.Item?.shopCode === "string" ? first.Item.shopCode : "";
          const muni = /^f(\d{6})/.exec(shopCode);
          // 返すのは楽天API由来の値のみ。呼び出し側が指定できるのは code だけ。
          return { ...p, id: code, ...(muni ? { municipalityCode: muni[1] } : {}) };
        } catch (e) {
          console.error("[share-items] lookup failed", /** @type {any} */ (e)?.status ?? "-", /** @type {any} */ (e)?.rakutenError ?? "");
          return null;
        }
      }));
      const products = results.filter((p) => p != null);
      return json({ products, source: "rakuten" }, 200, {
        "cache-control": `public, max-age=60, s-maxage=${products.length > 0 ? CACHE_TTL_SECONDS : 60}`
      });
    }, keyUrl.toString());
  } catch (e) {
    console.error("[share-items] upstream failure", /** @type {any} */ (e)?.status ?? "-");
    return json({ error: "upstream_error" }, 502, { "cache-control": "no-store" });
  }
}

/**
 * @param {{request: Request, waitUntil?: (p:Promise<any>)=>void}} ctx
 * @param {() => Promise<Response>} producer
 * @param {string} keyUrl
 */
async function withEdgeCache(ctx, producer, keyUrl) {
  try {
    const cache = /** @type {Cache | undefined} */ (/** @type {any} */ (globalThis.caches)?.default);
    if (!cache) return producer();
    const key = new Request(keyUrl, { method: "GET" });
    const hit = await cache.match(key);
    if (hit) return hit;
    const res = await producer();
    if (res.ok && ctx.waitUntil) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch {
    return producer();
  }
}
