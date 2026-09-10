// @ts-check
/** @typedef {import("./types.js").Municipality} Municipality */

/** @type {{meta:any, municipalities:Municipality[]} | null} */
let cache = null;

/** 自治体データ(municipalities.json)を読み込む。 */
export async function loadMunicipalities() {
  if (cache) return cache;
  const res = await fetch("/assets/data/municipalities.json", { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`自治体データの読み込みに失敗しました (${res.status})`);
  const json = await res.json();
  cache = { meta: json.meta ?? {}, municipalities: json.municipalities ?? [] };
  return cache;
}

/** @param {string} code */
export async function findMunicipalityByCode(code) {
  const { municipalities } = await loadMunicipalities();
  return municipalities.find((m) => m.municipalityCode === code) ?? null;
}
