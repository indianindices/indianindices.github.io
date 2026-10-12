const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/init\(\);\s*$/, "");
const researchSource = fs.readFileSync(path.join(root, "research.js"), "utf8");
const calculatorSource = fs.readFileSync(path.join(root, "calculator.js"), "utf8");
const realData = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));

function setup(data = realData) {
  const elements = new Map();
  let points;
  const context = vm.createContext({
    UI_CONFIG: structuredClone(require("../ui-config.js")),
    SectorAnalytics: require("../analytics.js"),
    InvestmentCalculator: require("../finance-calculations.js"),
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
  vm.runInContext(researchSource, context);
  vm.runInContext(calculatorSource, context);
  vm.runInContext(source, context);
  vm.runInContext('state.data = data; state.names = Object.keys(data.assets); state.fromYear = 2000; state.toYear = data.currentYear; state.charts.asset = {chart, series}; state.names.forEach(name => state.stats[name] = computeStats(data.assets[name]));', context);
  return { run: (code) => vm.runInContext(code, context), context, points: () => points };
}

test("UI config disables Research by default and rejects its deep links", () => {
  const app = setup();
  assert.equal(app.run('uiSectionEnabled("research")'), false);
  app.run('applyUiConfig()');
  assert.equal(app.run('document.querySelector("#researchBtn").hidden'), true);
  app.context.location = { hash: "#research/portfolio" };
  app.context.window = { scrollTo() {} };
  app.run('renderSidebar = () => {}; renderResearch = () => { throw new Error("Disabled Research rendered"); }; route()');
  assert.equal(app.context.location.hash, "asset/Nifty50");
  assert.equal(app.run('document.querySelector("#researchView").hidden'), true);
});

test("UI config chooses the first enabled tab and hides sections with no enabled children", () => {
  const app = setup();
  const buttons = ["heatmap", "returns", "cagr"].map((tab) => ({ dataset: { tab }, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }));
  app.context.document.querySelectorAll = (selector) => selector === "#summaryTabs [role='tab']" ? buttons : [];
  app.run('UI_CONFIG.subsections.marketOverview.heatmap = false; UI_CONFIG.subsections.marketOverview.returns = false; ensureSummaryChart = () => { throw new Error("Disabled chart created"); }; renderSummary()');
  assert.equal(app.run('state.summaryTab'), "cagr");
  assert.equal(buttons[0].hidden, true);
  assert.equal(buttons[1].hidden, true);
  assert.equal(buttons[2].hidden, false);
  assert.equal(app.run('document.querySelector("#summary-cagr-panel").hidden'), false);
  app.run('UI_CONFIG.subsections.marketOverview.cagr = false; renderSummary(); applyUiConfig()');
  assert.equal(app.run('uiSectionEnabled("marketOverview")'), false);
  assert.equal(app.run('document.querySelector("#summaryBtn").hidden'), true);
  assert.ok(buttons.every((button) => button.hidden));
  app.run('UI_CONFIG.sections.research = true; UI_CONFIG.subsections.research.quality = false; renderResearch("quality")');
  assert.equal(app.run('researchState.tab'), "screener");
  assert.equal(app.run('document.querySelector("#research-quality-panel").hidden'), true);
});

test("UI config hides asset blocks without initializing a disabled chart", () => {
  const app = setup();
  app.run('UI_CONFIG.subsections.assets.chart = false; UI_CONFIG.subsections.assets.stats = false; ensureAssetChart = () => { throw new Error("Disabled asset chart created"); }; renderAsset("Nifty50")');
  assert.equal(app.run('document.querySelector("#assetChartBlock").hidden'), true);
  assert.equal(app.run('document.querySelector("#assetStats").hidden'), true);
  assert.equal(app.run('document.querySelector("#assetTableBlock").hidden'), false);
  assert.ok(app.run('document.querySelector("#assetTable").innerHTML').includes("Q1"));
  app.run('UI_CONFIG.subsections.assets.returnsTable = false; renderAsset("Nifty50")');
  assert.equal(app.run('document.querySelector("#assetRangeControls").hidden'), true);
  assert.equal(app.run('uiSectionEnabled("assets")'), false);
});

test("UI config supports disabling every view without a redirect loop", () => {
  const app = setup();
  app.context.location = { hash: "#summary" };
  app.context.window = { scrollTo() {} };
  app.run('Object.keys(UI_CONFIG.sections).forEach(key => UI_CONFIG.sections[key] = false); renderSidebar = () => {}; route()');
  assert.equal(app.run('state.view'), null);
  assert.equal(app.run('document.querySelector("#noViews").hidden'), false);
  assert.equal(app.context.location.hash, "#summary");
});

test("UI config normalizes disabled Research tab links and is staged before app.js", () => {
  const app = setup();
  app.context.location = { hash: "#research/quality" };
  app.context.window = { scrollTo() {} };
  app.run('UI_CONFIG.sections.research = true; UI_CONFIG.subsections.research.quality = false; renderSidebar = () => {}; route()');
  assert.equal(app.context.location.hash, "research/screener");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(html.indexOf('src="ui-config.js"') < html.indexOf('src="app.js"'));
  for (const file of ["dev.sh", ".github/workflows/update-data.yml"]) {
    assert.match(fs.readFileSync(path.join(root, file), "utf8"), /cp index.html methodology.html ui-config.js /);
  }
});

test("UI config selects the first enabled comparison mode for disabled saved URLs", () => {
  const app = setup();
  app.run('UI_CONFIG.subsections.compare.returns = false; state.compareNames = []; state.fromYear = 2020; state.toYear = 2025; state.charts.compare = {chart, lines: []}; applyCompareParams(new URLSearchParams("mode=returns")); renderCompare()');
  assert.equal(app.run('state.compareMode'), "growth");
  assert.match(app.run('compareHash()'), /mode=growth/);
  app.run('Object.keys(UI_CONFIG.subsections.compare).forEach(key => UI_CONFIG.subsections.compare[key] = false); applyUiConfig()');
  assert.equal(app.run('document.querySelector("#compareBtn").hidden'), true);
});

test("Calculator config and deep links select enabled modes and hide disabled sections", () => {
  const app = setup();
  app.context.location = { hash: "#calculator/swp" };
  app.context.window = { scrollTo() {} };
  app.run('let modeRendered; renderCalculator = mode => {modeRendered = mode;}; renderSidebar = () => {}; route()');
  assert.equal(app.run('state.view'), "calculator");
  assert.equal(app.run('modeRendered'), "swp");
  assert.equal(app.run('document.querySelector("#calculatorView").hidden'), false);
  app.run('UI_CONFIG.subsections.calculator.swp = false; route()');
  assert.equal(app.context.location.hash, "calculator/sip");
  app.run('UI_CONFIG.sections.calculator = false; location.hash = "#calculator/swp"; route(); applyUiConfig()');
  assert.equal(app.run('document.querySelector("#calculatorBtn").hidden'), true);
  assert.equal(app.run('document.querySelector("#calculatorView").hidden'), true);
});

test("Calculator exports contain cash-flow assumptions and a projection-specific PNG disclaimer", () => {
  const app = setup();
  app.run('calculatorState.result = InvestmentCalculator.project({mode: "swp", amount: 1000, withdrawal: 300, annualReturn: 0, years: 1, start: "2026-10", stepUp: 0})');
  const records = app.run('calculatorRecords()');
  assert.equal(records.length, 14);
  assert.ok(records[0].includes("Requested withdrawal (INR)"));
  assert.equal(records[5][records[0].indexOf("Actual withdrawal (INR)")], 100);
  const info = app.run('calculatorExportInfo()');
  assert.equal(info.title, "SWP projection");
  assert.match(info.footer, /not a forecast/);
  assert.ok(!info.footer.includes("Trendlyne"));
});

test("Research quality and screener render source coverage without creating charts", () => {
  const app = setup();
  app.run('UI_CONFIG.sections.research = true');
  app.run('renderResearch("quality")');
  assert.equal(app.run('document.querySelector("#research-quality-panel").hidden'), false);
  assert.equal(app.run('document.querySelector("#researchRangeControls").hidden'), true);
  assert.ok(app.run('document.querySelector("#qualityTable").innerHTML').includes("Nifty50"));
  assert.ok(app.run('document.querySelector("#researchBasis").textContent').includes("unverified"));
  app.run('renderResearch("screener")');
  assert.equal(app.run('document.querySelector("#research-quality-panel").hidden'), true);
  assert.equal(app.run('document.querySelector("#research-screener-panel").hidden'), false);
  assert.ok(app.run('document.querySelector("#screenerTable").innerHTML').includes("Matched windows"));
  assert.equal(app.run('state.charts.portfolio'), undefined);
  app.run('document.querySelector("#screenMinWindows").value = 0; renderScreener()');
  assert.match(app.run('document.querySelector("#screenerStatus").textContent'), /Enter valid/);
  app.run('document.querySelector("#screenMinWindows").value = 12; document.querySelector("#researchFrom").value = ""; renderScreener()');
  assert.match(app.run('document.querySelector("#screenerStatus").textContent'), /Enter valid/);
});

test("Research deep links isolate panels and preserve the existing Market Overview link", () => {
  const app = setup();
  app.run('UI_CONFIG.sections.research = true');
  app.context.location = { hash: "#research/screener" };
  app.context.window = { scrollTo() {} };
  app.run('renderSidebar = () => {}; route()');
  assert.equal(app.run('state.view'), "research");
  assert.equal(app.run('document.querySelector("#researchView").hidden'), false);
  assert.equal(app.run('document.querySelector("#assetView").hidden'), true);
  assert.equal(app.run('document.querySelector("#summaryView").hidden'), true);
  app.run('location.hash = "#summary"; renderSummary = () => {}; route()');
  assert.equal(app.run('state.view'), "summary");
  assert.equal(app.run('document.querySelector("#researchView").hidden'), true);
});

test("Research exports carry coverage, return basis and reproducible settings", () => {
  const app = setup();
  app.run('UI_CONFIG.sections.research = true');
  app.run('renderResearch("quality")');
  let rows = app.run('researchRecords("quality")');
  assert.equal(rows.length, Object.keys(realData.assets).length + 1);
  assert.equal(rows[0][1], "Return basis");
  app.run('renderResearch("screener")');
  rows = app.run('researchRecords("screener")');
  assert.ok(rows[0].includes("Rolling window (months)"));
  app.run('researchState.simulation = SectorAnalytics.simulate(state.data, [{name: "Nifty50", weight: 100}], {costBps: 25, rebalance: "annual", from: SectorAnalytics.monthKey("2024-01"), to: SectorAnalytics.monthKey("2026-09")})');
  rows = app.run('researchRecords("portfolio")');
  assert.equal(rows[1][rows[0].indexOf("Trading cost (bps)")], 25);
  assert.equal(rows[1][rows[0].indexOf("Rebalance")], "annual");
  assert.equal(rows[1][rows[0].indexOf("Target weights (%)")], "Nifty50: 100");
  assert.equal(rows[1].at(-1), "Return basis unverified");
});

test("Summary tabs show only their own panel and initialize the chart lazily", () => {
  const app = setup();
  const buttons = ["heatmap", "returns", "cagr"].map((tab) => ({ dataset: { tab }, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }));
  app.context.document.querySelectorAll = (selector) => selector === "#summaryTabs [role='tab']" ? buttons : [];
  app.run('let summaryCalls = 0; ensureSummaryChart = () => { summaryCalls++; return {chart}; }; renderSummary()');
  assert.equal(app.run('state.summaryTab'), "heatmap");
  assert.equal(app.run('document.querySelector("#summary-cagr-panel").hidden'), true);
  assert.equal(app.run('document.querySelector("#summary-heatmap-panel").hidden'), false);
  assert.equal(app.run('document.querySelector("#summary-returns-panel").hidden'), true);
  assert.ok(app.run('document.querySelector("#heatmap").innerHTML').includes("<th>Asset</th>"));
  assert.equal(app.run('summaryCalls'), 0);
  assert.equal(buttons[0].attributes["aria-selected"], "true");
  assert.equal(buttons[0].tabIndex, 0);
  assert.equal(buttons[1].tabIndex, -1);
  app.run('state.summaryTab = "cagr"; renderSummary()');
  assert.equal(app.run('document.querySelector("#summary-cagr-panel").hidden'), false);
  assert.equal(app.run('document.querySelector("#summary-heatmap-panel").hidden'), true);
  assert.ok(app.run('document.querySelector("#rankings").innerHTML').includes("5Y CAGR"));
  assert.equal(app.run('summaryCalls'), 0);
  app.run('state.summaryTab = "returns"; renderSummary()');
  assert.equal(app.run('document.querySelector("#summary-heatmap-panel").hidden'), true);
  assert.equal(app.run('document.querySelector("#summary-returns-panel").hidden'), false);
  assert.equal(app.run('summaryCalls'), 1);
  assert.equal(buttons[1].attributes["aria-selected"], "true");
});

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

test("monthly charts use source values, month ends, labels and year filters", () => {
  const data = { currentYear: 2028, assets: { A: [{ year: 2028, q: [2, null, null, null], annual: 2 }] },
    monthlyAssets: { A: [{ year: 2028, m: [1, -2, 0, ...Array(9).fill(null)], annual: 2 }, { year: 2027, m: Array(12).fill(3), annual: 40 }] } };
  const app = setup(data);
  app.run('state.asset = "A"; state.returnPeriod = state.tablePeriod = "monthly"; state.fromYear = state.toYear = 2028; renderAsset("A")');
  assert.deepEqual(Array.from(app.points(), (point) => [point.time.year, point.time.month, point.time.day, point.value]), [[2028, 1, 31, 1], [2028, 2, 29, -2], [2028, 3, 31, 0]]);
  assert.equal(app.run('assetPeriodLabel({year: 2028, month: 2, day: 29})'), "Feb 2028");
  assert.ok(app.run('document.querySelector("#assetTable").innerHTML').includes("<th>Dec</th>"));
  assert.ok(app.run('document.querySelector("#assetTable").innerHTML').includes("2028 YTD"));
  const records = app.run('state.view = "asset"; exportRecords()');
  assert.equal(records.length, 2);
  assert.equal(records[0].length, 16);
  assert.equal(records[0][3], "Jan (%)");
  assert.equal(records[1][4], -2);
  assert.equal(records[1][6], null);
  assert.ok(app.run('chartExportInfo("asset").title').includes("monthly returns"));
});

test("monthly mode handles old workbooks and exposes monthly cached status independently", () => {
  const app = setup({ currentYear: 2026, assets: { A: [{ year: 2025, q: [1, 2, 3, 4], annual: 10 }] },
    refresh: { A: { status: "fresh", lastSuccess: "2026-10-12" } } });
  app.run('state.asset = "A"; state.returnPeriod = state.tablePeriod = "monthly"; renderAsset("A")');
  assert.equal(app.points().length, 0);
  assert.match(app.run('document.querySelector("#assetChartStatus").textContent'), /No completed returns/);
  app.run('state.data.monthlyAssets = { A: [{year: 2025, m: [0, ...Array(11).fill(null)], annual: 0}] }; state.data.monthlyRefresh = { A: {status: "cached", lastSuccess: "2025-01-01", lastAttempt: "2026-10-12"} }; renderAsset("A")');
  assert.equal(app.points()[0].value, 0);
  assert.match(app.run('document.querySelector("#assetTableStatus").textContent'), /Cached data/);
  assert.equal(app.run('refreshInfo("A", Date.parse("2026-10-12"), "monthly").kind'), "cached");
  assert.equal(app.run('refreshInfo("A", Date.parse("2026-10-12")).kind'), "fresh");
});

test("Summary heatmaps select monthly and quarterly years and preserve missing cells", () => {
  const app = setup({ currentYear: 2026, assets: {
    A: [{ year: 2025, q: [1, 2, 3, 4], annual: 10 }], B: [{ year: 2025, q: [null, 0, null, 2], annual: 2 }],
  }, monthlyAssets: { A: [{ year: 2025, m: [0, -2, ...Array(10).fill(null)], annual: 10 }, { year: 2024, m: Array(12).fill(5), annual: 10 }] } });
  app.run('state.heatmapPeriod = "monthly"; state.heatmapYear = 2025; renderHeatmap()');
  let html = app.run('document.querySelector("#heatmap").innerHTML');
  assert.equal((html.match(/<th>/g) ?? []).length, 14);
  assert.equal((html.match(/class="empty"/g) ?? []).length, 24);
  assert.ok(html.includes("-2.00%"));
  assert.equal(app.run('document.querySelector("#heatmapYearControl").hidden'), false);
  app.run('state.heatmapYear = 2024; renderHeatmap()');
  assert.ok(app.run('document.querySelector("#heatmap").innerHTML').includes("+5.00%"));
  app.run('state.heatmapPeriod = "quarterly"; renderHeatmap()');
  html = app.run('document.querySelector("#heatmap").innerHTML');
  assert.equal((html.match(/<th>/g) ?? []).length, 6);
  assert.ok(html.includes("<th>Q4</th>"));
  app.run('state.heatmapPeriod = "annual"; renderHeatmap()');
  assert.equal(app.run('document.querySelector("#heatmapYearControl").hidden'), true);
});

test("monthly chart values match all refreshed source indices", () => {
  const app = setup();
  for (const [name, rows] of Object.entries(realData.monthlyAssets ?? {})) {
    app.context.name = name;
    app.run('state.returnPeriod = "monthly"; renderAsset(name)');
    const expected = rows.filter((row) => !row.avg && row.year >= 2000 && row.year <= realData.currentYear).flatMap((row) => row.m.flatMap((value, index) => value == null ? [] : [{ year: row.year, month: index + 1, value }]))
      .sort((left, right) => left.year - right.year || left.month - right.month);
    assert.deepEqual(Array.from(app.points(), (point) => ({ year: point.time.year, month: point.time.month, value: point.value })), expected);
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
  const app = setup({ currentYear: 2026, assets: {
    Nifty50: [{ year: 2025, q: [1, 2, 3, 4], annual: 10 }],
  } });
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

test("support deep links render the dashboard without rewriting the support hash", () => {
  const app = setup();
  app.context.location = { hash: "#support" };
  app.context.window = { scrollTo() {} };
  app.run("renderSidebar = () => {}; route()");
  assert.equal(app.context.location.hash, "#support");
  assert.equal(app.run("state.view"), "asset");
  assert.equal(app.run("state.asset"), realData.assets.Nifty50 ? "Nifty50" : Object.keys(realData.assets)[0]);
  assert.equal(app.run('document.querySelector("#assetView").hidden'), false);
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

test("public source hints omit refresh failure details and timestamps", () => {
  const app = setup();
  app.run('state.data.refresh = {Nifty50:{status:"cached",lastSuccess:null,lastAttempt:"2026-10-07"}}');
  const hint = app.run('refreshDot("Nifty50")');
  assert.ok(hint.includes("saved history"));
  assert.ok(!hint.includes("failed refresh"));
  assert.ok(!hint.includes("last attempt"));
  assert.ok(!hint.includes("2026-10-07"));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(!html.includes('id="assetFreshness"'));
  app.run('delete state.data.refresh');
});

test("concise README links process and preserves PolyForm and dependency notices", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const method = fs.readFileSync(path.join(root, "docs", "METHOD.md"), "utf8");
  const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
  assert.ok(readme.split("\n").length < 80);
  assert.match(readme, /\[docs\/METHOD\.md\]\(docs\/METHOD\.md\)/);
  assert.ok(!readme.includes("tutorial.gif"));
  assert.ok(!readme.includes("18-chapter"));
  for (const heading of ["## Comparison modes", "## Data and year rollover", "## Methodology", "## Local setup"]) assert.ok(method.includes(heading));
  assert.match(method, /\[ui-config\.js\]\(\.\.\/ui-config\.js\)/);
  assert.ok(license.startsWith("# PolyForm Noncommercial License 1.0.0\n"));
  assert.match(license, /Any noncommercial purpose is a permitted purpose/);
  assert.match(readme, /source-available, not OSI-approved open source/);
  assert.ok(!readme.includes("all rights reserved"));
  const notice = fs.readFileSync(path.join(root, "NOTICE"), "utf8");
  assert.match(notice, /^Required Notice: Copyright/m);
  assert.match(notice, /does\nnot replace or restrict rights granted by those third-party licenses/);
  for (const file of ["dev.sh", ".github/workflows/update-data.yml"]) assert.match(fs.readFileSync(path.join(root, file), "utf8"), /data.json LICENSE NOTICE /);
  assert.match(fs.readFileSync(path.join(root, "vendor", "financial.LICENSE"), "utf8"), /MIT License/);
  assert.match(fs.readFileSync(path.join(root, "vendor", "simple-statistics.LICENSE"), "utf8"), /ISC License/);
});

test("dashboard footer links to a deployed standalone methodology page", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const page = fs.readFileSync(path.join(root, "methodology.html"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.ok(html.indexOf('<footer class="data-meta">') > html.indexOf('id="summaryView"'));
  assert.match(html, /<footer class="data-meta">\s*<span id="freshness"><\/span>\s*<a href="methodology.html">Data &amp; methodology<\/a>\s*<\/footer>\s*<\/main>/);
  assert.ok(!html.includes('<details class="methodology">'));
  assert.equal((page.match(/<dt>/g) || []).length, (page.match(/<dd>/g) || []).length);
  for (const heading of ["Return basis", "Data quality", "Benchmark screener", "Correlations", "Portfolio simulation", "Portfolio risk"]) {
    assert.ok(page.includes(`<dt>${heading}</dt>`));
  }
  assert.match(page, /href="index.html">Back to dashboard/);
  for (const file of ["dev.sh", ".github/workflows/update-data.yml"]) {
    assert.match(fs.readFileSync(path.join(root, file), "utf8"), /cp index.html methodology.html /);
  }
  assert.match(readme, /<a href="https:\/\/indianindices.github.io\/">\s*<img src="docs\/brand.png"/);
  assert.match(readme, /## Support IndianIndices[\s\S]*hosting, data, development and future improvements\.\s*$/);
});