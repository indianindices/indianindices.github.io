const test = require("node:test");
const assert = require("node:assert/strict");
const calculator = require("../finance-calculations.js");
const options = { mode: "sip", amount: 1000, annualReturn: 0, years: 1, start: "2026-10", stepUp: 0, timing: "begin" };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-9, `${actual} != ${expected}`);

test("SIP zero-return cash flows and dates are exact and include the starting balance", () => {
  const result = calculator.project(options);
  close(result.balance, 12000);
  close(result.invested, 12000);
  close(result.gains, 0);
  assert.equal(result.points.length, 13);
  assert.deepEqual(result.points[0].time, { year: 2026, month: 9, day: 30 });
  assert.deepEqual(result.points.at(-1).time, { year: 2027, month: 9, day: 30 });
  assert.deepEqual(calculator.monthTime("2028-02", 0), { year: 2028, month: 2, day: 29 });
});

test("SIP beginning and end contribution timings match the standard annuity calculation", () => {
  const end = calculator.project({ ...options, annualReturn: 12, timing: "end" });
  const begin = calculator.project({ ...options, annualReturn: 12 });
  const rate = 1.12 ** (1 / 12) - 1;
  close(end.balance, 1000 * ((1 + rate) ** 12 - 1) / rate);
  close(begin.balance, end.balance * (1 + rate));
  assert.ok(begin.balance > end.balance);
});

test("annual SIP step-ups change only after each complete projection year", () => {
  const result = calculator.project({ ...options, years: 2, stepUp: 10 });
  close(result.invested, 25200);
  close(result.points[12].contribution, 1000);
  close(result.points[13].contribution, 1100);
  close(result.balance, 25200);
  assert.equal(result.yearly.length, 2);
});

test("lump-sum effective annual compounding handles gains, losses and zero returns", () => {
  const result = calculator.project({ ...options, mode: "lumpsum", amount: 100000, annualReturn: 12, years: 10 });
  close(result.balance, 100000 * 1.12 ** 10);
  close(result.invested, 100000);
  close(result.gains, result.balance - 100000);
  const loss = calculator.project({ ...options, mode: "lumpsum", annualReturn: -20 });
  close(loss.balance, 800);
  close(loss.gains, -200);
  close(calculator.project({ ...options, mode: "lumpsum" }).balance, 1000);
});

test("SWP caps withdrawals, reports depletion and shortfall, and never creates negative balances", () => {
  const result = calculator.project({ ...options, mode: "swp", withdrawal: 300 });
  assert.equal(result.depletedAt, 4);
  close(result.points[4].withdrawal, 100);
  close(result.withdrawn, 1000);
  close(result.shortfall, 2600);
  close(result.balance, 0);
  close(result.gains, 0);
  assert.ok(result.points.every((point) => point.balance >= 0));
});

test("SWP pays at month end and accounts for growth plus annual withdrawal increases", () => {
  const result = calculator.project({ ...options, mode: "swp", amount: 100000, annualReturn: 12, withdrawal: 1000, years: 2, stepUp: 10 });
  close(result.points[1].balance, 100000 * 1.12 ** (1 / 12) - 1000);
  close(result.points[12].requestedWithdrawal, 1000);
  close(result.points[13].requestedWithdrawal, 1100);
  close(result.withdrawn, 25200);
  close(result.gains, result.points.slice(1).reduce((sum, point) => sum + point.growth, 0));
  assert.equal(result.depletedAt, null);
});

test("calculator rejects missing, nonfinite and out-of-range assumptions", () => {
  for (const patch of [{ mode: "other" }, { amount: 0 }, { amount: NaN }, { annualReturn: 51 }, { annualReturn: -100 }, { years: 0 }, { years: 1.5 }, { years: 51 }, { stepUp: -1 }, { stepUp: Infinity }, { timing: "other" }, { start: "2026-13" }, { start: "2200-01" }, { mode: "swp", withdrawal: 0 }]) {
    assert.ok(calculator.project({ ...options, ...patch }).error, JSON.stringify(patch));
  }
});