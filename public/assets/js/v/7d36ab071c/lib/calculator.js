// @ts-check
// 控除上限額シミュレーター(概算・目安)
//
// 【計算式】ふるさと納税の全額控除上限(自己負担2,000円を除く)の一般的な目安式:
//   上限目安 = 住民税所得割額 × 20% ÷ (90% − 所得税率 × 1.021) + 2,000円
//   (復興特別所得税2.1%を含む。多くの自治体・総務省資料で示される簡易式)
//
// 【前提(2026年8月実装時点の制度を簡略化)】
// - 給与収入のみを想定。給与所得控除は令和7年分以降の下限65万円を反映。
// - 所得税の基礎控除は令和7年度改正後の段階額(令和7・8年分の上乗せ含む)を反映。
// - 住民税の基礎控除は43万円(所得2,400万円超は逓減)。
// - 社会保険料は未入力時「年収×15%」で概算。
// - 調整控除・住宅ローン控除等の税額控除、分離課税所得は考慮しない。
// - 制度は変更され得るため、結果はあくまで目安。公開前チェックリストで最新税制を再確認すること。

/**
 * @typedef {Object} CalcInput
 * @property {number} salary            給与収入(年収, 円)
 * @property {boolean} hasSpouse        配偶者控除の対象となる配偶者がいるか
 * @property {number} dependents        扶養親族(一般・16歳以上)の人数
 * @property {number} dependentsSpecific 特定扶養親族(19〜22歳)の人数
 * @property {number} [socialInsurance] 社会保険料の実額(未入力なら概算)
 * @property {number} [ideco]           iDeCo等 小規模企業共済等掛金(年額)
 * @property {number} [otherDeductions] その他の所得控除合計(医療費控除・生命保険料控除等)
 */

/**
 * @typedef {Object} CalcResult
 * @property {number} limit          上限目安(円, 千円未満切り捨て)
 * @property {number} limitRaw       丸め前
 * @property {number} salaryIncome   給与所得
 * @property {number} socialInsurance 使用した社会保険料額
 * @property {number} taxableResident 住民税課税所得
 * @property {number} shotokuwari    住民税所得割額(10%)
 * @property {number} incomeTaxRate  適用した所得税率
 * @property {string[]} assumptions  前提条件の説明
 */

/** 給与所得控除(令和7年分以降: 収入190万円以下は一律65万円) @param {number} salary */
export function salaryIncomeDeduction(salary) {
  if (salary <= 1_900_000) return 650_000;
  if (salary <= 3_600_000) return salary * 0.3 + 80_000;
  if (salary <= 6_600_000) return salary * 0.2 + 440_000;
  if (salary <= 8_500_000) return salary * 0.1 + 1_100_000;
  return 1_950_000;
}

/** 所得税の基礎控除(令和7年度改正・令和7/8年分の上乗せ込み) @param {number} totalIncome 合計所得金額 */
export function basicDeductionIncomeTax(totalIncome) {
  if (totalIncome <= 1_320_000) return 950_000;
  if (totalIncome <= 3_360_000) return 880_000;
  if (totalIncome <= 4_890_000) return 680_000;
  if (totalIncome <= 6_550_000) return 630_000;
  if (totalIncome <= 23_500_000) return 580_000;
  if (totalIncome <= 24_000_000) return 480_000;
  if (totalIncome <= 24_500_000) return 320_000;
  if (totalIncome <= 25_000_000) return 160_000;
  return 0;
}

/** 住民税の基礎控除 @param {number} totalIncome */
export function basicDeductionResidentTax(totalIncome) {
  if (totalIncome <= 24_000_000) return 430_000;
  if (totalIncome <= 24_500_000) return 290_000;
  if (totalIncome <= 25_000_000) return 150_000;
  return 0;
}

/** 配偶者控除(本人所得900万円以下38万円…段階) @param {number} totalIncome @param {boolean} resident 住民税側か */
function spouseDeduction(totalIncome, resident) {
  if (totalIncome <= 9_000_000) return resident ? 330_000 : 380_000;
  if (totalIncome <= 9_500_000) return resident ? 220_000 : 260_000;
  if (totalIncome <= 10_000_000) return resident ? 110_000 : 130_000;
  return 0;
}

/** 所得税の限界税率 @param {number} taxable 課税所得(千円未満切捨) */
export function incomeTaxRate(taxable) {
  if (taxable <= 1_949_000) return 0.05;
  if (taxable <= 3_299_000) return 0.10;
  if (taxable <= 6_949_000) return 0.20;
  if (taxable <= 8_999_000) return 0.23;
  if (taxable <= 17_999_000) return 0.33;
  if (taxable <= 39_999_000) return 0.40;
  return 0.45;
}

/** @param {number} n */ const floor1000 = (n) => Math.floor(n / 1000) * 1000;

/**
 * 上限目安を計算する。
 * @param {CalcInput} input
 * @returns {CalcResult}
 */
export function estimateDeductionLimit(input) {
  const salary = Math.max(0, Math.floor(input.salary || 0));
  const dependents = Math.max(0, Math.floor(input.dependents || 0));
  const dependentsSpecific = Math.max(0, Math.floor(input.dependentsSpecific || 0));
  const ideco = Math.max(0, Math.floor(input.ideco || 0));
  const other = Math.max(0, Math.floor(input.otherDeductions || 0));

  const salaryIncome = Math.max(0, salary - salaryIncomeDeduction(salary));
  const si = input.socialInsurance != null && input.socialInsurance >= 0
    ? Math.floor(input.socialInsurance)
    : Math.floor(salary * 0.15);

  const depIT = dependents * 380_000 + dependentsSpecific * 630_000;
  const depRT = dependents * 330_000 + dependentsSpecific * 450_000;
  const spouseIT = input.hasSpouse ? spouseDeduction(salaryIncome, false) : 0;
  const spouseRT = input.hasSpouse ? spouseDeduction(salaryIncome, true) : 0;

  const taxableIT = floor1000(Math.max(0,
    salaryIncome - si - ideco - other - basicDeductionIncomeTax(salaryIncome) - spouseIT - depIT));
  const taxableRT = floor1000(Math.max(0,
    salaryIncome - si - ideco - other - basicDeductionResidentTax(salaryIncome) - spouseRT - depRT));

  const shotokuwari = Math.floor(taxableRT * 0.10);

  // 所得税率は「寄附による所得控除後」で見るのがより正確なため、1回だけ補正する。
  let rate = incomeTaxRate(taxableIT);
  let limitRaw = shotokuwari > 0 ? (shotokuwari * 0.2) / (0.9 - rate * 1.021) + 2000 : 0;
  if (limitRaw > 2000) {
    const rate2 = incomeTaxRate(Math.max(0, taxableIT - Math.floor(limitRaw - 2000)));
    if (rate2 !== rate) {
      rate = rate2;
      limitRaw = (shotokuwari * 0.2) / (0.9 - rate * 1.021) + 2000;
    }
  }

  const limit = limitRaw >= 3000 ? floor1000(limitRaw) : 0;

  /** @type {string[]} */
  const assumptions = [
    "給与収入のみ・ワンストップ特例または確定申告で正しく手続きする前提の概算です。",
    input.socialInsurance != null ? "社会保険料は入力された実額を使用。" : "社会保険料は年収の15%で概算。",
    "住宅ローン控除など税額控除がある場合、上限は目安より小さくなることがあります。",
    "税制(基礎控除・給与所得控除等)は改正されることがあります。最新情報は国税庁・総務省・お住まいの自治体でご確認ください。"
  ];

  return { limit, limitRaw, salaryIncome, socialInsurance: si, taxableResident: taxableRT, shotokuwari, incomeTaxRate: rate, assumptions };
}
