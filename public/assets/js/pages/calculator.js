// @ts-check
// 控除上限額シミュレーター画面(指示書57-60)。
// 計算ロジックは lib/calculator.js。結果から予算ガチャへ金額をワンタップで引き継ぐ。

import { estimateDeductionLimit } from "../lib/calculator.js";
import { parseSalaryMan, parseCount } from "../lib/validate.js";
import { yen } from "../lib/format.js";

const HANDOFF_KEY = "furugacha:budget:handoff:v1";

/** @param {string} sel @returns {HTMLElement} */
function must(sel) {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`要素が見つかりません: ${sel}`);
  return el;
}
/** @param {string} sel @returns {HTMLInputElement} */
const input = (sel) => /** @type {HTMLInputElement} */ (must(sel));

const els = {
  form: must("#calc-form"),
  salary: input("#calc-salary"),
  spouse: /** @type {HTMLSelectElement} */ (must("#calc-spouse")),
  dep: input("#calc-dep"),
  depSpec: input("#calc-dep-spec"),
  detail: /** @type {HTMLDetailsElement} */ (must("#calc-detail")),
  social: input("#calc-social"),
  ideco: input("#calc-ideco"),
  other: input("#calc-other"),
  error: must("#calc-error"),
  result: must("#calc-result"),
  amount: must("#calc-amount"),
  zeroNote: must("#calc-zero-note"),
  breakdown: must("#calc-breakdown"),
  assumptions: must("#calc-assumptions"),
  ctaBudget: /** @type {HTMLAnchorElement} */ (must("#calc-cta-budget")),
  ctaBudgetAmount: must("#calc-cta-budget-amount")
};

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  run();
});

function run() {
  const salary = parseSalaryMan(els.salary.value);
  if (salary == null) {
    els.error.hidden = false;
    els.error.textContent = "年収は1〜100,000(万円)の範囲で数字のみ入力してください。";
    els.salary.focus();
    return;
  }
  els.error.hidden = true;

  /** @param {HTMLInputElement} el */
  const manYen = (el) => {
    const v = el.value.trim();
    if (v === "") return undefined;
    const n = Number(v.replace(/[,，\s]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.floor(n * 10_000) : undefined;
  };

  const detailOpen = els.detail.open;
  const r = estimateDeductionLimit({
    salary,
    hasSpouse: els.spouse.value === "yes",
    dependents: parseCount(els.dep.value),
    dependentsSpecific: parseCount(els.depSpec.value),
    ...(detailOpen && manYen(els.social) != null ? { socialInsurance: manYen(els.social) } : {}),
    ideco: detailOpen ? (manYen(els.ideco) ?? 0) : 0,
    otherDeductions: detailOpen ? (manYen(els.other) ?? 0) : 0
  });

  els.result.hidden = false;
  if (r.limit <= 0) {
    els.amount.textContent = "—";
    els.zeroNote.hidden = false;
    els.ctaBudget.parentElement?.setAttribute("hidden", "");
  } else {
    els.amount.textContent = `約${r.limit.toLocaleString("ja-JP")}円`;
    els.zeroNote.hidden = true;
    els.ctaBudget.parentElement?.removeAttribute("hidden");
    // 金額のワンタップ引き継ぎ: URL + sessionStorage の両方(再入力ゼロ)
    els.ctaBudget.href = `/budget-gacha/?budget=${r.limit}&source=calculator`;
    els.ctaBudgetAmount.textContent = yen(r.limit);
    els.ctaBudget.addEventListener("click", () => {
      try { sessionStorage.setItem(HANDOFF_KEY, String(r.limit)); } catch { /* noop */ }
    }, { once: true });
  }

  els.breakdown.replaceChildren(
    row("給与所得(給与所得控除後)", yen(r.salaryIncome)),
    row("社会保険料(概算/入力値)", yen(r.socialInsurance)),
    row("住民税の課税所得(概算)", yen(r.taxableResident)),
    row("住民税所得割額(10%)", yen(r.shotokuwari)),
    row("適用した所得税率", `${Math.round(r.incomeTaxRate * 100)}%(復興特別所得税を加味)`)
  );
  els.assumptions.replaceChildren(...r.assumptions.map((a) => {
    const li = document.createElement("li");
    li.textContent = a;
    return li;
  }));
  els.result.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** @param {string} k @param {string} v */
function row(k, v) {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  th.scope = "row";
  th.textContent = k;
  const td = document.createElement("td");
  td.textContent = v;
  tr.append(th, td);
  return tr;
}
