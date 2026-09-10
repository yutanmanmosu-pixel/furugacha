// @ts-check
// ガチャ履歴(端末内のみ)。
import { gachaHistory, budgetHistory, clearHistory } from "../lib/storage.js";
import { msgEl } from "./product-card.js";
import { yen } from "../lib/format.js";

/** @param {string} sel @returns {HTMLElement} */
function must(sel) {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`要素が見つかりません: ${sel}`);
  return el;
}

const gList = must("#history-gacha");
const bList = must("#history-budget");
const clearBtn = /** @type {HTMLButtonElement} */ (must("#history-clear"));

/** @param {number} ts */
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function render() {
  const g = gachaHistory();
  gList.replaceChildren();
  if (g.length === 0) gList.append(msgEl("まだ自治体ガチャの履歴はありません。"));
  for (const h of g) {
    const m = h.municipality;
    if (!m) continue;
    const li = document.createElement("li");
    li.className = "history-item";
    const time = document.createElement("time");
    time.textContent = fmtDate(h.ts ?? Date.now());
    const label = document.createElement("span");
    label.textContent = `【${h.scopeLabel ?? "全国"}】${m.prefecture} ${m.municipality}`;
    const link = document.createElement("a");
    link.className = "btn btn--ghost btn--sm";
    link.href = `/gacha/?code=${encodeURIComponent(m.municipalityCode ?? "")}`;
    link.textContent = "もう一度見る";
    li.append(time, label, link);
    gList.append(li);
  }

  const b = budgetHistory();
  bList.replaceChildren();
  if (b.length === 0) bList.append(msgEl("まだ予算おまかせガチャの履歴はありません。"));
  for (const h of b) {
    const li = document.createElement("li");
    li.className = "history-item";
    const time = document.createElement("time");
    time.textContent = fmtDate(h.ts ?? Date.now());
    const label = document.createElement("span");
    label.textContent = `予算${yen(h.budget ?? 0)}(${h.categoryLabel ?? ""})→ ${h.count ?? 0}品・合計${yen(h.total ?? 0)}`;
    li.append(time, label);
    bList.append(li);
  }
}

clearBtn.addEventListener("click", () => {
  if (confirm("この端末に保存された履歴をすべて削除します。よろしいですか?")) {
    clearHistory();
    render();
  }
});
render();
