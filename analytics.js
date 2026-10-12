(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./vendor/simple-statistics.min.js"));
  else root.SectorAnalytics = factory(root.ss);
})(typeof globalThis === "object" ? globalThis : this, function (statistics) {
  "use strict";

  const valid = (value) => Number.isFinite(value) && value >= -100;
  const monthKey = (value) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "")) return null;
    const [year, month] = value.split("-").map(Number);
    return year * 12 + month - 1;
  };
  const monthLabel = (key) => `${Math.floor(key / 12)}-${String(key % 12 + 1).padStart(2, "0")}`;
  const monthTime = (key) => {
    const year = Math.floor(key / 12), month = key % 12 + 1;
    return { year, month, day: new Date(Date.UTC(year, month, 0)).getUTCDate() };
  };

  function monthlyMap(data, name) {
    const result = new Map();
    const seen = new Set();
    for (const row of data.monthlyAssets?.[name] ?? []) {
      if (row.avg || !Number.isInteger(row.year)) continue;
      (row.m ?? []).forEach((value, index) => {
        if (index >= 12) return;
        const key = row.year * 12 + index;
        if (seen.has(key)) { result.delete(key); return; }
        seen.add(key);
        const time = monthTime(key);
        const end = `${monthLabel(key)}-${String(time.day).padStart(2, "0")}`;
        if (valid(value) && index < 12 && (!data.generated || end < data.generated)) result.set(key, value);
      });
    }
    return result;
  }

  function compound(map, start, end) {
    let product = 1;
    for (let key = start; key <= end; key++) {
      if (!valid(map.get(key))) return null;
      product *= 1 + map.get(key) / 100;
    }
    return (product - 1) * 100;
  }

  function commonHistory(maps, from = null, to = null) {
    if (!maps.length || maps.some((map) => !map.size)) return null;
    const candidates = [...maps[0].keys()].filter((key) => (from == null || key >= from) && (to == null || key <= to) && maps.every((map) => valid(map.get(key)))).sort((left, right) => left - right);
    if (!candidates.length) return null;
    const end = candidates.at(-1);
    let start = end;
    while ((from == null || start - 1 >= from) && maps.every((map) => valid(map.get(start - 1)))) start--;
    const earliest = Math.max(from ?? -Infinity, ...maps.map((map) => Math.min(...map.keys())));
    return { start, end, keys: Array.from({ length: end - start + 1 }, (_, index) => start + index), excluded: Math.max(0, start - earliest) };
  }

  function audit(data, name, tolerance = 0.1) {
    const map = monthlyMap(data, name);
    const keys = [...map.keys()].sort((left, right) => left - right);
    let invalid = 0, duplicates = 0;
    const seen = new Set();
    for (const row of data.monthlyAssets?.[name] ?? []) {
      if (row.avg || !Number.isInteger(row.year)) continue;
      (row.m ?? []).forEach((value, index) => {
        const key = row.year * 12 + index;
        if (seen.has(key)) duplicates++;
        seen.add(key);
        if (value != null && !valid(value)) invalid++;
      });
    }
    let checked = 0, maxDifference = null;
    const issues = [];
    for (const row of data.assets[name] ?? []) {
      if (row.avg || !Number.isInteger(row.year)) continue;
      (row.q ?? []).forEach((value, index) => {
        if (value != null && !valid(value)) invalid++;
        const start = row.year * 12 + index * 3;
        const monthly = compound(map, start, start + 2);
        if (monthly == null || !valid(value)) return;
        checked++;
        const difference = monthly - value;
        maxDifference = Math.max(maxDifference ?? 0, Math.abs(difference));
        if (Math.abs(difference) > tolerance) issues.push({ year: row.year, quarter: index + 1, monthly, quarterly: value, difference });
      });
    }
    return { name, first: keys[0] ?? null, last: keys.at(-1) ?? null, observations: keys.length, missing: keys.length ? keys.at(-1) - keys[0] + 1 - keys.length : 0, invalid, duplicates, checked, mismatches: issues.length, maxDifference, issues };
  }

  function risk(points, months) {
    const values = points.map((point) => point.value);
    let peak = values[0], maxDrawdown = 0;
    const returns = [];
    values.forEach((value, index) => {
      peak = Math.max(peak, value);
      if (peak > 0) maxDrawdown = Math.min(maxDrawdown, (value / peak - 1) * 100);
      if (index && values[index - 1] > 0) returns.push((value / values[index - 1] - 1) * 100);
    });
    return { finalValue: values.at(-1), cagr: months >= 12 ? ((values.at(-1) / values[0]) ** (12 / months) - 1) * 100 : null, volatility: returns.length >= 24 ? statistics.sampleStandardDeviation(returns) * Math.sqrt(12) : null, maxDrawdown };
  }

  function screen(data, options = {}) {
    const benchmark = monthlyMap(data, options.benchmark ?? "Nifty50");
    const window = options.window ?? 12;
    if (![12, 36, 60].includes(window)) return [];
    const endpoints = [...benchmark.keys()].filter((key) => (options.from == null || key >= options.from) && (options.to == null || key <= options.to)).sort((left, right) => left - right);
    const last = endpoints.at(-1);
    return Object.keys(data.assets).filter((name) => name !== (options.benchmark ?? "Nifty50")).map((name) => {
      const map = monthlyMap(data, name);
      const excess = endpoints.flatMap((end) => {
        const assetReturn = compound(map, end - window + 1, end);
        const benchmarkReturn = compound(benchmark, end - window + 1, end);
        return assetReturn == null || benchmarkReturn == null ? [] : [{ end, value: assetReturn - benchmarkReturn }];
      });
      const history = commonHistory([map, benchmark], options.from, options.to);
      const points = history ? [{ key: history.start - 1, value: 10000 }] : [];
      if (history) history.keys.forEach((key) => points.push({ key, value: points.at(-1).value * (1 + map.get(key) / 100) }));
      return { name, windows: excess.length, hitRate: excess.length ? excess.filter((point) => point.value > 0).length / excess.length * 100 : null, meanExcess: excess.length ? statistics.mean(excess.map((point) => point.value)) : null, latestExcess: excess.find((point) => point.end === last)?.value ?? null, last: excess.at(-1)?.end ?? null, maxDrawdown: history ? risk(points, history.keys.length).maxDrawdown : null, riskMonths: history?.keys.length ?? 0, riskStart: history?.start ?? null, riskEnd: history?.end ?? null };
    });
  }

  function correlations(data, names, from = null, to = null, minimum = 24) {
    const maps = names.map((name) => monthlyMap(data, name));
    const history = commonHistory(maps, from, to);
    const count = history?.keys.length ?? 0;
    const values = maps.map((map) => history?.keys.map((key) => map.get(key)) ?? []);
    const matrix = values.map((left) => values.map((right) => {
      if (count < minimum || new Set(left).size < 2 || new Set(right).size < 2) return null;
      const value = statistics.sampleCorrelation(left, right);
      return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : null;
    }));
    return { names, history, count, minimum, matrix };
  }

  function simulate(data, allocations, options = {}) {
    const totalWeight = statistics.sum(allocations.map((row) => row.weight));
    if (!allocations.length || allocations.some((row) => !Number.isFinite(row.weight) || row.weight < 0 || !data.assets[row.name]) || Math.abs(totalWeight - 100) > 0.000001) return { error: "Weights must be non-negative and total 100%." };
    if (new Set(allocations.map((row) => row.name)).size !== allocations.length) return { error: "Choose each index only once." };
    const amount = options.amount ?? 10000, costBps = options.costBps ?? 10, rebalance = options.rebalance ?? "quarterly";
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(costBps) || costBps < 0 || costBps > 500 || !["none", "monthly", "quarterly", "annual"].includes(rebalance)) return { error: "Enter a positive investment, costs from 0 to 500 bps, and a valid rebalance frequency." };
    if (options.from != null && options.to != null && options.from > options.to) return { error: "The start month must not be after the end month." };
    const active = allocations.filter((row) => row.weight > 0);
    const maps = active.map((row) => monthlyMap(data, row.name));
    const history = commonHistory(maps, options.from, options.to);
    if (!history) return { error: "No shared completed monthly history for these weights and dates." };
    const rate = costBps / 10000;
    let totalCost = amount * rate;
    let holdings = active.map((row) => (amount - totalCost) * row.weight / 100);
    const points = [{ key: history.start - 1, value: amount }];
    history.keys.forEach((key, index) => {
      holdings = holdings.map((value, position) => value * (1 + maps[position].get(key) / 100));
      const gross = statistics.sum(holdings);
      const due = rebalance === "monthly" || rebalance === "quarterly" && (key + 1) % 3 === 0 || rebalance === "annual" && (key + 1) % 12 === 0;
      if (due && index < history.keys.length - 1 && gross > 0) {
        let low = 0, high = gross;
        if (rate) {
          for (let iteration = 0; iteration < 48; iteration++) {
            const net = (low + high) / 2;
            const fee = rate * statistics.sum(holdings.map((value, position) => Math.abs(net * active[position].weight / 100 - value)));
            if (net + fee > gross) high = net;
            else low = net;
          }
        }
        const net = rate ? (low + high) / 2 : gross;
        totalCost += gross - net;
        holdings = active.map((row) => net * row.weight / 100);
      }
      points.push({ key, value: statistics.sum(holdings) });
    });
    const benchmarkMap = monthlyMap(data, "Nifty50");
    const benchmark = history.keys.every((key) => valid(benchmarkMap.get(key))) ? [{ key: history.start - 1, value: amount }] : [];
    let benchmarkValue = amount * (1 - rate);
    if (benchmark.length) history.keys.forEach((key) => { benchmarkValue *= 1 + benchmarkMap.get(key) / 100; benchmark.push({ key, value: benchmarkValue }); });
    return { history, points, benchmark, totalCost, allocations: active.map(({ name, weight }) => ({ name, weight })), settings: { amount, costBps, rebalance }, statistics: risk(points, history.keys.length), benchmarkStatistics: benchmark.length ? risk(benchmark, history.keys.length) : null };
  }

  return { monthKey, monthLabel, monthTime, monthlyMap, compound, commonHistory, audit, screen, correlations, simulate };
});