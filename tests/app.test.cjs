const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/init\(\);\s*$/, "");
const realData = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));

function setup(data = realData) {
  const elements = new Map();
  let points;
  const context = vm.createContext({
    LightweightCharts: { TickMarkType: { Year: 0 } }, Intl,
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, { hidden: false, textContent: "", innerHTML: "" });
        return elements.get(selector);
      },
      querySelectorAll: () => [],
    },
    requestAnimationFrame: (callback) => callback(),
    data,
    chart: { applyOptions() {}, timeScale: () => ({ fitContent() {} }), priceScale: () => ({ applyOptions() {} }) },
    series: { setData(value) { points = value; } },
  });
  vm.runInContext(source, context);
  vm.runInContext('state.data = data; state.names = Object.keys(data.assets); state.fromYear = 2000; state.toYear = data.currentYear; state.charts.asset = {chart, series}; state.names.forEach(name => state.stats[name] = computeStats(data.assets[name]));', context);
  return { run: (code) => vm.runInContext(code, context), context, points: () => points };
}

test("quarterly and annual chart values match all source indices", () => {
  const app = setup();
  for (const [name, rows] of Object.entries(realData.assets)) {
    app.context.name = name;
    for (const period of ["quarterly", "annual"]) {
      app.context.period = period;
      app.run("state.returnPeriod = period; renderAsset(name)");
      const expected = rows.filter((row) => !row.avg).flatMap((row) => period === "annual"
        ? row.annual == null ? [] : [{ year: row.year, month: 12, value: row.annual }]
        : row.q.flatMap((value, index) => value == null ? [] : [{ year: row.year, month: (index + 1) * 3, value }]))
        .sort((left, right) => left.year - right.year || left.month - right.month);
      assert.deepEqual(Array.from(app.points(), (point) => ({ year: point.time.year, month: point.time.month, value: point.value })), expected);
    }
  }
});

test("growth aligns starting balances and does not compound across gaps", () => {
  const app = setup({ currentYear: 2026, assets: {
    A: [{ year: 2025, q: [10, -10, null, 20], annual: 10 }],
    B: [{ year: 2025, q: [5, 5, 5, 5], annual: 20 }],
  } });
  let growth = app.run('growthData(["A", "B"])');
  assert.equal(growth.start, 2025 * 4 + 3);
  assert.equal(growth.series[0][0].value, 10000);
  assert.equal(growth.series[0][1].value, 12000);
  assert.equal(growth.series[1][1].value, 10500);
  app.run("state.data.assets.A[0].q[2] = 0");
  growth = app.run('growthData(["A", "B"])');
  assert.equal(growth.series[0][4].value, 11880);
  assert.equal(growth.series[0][0].time.year, 2024);
  assert.equal(app.run("growthData([])"), null);
  assert.equal(app.run('growthData(["A"], 2026, 2026)'), null);
});

test("year filters apply to charts and CSV while preserving YTD labels", () => {
  const app = setup();
  app.run('state.view = "asset"; state.asset = "Nifty50"; state.fromYear = state.toYear = state.data.currentYear; renderAsset(state.asset)');
  assert.ok(app.points().every((point) => point.time.year === realData.currentYear));
  const records = app.run("exportRecords()");
  assert.equal(records.length, 2);
  assert.equal(records[1][2], "YTD");
  assert.equal(records[1][6], null);
  assert.equal(app.run('state.returnPeriod = "annual"; assetPeriodLabel({year: state.data.currentYear, month: 12})'), `${realData.currentYear} YTD`);
});

test("comparison exports respect selected indices and growth baseline", () => {
  const app = setup();
  app.run('state.view = "compare"; state.compareNames = ["Nifty50", "Next50"]; state.fromYear = 2020; state.toYear = 2025');
  assert.equal(app.run("exportRecords().length"), 13);
  app.run('state.compareMode = "growth"');
  const records = app.run("exportRecords()");
  assert.equal(records.length, 51);
  assert.equal(records[1][1], "2019-12-31");
  assert.equal(records[1][2], 10000);
  app.run("state.compareNames = []");
  assert.equal(app.run("exportRecords().length"), 1);
});

test("CSV escapes delimiters and quotes, preserves numeric losses and blanks", () => {
  const app = setup();
  assert.equal(app.run('csvText([["a,b", "a\\\"b", "=SUM(A1)", -2, null]])'), '"a,b","a""b","\'=SUM(A1)","-2",""');
});