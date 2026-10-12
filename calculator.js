const calculatorState = {
  mode: "sip", result: null,
  settings: {
    sip: { amount: 10000, withdrawal: 0, annualReturn: 12, years: 10, stepUp: 0, timing: "begin", start: "" },
    lumpsum: { amount: 100000, withdrawal: 0, annualReturn: 12, years: 10, stepUp: 0, timing: "end", start: "" },
    swp: { amount: 1000000, withdrawal: 10000, annualReturn: 8, years: 15, stepUp: 0, timing: "end", start: "" },
  },
};
const CALCULATOR_NAMES = { sip: "SIP", lumpsum: "LumpSum", swp: "SWP" };
const CALCULATOR_COLORS = { sip: "#6ee7b7", lumpsum: "#67e8f9", swp: "#fda4af" };

function initCalculator() {
  const start = state.data.generated?.slice(0, 7) || new Date().toISOString().slice(0, 7);
  Object.values(calculatorState.settings).forEach((settings) => (settings.start = start));
}

function calculatorNumber(selector) {
  const value = $(selector).value;
  return value === "" || value == null ? NaN : Number(value);
}

function calculatorInputSettings() {
  return { mode: calculatorState.mode, amount: calculatorNumber("#calculatorAmount"), withdrawal: calculatorNumber("#calculatorWithdrawal"), annualReturn: calculatorNumber("#calculatorRate"), years: calculatorNumber("#calculatorYears"), stepUp: calculatorNumber("#calculatorStepUp"), timing: $("#calculatorTiming").value, start: $("#calculatorStart").value };
}

function renderCalculator(mode = calculatorState.mode) {
  const modes = enabledUiSubsections("calculator");
  calculatorState.mode = modes.includes(mode) ? mode : modes[0];
  document.querySelectorAll("#calculatorTabs [role='tab']").forEach((button) => {
    const selected = button.dataset.calculator === calculatorState.mode;
    button.hidden = !modes.includes(button.dataset.calculator);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  if (!calculatorState.mode) return;
  const settings = calculatorState.settings[calculatorState.mode];
  $("#calculatorView").dataset.mode = calculatorState.mode;
  $("#calculatorPanel").setAttribute("aria-labelledby", `calculator-${calculatorState.mode}-tab`);
  $("#calculatorAmountLabel").textContent = calculatorState.mode === "sip" ? "Monthly investment (INR)" : "Initial investment (INR)";
  $("#calculatorStepLabel").textContent = calculatorState.mode === "swp" ? "Annual withdrawal increase (%)" : "Annual SIP increase (%)";
  ["amount", "withdrawal", "annualReturn", "years", "stepUp", "timing", "start"].forEach((key) => {
    const selectors = { amount: "#calculatorAmount", withdrawal: "#calculatorWithdrawal", annualReturn: "#calculatorRate", years: "#calculatorYears", stepUp: "#calculatorStepUp", timing: "#calculatorTiming", start: "#calculatorStart" };
    $(selectors[key]).value = settings[key];
  });
  [["#calculatorWithdrawalField", "#calculatorWithdrawal", calculatorState.mode !== "swp"], ["#calculatorStepField", "#calculatorStepUp", calculatorState.mode === "lumpsum"], ["#calculatorTimingField", "#calculatorTiming", calculatorState.mode !== "sip"]].forEach(([group, input, hidden]) => {
    $(group).hidden = hidden;
    $(input).disabled = hidden;
  });
  updateCalculator();
}

function ensureCalculatorChart() {
  if (state.charts.calculator) return state.charts.calculator;
  const chart = LC.createChart($("#calculatorChart"), baseOptions({ localization: { priceFormatter: money }, timeScale: { borderColor: "rgba(255,255,255,0.1)", tickMarkFormatter: (time, type) => type === LC.TickMarkType.Year ? String(yearOf(time)) : `${MONTHS[monthOf(time) - 1]} '${String(yearOf(time)).slice(-2)}` } }));
  const balance = chart.addAreaSeries({ lineColor: CALCULATOR_COLORS.sip, topColor: "rgba(110,231,183,0.18)", bottomColor: "rgba(110,231,183,0)", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "custom", formatter: money } });
  const cash = chart.addLineSeries({ color: "#93c5fd", lineWidth: 2, lineStyle: LC.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "custom", formatter: money } });
  chart.subscribeCrosshairMove((event) => {
    const tip = $("#calculatorTip");
    const value = event.seriesData.get(balance)?.value;
    if (!event.time || !event.point || value == null) { tip.hidden = true; return; }
    const flow = event.seriesData.get(cash)?.value;
    tip.hidden = false;
    tip.innerHTML = `${MONTHS[monthOf(event.time) - 1]} ${yearOf(event.time)}<b>${calculatorState.mode === "swp" ? "Corpus" : "Value"} ${money(value)}</b>${flow == null ? "" : `<b>${calculatorState.mode === "swp" ? "Withdrawn" : "Invested"} ${money(flow)}</b>`}`;
    tip.style.left = `${Math.max(0, Math.min(event.point.x + 12, $("#calculatorChart").clientWidth - 200))}px`;
    tip.style.top = `${Math.max(event.point.y - 70, 56)}px`;
  });
  $("#calculatorChart").addEventListener("dblclick", () => fit(chart));
  state.charts.calculator = { chart, balance, cash };
  return state.charts.calculator;
}

function updateCalculator() {
  const settings = calculatorInputSettings();
  calculatorState.settings[calculatorState.mode] = settings;
  $("#calculatorRateRange").value = Number.isFinite(settings.annualReturn) ? settings.annualReturn : 0;
  $("#calculatorYearsRange").value = Number.isFinite(settings.years) ? settings.years : 1;
  const result = InvestmentCalculator.project(settings);
  calculatorState.result = result;
  $("#calculatorTip").hidden = true;
  $("#calculatorSummary").hidden = !!result.error;
  $("#calculatorPng").disabled = $("#calculatorCsv").disabled = !!result.error;
  $("#calculatorStatus").classList.toggle("neg", !!result.error || result.depletedAt != null);
  $("#calculatorExportStatus").textContent = "";
  if (result.error) {
    $("#calculatorStatus").textContent = result.error;
    state.charts.calculator?.balance.setData([]);
    state.charts.calculator?.cash.setData([]);
    $("#calculatorYearTable").innerHTML = "";
    return;
  }
  const swp = settings.mode === "swp";
  $("#calculatorTotalLabel").textContent = swp ? "Remaining corpus" : "Projected value";
  $("#calculatorTotal").textContent = money(result.balance);
  $("#calculatorCashLabel").textContent = swp ? "Cumulative withdrawals" : "Total invested";
  $("#calculatorValueLabel").textContent = swp ? "Remaining corpus" : "Investment value";
  $("#calculatorStatus").textContent = result.depletedAt != null ? `Corpus depleted in month ${result.depletedAt} · ${result.shortfall > 0 ? `withdrawal shortfall ${money(result.shortfall)}` : "last withdrawal fully met"}` : `${settings.years} years · assumed ${settings.annualReturn}% effective annual return${swp ? " · month-end withdrawals" : settings.mode === "sip" ? ` · ${settings.timing === "begin" ? "beginning" : "end"}-of-month SIP` : ""}`;
  const metrics = [["Invested", money(result.invested)], [swp ? "Total withdrawn" : "Estimated gain / loss", money(swp ? result.withdrawn : result.gains)], [swp ? "Estimated gain / loss" : "Annual SIP increase", swp ? money(result.gains) : `${settings.stepUp}%`]];
  if (settings.mode === "lumpsum") metrics[2] = ["Duration", `${settings.years} years`];
  $("#calculatorMetrics").innerHTML = metrics.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  const { chart, balance, cash } = ensureCalculatorChart();
  const color = CALCULATOR_COLORS[settings.mode];
  const rgb = { sip: "110,231,183", lumpsum: "103,232,249", swp: "253,164,175" }[settings.mode];
  balance.applyOptions({ lineColor: color, topColor: `rgba(${rgb},0.18)`, bottomColor: `rgba(${rgb},0)` });
  balance.setData(result.points.map((point) => ({ time: point.time, value: point.balance })));
  cash.setData(result.points.map((point) => ({ time: point.time, value: swp ? point.withdrawn : point.invested })));
  requestAnimationFrame(() => fit(chart));
  const rows = result.yearly.map((point) => `<tr><td class="label">Year ${point.year}</td><td>${money(point.invested)}</td><td>${money(point.withdrawn)}</td><td>${money(point.balance)}</td><td class="${cls(point.balance + point.withdrawn - point.invested)}">${money(point.balance + point.withdrawn - point.invested)}</td><td>${money(point.shortfall)}</td></tr>`);
  $("#calculatorYearTable").innerHTML = `<thead><tr><th>Year</th><th>Invested</th><th>Withdrawn</th><th>Balance</th><th>Gain / loss</th><th>Withdrawal shortfall</th></tr></thead><tbody>${rows.join("")}</tbody>`;
}

function calculatorRecords() {
  const result = calculatorState.result;
  const headers = ["Month", "Date", "Opening balance (INR)", "Contribution (INR)", "Actual withdrawal (INR)", "Requested withdrawal (INR)", "Growth (INR)", "Closing balance (INR)", "Total invested (INR)", "Total withdrawn (INR)", "Withdrawal shortfall (INR)", "Mode", "Base investment (INR)", "Assumed annual return (%)", "Years", "Annual increase (%)", "SIP timing", "Start month"];
  if (!result || result.error) return [headers];
  const settings = result.settings;
  return [headers, ...result.points.map((point) => [point.month, `${point.time.year}-${String(point.time.month).padStart(2, "0")}-${String(point.time.day).padStart(2, "0")}`, point.opening, point.contribution, point.withdrawal, point.requestedWithdrawal, point.growth, point.balance, point.invested, point.withdrawn, point.shortfall, CALCULATOR_NAMES[settings.mode], settings.amount, settings.annualReturn, settings.years, settings.stepUp, settings.mode === "sip" ? settings.timing : null, settings.start])];
}

function calculatorExportInfo() {
  const settings = calculatorState.result.settings;
  const swp = settings.mode === "swp";
  return { title: `${CALCULATOR_NAMES[settings.mode]} projection`, subtitle: `${money(settings.amount)} ${settings.mode === "sip" ? "monthly" : "initial"}${swp ? ` · ${money(settings.withdrawal)} withdrawn monthly` : ""} · ${settings.years} years · assumed ${settings.annualReturn}% effective annual return · starts ${settings.start}${settings.mode === "sip" ? ` · ${settings.timing}-month SIP` : ""}${settings.mode !== "lumpsum" ? ` · ${settings.stepUp}% annual increase` : ""}`, lines: [{ name: swp ? "Remaining corpus" : "Investment value", color: CALCULATOR_COLORS[settings.mode] }, { name: swp ? "Cumulative withdrawals" : "Total invested", color: "#93c5fd" }], footer: "Hypothetical constant-return projection, not a forecast. Fees, taxes and inflation excluded.", filename: `indian-sectors-calculator-${settings.mode}.png` };
}

function bindCalculator() {
  $("#calculatorBtn").addEventListener("click", () => (location.hash = `calculator/${enabledUiSubsections("calculator").includes(calculatorState.mode) ? calculatorState.mode : enabledUiSubsections("calculator")[0]}`));
  $("#calculatorTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-calculator]");
    if (button && enabledUiSubsections("calculator").includes(button.dataset.calculator)) location.hash = `calculator/${button.dataset.calculator}`;
  });
  $("#calculatorTabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...document.querySelectorAll("#calculatorTabs [role='tab']")].filter((button) => !button.hidden);
    const current = buttons.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click(); buttons[next].focus();
  });
  $("#calculatorForm").addEventListener("input", (event) => {
    if (event.target.id === "calculatorRateRange") $("#calculatorRate").value = event.target.value;
    if (event.target.id === "calculatorYearsRange") $("#calculatorYears").value = event.target.value;
    updateCalculator();
  });
  $("#calculatorForm").addEventListener("submit", (event) => { event.preventDefault(); if (event.target.reportValidity()) updateCalculator(); });
  $("#calculatorCsv").addEventListener("click", () => saveBlob(new Blob(["\uFEFF", csvText(calculatorRecords())], { type: "text/csv;charset=utf-8" }), `indian-sectors-calculator-${calculatorState.mode}.csv`));
  $("#calculatorPng").addEventListener("click", async () => {
    if (!calculatorState.result || calculatorState.result.error) return;
    $("#calculatorPng").disabled = true;
    $("#calculatorExportStatus").textContent = "Preparing PNG...";
    try {
      const info = calculatorExportInfo();
      saveBlob(await createChartPng("calculator", info), info.filename);
      $("#calculatorExportStatus").textContent = "PNG export ready";
    } catch { $("#calculatorExportStatus").textContent = "PNG export failed"; }
    finally { $("#calculatorPng").disabled = !!calculatorState.result?.error; }
  });
}