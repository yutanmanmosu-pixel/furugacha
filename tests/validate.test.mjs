import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBudget, parseSource, parseSalaryMan, parseCount, BUDGET_MIN, BUDGET_MAX } from "../public/assets/js/lib/validate.js";

test("parseBudget: 正常値", () => {
  assert.equal(parseBudget("72000"), 72000);
  assert.equal(parseBudget("72,000"), 72000);
  assert.equal(parseBudget(30000), 30000);
});

test("parseBudget: 不正値はnull(負値/NaN/0/巨大値/不正文字)", () => {
  for (const bad of ["-100", "0", "abc", "1e9", "999999999999", "", null, undefined, String(BUDGET_MAX + 1), String(BUDGET_MIN - 1), "12.5", "<script>"]) {
    assert.equal(parseBudget(bad), null, String(bad));
  }
});

test("parseSource: calculator以外はnull", () => {
  assert.equal(parseSource("calculator"), "calculator");
  assert.equal(parseSource("evil"), null);
});

test("parseSalaryMan / parseCount", () => {
  assert.equal(parseSalaryMan("500"), 5_000_000);
  assert.equal(parseSalaryMan("0"), null);
  assert.equal(parseSalaryMan("-1"), null);
  assert.equal(parseCount("3"), 3);
  assert.equal(parseCount("99"), 0);
  assert.equal(parseCount("x"), 0);
});
