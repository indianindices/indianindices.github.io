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
    LightweightCharts: { TickMarkType: { Year: 0 }, LineType: { Curved: 2, Simple: 0 }, LineStyle: { Dashed: 2, Solid: 0 } }, Intl, URLSearchParams,
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

test("both comparison modes use curved lines and keep the benchmark dashed", () => {
  const app = setup();
  const options = [];
  app.context.chart.removeSeries = () => {};
  app.context.chart.addLineSeries = (value) => {
    options.push(value);
    let data = [];
    return { setData(value) { data = value; }, data() { return data; } };
  };
  app.run('state.charts.compare = {chart, lines: []}; state.compareNames = ["Nifty50", "Next50"]');
  for (const mode of ["returns", "growth"]) {
    app.context.mode = mode;
    options.length = 0;
    app.run("state.compareMode = mode; renderCompare()");
    assert.equal(options.length, 2);
    assert.ok(options.every((value) => value.lineType === app.context.LightweightCharts.LineType.Curved));
    assert.equal(options[0].lineStyle, app.context.LightweightCharts.LineStyle.Dashed);
    assert.equal(options[1].lineStyle, app.context.LightweightCharts.LineStyle.Solid);
  }
});

test("CSV escapes delimiters and quotes, preserves numeric losses and blanks", () => {
  const app = setup();
  assert.equal(app.run('csvText([["a,b", "a\\\"b", "=SUM(A1)", -2, null]])'), '"a,b","a""b","\'=SUM(A1)","-2",""');
});

test("excess returns subtract matched benchmark years and preserve missing data", () => {
  const app = setup({ currentYear: 2026, assets: {
    Nifty50: [{ year: 2024, q: [], annual: -10 }, { year: 2025, q: [], annual: null }],
    Sector: [{ year: 2024, q: [], annual: 5 }, { year: 2025, q: [], annual: 20 }, { year: 2026, q: [], annual: 10 }],
  } });
  const points = app.run('annualCompareData("Sector", true)');
  assert.equal(points[0].value, 15);
  assert.equal(points[1].value, undefined);
  assert.equal(points[2].value, undefined);
  assert.equal(app.run('annualCompareData("Nifty50", true)[0].value'), 0);
  app.run('state.view = "compare"; state.compareMode = "excess"; state.compareNames = ["Sector"]');
  const records = app.run("exportRecords()");
  assert.equal(records[0][3], "Excess vs Nifty50 (percentage points)");
  assert.equal(records[1][3], 15);
  assert.equal(records[2][3], null);
});

test("percentage-point formatter preserves excess-return units and signs", () => {
  const app = setup();
  assert.equal(app.run("fmtPp(5)"), "+5.00 pp");
  assert.equal(app.run("fmtPp(-5)"), "-5.00 pp");
  assert.equal(app.run("fmtPp(0)"), "0.00 pp");
  assert.equal(app.run("fmtPp(null)"), "—");
});

test("comparison URLs preserve selections, mode, dates and empty selections", () => {
  const app = setup();
  app.run('state.firstYear = 2006; state.lastYear = 2026; state.fromYear = 2020; state.toYear = 2025; state.compareNames = ["Nifty50", "Oil and gas"]; state.compareMode = "growth"');
  const hash = app.run("compareHash()");
  app.context.params = new URLSearchParams(hash.split("?")[1]);
  app.run('state.compareNames = []; state.compareMode = "returns"; state.fromYear = 2006; applyCompareParams(params)');
  assert.deepEqual(Array.from(app.run("state.compareNames")), ["Nifty50", "Oil and gas"]);
  assert.equal(app.run("state.compareMode"), "growth");
  assert.equal(app.run("state.fromYear"), 2020);
  assert.equal(app.run("state.toYear"), 2025);
  app.run('state.compareNames = []; applyCompareParams(new URLSearchParams(compareHash().split("?")[1]))');
  assert.equal(app.run("state.compareNames.length"), 0);
  app.run('applyCompareParams(new URLSearchParams("mode=bad&asset=bad&asset=Nifty50&asset=Nifty50&from=1900&to=9999"))');
  assert.deepEqual(Array.from(app.run("state.compareNames")), ["Nifty50"]);
  assert.equal(app.run("state.compareMode"), "returns");
  assert.equal(app.run("state.fromYear"), 2006);
  assert.equal(app.run("state.toYear"), 2026);
});

test("rolling CAGR uses complete lookbacks before the filtered endpoint range", () => {
  const app = setup({ currentYear: 2026, assets: { Sector: [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, q: [10, 10, 10, 10], annual: 46.41 })) } });
  app.run("state.fromYear = state.toYear = 2025");
  const three = app.run('rollingCompareData("Sector", 3)');
  const five = app.run('rollingCompareData("Sector", 5)');
  assert.equal(three.length, 4);
  assert.ok(three.every((point) => Math.abs(point.value - 46.41) < 1e-8));
  assert.equal(five[0].value, undefined);
  assert.ok(Math.abs(five[3].value - 46.41) < 1e-8);
  app.run("state.data.assets.Sector[2].q[1] = null");
  assert.ok(app.run('rollingCompareData("Sector", 3)').every((point) => point.value === undefined));
  app.run('state.view = "compare"; state.compareMode = "rolling5"; state.compareNames = ["Sector"]');
  assert.equal(app.run("exportRecords()[0][2]"), "5Y rolling CAGR (%)");
});

test("freshness distinguishes missing metadata, cached failures and overdue sources", () => {
  const app = setup();
  assert.equal(app.run('refreshInfo("Nifty50").kind'), "unknown");
  app.run('state.data.refresh = {Nifty50: {lastSuccess: "2026-10-01", lastAttempt: "2026-10-07", status: "fresh"}}');
  assert.equal(app.run('refreshInfo("Nifty50", Date.parse("2026-10-07")).kind'), "fresh");
  assert.equal(app.run('refreshInfo("Nifty50", Date.parse("2027-01-01")).kind'), "stale");
  app.run('state.data.refresh.Nifty50.status = "cached"');
  assert.equal(app.run('refreshInfo("Nifty50", Date.parse("2026-10-07")).kind'), "cached");
  app.run('state.data.refresh.Nifty50.lastSuccess = null');
  assert.ok(app.run('refreshInfo("Nifty50").detail').includes("unknown"));
  app.run('delete state.data.refresh');
});

test("drawdowns and recovery durations track regained and unrecovered peaks", () => {
  const app = setup();
  app.context.points = [100, 120, 90, 100, 120, 132, 66].map((value, index) => ({ time: { year: 2020 + Math.floor(index / 4), month: (index % 4 + 1) * 3, day: 31 }, value }));
  app.run("var risk = riskData({series:[points]})[0]");
  assert.deepEqual(Array.from(app.run("risk.drawdown"), (point) => Math.round(point.value)), [0, 0, -25, -17, 0, 0, -50]);
  assert.deepEqual(Array.from(app.run("risk.recovery"), (point) => point.value), [0, 0, 1, 2, 0, 0, 1]);
  assert.equal(app.run("risk.longest"), 3);
  assert.equal(app.run("risk.worstRecovery"), null);
  assert.equal(app.run("risk.current"), -50);
  app.run("points.pop(); risk = riskData({series:[points]})[0]");
  assert.equal(app.run("risk.worstRecovery"), 3);
  assert.equal(app.run("risk.current"), 0);
  assert.equal(app.run("riskData(null)"), null);
});

test("rankings keep missing values last and use stable alphabetical ties", () => {
  const app = setup();
  app.run('state.names = ["C", "B", "A"]; state.stats = {A:{cagr5:10,sd:4},B:{cagr5:null,sd:null},C:{cagr5:10,sd:2}}');
  assert.deepEqual(Array.from(app.run('rankedNames("cagr5", "desc")')), ["A", "C", "B"]);
  assert.deepEqual(Array.from(app.run('rankedNames("cagr5", "asc")')), ["A", "C", "B"]);
  assert.deepEqual(Array.from(app.run('rankedNames("sd", "asc")')), ["C", "A", "B"]);
  assert.deepEqual(Array.from(app.run('rankedNames("name", "desc")')), ["C", "B", "A"]);
  app.run("renderRankings()");
  assert.ok(app.run('document.querySelector("#rankings").innerHTML').includes('aria-sort="descending"'));
});

test("PNG export metadata includes metric units and excludes hidden summary lines", () => {
  const app = setup();
  app.run('state.compareMode = "excess"; state.charts.compare = {lines: [{name:"Nifty50",series:{options:()=>({color:"red"})}}]}');
  const compare = app.run('chartExportInfo("compare")');
  assert.ok(compare.title.includes("percentage points"));
  assert.ok(compare.filename.endsWith(".png"));
  assert.equal(compare.lines.length, 1);
  app.run('state.charts.summary = {lines: [{name:"A",visible:false},{name:"B",visible:true,series:{options:()=>({color:"blue"})}}]}');
  const summary = app.run('chartExportInfo("summary")');
  assert.equal(summary.lines.length, 1);
  assert.equal(summary.lines[0].name, "B");
  assert.equal(summary.title, "Annual returns · 1 visible index");
  app.run('state.asset = "Nifty200 Momentum30"; state.returnPeriod = "annual"');
  assert.ok(app.run('chartExportInfo("asset").filename').includes("Nifty200_Momentum30-annual"));
});

test("2027 labels advance YTD while 2026 becomes a past year", () => {
  const app = setup({ currentYear: 2027, generated: "2027-04-03", assets: {
    Nifty50: [{ year: 2027, q: [4, null, null, null], annual: 4 }, { year: 2026, q: [2, 3, 4, 5], annual: 14.7 }],
  } });
  app.run('state.asset = "Nifty50"; state.returnPeriod = "annual"; renderAsset("Nifty50"); renderHeatmap(); renderRankings()');
  const table = app.run('document.querySelector("#assetTable").innerHTML');
  assert.ok(table.includes("2027 YTD"));
  assert.ok(table.includes('class="label">2026</td>'));
  assert.ok(!table.includes("2026 YTD"));
  assert.ok(app.run('document.querySelector("#heatmap").innerHTML').includes("2027 YTD"));
  assert.ok(app.run('document.querySelector("#rankings").innerHTML').includes("2027 YTD"));
  assert.equal(app.run("assetPeriodLabel({year:2026,month:12})"), "2026");
  assert.equal(app.run("assetPeriodLabel({year:2027,month:12})"), "2027 YTD");
  assert.equal(app.run('state.stats.Nifty50.last'), 14.7);
});