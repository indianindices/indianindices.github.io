const test = require("node:test");
const assert = require("node:assert/strict");
const analytics = require("../analytics.js");

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const fixture = (series) => ({ currentYear: 2030, assets: Object.fromEntries(Object.keys(series).map((name) => [name, []])), monthlyAssets: Object.fromEntries(Object.entries(series).map(([name, values]) => [name, Array.from({ length: Math.ceil(values.length / 12) }, (_, index) => ({ year: 2020 + index, m: values.slice(index * 12, index * 12 + 12) }))])) });

test("historical backtest contribution timing, costs, benchmark parity and cash-flow-neutral losses", () => {
  const data = fixture({ A: [10, -50], Nifty50: [10, -50] });
  const weights = [{ name: "A", weight: 100 }];
  const options = { from: 2020 * 12, to: 2020 * 12 + 1, amount: 100 };
  const begin = analytics.backtest(data, weights, options);
  close(begin.finalValue, 105);
  close(begin.invested, 200);
  close(begin.maxDrawdown, -50);
  close(begin.rows.at(-1).benchmark, begin.finalValue);
  close(begin.xirr, begin.benchmarkXirr);
  const end = analytics.backtest(data, weights, { ...options, timing: "end", costBps: 100 });
  close(end.finalValue, 148.5);
  close(end.costs, 2);
  assert.ok(end.maxDrawdown < -50);
  close(analytics.backtest(data, weights, { ...options, mode: "lumpsum", timing: "end" }).finalValue, 55);
});

test("historical backtest step-ups, annualization, gaps and validation", () => {
  const data = fixture({ A: Array(24).fill(0), Nifty50: Array(24).fill(0) });
  const weights = [{ name: "A", weight: 100 }];
  const options = { from: 2020 * 12, to: 2021 * 12 + 11, amount: 100, stepUp: 10 };
  const result = analytics.backtest(data, weights, options);
  close(result.invested, 2520);
  close(result.rows[12].contribution, 110);
  close(result.xirr, 0);
  close(analytics.backtest(data, weights, { ...options, mode: "lumpsum" }).cagr, 0);
  assert.ok(analytics.backtest(data, weights, { ...options, amount: NaN }).error);
  assert.ok(analytics.backtest(data, [{ name: "A", weight: 50 }], options).error);
  data.monthlyAssets.A[0].m[3] = null;
  assert.match(analytics.backtest(data, weights, options).error, /2020-04/);
});

test("backtest weighted holdings drift and XIRR matches independently annualized lump-sum growth", () => {
  const data = fixture({ A: Array(24).fill(1), B: Array(24).fill(0), Nifty50: Array(24).fill(1) });
  const from = 2020 * 12, to = 2021 * 12 + 11;
  const result = analytics.backtest(data, [{ name: "A", weight: 50 }, { name: "B", weight: 50 }], { from, to, amount: 100, mode: "lumpsum" });
  close(result.finalValue, 50 * 1.01 ** 24 + 50);
  const years = (Date.UTC(2021, 11, 31) - Date.UTC(2020, 0, 1)) / 86400000 / 365;
  close(result.xirr, ((result.finalValue / 100) ** (1 / years) - 1) * 100);
  close(result.cagr, result.xirr);
  const loss = analytics.backtest(fixture({ A: [-100, 0], Nifty50: [-100, 0] }), [{ name: "A", weight: 100 }], { from, to: from + 1, amount: 100 });
  close(loss.finalValue, 100);
  close(loss.maxDrawdown, -100);
  assert.ok(Number.isFinite(loss.xirr));
});

test("monthly dates and compounding retain zeros and reject missing or unfinished periods", () => {
  const data = fixture({ A: [10, -10, 0, null] });
  const map = analytics.monthlyMap(data, "A");
  close(analytics.compound(map, 2020 * 12, 2020 * 12 + 2), -1);
  assert.equal(analytics.compound(map, 2020 * 12, 2020 * 12 + 3), null);
  assert.equal(analytics.monthKey("2020-13"), null);
  assert.deepEqual(analytics.monthTime(2020 * 12 + 1), { year: 2020, month: 2, day: 29 });
  data.generated = "2020-03-01";
  assert.equal(analytics.monthlyMap(data, "A").size, 2);
});

test("audit checks actual quarter compounding and excludes averages and incomplete quarters", () => {
  const data = fixture({ A: [10, -10, 0, 1, null, 1, 1, 1, 1] });
  data.assets.A = [{ year: 2020, q: [-1, 5, 5, null] }, { avg: true, q: [1, 1, 1, 1] }];
  data.monthlyAssets.A.push({ avg: true, m: Array(12).fill(99) });
  const result = analytics.audit(data, "A");
  assert.equal(result.checked, 2);
  assert.equal(result.mismatches, 1);
  assert.equal(result.missing, 1);
  assert.equal(result.issues[0].quarter, 3);
  close(result.issues[0].monthly, 3.0301);
  close(result.issues[0].difference, -1.9699);
  assert.equal(analytics.audit(data, "A", 2).mismatches, 0);
});

test("audit records invalid returns and duplicate monthly observations", () => {
  const data = fixture({ A: [null, -101, 0] });
  data.monthlyAssets.A.push({ year: 2020, m: [1] });
  const audit = analytics.audit(data, "A");
  assert.equal(audit.invalid, 1);
  assert.equal(audit.duplicates, 1);
  assert.equal(audit.missing, 0);
  assert.equal(analytics.monthlyMap(data, "A").has(2020 * 12), false);
});

test("common history uses the latest shared uninterrupted suffix instead of crossing gaps", () => {
  const data = fixture({ A: [1, null, 1, 2], B: [2, 3, 4, null] });
  const history = analytics.commonHistory([analytics.monthlyMap(data, "A"), analytics.monthlyMap(data, "B")]);
  assert.deepEqual(history.keys, [2020 * 12 + 2]);
  assert.equal(history.excluded, 2);
  assert.equal(analytics.commonHistory([new Map()]), null);
});

test("benchmark screen counts strict wins in consecutive rolling windows and anchors latest to benchmark", () => {
  const data = fixture({ Nifty50: Array(24).fill(0), A: Array(24).fill(1), B: Array(24).fill(0) });
  let rows = analytics.screen(data, { window: 12 });
  const asset = rows.find((row) => row.name === "A");
  assert.equal(asset.windows, 13);
  assert.equal(asset.hitRate, 100);
  close(asset.latestExcess, (1.01 ** 12 - 1) * 100);
  assert.equal(rows.find((row) => row.name === "B").hitRate, 0);
  data.monthlyAssets.A[0].m[5] = null;
  data.monthlyAssets.A[1].m[11] = null;
  rows = analytics.screen(data, { window: 12 });
  assert.equal(rows.find((row) => row.name === "A").windows, 6);
  assert.equal(rows.find((row) => row.name === "A").latestExcess, null);
  assert.equal(analytics.screen(data, { window: 36 })[0].windows, 0);
  const filtered = analytics.screen(data, { window: 12, from: 2021 * 12, to: 2021 * 12 + 1 });
  assert.equal(filtered.find((row) => row.name === "B").windows, 2);
});

test("correlations use one shared sample and reject short histories and constant series", () => {
  const values = Array.from({ length: 24 }, (_, index) => index % 5 - 2);
  const data = fixture({ A: values, B: values.map((value) => -value), Flat: Array(24).fill(0) });
  const result = analytics.correlations(data, ["A", "B", "Flat"]);
  close(result.matrix[0][0], 1);
  close(result.matrix[0][1], -1);
  assert.equal(result.matrix[0][2], null);
  assert.equal(result.count, 24);
  assert.equal(analytics.correlations(data, ["A", "B"], 2021 * 12).matrix[0][1], null);
});

test("portfolio distinguishes drifting holdings from monthly rebalancing", () => {
  const data = fixture({ A: [100, 0], B: [0, 100], Nifty50: [0, 0] });
  const weights = [{ name: "A", weight: 50 }, { name: "B", weight: 50 }];
  const held = analytics.simulate(data, weights, { amount: 100, costBps: 0, rebalance: "none" });
  const monthly = analytics.simulate(data, weights, { amount: 100, costBps: 0, rebalance: "monthly" });
  close(held.statistics.finalValue, 200);
  close(monthly.statistics.finalValue, 225);
  close(held.benchmark.at(-1).value, 100);
  assert.equal(held.statistics.cagr, null);
  assert.equal(held.statistics.volatility, null);
  assert.equal(held.points[0].key, 2020 * 12 - 1);
});

test("quarterly and annual rebalancing use calendar boundaries, not elapsed observations", () => {
  const data = fixture({ A: [0, 100, 100, 0, ...Array(6).fill(0), 100, 100, 0], B: [0, 0, 0, 100, ...Array(6).fill(0), 0, 0, 100] });
  const weights = [{ name: "A", weight: 50 }, { name: "B", weight: 50 }];
  const options = { amount: 100, costBps: 0, from: 2020 * 12 + 1, to: 2020 * 12 + 3 };
  close(analytics.simulate(data, weights, { ...options, rebalance: "quarterly" }).statistics.finalValue, 375);
  close(analytics.simulate(data, weights, { ...options, rebalance: "annual" }).statistics.finalValue, 300);
  close(analytics.simulate(data, weights, { ...options, from: 2020 * 12 + 10, to: 2021 * 12, rebalance: "annual" }).statistics.finalValue, 375);
});

test("annualized portfolio statistics require sufficient monthly observations", () => {
  const data = fixture({ A: Array(24).fill(1), Nifty50: Array(24).fill(0) });
  const result = analytics.simulate(data, [{ name: "A", weight: 100 }], { costBps: 0 });
  close(result.statistics.cagr, (1.01 ** 12 - 1) * 100);
  close(result.statistics.volatility, 0);
  const short = analytics.simulate(data, [{ name: "A", weight: 100 }], { costBps: 0, to: 2020 * 12 + 11 });
  assert.notEqual(short.statistics.cagr, null);
  assert.equal(short.statistics.volatility, null);
});

test("portfolio costs apply to initial purchases and actual buys plus sells, with no final rebalance", () => {
  const data = fixture({ A: [100, 0], B: [0, 100], Nifty50: [0, 0] });
  const result = analytics.simulate(data, [{ name: "A", weight: 50 }, { name: "B", weight: 50 }], { amount: 100, costBps: 100, rebalance: "monthly" });
  close(result.totalCost, 1.495);
  close(result.statistics.finalValue, 222.0075);
  close(result.benchmark.at(-1).value, 99);
  const flat = analytics.simulate(fixture({ A: [0, 0], Nifty50: [0, 0] }), [{ name: "A", weight: 100 }], { amount: 100, costBps: 100 });
  close(flat.statistics.maxDrawdown, -1);
  close(flat.totalCost, 1);
});

test("portfolio checks weight totals, duplicates, costs, date ranges and missing history", () => {
  const data = fixture({ A: [1, null, 2], B: [1, 1, 1], Nifty50: [0, null, 0] });
  assert.match(analytics.simulate(data, [{ name: "A", weight: 90 }]).error, /100%/);
  assert.match(analytics.simulate(data, [{ name: "A", weight: 50 }, { name: "A", weight: 50 }]).error, /once/);
  assert.match(analytics.simulate(data, [{ name: "A", weight: 100 }], { costBps: -1 }).error, /costs/);
  assert.match(analytics.simulate(data, [{ name: "A", weight: 100 }], { from: 10, to: 5 }).error, /start/);
  const result = analytics.simulate(data, [{ name: "A", weight: 50 }, { name: "B", weight: 50 }], { costBps: 0 });
  assert.equal(result.history.keys.length, 1);
  assert.equal(result.history.excluded, 2);
  close(result.statistics.finalValue, 10150);
  assert.match(analytics.simulate(data, [{ name: "A", weight: 100 }], { from: 0, to: 1 }).error, /No shared/);
});