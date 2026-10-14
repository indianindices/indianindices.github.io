const PERSONAL_STORAGE_KEY = "indianindices.personal.v1";
const personalState = { favorites: new Set(), comparisons: [], scenarios: [], scope: "all", persistent: true };
const SCENARIO_COLORS = ["#fcd34d", "#c4b5fd", "#fb923c"];

function personalId() {
  return globalThis.crypto?.randomUUID?.() || `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function validPersonalRecord(record) {
  return record && typeof record.id === "string" && /^[a-z0-9-]{1,64}$/i.test(record.id) && typeof record.name === "string" && record.name.trim().length > 0 && record.name.length <= 48;
}

function validSavedComparison(hash) {
  if (typeof hash !== "string" || hash.length > 4096 || !hash.startsWith("compare?")) return false;
  const params = new URLSearchParams(hash.slice(8));
  return ["mode", "from", "to"].every((key) => params.getAll(key).length === 1) && UI_SUBSECTIONS.compare.includes(params.get("mode")) && ["from", "to"].every((key) => /^\d{4}$/.test(params.get(key))) && Number(params.get("from")) <= Number(params.get("to")) && params.getAll("asset").length > 0 && params.getAll("asset").every((name) => state.names.includes(name));
}

function loadPersonalization() {
  personalState.favorites = new Set();
  personalState.comparisons = [];
  personalState.scenarios = [];
  let raw;
  try { raw = localStorage.getItem(PERSONAL_STORAGE_KEY); }
  catch { personalState.persistent = false; return; }
  if (!raw || raw.length > 100000) return;
  try {
    const saved = JSON.parse(raw);
    if (saved?.version !== 1) return;
    personalState.favorites = new Set((Array.isArray(saved.favorites) ? saved.favorites : []).filter((name) => state.names.includes(name)));
    const ids = new Set();
    personalState.comparisons = (Array.isArray(saved.comparisons) ? saved.comparisons : []).slice(0, 10).filter((record) => {
      if (!validPersonalRecord(record) || ids.has(record.id) || !validSavedComparison(record.hash)) return false;
      ids.add(record.id);
      return true;
    }).map(({ id, name, hash }) => ({ id, name: name.trim(), hash }));
    const counts = { sip: 0, lumpsum: 0, swp: 0 };
    for (const record of (Array.isArray(saved.scenarios) ? saved.scenarios : []).slice(0, 9)) {
      if (!validPersonalRecord(record) || ids.has(record.id) || !record.settings || typeof record.settings !== "object") continue;
      const result = InvestmentCalculator.project(record.settings);
      if (result.error || counts[result.settings.mode] >= 3) continue;
      ids.add(record.id);
      counts[result.settings.mode]++;
      personalState.scenarios.push({ id: record.id, name: record.name.trim(), settings: result.settings, visible: record.visible !== false });
    }
  } catch {}
}

function persistPersonalization() {
  try {
    localStorage.setItem(PERSONAL_STORAGE_KEY, JSON.stringify({ version: 1, favorites: [...personalState.favorites], comparisons: personalState.comparisons, scenarios: personalState.scenarios }));
    personalState.persistent = true;
  } catch { personalState.persistent = false; }
  return personalState.persistent;
}

function personalStatus(action) {
  return personalState.persistent ? action : `${action} · this session only`;
}

function toggleWatchlist(name) {
  if (!uiFeatureEnabled("watchlists") || !state.names.includes(name)) return;
  if (personalState.favorites.has(name)) personalState.favorites.delete(name);
  else personalState.favorites.add(name);
  persistPersonalization();
  renderSidebar();
  $("#watchlistStatus").textContent = personalStatus(personalState.favorites.has(name) ? "Added to watchlist" : "Removed from watchlist");
}

function renderSavedComparisons() {
  $("#savedComparisonControls").hidden = !uiFeatureEnabled("watchlists");
  $("#saveComparison").disabled = !state.compareNames.length;
  const rows = personalState.comparisons.filter((record) => enabledUiSubsections("compare").includes(new URLSearchParams(record.hash.slice(8)).get("mode")));
  $("#savedComparisonList").innerHTML = rows.length ? rows.map((record) => `<div class="saved-comparison"><a href="#${esc(record.hash)}">${esc(record.name)}</a><button type="button" class="icon-command" data-remove-comparison="${record.id}" title="Remove comparison" aria-label="Remove ${esc(record.name)}"><img src="assets/x.svg" width="16" height="16" alt=""></button></div>`).join("") : '<p class="hint">No saved comparisons</p>';
}

function saveCurrentComparison() {
  if (!uiFeatureEnabled("watchlists") || !state.compareNames.length) return;
  if (personalState.comparisons.length >= 10) { $("#savedComparisonStatus").textContent = "Maximum 10 comparisons. Remove one before saving another."; return; }
  const name = ($("#comparisonName").value || `Comparison ${personalState.comparisons.length + 1}`).trim().slice(0, 48);
  if (!name) { $("#savedComparisonStatus").textContent = "Enter a comparison name."; return; }
  personalState.comparisons.push({ id: personalId(), name, hash: compareHash() });
  persistPersonalization();
  $("#comparisonName").value = "";
  renderSavedComparisons();
  $("#savedComparisonStatus").textContent = personalStatus("Comparison saved");
}

function activeCalculatorScenarios() {
  if (!uiFeatureEnabled("savedScenarios")) return [];
  return personalState.scenarios.filter((record) => record.settings.mode === calculatorState.mode).map((record, index) => ({ ...record, color: SCENARIO_COLORS[index], result: InvestmentCalculator.project(record.settings) })).filter((record) => record.visible && !record.result.error);
}

function renderSavedScenarios() {
  $("#savedScenarioSection").hidden = !uiFeatureEnabled("savedScenarios");
  $("#saveCalculatorScenario").disabled = !calculatorState.result || !!calculatorState.result.error;
  const records = personalState.scenarios.filter((record) => record.settings.mode === calculatorState.mode);
  const rows = records.map((record, index) => {
    const result = InvestmentCalculator.project(record.settings);
    return `<tr><td><input type="checkbox" data-compare-scenario="${record.id}" aria-label="Compare ${esc(record.name)}" ${record.visible ? "checked" : ""}></td><td class="label"><span class="scenario-swatch" style="background:${SCENARIO_COLORS[index]}"></span>${esc(record.name)}</td><td>${record.settings.annualReturn}%</td><td>${record.settings.years}</td><td>${record.settings.start}</td><td>${money(result.invested)}</td><td>${money(result.withdrawn)}</td><td>${money(result.balance)}</td><td><button type="button" class="load-scenario" data-load-scenario="${record.id}">Load</button></td><td><button type="button" class="icon-command" data-remove-scenario="${record.id}" title="Remove scenario" aria-label="Remove ${esc(record.name)}"><img src="assets/x.svg" width="16" height="16" alt=""></button></td></tr>`;
  });
  $("#savedScenarioTable").innerHTML = `<thead><tr><th>Graph</th><th>Scenario</th><th>Return</th><th>Years</th><th>Start</th><th>Invested</th><th>Withdrawn</th><th>Final balance</th><th></th><th></th></tr></thead><tbody>${rows.join("")}</tbody>`;
  $("#savedScenarioEmpty").hidden = !!records.length;
  $("#calculatorSavedLegend").innerHTML = activeCalculatorScenarios().map((record) => `<span><i style="background:${record.color}"></i>${esc(record.name)}</span>`).join("");
}

function syncCalculatorScenarios() {
  const entry = state.charts.calculator;
  if (!entry) return;
  (entry.scenarios ?? []).forEach((line) => entry.chart.removeSeries(line.series));
  entry.scenarios = [];
  if (!calculatorState.result || calculatorState.result.error) return;
  for (const record of activeCalculatorScenarios()) {
    const series = entry.chart.addLineSeries({ color: record.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "custom", formatter: money } });
    series.setData(record.result.points.map((point) => ({ time: point.time, value: point.balance })));
    entry.scenarios.push({ id: record.id, name: record.name, color: record.color, series });
  }
}

function saveCalculatorScenario() {
  if (!uiFeatureEnabled("savedScenarios") || !calculatorState.result || calculatorState.result.error) return;
  const count = personalState.scenarios.filter((record) => record.settings.mode === calculatorState.mode).length;
  if (count >= 3) { $("#savedScenarioStatus").textContent = "Maximum 3 scenarios per calculator. Remove one before saving another."; return; }
  const name = ($("#calculatorScenarioName").value || `${CALCULATOR_NAMES[calculatorState.mode]} ${count + 1}`).trim().slice(0, 48);
  if (!name) { $("#savedScenarioStatus").textContent = "Enter a scenario name."; return; }
  personalState.scenarios.push({ id: personalId(), name, settings: { ...calculatorState.result.settings }, visible: true });
  persistPersonalization();
  $("#calculatorScenarioName").value = "";
  updateCalculator();
  $("#savedScenarioStatus").textContent = personalStatus("Scenario saved");
}

function bindPersonalization() {
  $("#assetList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-watch]");
    if (button) toggleWatchlist(button.dataset.watch);
  });
  $("#assetScope").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-scope]");
    if (!button || !uiFeatureEnabled("watchlists")) return;
    personalState.scope = button.dataset.scope === "watchlist" ? "watchlist" : "all";
    renderSidebar();
  });
  $("#saveComparison").addEventListener("click", saveCurrentComparison);
  $("#savedComparisonList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remove-comparison]");
    if (!button) return;
    personalState.comparisons = personalState.comparisons.filter((record) => record.id !== button.dataset.removeComparison);
    persistPersonalization(); renderSavedComparisons();
    $("#savedComparisonStatus").textContent = personalStatus("Comparison removed");
  });
  $("#saveCalculatorScenario").addEventListener("click", saveCalculatorScenario);
  $("#savedScenarioTable").addEventListener("change", (event) => {
    const record = personalState.scenarios.find((item) => item.id === event.target.dataset.compareScenario);
    if (!record) return;
    record.visible = event.target.checked;
    persistPersonalization(); syncCalculatorScenarios();
    if (!calculatorState.result?.error) requestAnimationFrame(() => fit(state.charts.calculator.chart));
    $("#savedScenarioStatus").textContent = personalStatus("Comparison updated");
  });
  $("#savedScenarioTable").addEventListener("click", (event) => {
    const load = event.target.closest("button[data-load-scenario]");
    const remove = event.target.closest("button[data-remove-scenario]");
    if (load) {
      const record = personalState.scenarios.find((item) => item.id === load.dataset.loadScenario);
      if (record) { calculatorState.settings[record.settings.mode] = { ...record.settings }; renderCalculator(record.settings.mode); }
    } else if (remove) {
      personalState.scenarios = personalState.scenarios.filter((item) => item.id !== remove.dataset.removeScenario);
      persistPersonalization(); updateCalculator();
      $("#savedScenarioStatus").textContent = personalStatus("Scenario removed");
    }
  });
}