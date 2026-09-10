// @ts-check
// 掲載自治体一覧: 地方フィルタ+名前検索。ここは「眺める」ためのページで、ガチャの抽選には影響しない。
import { loadMunicipalities } from "../lib/data.js";
import { REGIONS } from "../lib/regions.js";

/** @param {string} sel @returns {HTMLElement} */
function must(sel) {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`要素が見つかりません: ${sel}`);
  return el;
}

const regionSel = /** @type {HTMLSelectElement} */ (must("#muni-region"));
const search = /** @type {HTMLInputElement} */ (must("#muni-search"));
const count = must("#muni-count");
const listEl = must("#muni-list");

/** @type {import("../lib/types.js").Municipality[]} */
let all = [];

for (const r of REGIONS) {
  const o = document.createElement("option");
  o.value = r.name;
  o.textContent = r.name;
  regionSel.append(o);
}

loadMunicipalities().then(({ municipalities, meta }) => {
  all = municipalities;
  if (meta?.isStarterSubset) {
    const note = must("#muni-subset-note");
    note.hidden = false;
  }
  render();
}).catch(() => {
  count.textContent = "データの読み込みに失敗しました。";
});

regionSel.addEventListener("change", render);
search.addEventListener("input", render);

function render() {
  const region = regionSel.value;
  const q = search.value.trim();
  const filtered = all.filter((m) =>
    (region === "" || m.region === region) &&
    (q === "" || m.municipality.includes(q) || m.prefecture.includes(q))
  );
  count.textContent = `${filtered.length}自治体`;
  listEl.replaceChildren();
  /** @type {Map<string, import("../lib/types.js").Municipality[]>} */
  const byPref = new Map();
  for (const m of filtered) {
    const arr = byPref.get(m.prefecture) ?? [];
    arr.push(m);
    byPref.set(m.prefecture, arr);
  }
  for (const [pref, list] of byPref) {
    const sec = document.createElement("section");
    sec.className = "muni-group";
    const h = document.createElement("h3");
    h.textContent = pref;
    const ul = document.createElement("ul");
    for (const m of list) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `/gacha/?code=${encodeURIComponent(m.municipalityCode)}`;
      a.textContent = m.municipality;
      li.append(a);
      ul.append(li);
    }
    sec.append(h, ul);
    listEl.append(sec);
  }
}
