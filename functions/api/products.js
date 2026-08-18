// @ts-check
// 返礼品検索API (Cloudflare Pages Function)
// ブラウザ → ここ → 楽天市場商品検索API(v2026-07-01)。
// - 資格情報はenvのみ(フロント非露出)
// - 資格情報なし/エラー時は502を返し、クライアント側がモックへフォールバック
// - 対応エラー: 資格情報なし / timeout / rate limit(429) / 0件 / 不正レスポンス / メンテ(503)
// - キャッシュ: 同一検索を短時間(10分)エッジキャッシュ。長期保存は行わない。
//   ※楽天ウェブサービス利用規約のデータ取り扱い条件は本番導入前に最新版を必ず確認すること。

import { callRakuten, CATEGORY_KEYWORDS } from "./_lib/rakuten.js";
import { mapRakutenItem, isFurusatoShopOf } from "./_lib/mapper.js";

const ALLOWED_CATEGORIES = new Set(["random", "food", "life", "travel"]);
const CACHE_TTL_SECONDS = 600;
/**
 * 商品0件時の短縮TTL(秒)。
 * 経緯: 本番接続作業中、復旧前に取得した {products:[]} が600秒エッジに残り、
 * 楽天API復旧後もMock表示が続く事象が発生。0件は「一時的状態」の可能性が高いため
 * 60秒だけキャッシュして早期に再問い合わせしつつ、完全非キャッシュによる
 * 楽天APIへの無駄な連打は避ける。エラー(4xx/5xx/timeout)は従来どおり非キャッシュ。
 */
const CACHE_TTL_EMPTY_SECONDS = 60;

/** 成功レスポンス用: 件数に応じたCache-Controlヘッダー値 @param {number} count */
function successCacheControl(count) {
  const ttl = count > 0 ? CACHE_TTL_SECONDS : CACHE_TTL_EMPTY_SECONDS;
  return `public, max-age=60, s-maxage=${ttl}`;
}

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
  const q = url.searchParams;

  const creds = {
    RAKUTEN_APPLICATION_ID: env.RAKUTEN_APPLICATION_ID ?? "",
    RAKUTEN_ACCESS_KEY: env.RAKUTEN_ACCESS_KEY ?? "",
    ...(env.RAKUTEN_AFFILIATE_ID ? { RAKUTEN_AFFILIATE_ID: env.RAKUTEN_AFFILIATE_ID } : {})
  };
  const mockMode = String(env.MOCK_MODE ?? "").toLowerCase() === "true";
  if (mockMode || !creds.RAKUTEN_APPLICATION_ID || !creds.RAKUTEN_ACCESS_KEY) {
    // 資格情報なし → クライアントのMockProviderに任せる
    return json({ error: "provider_unavailable", detail: "Rakuten credentials not configured" }, 502, {
      "cache-control": "no-store"
    });
  }

  const mode = q.get("mode");
  const limit = clampInt(q.get("limit"), 1, 60, 6);

  try {
    if (mode === "municipality") {
      const name = sanitizeText(q.get("name"));
      const pref = sanitizeText(q.get("pref"));
      const code = q.get("code") ?? "";
      if (!name || !pref || !/^\d{6}$/.test(code)) {
        return json({ error: "bad_request", detail: "name/pref/code が不正です" }, 400);
      }
      return await withEdgeCache(ctx, async () => {
        const body = await callRakuten(creds, {
          keyword: `ふるさと納税 ${name}`,
          hits: "30",
          imageFlag: "1",
          availability: "1"
        });
        const items = /** @type {any[]} */ (Array.isArray(body?.Items) ? body.Items : Array.isArray(body?.items) ? body.items : []);
        // 楽天ふるさと納税の自治体公式ショップ(f+自治体コード)を優先。無ければキーワード結果を使用。
        const official = items.filter((/** @type {any} */ it) => isFurusatoShopOf(it, code));
        const source = official.length > 0 ? official : items;
        const products = source
          .map((/** @type {any} */ it) => mapRakutenItem(it, { municipality: name, prefecture: pref }))
          .filter((/** @type {any} */ p) => p != null)
          .slice(0, limit);
        return json({ products, source: "rakuten", filteredByShop: official.length > 0 }, 200, {
          "cache-control": successCacheControl(products.length)
        });
      });
    }

    if (mode === "budget") {
      const budget = clampInt(q.get("budget"), 2000, 2_000_000, 0);
      const category = q.get("category") ?? "random";
      if (!budget || !ALLOWED_CATEGORIES.has(category)) {
        return json({ error: "bad_request", detail: "budget/category が不正です" }, 400);
      }
      return await withEdgeCache(ctx, async () => {
        const kw = CATEGORY_KEYWORDS[/** @type {keyof typeof CATEGORY_KEYWORDS} */ (category)] ?? "";
        const body = await callRakuten(creds, {
          keyword: `ふるさと納税${kw ? " " + kw : ""}`,
          hits: "30",
          imageFlag: "1",
          availability: "1",
          maxPrice: String(budget),
          ...(budget > 2000 ? { minPrice: "2000" } : {})
        });
        const items = /** @type {any[]} */ (Array.isArray(body?.Items) ? body.Items : Array.isArray(body?.items) ? body.items : []);
        const products = items
          .map((/** @type {any} */ it) => mapRakutenItem(it, { municipality: "", prefecture: "", category }))
          .filter((/** @type {any} */ p) => p != null)
          .slice(0, limit);
        return json({ products, source: "rakuten" }, 200, {
          "cache-control": successCacheControl(products.length)
        });
      });
    }

    return json({ error: "bad_request", detail: "mode は municipality か budget を指定してください" }, 400);
  } catch (e) {
    const status = /** @type {any} */ (e)?.status;
    const kind = /** @type {any} */ (e)?.rakutenError || /** @type {any} */ (e)?.name || "unknown";
    // 診断ログ(秘密情報なし): 上流status / 楽天errorコード or 例外名のみ
    console.error("[products] upstream failure -> 502 fallback", status ?? "-", kind);
    if (status === 429) {
      return json({ error: "rate_limited", detail: "楽天APIのリクエスト上限に達しました" }, 502, {
        "retry-after": "5", "cache-control": "no-store"
      });
    }
    if (status === 503) {
      return json({ error: "upstream_maintenance", detail: "楽天APIがメンテナンス中です" }, 502, { "cache-control": "no-store" });
    }
    const isAbort = /** @type {any} */ (e)?.name === "AbortError";
    return json({ error: isAbort ? "upstream_timeout" : "upstream_error", ...(Number.isInteger(status) ? { upstream_status: status } : {}) }, 502, { "cache-control": "no-store" });
  }
}

/**
 * 同一URLをエッジキャッシュ(Cache API)。楽天APIへの過剰リクエストの抑制も兼ねる。
 * @param {{request: Request, waitUntil?: (p:Promise<any>)=>void}} ctx
 * @param {() => Promise<Response>} producer
 */
async function withEdgeCache(ctx, producer) {
  try {
    const cache = /** @type {Cache | undefined} */ (/** @type {any} */ (globalThis.caches)?.default);
    if (!cache) return producer();
    const key = new Request(ctx.request.url, { method: "GET" });
    const hit = await cache.match(key);
    if (hit) return hit;
    const res = await producer();
    if (res.ok && ctx.waitUntil) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch {
    return producer();
  }
}

/**
 * @param {string | null} raw @param {number} min @param {number} max @param {number} fallback
 */
function clampInt(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** キーワードに使う文字列の安全化(制御文字除去・長さ制限) @param {string | null} raw */
function sanitizeText(raw) {
  if (!raw) return "";
  return raw.replace(/[\u0000-\u001f<>"']/g, "").trim().slice(0, 40);
}
