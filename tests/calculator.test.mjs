import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateDeductionLimit, salaryIncomeDeduction, incomeTaxRate } from "../public/assets/js/lib/calculator.js";

test("給与所得控除: 令和7年以降の下限65万円", () => {
  assert.equal(salaryIncomeDeduction(1_500_000), 650_000);
  assert.equal(salaryIncomeDeduction(5_000_000), 5_000_000 * 0.2 + 440_000);
  assert.equal(salaryIncomeDeduction(20_000_000), 1_950_000);
});

test("所得税率テーブル", () => {
  assert.equal(incomeTaxRate(1_000_000), 0.05);
  assert.equal(incomeTaxRate(4_000_000), 0.20);
  assert.equal(incomeTaxRate(50_000_000), 0.45);
});

test("年収500万円・独身: 妥当なレンジの目安(4〜8万円)", () => {
  const r = estimateDeductionLimit({ salary: 5_000_000, hasSpouse: false, dependents: 0, dependentsSpecific: 0 });
  assert.ok(r.limit >= 40_000 && r.limit <= 80_000, `limit=${r.limit}`);
  assert.equal(r.limit % 1000, 0, "千円未満切り捨て");
});

test("配偶者・扶養で上限は下がる", () => {
  const single = estimateDeductionLimit({ salary: 6_000_000, hasSpouse: false, dependents: 0, dependentsSpecific: 0 });
  const family = estimateDeductionLimit({ salary: 6_000_000, hasSpouse: true, dependents: 1, dependentsSpecific: 1 });
  assert.ok(family.limit < single.limit);
});

test("低収入では0(自己負担割れの提案をしない)", () => {
  const r = estimateDeductionLimit({ salary: 1_000_000, hasSpouse: false, dependents: 0, dependentsSpecific: 0 });
  assert.equal(r.limit, 0);
});

test("負値・NaNは0扱いで落ちない", () => {
  const r = estimateDeductionLimit({ salary: -100, hasSpouse: false, dependents: NaN, dependentsSpecific: 0 });
  assert.equal(r.limit, 0);
});

test("社会保険料の実額入力が反映される", () => {
  const auto = estimateDeductionLimit({ salary: 5_000_000, hasSpouse: false, dependents: 0, dependentsSpecific: 0 });
  const manual = estimateDeductionLimit({ salary: 5_000_000, hasSpouse: false, dependents: 0, dependentsSpecific: 0, socialInsurance: 1_200_000 });
  assert.ok(manual.limit < auto.limit);
});
