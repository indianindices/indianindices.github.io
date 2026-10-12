const researchState = { tab: "quality", weights: {}, audits: [], screen: [], screenOptions: {}, simulation: null, correlation: null };

function researchNumber(selector, fallback) {
  const value = $(selector).value;
  return value == null ? fallback : value === "" ? NaN : Number(value);
}

function researchRange() {
  const fromValue = $("#researchFrom").value, toValue = $("#researchTo").value;
  const from = SectorAnalytics.monthKey(fromValue), to = SectorAnalytics.monthKey(toValue);
  return { from, to, invalid: fromValue != null && from == null || toValue != null && to == null };
}

function researchBasis() {
  const type = state.data.methodology?.returnType;
  return type === "price" ? "Price returns" : type === "total" ? "Total returns" : "Return basis unverified";
}

function researchSpan(history) {
  return history ? `${SectorAnalytics.monthLabel(history.start)} to ${SectorAnalytics.monthLabel(history.end)} · ${history.keys.length} consecutive months` : "No shared completed monthly history";
}

function researchTable(headers, rows) {
  return `<thead><tr>${headers.map((header) => `<th scope="col">${header}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody>`;
}

function initResearch() {
  const maps = state.names.map((name) => SectorAnalytics.monthlyMap(state.data, name));
  const keys = maps.flatMap((map) => [...map.keys()]);
  const first = keys.length ? Math.min(...keys) : state.firstYear * 12;
  const last = keys.length ? Math.max(...keys) : state.lastYear * 12 + 11;
  $("#researchFrom").value = SectorAnalytics.monthLabel(Math.max(first, last - 59));
  $("#researchTo").value = SectorAnalytics.monthLabel(last);
  ["#researchFrom", "#researchTo"].forEach((selector) => {
    $(selector).min = SectorAnalytics.monthLabel(first);
    $(selector).max = SectorAnalytics.monthLabel(last);
  });
  const defaults = ["Nifty50", "IT", "BankNifty"].filter((name) => state.names.includes(name));
  const selected = defaults.length ? defaults : state.names.slice(0, 3);
  selected.forEach((name, index) => (researchState.weights[name] = index === selected.length - 1 ? 100 - (selected.length - 1) * Math.floor(100 / selected.length) : Math.floor(100 / selected.length)));
  $("#allocationChoices").innerHTML = state.names.map((name) => {
    const active = Object.hasOwn(researchState.weights, name);
    return `<div class="allocation-row"><label><input type="checkbox" data-index="${esc(name)}" ${active ? "checked" : ""}><span>${esc(name)}</span>${refreshDot(name, "monthly")}</label><label class="weight-field"><input type="number" data-weight="${esc(name)}" aria-label="${esc(name)} weight percent" min="0" max="100" step="0.01" value="${researchState.weights[name] ?? 0}" ${active ? "" : "disabled"}><span>%</span></label></div>`;
  }).join("");
}

function renderResearch(tab = researchState.tab) {
  const tabs = enabledUiSubsections("research");
  researchState.tab = tabs.includes(tab) ? tab : tabs[0];
  document.querySelectorAll("#researchTabs [role='tab']").forEach((button) => {
    const selected = button.dataset.research === researchState.tab;
    button.hidden = !tabs.includes(button.dataset.research);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  ["quality", "screener", "portfolio"].forEach((name) => ($(`#research-${name}-panel`).hidden = name !== researchState.tab));
  if (!researchState.tab) return;
  $("#researchRangeControls").hidden = researchState.tab === "quality";
  $("#researchBasis").textContent = `${researchBasis()} · rounded source returns · no separately added dividends`;
  if (researchState.tab === "quality") renderDataQuality();
  else if (researchState.tab === "screener") renderScreener();
  else renderPortfolio();
}

function renderDataQuality() {
  const tolerance = state.data.methodology?.reconciliationTolerancePp ?? 0.1;
  researchState.audits = state.names.map((name) => SectorAnalytics.audit(state.data, name, tolerance));
  const checked = researchState.audits.reduce((total, row) => total + row.checked, 0);
  const mismatches = researchState.audits.reduce((total, row) => total + row.mismatches, 0);
  $("#qualityStatus").textContent = `${state.names.length} indices · ${checked} comparable quarters · ${mismatches} exceptions · tolerance ${tolerance.toFixed(2)} pp`;
  const month = (key) => key == null ? "—" : SectorAnalytics.monthLabel(key);
  const rows = researchState.audits.map((row) => {
    const quarterly = refreshInfo(row.name), monthly = refreshInfo(row.name, Date.now(), "monthly");
    const status = row.invalid || row.duplicates || row.mismatches ? "Review" : !row.checked ? "Not comparable" : "Within tolerance";
    return `<tr><td class="label"><a href="#asset/${encodeURIComponent(row.name)}">${esc(row.name)}</a></td><td>${month(row.first)}</td><td>${month(row.last)}</td><td>${row.observations}</td><td>${row.missing}</td><td title="Invalid returns: ${row.invalid}; duplicate monthly observations: ${row.duplicates}">${row.invalid + row.duplicates}</td><td title="${esc(quarterly.detail)}">${esc(quarterly.label)}</td><td title="${esc(monthly.detail)}">${esc(monthly.label)}</td><td>${row.checked}</td><td>${row.mismatches}</td><td class="${status === "Review" ? "neg" : ""}">${status}</td></tr>`;
  });
  $("#qualityTable").innerHTML = researchTable(["Index", "First month", "Last month", "Months", "Missing months", "Invalid / duplicate", "Quarterly refresh", "Monthly refresh", "Checked quarters", "Exceptions", "Status"], rows);
  const issues = researchState.audits.flatMap((row) => row.issues.map((issue) => `<tr><td class="label">${esc(row.name)}</td><td>${issue.year} Q${issue.quarter}</td><td>${fmt(issue.monthly)}</td><td>${fmt(issue.quarterly)}</td><td>${fmtPp(issue.difference)}</td></tr>`));
  $("#reconciliationTable").innerHTML = researchTable(["Index", "Quarter", "Compounded months", "Source quarter", "Difference"], issues);
  $("#reconciliationDetails").hidden = !issues.length;
  $("#reconciliationCount").textContent = `Reconciliation exceptions (${issues.length})`;
}

function renderScreener() {
  const range = researchRange();
  const window = researchNumber("#screenWindow", 12);
  const minimum = researchNumber("#screenMinWindows", 12);
  const hitRate = researchNumber("#screenMinHit", 0);
  researchState.screenOptions = { ...range, window };
  if (range.invalid || ![12, 36, 60].includes(window) || !Number.isInteger(minimum) || minimum < 1 || minimum > 500 || !Number.isFinite(hitRate) || hitRate < 0 || hitRate > 100 || range.from != null && range.to != null && range.from > range.to) {
    $("#screenerStatus").textContent = "Enter valid dates, 1–500 matched windows, and a win rate from 0 to 100%.";
    researchState.screen = [];
  } else {
    const rows = SectorAnalytics.screen(state.data, { ...range, window });
    const key = $("#screenSort").value || "hitRate";
    researchState.screen = rows.filter((row) => row.windows >= minimum && row.hitRate >= hitRate && (!$("#screenPositive").checked || row.latestExcess > 0)).sort((left, right) => {
      const leftMissing = !Number.isFinite(left[key]), rightMissing = !Number.isFinite(right[key]);
      if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
      return (!leftMissing ? right[key] - left[key] : 0) || left.name.localeCompare(right.name);
    });
    $("#screenerStatus").textContent = `${researchState.screen.length} eligible indices · Nifty50 benchmark · ${window}-month rolling returns · at least ${minimum} matched windows`;
  }
  const rows = researchState.screen.map((row) => `<tr><td class="label"><a href="#asset/${encodeURIComponent(row.name)}">${esc(row.name)}</a>${refreshDot(row.name, "monthly")}</td><td>${row.hitRate.toFixed(1)}%</td><td>${row.windows}</td><td class="${cls(row.latestExcess)}">${fmtPp(row.latestExcess)}</td><td class="${cls(row.meanExcess)}">${fmtPp(row.meanExcess)}</td><td>${row.last == null ? "—" : SectorAnalytics.monthLabel(row.last)}</td><td class="neg" title="${row.riskStart == null ? "No shared history" : `${SectorAnalytics.monthLabel(row.riskStart)} to ${SectorAnalytics.monthLabel(row.riskEnd)}`}">${fmt(row.maxDrawdown)}</td><td>${row.riskMonths}</td></tr>`);
  $("#screenerTable").innerHTML = researchTable(["Index", "Beat Nifty50", "Matched windows", "Latest excess (pp)", "Average excess (pp)", "Last matched end", "Month-end max DD", "Risk months"], rows);
  $("#screenerCsv").disabled = !rows.length;
}

function ensurePortfolioChart() {
  if (state.charts.portfolio) return state.charts.portfolio;
  const chart = LC.createChart($("#portfolioChart"), baseOptions({ localization: { priceFormatter: money } }));
  const portfolio = chart.addLineSeries({ color: "#7c5cff", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "custom", formatter: money } });
  const benchmark = chart.addLineSeries({ color: "#9aa4b2", lineWidth: 2, lineStyle: LC.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "custom", formatter: money } });
  const tip = $("#portfolioTip");
  chart.subscribeCrosshairMove((event) => {
    if (!event.time || !event.point) { tip.hidden = true; return; }
    const value = event.seriesData.get(portfolio)?.value;
    const reference = event.seriesData.get(benchmark)?.value;
    if (value == null) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.innerHTML = `${yearOf(event.time)}-${String(monthOf(event.time)).padStart(2, "0")}<b>Portfolio ${money(value)}</b>${reference == null ? "" : `<b>Nifty50 ${money(reference)}</b>`}`;
    tip.style.left = `${Math.max(0, Math.min(event.point.x + 12, $("#portfolioChart").clientWidth - 190))}px`;
    tip.style.top = `${Math.max(event.point.y - 70, 56)}px`;
  });
  $("#portfolioChart").addEventListener("dblclick", () => fit(chart));
  state.charts.portfolio = { chart, portfolio, benchmark };
  return state.charts.portfolio;
}

function renderPortfolio() {
  const allocations = Object.entries(researchState.weights).map(([name, weight]) => ({ name, weight }));
  const total = allocations.reduce((sum, row) => sum + row.weight, 0);
  $("#weightTotal").textContent = `Total weight: ${Number.isFinite(total) ? total.toFixed(2) : "invalid"}%`;
  const range = researchRange();
  const options = { ...range, amount: researchNumber("#portfolioAmount", 10000), costBps: researchNumber("#portfolioCosts", 10), rebalance: $("#portfolioRebalance").value || "quarterly" };
  const result = range.invalid ? { error: "Choose valid start and end months." } : SectorAnalytics.simulate(state.data, allocations, options);
  researchState.simulation = result;
  $("#portfolioTip").hidden = true;
  $("#portfolioStatus").textContent = result.error || `${researchSpan(result.history)}${result.history.excluded ? ` · ${result.history.excluded} earlier months excluded before the last gap` : ""}${result.benchmark.length ? "" : " · benchmark unavailable for this span"}`;
  $("#portfolioPng").disabled = $("#portfolioCsv").disabled = !!result.error;
  if (result.error) {
    $("#portfolioMetrics").innerHTML = "";
    $("#portfolioBenchmark").textContent = "";
    state.charts.portfolio?.portfolio.setData([]);
    state.charts.portfolio?.benchmark.setData([]);
  } else {
    const { chart, portfolio, benchmark } = ensurePortfolioChart();
    const points = (rows) => rows.map((point) => ({ time: SectorAnalytics.monthTime(point.key), value: point.value }));
    portfolio.setData(points(result.points));
    benchmark.setData(points(result.benchmark));
    requestAnimationFrame(() => fit(chart));
    const metrics = [["Final value", money(result.statistics.finalValue)], ["CAGR", fmt(result.statistics.cagr)], ["Annualized volatility", fmt(result.statistics.volatility)], ["Month-end max drawdown", fmt(result.statistics.maxDrawdown)], ["Trading costs", money(result.totalCost)]];
    $("#portfolioMetrics").innerHTML = metrics.map(([label, value]) => `<div class="chip"><small>${label}</small><strong>${value}</strong></div>`).join("");
    $("#portfolioBenchmark").textContent = result.benchmarkStatistics ? `Nifty50 buy-and-hold · final value ${money(result.benchmarkStatistics.finalValue)} · CAGR ${fmt(result.benchmarkStatistics.cagr)} · max drawdown ${fmt(result.benchmarkStatistics.maxDrawdown)}` : "Nifty50 unavailable for the shared history";
  }
  const names = range.invalid ? [] : allocations.filter((row) => Number.isFinite(row.weight) && row.weight > 0).map((row) => row.name);
  const correlation = SectorAnalytics.correlations(state.data, names, range.from, range.to);
  researchState.correlation = correlation;
  $("#correlationStatus").textContent = `${researchSpan(correlation.history)} · minimum ${correlation.minimum} months${correlation.count < correlation.minimum ? " · insufficient observations" : ""}`;
  const rows = names.map((name, index) => `<tr><td class="label">${esc(name)}</td>${correlation.matrix[index].map((value) => {
    if (value == null) return '<td class="empty">—</td>';
    const strength = 0.08 + Math.abs(value) * 0.5;
    const color = value < 0 ? `rgba(103,232,249,${strength})` : `rgba(124,92,255,${strength})`;
    return `<td title="${correlation.count} shared monthly observations" style="background:${color};color:${value < -0.5 ? "#111" : "#fff"}">${value.toFixed(2)}</td>`;
  }).join("")}</tr>`);
  $("#correlationTable").innerHTML = researchTable(["Index", ...names.map(esc)], rows);
  $("#correlationCsv").disabled = !names.length || correlation.count < correlation.minimum;
}

function researchRecords(kind) {
  if (kind === "quality") return [["Index", "Return basis", "First month", "Last month", "Monthly observations", "Missing months", "Invalid values", "Duplicate observations", "Checked quarters", "Reconciliation exceptions", "Max discrepancy (pp)"], ...researchState.audits.map((row) => [row.name, researchBasis(), row.first == null ? null : SectorAnalytics.monthLabel(row.first), row.last == null ? null : SectorAnalytics.monthLabel(row.last), row.observations, row.missing, row.invalid, row.duplicates, row.checked, row.mismatches, row.maxDifference])];
  if (kind === "screener") return [["Index", "Beat Nifty50 (%)", "Matched windows", "Latest excess (pp)", "Average excess (pp)", "Last matched end", "Month-end max drawdown (%)", "Risk months", "Risk from", "Risk to", "Rolling window (months)", "Return basis"], ...researchState.screen.map((row) => [row.name, row.hitRate, row.windows, row.latestExcess, row.meanExcess, row.last == null ? null : SectorAnalytics.monthLabel(row.last), row.maxDrawdown, row.riskMonths, row.riskStart == null ? null : SectorAnalytics.monthLabel(row.riskStart), row.riskEnd == null ? null : SectorAnalytics.monthLabel(row.riskEnd), researchState.screenOptions.window, researchBasis()])];
  if (kind === "correlation") {
    const result = researchState.correlation;
    return [["Index", "Shared months", "From", "To", "Return basis", ...(result?.names ?? [])], ...(result?.names ?? []).map((name, index) => [name, result.count, result.history ? SectorAnalytics.monthLabel(result.history.start) : null, result.history ? SectorAnalytics.monthLabel(result.history.end) : null, researchBasis(), ...result.matrix[index]])];
  }
  const result = researchState.simulation;
  const benchmark = new Map((result?.benchmark ?? []).map((point) => [point.key, point.value]));
  return [["Month", "Portfolio value (INR)", "Nifty50 value (INR)", "Initial investment (INR)", "Rebalance", "Trading cost (bps)", "Target weights (%)", "Return basis"], ...(result?.points ?? []).map((point) => [SectorAnalytics.monthLabel(point.key), point.value, benchmark.get(point.key) ?? null, result.settings.amount, result.settings.rebalance, result.settings.costBps, result.allocations.map((row) => `${row.name}: ${row.weight}`).join("; "), researchBasis()])];
}

function bindResearch() {
  $("#researchBtn").addEventListener("click", () => (location.hash = `research/${researchState.tab}`));
  $("#researchTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-research]");
    if (button && enabledUiSubsections("research").includes(button.dataset.research)) location.hash = `research/${button.dataset.research}`;
  });
  $("#researchTabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...document.querySelectorAll("#researchTabs [role='tab']")].filter((button) => !button.hidden);
    const current = buttons.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click();
    buttons[next].focus();
  });
  ["#researchFrom", "#researchTo"].forEach((selector) => $(selector).addEventListener("change", () => renderResearch()));
  $("#screenerFilters").addEventListener("submit", (event) => { event.preventDefault(); if (event.target.reportValidity()) renderScreener(); });
  $("#screenerFilters").addEventListener("change", renderScreener);
  $("#portfolioSettings").addEventListener("submit", (event) => { event.preventDefault(); if (event.target.reportValidity()) renderPortfolio(); });
  $("#portfolioSettings").addEventListener("change", renderPortfolio);
  $("#allocationChoices").addEventListener("change", (event) => {
    const input = event.target;
    if (input.dataset.index) {
      const name = input.dataset.index;
      if (input.checked) researchState.weights[name] = 0;
      else delete researchState.weights[name];
      const weight = [...document.querySelectorAll("#allocationChoices [data-weight]")].find((field) => field.dataset.weight === name);
      weight.disabled = !input.checked;
      weight.value = researchState.weights[name] ?? 0;
    } else if (input.dataset.weight) researchState.weights[input.dataset.weight] = input.value === "" ? NaN : Number(input.value);
    renderPortfolio();
  });
  $("#equalWeights").addEventListener("click", () => {
    const names = Object.keys(researchState.weights);
    const weight = names.length ? Math.floor(10000 / names.length) / 100 : 0;
    names.forEach((name, index) => (researchState.weights[name] = index === names.length - 1 ? 100 - weight * (names.length - 1) : weight));
    document.querySelectorAll("#allocationChoices [data-weight]").forEach((input) => (input.value = researchState.weights[input.dataset.weight] ?? 0));
    renderPortfolio();
  });
  document.querySelectorAll(".research-csv").forEach((button) => button.addEventListener("click", () => saveBlob(new Blob(["\uFEFF", csvText(researchRecords(button.dataset.export))], { type: "text/csv;charset=utf-8" }), `indian-sectors-${button.dataset.export}-${state.data.generated}.csv`)));
  $("#portfolioPng").addEventListener("click", async () => {
    const result = researchState.simulation;
    if (!result || result.error) return;
    $("#portfolioPng").disabled = true;
    $("#portfolioExportStatus").textContent = "Preparing PNG...";
    try {
      const chart = state.charts.portfolio;
      const weights = result.allocations.map((row) => `${row.name} ${row.weight.toFixed(2)}%`).join(", ");
      const info = { title: "Hypothetical portfolio vs Nifty50", subtitle: `${researchSpan(result.history)} · ${researchBasis()} · ${money(result.settings.amount)} · ${result.settings.rebalance} rebalance · ${result.settings.costBps} bps per traded value · ${weights}`, lines: [{ name: "Portfolio", color: chart.portfolio.options().color }, ...(result.benchmark.length ? [{ name: "Nifty50 buy-and-hold", color: chart.benchmark.options().color }] : [])], filename: `indian-sectors-portfolio-${state.data.generated}.png` };
      saveBlob(await createChartPng("portfolio", info), info.filename);
      $("#portfolioExportStatus").textContent = "PNG export ready";
    } catch { $("#portfolioExportStatus").textContent = "PNG export failed"; }
    finally { $("#portfolioPng").disabled = !!researchState.simulation?.error; }
  });
}