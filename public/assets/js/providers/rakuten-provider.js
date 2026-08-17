// @ts-check
// 楽天連携Provider。ブラウザ → 当サイト /api/products (Cloudflare Pages Functions) → 楽天API。
// API資格情報はサーバー側の環境変数のみで扱い、フロントには一切露出しない(指示書40)。

/** @typedef {import("../lib/types.js").Product} Product */

export class RakutenFurusatoProductProvider {
  /** @param {{municipality:string, prefecture:string, municipalityCode:string, limit?:number}} q */
  async searchByMunicipality(q) {
    const params = new URLSearchParams({
      mode: "municipality",
      name: q.municipality,
      pref: q.prefecture,
      code: q.municipalityCode,
      limit: String(q.limit ?? 6)
    });
    return this.#fetch(params);
  }

  /** @param {{budget:number, category:string, limit?:number}} q */
  async searchByBudget(q) {
    const params = new URLSearchParams({
      mode: "budget",
      budget: String(q.budget),
      category: q.category,
      limit: String(q.limit ?? 60)
    });
    return this.#fetch(params);
  }

  /** @param {URLSearchParams} params @returns {Promise<Product[]>} */
  async #fetch(params) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(`/api/products?${params}`, { signal: ctrl.signal, headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`products API ${res.status}`);
      const json = await res.json();
      return Array.isArray(json.products) ? json.products : [];
    } finally {
      clearTimeout(timer);
    }
  }
}
