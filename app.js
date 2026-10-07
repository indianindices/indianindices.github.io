const LC = LightweightCharts;
const QEND = [[3, 31], [6, 30], [9, 30], [12, 31]];
const $ = (s) => document.querySelector(s);
const state = { data: null, names: [], stats: {}, view: null, asset: null, charts: {}, cagrYears: 5, returnPeriod: "quarterly", compareNames: [], compareMode: "returns", fromYear: null, toYear: null };

const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);
const cls = (v) => (v == null ? "" : v >= 0 ? "pos" : "neg");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const stdev = (a) => {
  const m = mean(a);
  return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : null;
};

// Light tint for small moves, deep red/green for extreme ones.
const NEG = [[254, 226, 226], [127, 0, 0]];
const POS = [[220, 252, 231], [4, 72, 28]];
function shade(v, scale) {
  if (v == null) return null;
  const t = Math.min(Math.abs(v) / scale, 1) ** 0.75;
  const [a, b] = v >= 0 ? POS : NEG;
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * t));
  return { bg: `rgb(${c})`, fg: t > 0.45 ? "#fff" : "#111", hex: `rgb(${c})` };
}
function cell(v, scale, extra = "") {
  const s = shade(v, scale);
  return s ? `<td ${extra} style="background:${s.bg};color:${s.fg}">${fmt(v)}</td>` : `<td ${extra} class="empty">—</td>`;
}

function hsla(h, s, l, a = 1) {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return `rgba(${f(0)},${f(8)},${f(4)},${a})`;
}

const yearOf = (t) => (typeof t === "object" ? t.year : typeof t === "string" ? +t.slice(0, 4) : new Date(t * 1000).getUTCFullYear());
const monthOf = (t) => (typeof t === "object" ? t.month : typeof t === "string" ? +t.slice(5, 7) : new Date(t * 1000).getUTCMonth() + 1);

// Trailing n-year CAGR compounded from quarterly returns, ending at the last completed quarter.
function trailingCagr(rows, n) {
  const quarterly = {};
  rows.filter((r) => !r.avg).forEach((r) => r.q.forEach((v, i) => v != null && (quarterly[r.year * 4 + i] = v)));
  const end = Math.max(...Object.keys(quarterly).map(Number));
  let p = 1;
  for (let k = end - 4 * n + 1; k <= end; k++) {
    if (quarterly[k] == null) return null;
    p *= 1 + quarterly[k] / 100;
  }
  return (p ** (1 / n) - 1) * 100;
}

function computeStats(rows) {
  const cy = state.data.currentYear;
  const full = rows.filter((r) => !r.avg && r.year < cy && r.annual != null).sort((a, b) => a.year - b.year);
  const byYear = Object.fromEntries(full.map((r) => [r.year, r.annual]));
  const cagr = (n) => trailingCagr(rows, n);
  const vals = full.map((r) => r.annual);
  const best = full.reduce((b, r) => (!b || r.annual > b.annual ? r : b), null);
  const worst = full.reduce((b, r) => (!b || r.annual < b.annual ? r : b), null);
  const m = mean(vals), sd = stdev(vals);
  return {
    cagr3: cagr(3), cagr5: cagr(5), cagr10: cagr(10),
    mean: m, sd, ratio: sd ? m / sd : null,
    win: vals.length ? (vals.filter((v) => v > 0).length / vals.length) * 100 : null,
    ytd: rows.find((r) => r.year === cy)?.annual ?? null,
    last: byYear[cy - 1] ?? null,
    best, worst, since: full[0]?.year,
  };
}

// ---------- chart helpers ----------
function baseOptions(extra) {
  return {
    autoSize: true,
    layout: { background: { color: "transparent" }, textColor: "#9aa4b2", fontFamily: "Inter, system-ui, sans-serif" },
    grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.06)" } },
    rightPriceScale: { borderColor: "rgba(255,255,255,0.1)", scaleMargins: { top: 0.1, bottom: 0.1 } },
    crosshair: {
      mode: LC.CrosshairMode.Normal,
      vertLine: { color: "rgba(124,92,255,0.6)", labelBackgroundColor: "#7c5cff" },
      horzLine: { color: "rgba(124,92,255,0.6)", labelBackgroundColor: "#7c5cff" },
    },
    handleScroll: { vertTouchDrag: false },
    localization: { priceFormatter: (v) => `${v.toFixed(1)}%` },
    ...extra,
  };
}

function zoom(chart, factor) {
  const ts = chart.timeScale();
  const r = ts.getVisibleLogicalRange();
  if (!r) return;
  const c = (r.from + r.to) / 2, h = ((r.to - r.from) / 2) * factor;
  ts.setVisibleLogicalRange({ from: c - h, to: c + h });
}
function fit(chart) {
  chart.priceScale("right").applyOptions({ autoScale: true });
  chart.timeScale().fitContent();
}

// ---------- asset view ----------
function assetPeriodLabel(time) {
  const year = yearOf(time);
  return state.returnPeriod === "annual" ? `${year}${year === state.data.currentYear ? " YTD" : ""}` : `${year} Q${Math.ceil(monthOf(time) / 3)}`;
}

function ensureAssetChart() {
  if (state.charts.asset) return state.charts.asset;
  const el = $("#assetChart");
  const chart = LC.createChart(el, baseOptions({
    timeScale: {
      borderColor: "rgba(255,255,255,0.1)",
      rightOffset: 2,
      minBarSpacing: 2,
      tickMarkFormatter: (t, type) => (type === LC.TickMarkType.Year ? String(yearOf(t)) : `Q${Math.ceil(monthOf(t) / 3)} '${String(yearOf(t)).slice(2)}`),
    },
  }));
  chart.applyOptions({ localization: { ...chart.options().localization, timeFormatter: (t) => `${yearOf(t)} Q${Math.ceil(monthOf(t) / 3)}` } });
  const series = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "custom", formatter: (v) => `${v.toFixed(2)}%` } });
  series.createPriceLine({ price: 0, color: "rgba(255,255,255,0.3)", lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: false });

  const tip = $("#assetTip");
  chart.subscribeCrosshairMove((p) => {
    const d = p.time && p.point && p.seriesData.get(series);
    if (!d) return (tip.hidden = true);
    tip.hidden = false;
    tip.innerHTML = `${assetPeriodLabel(p.time)}<b class="${cls(d.value)}">${fmt(d.value)}</b>`;
    const w = el.clientWidth;
    tip.style.left = `${Math.min(p.point.x + 14, w - 130)}px`;
    tip.style.top = `${Math.max(p.point.y - 50, 4)}px`;
  });
  el.addEventListener("dblclick", () => fit(chart));
  state.charts.asset = { chart, series };
  return state.charts.asset;
}

function renderAsset(name, keepZoom = false) {
  const rows = state.data.assets[name];
  const displayed = rows.filter((row) => !row.avg && row.year >= state.fromYear && row.year <= state.toYear);
  const s = state.stats[name];
  const cy = state.data.currentYear;
  $("#assetTitle").textContent = name;

  const chip = (label, v, note = "") => `<div class="chip"><small>${label}</small><strong class="${cls(v)}">${fmt(v)}</strong>${note ? `<em>${note}</em>` : ""}</div>`;
  $("#assetStats").innerHTML = [
    chip(`${cy} YTD`, s.ytd),
    chip(`${cy - 1}`, s.last),
    chip("3Y CAGR", s.cagr3, state.asOf),
    chip("5Y CAGR", s.cagr5, state.asOf),
    chip("10Y CAGR", s.cagr10, state.asOf),
    chip("Best year", s.best?.annual, s.best?.year),
    chip("Worst year", s.worst?.annual, s.worst?.year),
    `<div class="chip"><small>Up years</small><strong>${s.win == null ? "—" : s.win.toFixed(0) + "%"}</strong><em>since ${s.since ?? "—"}</em></div>`,
    `<div class="chip"><small>Volatility (σ)</small><strong>${s.sd == null ? "—" : s.sd.toFixed(1) + "%"}</strong></div>`,
  ].join("");

  const { chart, series } = ensureAssetChart();
  const annual = state.returnPeriod === "annual";
  $("#assetTip").hidden = true;
  document.querySelectorAll("#returnPeriod button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.period === state.returnPeriod)));
  chart.applyOptions({
    timeScale: { tickMarkFormatter: (time, type) => annual ? assetPeriodLabel(time) : type === LC.TickMarkType.Year ? String(yearOf(time)) : `Q${Math.ceil(monthOf(time) / 3)} '${String(yearOf(time)).slice(2)}` },
    localization: { timeFormatter: assetPeriodLabel },
  });
  const points = displayed
    .flatMap((r) => annual
      ? r.annual == null ? [] : [{ time: { year: r.year, month: 12, day: 31 }, value: r.annual, color: shade(r.annual, 40).hex }]
      : r.q.map((v, i) => (v == null ? null : { time: { year: r.year, month: QEND[i][0], day: QEND[i][1] }, value: v, color: shade(v, 15).hex })))
    .filter(Boolean)
    .sort((a, b) => a.time.year - b.time.year || a.time.month - b.time.month);
  series.setData(points);
  if (!keepZoom) requestAnimationFrame(() => fit(chart));

  const annualByYear = Object.fromEntries(rows.filter((r) => !r.avg).map((r) => [r.year, r.annual]));
  const n = state.cagrYears;
  const rolling = (y) => {
    if (y >= cy) return trailingCagr(rows, n);
    let p = 1;
    for (let k = y - n + 1; k <= y; k++) {
      if (annualByYear[k] == null) return null;
      p *= 1 + annualByYear[k] / 100;
    }
    return (p ** (1 / n) - 1) * 100;
  };
  const tableRows = state.fromYear === state.firstYear && state.toYear === state.lastYear ? rows : displayed;
  const body = tableRows.map((r) => {
    const label = r.avg ? "5Y Avg" : r.year === cy ? `${r.year} YTD` : r.year;
    const tip = r.year === cy ? `title="Trailing ${n}Y to the last completed quarter"` : "";
    return `<tr class="${r.avg ? "avg" : ""}"><td class="label">${label}</td>${r.q.map((v) => cell(v, 15)).join("")}${cell(r.annual, 40)}${r.avg ? '<td class="empty">—</td>' : cell(rolling(r.year), 25, tip)}</tr>`;
  }).join("");
  const options = [3, 5, 10].map((k) => `<option value="${k}" ${k === n ? "selected" : ""}>${k}Y CAGR</option>`).join("");
  $("#assetTable").innerHTML = `<thead><tr><th>Year</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Annual</th><th><select id="cagrSelect" class="th-select">${options}</select></th></tr></thead><tbody>${body}</tbody>`;
}

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const quarterTime = (key) => ({ year: Math.floor(key / 4), month: QEND[key % 4][0], day: QEND[key % 4][1] });
const quarterLabel = (key) => `Q${key % 4 + 1} ${Math.floor(key / 4)}`;

function growthData(names, fromYear = -Infinity, toYear = Infinity) {
  if (!names.length) return null;
  const maps = names.map((name) => new Map(state.data.assets[name].filter((row) => !row.avg && row.year >= fromYear && row.year <= toYear)
    .flatMap((row) => row.q.flatMap((value, index) => Number.isFinite(value) ? [[row.year * 4 + index, value]] : []))));
  const common = [...maps[0].keys()].filter((key) => maps.every((map) => map.has(key))).sort((left, right) => left - right);
  if (!common.length) return null;
  const end = common[common.length - 1];
  let start = end;
  while (maps.every((map) => map.has(start - 1))) start--;
  const series = maps.map((map) => {
    let value = 10000;
    const points = [{ time: quarterTime(start - 1), value }];
    for (let key = start; key <= end; key++) {
      value *= 1 + map.get(key) / 100;
      points.push({ time: quarterTime(key), value });
    }
    return points;
  });
  return { start, end, series };
}

function ensureCompareChart() {
  if (state.charts.compare) return state.charts.compare;
  const chart = LC.createChart($("#compareChart"), baseOptions({
    timeScale: { borderColor: "rgba(255,255,255,0.1)", tickMarkFormatter: (time) => String(yearOf(time)) },
    localization: { timeFormatter: (time) => `${yearOf(time)}${yearOf(time) === state.data.currentYear ? " YTD" : ""}`, priceFormatter: (value) => `${value.toFixed(2)}%` },
  }));
  const entry = { chart, lines: [] };
  chart.subscribeCrosshairMove((event) => {
    const tip = $("#compareTip");
    if (!event.time || !event.point) return (tip.hidden = true);
    const values = entry.lines.flatMap((line) => {
      const point = event.seriesData.get(line.series);
      return point?.value == null ? [] : [`<div><span>${esc(line.name)}</span><b class="${state.compareMode === "growth" ? "" : cls(point.value)}">${state.compareMode === "growth" ? money(point.value) : fmt(point.value)}</b></div>`];
    });
    tip.hidden = !values.length;
    tip.innerHTML = `${chart.options().localization.timeFormatter(event.time)}${values.join("")}`;
    tip.style.left = `${Math.max(0, Math.min(event.point.x + 12, $("#compareChart").clientWidth - Math.ceil(tip.getBoundingClientRect().width)))}px`;
    tip.style.top = "8px";
  });
  $("#compareChart").addEventListener("dblclick", () => fit(chart));
  state.charts.compare = entry;
  return entry;
}

function renderCompare() {
  const entry = ensureCompareChart();
  entry.lines.forEach((line) => entry.chart.removeSeries(line.series));
  entry.lines = [];
  $("#compareTip").hidden = true;
  const growth = state.compareMode === "growth";
  const selected = state.names.filter((name) => state.compareNames.includes(name));
  const compounded = growth ? growthData(selected, state.fromYear, state.toYear) : null;
  const formatter = growth ? money : (value) => `${value.toFixed(2)}%`;
  document.querySelectorAll("#compareMode button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === state.compareMode)));
  entry.chart.applyOptions({
    timeScale: { tickMarkFormatter: (time) => String(yearOf(time)) },
    localization: { priceFormatter: formatter, timeFormatter: (time) => growth ? `${yearOf(time)} Q${Math.ceil(monthOf(time) / 3)}` : `${yearOf(time)}${yearOf(time) === state.data.currentYear ? " YTD" : ""}` },
  });
  state.names.forEach((name, index) => {
    if (!selected.includes(name) || (growth && !compounded)) return;
    const series = entry.chart.addLineSeries({
      color: hsla((index * 137.508) % 360, 80, 62), lineWidth: name === "Nifty50" ? 3 : 2,
      lineStyle: name === "Nifty50" ? LC.LineStyle.Dashed : LC.LineStyle.Solid,
      priceLineVisible: false, lastValueVisible: false,
      priceFormat: { type: "custom", formatter },
    });
    series.setData(growth ? compounded.series[selected.indexOf(name)] : state.data.assets[name].filter((row) => !row.avg && row.year >= state.fromYear && row.year <= state.toYear).sort((left, right) => left.year - right.year)
      .map((row) => ({ time: { year: row.year, month: 12, day: 31 }, ...(row.annual == null ? {} : { value: row.annual }) })));
    entry.lines.push({ name, series });
  });
  $("#compareStatus").textContent = !selected.length ? "No indices selected" : growth
    ? compounded ? `₹10,000 at end of ${quarterLabel(compounded.start - 1)} · through ${quarterLabel(compounded.end)} · common uninterrupted history` : "No shared quarterly history"
    : `${selected.length} indices · ${state.data.currentYear} is YTD`;
  $("#compareView .download-csv").disabled = !selected.length || (growth && !compounded);
  requestAnimationFrame(() => fit(entry.chart));
}

function csvText(records) {
  return records.map((record) => record.map((value) => {
    let text = value == null ? "" : String(value);
    if (typeof value === "string" && /^[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
}

function exportRecords() {
  if (state.view === "asset") {
    return [["Index", "Year", "Period", "Q1 (%)", "Q2 (%)", "Q3 (%)", "Q4 (%)", "Annual return (%)"],
      ...state.data.assets[state.asset].filter((row) => !row.avg && row.year >= state.fromYear && row.year <= state.toYear)
        .map((row) => [state.asset, row.year, row.year === state.data.currentYear ? "YTD" : "Full year", ...row.q, row.annual])];
  }
  const selected = state.names.filter((name) => state.compareNames.includes(name));
  if (state.compareMode === "growth") {
    const compounded = growthData(selected, state.fromYear, state.toYear);
    return [["Index", "Date", "Investment value (INR)"], ...(compounded ? selected.flatMap((name, index) => compounded.series[index].map((point) => [name,
      `${point.time.year}-${String(point.time.month).padStart(2, "0")}-${String(point.time.day).padStart(2, "0")}`, Number(point.value.toFixed(2))])) : [])];
  }
  return [["Index", "Year", "Period", "Annual return (%)"], ...selected.flatMap((name) => state.data.assets[name]
    .filter((row) => !row.avg && row.year >= state.fromYear && row.year <= state.toYear)
    .map((row) => [name, row.year, row.year === state.data.currentYear ? "YTD" : "Full year", row.annual]))];
}

function downloadCsv() {
  const url = URL.createObjectURL(new Blob(["\uFEFF", csvText(exportRecords())], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  const name = state.view === "asset" ? state.asset : `comparison-${state.compareMode}`;
  link.download = `${name.replace(/[^a-z0-9_-]/gi, "_")}-${state.fromYear}-${state.toYear}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- summary view ----------
function ensureSummaryChart() {
  if (state.charts.summary) return state.charts.summary;
  const el = $("#summaryChart");
  const chart = LC.createChart(el, baseOptions({
    timeScale: { borderColor: "rgba(255,255,255,0.1)", rightOffset: 1, tickMarkFormatter: (t) => String(yearOf(t)) },
  }));
  chart.applyOptions({ localization: { ...chart.options().localization, timeFormatter: (t) => String(yearOf(t)) } });
  const cy = state.data.currentYear;
  const lines = state.names.map((name, i) => {
    const hue = Math.round((i * 137.508) % 360);
    const color = hsla(hue, 80, 62);
    const series = chart.addLineSeries({
      color, lineWidth: 2, lineType: LC.LineType.Curved,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 3,
      priceFormat: { type: "custom", formatter: (v) => `${v.toFixed(2)}%` },
    });
    const data = state.data.assets[name]
      .filter((r) => !r.avg && r.annual != null)
      .map((r) => ({ time: { year: r.year, month: 12, day: 31 }, value: r.annual }))
      .sort((a, b) => a.time.year - b.time.year);
    series.setData(data);
    return { name, hue, color, series, visible: true, byYear: Object.fromEntries(data.map((d) => [d.time.year, d.value])) };
  });
  lines[0].series.createPriceLine({ price: 0, color: "rgba(255,255,255,0.3)", lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: false });

  const highlight = (target) => {
    lines.forEach((l) => l.series.applyOptions({
      color: !target || l === target ? l.color : hsla(l.hue, 40, 50, 0.12),
      lineWidth: l === target ? 4 : 2,
    }));
  };

  const legend = $("#legend");
  const renderLegend = (year) => {
    const y = year ?? cy - 1;
    const sorted = [...lines].sort((a, b) => (b.byYear[y] ?? -1e9) - (a.byYear[y] ?? -1e9));
    legend.innerHTML = `<div class="head">${y}${y === cy ? " YTD" : ""} &middot; sorted by return</div>` + sorted.map((l) =>
      `<div class="item ${l.visible ? "" : "off"}" data-name="${esc(l.name)}"><span class="dot" style="background:${l.color}"></span><span class="name">${esc(l.name)}</span><span class="val ${cls(l.byYear[y])}">${fmt(l.byYear[y], 1)}</span></div>`
    ).join("");
  };
  const byName = Object.fromEntries(lines.map((l) => [l.name, l]));
  legend.addEventListener("click", (e) => {
    const item = e.target.closest(".item");
    if (!item) return;
    const l = byName[item.dataset.name];
    l.visible = !l.visible;
    l.series.applyOptions({ visible: l.visible });
    item.classList.toggle("off", !l.visible);
  });
  legend.addEventListener("mouseover", (e) => {
    const item = e.target.closest(".item");
    highlight(item ? byName[item.dataset.name] : null);
  });
  legend.addEventListener("mouseleave", () => highlight(null));

  let lastYear = null;
  chart.subscribeCrosshairMove((p) => {
    const y = p.time ? yearOf(p.time) : null;
    if (y !== lastYear) renderLegend((lastYear = y));
  });
  el.addEventListener("dblclick", () => fit(chart));
  renderLegend(null);
  state.charts.summary = { chart, lines, renderLegend };
  return state.charts.summary;
}

function renderSummary() {
  const { chart } = ensureSummaryChart();
  requestAnimationFrame(() => fit(chart));
  renderSummaryText();
  renderHeatmap();
}

function renderHeatmap() {
  const cy = state.data.currentYear;
  const years = [...new Set(state.names.flatMap((n) => state.data.assets[n].filter((r) => !r.avg).map((r) => r.year)))].sort((a, b) => b - a);
  const order = [...state.names].sort((a, b) => (state.stats[b].cagr5 ?? -1e9) - (state.stats[a].cagr5 ?? -1e9));
  const head = `<thead><tr><th>Asset</th><th>5Y CAGR</th>${years.map((y) => `<th>${y}${y === cy ? " YTD" : ""}</th>`).join("")}</tr></thead>`;
  const body = order.map((n) => {
    const byYear = Object.fromEntries(state.data.assets[n].filter((r) => !r.avg).map((r) => [r.year, r.annual]));
    return `<tr><td class="label" data-name="${esc(n)}">${esc(n)}</td>${cell(state.stats[n].cagr5, 25)}${years.map((y) => cell(byYear[y] ?? null, 40)).join("")}</tr>`;
  }).join("");
  $("#heatmap").innerHTML = head + `<tbody>${body}</tbody>`;
}

function renderSummaryText() {
  const cy = state.data.currentYear;
  const S = state.stats;
  const list = (arr, key, d = 1) => arr.map((n) => `<b>${esc(n)}</b> (${fmt(S[n][key], d)})`).join(", ");
  const ranked = (key) => state.names.filter((n) => S[n][key] != null).sort((a, b) => S[b][key] - S[a][key]);

  const by5 = ranked("cagr5"), by10 = ranked("cagr10"), byLast = ranked("last"), byYtd = ranked("ytd"), byRatio = ranked("ratio");
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const ytdMedian = median(byYtd.map((n) => S[n].ytd));
  const negYtd = byYtd.filter((n) => S[n].ytd < 0).length;
  const negLast = byLast.filter((n) => S[n].last < 0).length;

  const quarterAvg = [0, 1, 2, 3].map((i) => mean(state.names.flatMap((n) => state.data.assets[n].filter((r) => !r.avg && r.q[i] != null).map((r) => r.q[i]))));
  const bestQ = quarterAvg.indexOf(Math.max(...quarterAvg)), worstQ = quarterAvg.indexOf(Math.min(...quarterAvg));

  const lastQIndex = QEND.findLastIndex(([m, d]) => new Date(cy, m - 1, d) < new Date());
  const ytdLabel = lastQIndex >= 0 ? `${cy} YTD (through Q${lastQIndex + 1})` : `${cy} YTD`;

  // Heuristic buckets (not a forecast).
  const quality = by10.filter((n) => S[n].ratio != null).sort((a, b) => S[b].ratio - S[a].ratio).slice(0, 10);
  const rebound = quality.filter((n) => S[n].ytd != null && S[n].ytd < ytdMedian).slice(0, 4);
  const momentum = state.names
    .filter((n) => S[n].ytd > 0 && S[n].cagr3 != null && S[n].cagr5 != null && S[n].cagr3 > 0 && S[n].cagr5 > 0)
    .sort((a, b) => S[b].ytd - S[a].ytd).slice(0, 4);
  const caution = state.names
    .filter((n) => (S[n].cagr3 != null && S[n].cagr3 < 0) || (S[n].ytd != null && S[n].ytd < 0 && S[n].cagr3 != null && S[n].cagr10 != null && S[n].cagr3 < S[n].cagr10 - 5))
    .sort((a, b) => (S[a].cagr3 ?? 0) - (S[b].cagr3 ?? 0)).slice(0, 4);

  const li = (html) => (html ? `<li>${html}</li>` : "");
  $("#summaryText").innerHTML = `
    <h2>How the asset classes performed</h2>
    <ul>
      ${li(by5.length && `<b>5-year leaders (trailing CAGR to ${state.asOf}):</b> ${list(by5.slice(0, 3), "cagr5")}. Laggards: ${list(by5.slice(-3).reverse(), "cagr5")}.`)}
      ${li(by10.length && `<b>10-year compounding (to ${state.asOf}):</b> ${list(by10.slice(0, 3), "cagr10")} have compounded best; ${list(by10.slice(-2).reverse(), "cagr10")} trailed.`)}
      ${li(byLast.length && `<b>${cy - 1}:</b> ${list(byLast.slice(0, 3), "last")} led while ${list(byLast.slice(-3).reverse(), "last")} lagged. ${negLast} of ${byLast.length} assets ended the year negative.`)}
      ${li(byYtd.length && `<b>${ytdLabel}:</b> ${negYtd} of ${byYtd.length} assets are in the red. Best: ${list(byYtd.slice(0, 3), "ytd")}. Worst: ${list(byYtd.slice(-3).reverse(), "ytd")}.`)}
      ${li(byRatio.length && `<b>Best risk-adjusted (avg annual return ÷ volatility):</b> ${byRatio.slice(0, 3).map((n) => `<b>${esc(n)}</b> (${S[n].ratio.toFixed(2)})`).join(", ")}.`)}
      ${li(`<b>Seasonality:</b> across all indices, Q${bestQ + 1} has been the strongest quarter on average (${fmt(quarterAvg[bestQ])}) and Q${worstQ + 1} the weakest (${fmt(quarterAvg[worstQ])}).`)}
    </ul>
    <h3>What may do well next (data-driven heuristics)</h3>
    <ul>
      ${li(rebound.length && `<b>Quality on sale:</b> ${list(rebound, "ytd")} have strong long-run risk-adjusted records but are below the median this year — historically such dips in compounders have tended to mean-revert.`)}
      ${li(momentum.length && `<b>Momentum continuation:</b> ${list(momentum, "ytd")} are positive this year with positive 3Y and 5Y trends.`)}
      ${li(caution.length && `<b>Caution:</b> ${list(caution, "cagr3")} (3Y CAGR) show weakening trends versus their long-term averages.`)}
      ${li(`<b>Seasonal tilt:</b> Q${worstQ + 1} has seen the most drawdowns and Q${bestQ + 1} the strongest rallies, so Q${worstQ + 1} weakness has historically been a better entry point than chasing Q${bestQ + 1} strength.`)}
    </ul>
    <p class="disclaimer">Generated automatically from past calendar-year and quarterly returns. Past performance does not predict future returns; this is not investment advice.</p>`;
}

// ---------- navigation ----------
function renderSidebar() {
  const q = $("#search").value.trim().toLowerCase();
  $("#assetList").innerHTML = state.names
    .filter((n) => n.toLowerCase().includes(q))
    .map((n) => {
      const s = shade(state.stats[n].ytd, 30);
      const badge = s ? `<span class="badge" style="background:${s.bg};color:${s.fg}">${fmt(state.stats[n].ytd, 1)}</span>` : "";
      return `<button class="nav ${state.view === "asset" && state.asset === n ? "active" : ""}" data-name="${esc(n)}"><span>${esc(n)}</span>${badge}</button>`;
    }).join("");
  $("#summaryBtn").classList.toggle("active", state.view === "summary");
  $("#compareBtn").classList.toggle("active", state.view === "compare");
}

function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  const name = hash.startsWith("asset/") ? hash.slice(6) : null;
  $("#compareView").hidden = hash !== "compare";
  if (name && state.data.assets[name]) {
    state.view = "asset";
    state.asset = name;
    $("#summaryView").hidden = true;
    $("#assetView").hidden = false;
    renderAsset(name);
  } else if (hash === "compare") {
    state.view = "compare";
    $("#assetView").hidden = true;
    $("#summaryView").hidden = true;
    renderCompare();
  } else if (hash === "summary") {
    state.view = "summary";
    $("#assetView").hidden = true;
    $("#summaryView").hidden = false;
    renderSummary();
  } else {
    location.hash = state.names.length ? `asset/${encodeURIComponent(state.names[0])}` : "summary";
    return;
  }
  renderSidebar();
  window.scrollTo({ top: 0 });
}

function activeChart() {
  return state.charts[state.view]?.chart;
}

function bindUI() {
  document.querySelectorAll(".range-controls select").forEach((select) => select.addEventListener("change", () => {
    if (select.classList.contains("from-year")) {
      state.fromYear = +select.value;
      state.toYear = Math.max(state.fromYear, state.toYear);
    } else {
      state.toYear = +select.value;
      state.fromYear = Math.min(state.fromYear, state.toYear);
    }
    document.querySelectorAll(".from-year").forEach((input) => (input.value = state.fromYear));
    document.querySelectorAll(".to-year").forEach((input) => (input.value = state.toYear));
    if (state.view === "asset") renderAsset(state.asset);
    else renderCompare();
  }));
  document.querySelectorAll(".download-csv").forEach((button) => button.addEventListener("click", downloadCsv));
  $("#summaryBtn").addEventListener("click", () => (location.hash = "summary"));
  $("#compareBtn").addEventListener("click", () => (location.hash = "compare"));
  $("#compareMode").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button || button.dataset.mode === state.compareMode) return;
    state.compareMode = button.dataset.mode;
    renderCompare();
  });
  $("#compareChoices").addEventListener("change", (event) => {
    const input = event.target;
    if (!input.matches("input[data-name]")) return;
    state.compareNames = input.checked ? [...state.compareNames, input.dataset.name] : state.compareNames.filter((name) => name !== input.dataset.name);
    renderCompare();
  });
  $("#assetList").addEventListener("click", (e) => {
    const b = e.target.closest(".nav");
    if (b) location.hash = `asset/${encodeURIComponent(b.dataset.name)}`;
  });
  $("#heatmap").addEventListener("click", (e) => {
    const td = e.target.closest("td.label");
    if (td) location.hash = `asset/${encodeURIComponent(td.dataset.name)}`;
  });
  $("#search").addEventListener("input", renderSidebar);
  $("#returnPeriod").addEventListener("click", (e) => {
    const button = e.target.closest("button[data-period]");
    if (!button || button.dataset.period === state.returnPeriod) return;
    state.returnPeriod = button.dataset.period;
    renderAsset(state.asset);
  });
  $("#assetTable").addEventListener("change", (e) => {
    if (e.target.id !== "cagrSelect") return;
    state.cagrYears = +e.target.value;
    renderAsset(state.asset, true);
  });
  document.querySelectorAll(".toolbar").forEach((bar) => bar.addEventListener("click", (e) => {
    const act = e.target.dataset.act;
    const c = state.charts[bar.dataset.chart];
    if (!act || !c) return;
    if (act === "in") zoom(c.chart, 0.7);
    if (act === "out") zoom(c.chart, 1.4);
    if (act === "fit") fit(c.chart);
    if (act === "all" || act === "none") {
      if (bar.dataset.chart === "compare") {
        state.compareNames = act === "all" ? [...state.names] : [];
        document.querySelectorAll("#compareChoices input").forEach((input) => (input.checked = act === "all"));
        renderCompare();
        return;
      }
      c.lines.forEach((l) => { l.visible = act === "all"; l.series.applyOptions({ visible: l.visible }); });
      c.renderLegend(null);
    }
  }));
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)) return;
    const chart = activeChart();
    if (!chart) return;
    if (e.key === "+" || e.key === "=") zoom(chart, 0.7);
    else if (e.key === "-") zoom(chart, 1.4);
    else if (e.key.toLowerCase() === "f") fit(chart);
  });
  window.addEventListener("hashchange", route);
}

async function init() {
  const res = await fetch("data.json", { cache: "no-store" });
  state.data = await res.json();
  state.names = Object.keys(state.data.assets);
  const years = [...new Set(state.names.flatMap((name) => state.data.assets[name].filter((row) => !row.avg).map((row) => row.year)))].sort((left, right) => left - right);
  state.firstYear = state.fromYear = years[0];
  state.lastYear = state.toYear = years[years.length - 1];
  document.querySelectorAll(".range-controls select").forEach((select) => {
    select.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join("");
    select.value = select.classList.contains("from-year") ? state.fromYear : state.toYear;
  });
  state.compareNames = state.names.filter((name, index) => name === "Nifty50" || index === 1);
  $("#compareChoices").innerHTML = "<legend>Indices</legend>" + state.names.map((name, index) => `<label><input type="checkbox" data-name="${esc(name)}" ${state.compareNames.includes(name) ? "checked" : ""}><span class="dot" style="background:${hsla((index * 137.508) % 360, 80, 62)}"></span>${esc(name)}</label>`).join("");
  const lastQ = Math.max(...state.names.flatMap((n) => state.data.assets[n].filter((r) => !r.avg).flatMap((r) => r.q.map((v, i) => (v == null ? -1 : r.year * 4 + i)))));
  state.asOf = `Q${(lastQ % 4) + 1} ${Math.floor(lastQ / 4)}`;
  const ageDays = (Date.now() - Date.parse(state.data.generated)) / 86400000;
  $("#freshness").textContent = `Data exported ${state.data.generated} · latest available quarter ${state.asOf}${ageDays > 45 ? " · export over 45 days old" : ""}`;
  $("#freshness").classList.toggle("stale", ageDays > 45);
  state.names.forEach((n) => (state.stats[n] = computeStats(state.data.assets[n])));
  $("#foot").textContent = `Data exported ${state.data.generated}`;
  bindUI();
  route();
}

init();
