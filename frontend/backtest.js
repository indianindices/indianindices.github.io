const backtestState = { weights: { Nifty50: 100 }, result: null, chart: null };
const BACKTEST_COLORS = ["#6ee7b7", "#67e8f9", "#fcd34d", "#fda4af", "#a3e635", "#fb923c"];

function initBacktest() {
  const keys = [...SectorAnalytics.monthlyMap(state.data, "Nifty50").keys()].sort((left, right) => left - right);
  if (keys.length) {
    $("#backtestFrom").value = SectorAnalytics.monthLabel(Math.max(keys[0], keys.at(-1) - 59));
    $("#backtestTo").value = SectorAnalytics.monthLabel(keys.at(-1));
    for (const selector of ["#backtestFrom", "#backtestTo"]) {
      $(selector).min = SectorAnalytics.monthLabel(keys[0]);
      $(selector).max = SectorAnalytics.monthLabel(keys.at(-1));
    }
  }
  renderBacktestWeights();
}

function renderBacktestWeights() {
  $("#backtestWeights").innerHTML = state.names.map((name) => {
    const active = Object.hasOwn(backtestState.weights, name);
    const color = BACKTEST_COLORS[state.names.indexOf(name) % BACKTEST_COLORS.length];
    return `<div class="allocation-row" data-selected="${active}" style="--index-color:${color}"><label><input type="checkbox" data-backtest-index="${esc(name)}" ${active ? "checked" : ""}><span class="allocation-swatch" aria-hidden="true"></span>${esc(name)}</label><label class="weight-field"><input type="number" data-backtest-weight="${esc(name)}" aria-label="${esc(name)} allocation percent" min="0" max="100" step="any" value="${active ? backtestState.weights[name] : 0}" ${active ? "" : "disabled"}><span>%</span></label></div>`;
  }).join("");
}

function backtestInputs() {
  return { from: SectorAnalytics.monthKey($("#backtestFrom").value), to: SectorAnalytics.monthKey($("#backtestTo").value), mode: $("#backtestMode").value, amount: calculatorNumber("#backtestAmount"), stepUp: calculatorNumber("#backtestStepUp"), timing: $("#backtestTiming").value, costBps: calculatorNumber("#backtestCosts") };
}

function backtestAllocations() {
  return Object.entries(backtestState.weights).map(([name, weight]) => ({ name, weight }));
}

function applyBacktestParams(params) {
  if (!params.size) return null;
  const invalid = "Invalid backtest link; current inputs were kept.";
  const fields = ["v", "from", "to", "mode", "amount", "stepUp", "timing", "costBps"];
  if (params.toString().length > 4096 || params.get("v") !== "1" || params.getAll("weights").length !== 1 || fields.some((field) => params.getAll(field).length !== 1)) return invalid;
  const options = Object.fromEntries(fields.slice(1).map((field) => [field, params.get(field)]));
  if (["amount", "stepUp", "costBps"].some((field) => !/^(?:\d+(?:\.\d+)?)(?:e[+-]?\d+)?$/i.test(options[field]))) return invalid;
  options.from = SectorAnalytics.monthKey(options.from);
  options.to = SectorAnalytics.monthKey(options.to);
  for (const field of ["amount", "stepUp", "costBps"]) options[field] = Number(options[field]);
  let allocations;
  try { allocations = JSON.parse(params.get("weights")); } catch { return invalid; }
  if (!Array.isArray(allocations) || allocations.length > state.names.length || allocations.some((row) => !row || typeof row.name !== "string" || typeof row.weight !== "number") || SectorAnalytics.backtest(state.data, allocations, options).error) return invalid;
  backtestState.weights = Object.fromEntries(allocations.map((row) => [row.name, row.weight]));
  const selectors = { from: "From", to: "To", mode: "Mode", amount: "Amount", stepUp: "StepUp", timing: "Timing", costBps: "Costs" };
  for (const [field, suffix] of Object.entries(selectors)) $("#backtest" + suffix).value = ["from", "to"].includes(field) ? SectorAnalytics.monthLabel(options[field]) : options[field];
  renderBacktestWeights();
  return null;
}

function backtestHash(result = backtestState.result) {
  if (!result || result.error) return null;
  const settings = result.settings;
  const params = new URLSearchParams({ v: "1", ...settings, from: SectorAnalytics.monthLabel(settings.from), to: SectorAnalytics.monthLabel(settings.to), weights: JSON.stringify(result.allocations) });
  return `backtest?${params}`;
}

function ensureBacktestChart() {
  if (backtestState.chart) return backtestState.chart;
  const chart = LC.createChart($("#backtestChart"), baseOptions({ localization: { priceFormatter: money } }));
  const line = (color, dashed = false) => chart.addLineSeries({ color, lineWidth: 2, lineStyle: dashed ? LC.LineStyle.Dashed : LC.LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "custom", formatter: money } });
  const portfolio = line("#6ee7b7"), benchmark = line("#67e8f9"), invested = line("#fcd34d", true);
  chart.subscribeCrosshairMove((event) => {
    const tip = $("#backtestTip");
    if (!event.time || !event.point) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.innerHTML = `${yearOf(event.time)}-${String(monthOf(event.time)).padStart(2, "0")}` + [["Portfolio", portfolio], ["Nifty50", benchmark], ["Invested", invested]].map(([label, series]) => `<b>${label} ${money(event.seriesData.get(series)?.value)}</b>`).join("");
    tip.style.left = `${Math.max(0, Math.min(event.point.x + 12, $("#backtestChart").clientWidth - 200))}px`;
    tip.style.top = `${Math.max(56, event.point.y - 75)}px`;
  });
  backtestState.chart = { chart, portfolio, benchmark, invested };
  state.charts.backtest = backtestState.chart;
  return backtestState.chart;
}

function renderBacktest(params = new URLSearchParams()) {
  const linkError = applyBacktestParams(params);
  const options = backtestInputs();
  const lump = options.mode === "lumpsum";
  $("#backtestView").dataset.mode = options.mode;
  $("#backtestAmountLabel").textContent = lump ? "Initial investment (INR)" : "Monthly investment (INR)";
  $("#backtestStepUp").disabled = $("#backtestTiming").disabled = lump;
  if (lump) { options.stepUp = 0; options.timing = "begin"; }
  const allocations = backtestAllocations();
  const total = allocations.reduce((sum, row) => sum + row.weight, 0);
  const validTotal = Number.isFinite(total) && Math.abs(total - 100) < 1e-6;
  $("#backtestWeightTotal").textContent = `${Number.isFinite(total) ? total.toFixed(2) : "Invalid"}% / 100%`;
  $("#backtestWeightTotal").dataset.valid = String(validTotal);
  const selectedCount = allocations.filter((row) => row.weight > 0).length;
  $("#backtestSelectedCount").textContent = `${selectedCount} ${selectedCount === 1 ? "index" : "indices"}`;
  const allocationMarkup = allocations.filter((row) => Number.isFinite(row.weight) && row.weight > 0).map((row) => `<span class="allocation-segment" tabindex="0" role="img" style="flex-basis:${Math.min(100, row.weight)}%;background:${BACKTEST_COLORS[state.names.indexOf(row.name) % BACKTEST_COLORS.length]}" data-allocation-label="${esc(row.name)}: ${row.weight.toFixed(2)}%" aria-label="${esc(row.name)}: ${row.weight.toFixed(2)}%"></span>`).join("");
  if (backtestState.allocationMarkup !== allocationMarkup) {
    $("#backtestAllocationBar").innerHTML = allocationMarkup;
    backtestState.allocationMarkup = allocationMarkup;
  }
  $("#backtestAllocationBar").setAttribute("aria-label", `Allocation ${Number.isFinite(total) ? total.toFixed(2) : "invalid"}% of 100%`);
  $("#backtestAllocationTip").hidden = true;
  document.querySelectorAll("#backtestRanges button").forEach((button) => {
    const keys = [...SectorAnalytics.monthlyMap(state.data, "Nifty50").keys()];
    const last = keys.length ? Math.max(...keys) : null;
    const first = keys.length ? Math.min(...keys) : null;
    const start = button.dataset.months === "all" ? first : Math.max(first, last - Number(button.dataset.months) + 1);
    button.setAttribute("aria-pressed", String(options.from === start && options.to === last));
  });
  const result = SectorAnalytics.backtest(state.data, allocations, options);
  backtestState.result = result;
  $("#backtestStatus").dataset.error = String(!!result.error);
  $("#backtestShareStatus").textContent = linkError || "";
  $("#backtestShareFallback").hidden = true;
  $("#backtestCsv").disabled = $("#backtestCopy").disabled = $("#backtestPng").disabled = !!result.error;
  $("#backtestStatus").textContent = result.error || `${SectorAnalytics.monthLabel(options.from)} to ${SectorAnalytics.monthLabel(options.to)} · ${result.rows.length} completed months · ${researchBasis()} · ${options.costBps} bps purchase costs`;
  $("#backtestTip").hidden = true;
  if (result.error) {
    $("#backtestMetrics").innerHTML = $("#backtestTable").innerHTML = "";
    if (backtestState.chart) for (const name of ["portfolio", "benchmark", "invested"]) backtestState.chart[name].setData([]);
    return;
  }
  const metrics = [["Final value", money(result.finalValue)], ["Total invested", money(result.invested)], ["Gain / loss", money(result.gain)], [lump ? "CAGR" : "XIRR (annualized)", fmt(lump ? result.cagr : result.xirr)], ["Month-end performance max DD", fmt(result.maxDrawdown)], ["Purchase costs", money(result.costs)], ["Nifty50 final value", money(result.rows.at(-1).benchmark)], ["Nifty50 XIRR (annualized)", fmt(result.benchmarkXirr)]];
  $("#backtestMetrics").innerHTML = metrics.map(([label, value], index) => `<div class="chip backtest-metric" data-metric="${index}"${index === 2 ? ` data-sign="${result.gain < 0 ? "negative" : "positive"}"` : ""}><small>${label}</small><strong>${value}</strong></div>`).join("");
  const entry = ensureBacktestChart();
  for (const [name, field] of [["portfolio", "value"], ["benchmark", "benchmark"], ["invested", "invested"]]) entry[name].setData(result.rows.map((row) => ({ time: SectorAnalytics.monthTime(row.key), value: row[field] })));
  requestAnimationFrame(() => fit(entry.chart));
  $("#backtestTable").innerHTML = researchTable(["Month", "Contribution", "Purchase cost", "Invested", "Portfolio", "Nifty50"], result.rows.map((row) => `<tr><td>${SectorAnalytics.monthLabel(row.key)}</td>${[row.contribution, row.fee, row.invested, row.value, row.benchmark].map((value) => `<td>${money(value)}</td>`).join("")}</tr>`));
}

function backtestRecords() {
  const result = backtestState.result;
  if (!result || result.error) return [];
  const settings = JSON.stringify({ ...result.settings, allocations: result.allocations, returnBasis: state.data.methodology?.returnType ?? "unverified", source: state.data.methodology?.source ?? "Trendlyne", generated: state.data.generated });
  return [["Month", "Opening (INR)", "Contribution (INR)", "Purchase cost (INR)", "Invested (INR)", "Portfolio (INR)", "Nifty50 (INR)", "Captured settings", "Basis"], ...result.rows.map((row) => [SectorAnalytics.monthLabel(row.key), row.opening, row.contribution, row.fee, row.invested, row.value, row.benchmark, settings, "Monthly approximation; rounded returns; no taxes or final liquidation"] )];
}

function bindBacktest() {
  $("#backtestBtn").addEventListener("click", () => (location.hash = "backtest"));
  $("#backtestForm").addEventListener("submit", (event) => { event.preventDefault(); renderBacktest(); });
  $("#backtestForm").addEventListener("change", () => renderBacktest());
  const showAllocationTip = (event) => {
    const segment = event.target.closest(".allocation-segment");
    if (!segment) return;
    const tip = $("#backtestAllocationTip");
    const bounds = segment.getBoundingClientRect();
    const parent = $("#backtestAllocationVisual").getBoundingClientRect();
    tip.textContent = segment.dataset.allocationLabel;
    tip.hidden = false;
    tip.style.left = `${Math.max(0, Math.min(bounds.left - parent.left + bounds.width / 2 - tip.offsetWidth / 2, parent.width - tip.offsetWidth))}px`;
    segment.setAttribute("aria-describedby", "backtestAllocationTip");
  };
  const hideAllocationTip = (event) => {
    if (event.target.matches(".allocation-segment")) event.target.removeAttribute("aria-describedby");
    $("#backtestAllocationTip").hidden = true;
  };
  $("#backtestAllocationBar").addEventListener("pointerover", showAllocationTip);
  $("#backtestAllocationBar").addEventListener("focusin", showAllocationTip);
  $("#backtestAllocationBar").addEventListener("pointerout", hideAllocationTip);
  $("#backtestAllocationBar").addEventListener("focusout", hideAllocationTip);
  $("#backtestAllocationBar").addEventListener("keydown", (event) => {
    if (event.key === "Escape") $("#backtestAllocationTip").hidden = true;
  });
  $("#backtestRanges").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-months]");
    if (!button) return;
    const keys = [...SectorAnalytics.monthlyMap(state.data, "Nifty50").keys()];
    if (!keys.length) return;
    const last = Math.max(...keys), first = Math.min(...keys);
    $("#backtestTo").value = SectorAnalytics.monthLabel(last);
    $("#backtestFrom").value = SectorAnalytics.monthLabel(button.dataset.months === "all" ? first : Math.max(first, last - Number(button.dataset.months) + 1));
    renderBacktest();
  });
  $("#backtestResetWeights").addEventListener("click", () => {
    backtestState.weights = { Nifty50: 100 };
    renderBacktestWeights();
    renderBacktest();
  });
  $("#backtestWeights").addEventListener("change", (event) => {
    const input = event.target;
    if (input.dataset.backtestIndex) {
      if (input.checked) backtestState.weights[input.dataset.backtestIndex] = 0;
      else delete backtestState.weights[input.dataset.backtestIndex];
      renderBacktestWeights();
    } else if (input.dataset.backtestWeight) backtestState.weights[input.dataset.backtestWeight] = input.value === "" ? NaN : Number(input.value);
    renderBacktest();
  });
  $("#backtestEqual").addEventListener("click", () => {
    const names = Object.keys(backtestState.weights);
    const weight = names.length ? Math.floor(10000 / names.length) / 100 : 0;
    names.forEach((name, index) => (backtestState.weights[name] = index === names.length - 1 ? 100 - weight * index : weight));
    renderBacktestWeights();
    renderBacktest();
  });
  $("#backtestCsv").addEventListener("click", () => saveBlob(new Blob(["\uFEFF", csvText(backtestRecords())], { type: "text/csv;charset=utf-8" }), "indian-sectors-backtest.csv"));
  $("#backtestCopy").addEventListener("click", async () => {
    const hash = backtestHash();
    if (!hash) return;
    const url = new URL(location.href);
    url.hash = hash;
    try { await navigator.clipboard.writeText(url.href); $("#backtestShareStatus").textContent = "Backtest link copied"; }
    catch { $("#backtestShareFallback").hidden = false; $("#backtestShareLink").value = url.href; $("#backtestShareLink").focus(); $("#backtestShareLink").select(); $("#backtestShareStatus").textContent = "Clipboard unavailable"; }
  });
  $("#backtestPng").addEventListener("click", async () => {
    const result = backtestState.result;
    if (!result || result.error) return;
    $("#backtestPng").disabled = true;
    try {
      const settings = result.settings;
      const info = { title: "Monthly historical backtest", subtitle: `${SectorAnalytics.monthLabel(settings.from)} to ${SectorAnalytics.monthLabel(settings.to)} · ${settings.mode} · ${money(settings.amount)} · ${settings.timing}-month · step-up ${settings.stepUp}% · costs ${settings.costBps} bps · ${result.allocations.map((row) => `${row.name} ${row.weight}%`).join(", ")} · ${researchBasis()}`, lines: [{ name: "Portfolio", color: "#6ee7b7" }, { name: "Nifty50", color: "#67e8f9" }, { name: "Invested", color: "#fcd34d" }], footer: "Monthly approximation from rounded returns. No taxes or final liquidation. Past performance is not a forecast.", filename: "indian-sectors-backtest.png" };
      saveBlob(await createChartPng("backtest", info), info.filename);
      $("#backtestShareStatus").textContent = "PNG export ready";
    } catch { $("#backtestShareStatus").textContent = "PNG export failed"; }
    finally { $("#backtestPng").disabled = !!backtestState.result?.error; }
  });
}