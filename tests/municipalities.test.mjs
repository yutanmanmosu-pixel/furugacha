import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isValidCode, PREF_BY_CODE, REGION_BY_PREF } from "../scripts/muni-utils.mjs";

const data = JSON.parse(readFileSync(new URL("../public/assets/data/municipalities.json", import.meta.url), "utf8"));

test("全コードが検査数字・都道府県・地方区分の検査に合格", () => {
  const seen = new Set();
  for (const m of data.municipalities) {
    assert.ok(isValidCode(m.municipalityCode), m.municipality);
    assert.equal(PREF_BY_CODE[m.municipalityCode.slice(0, 2)], m.prefecture, m.municipality);
    assert.equal(REGION_BY_PREF[m.prefecture], m.region, m.municipality);
    assert.ok(!seen.has(m.municipalityCode));
    seen.add(m.municipalityCode);
  }
});

test("47都道府県すべてをカバー", () => {
  assert.equal(new Set(data.municipalities.map((m) => m.prefecture)).size, 47);
});

test("糸島市(402303)を含む", () => {
  assert.ok(data.municipalities.some((m) => m.municipalityCode === "402303" && m.municipality === "糸島市"));
});
