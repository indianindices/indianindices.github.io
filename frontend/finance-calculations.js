(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./vendor/financial.min.js"));
  else root.InvestmentCalculator = factory(root.FinancialMath);
})(typeof globalThis === "object" ? globalThis : this, function (finance) {
  "use strict";

  function monthTime(start, offset) {
    const [year, month] = start.split("-").map(Number);
    const end = new Date(Date.UTC(year, month + offset, 0));
    return { year: end.getUTCFullYear(), month: end.getUTCMonth() + 1, day: end.getUTCDate() };
  }

  function project(options) {
    const { mode, amount, annualReturn, years, start } = options;
    const stepUp = mode === "lumpsum" ? 0 : options.stepUp ?? 0;
    const withdrawal = options.withdrawal ?? 0;
    const timing = mode === "sip" ? options.timing ?? "begin" : "end";
    if (!["sip", "lumpsum", "swp"].includes(mode)) return { error: "Choose SIP, LumpSum or SWP." };
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000000000) return { error: "Enter an investment from INR 1 to 100 crore." };
    if (!Number.isFinite(annualReturn) || annualReturn < -50 || annualReturn > 50) return { error: "Enter an assumed annual return from -50% to 50%." };
    if (!Number.isInteger(years) || years < 1 || years > 50) return { error: "Enter a whole-number duration from 1 to 50 years." };
    if (!Number.isFinite(stepUp) || stepUp < 0 || stepUp > 50) return { error: "Enter an annual increase from 0% to 50%." };
    if (mode === "swp" && (!Number.isFinite(withdrawal) || withdrawal < 1 || withdrawal > 1000000000)) return { error: "Enter a monthly withdrawal from INR 1 to 100 crore." };
    if (!["begin", "end"].includes(timing)) return { error: "Choose beginning- or end-of-month contributions." };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start ?? "") || Number(start.slice(0, 4)) < 1900 || Number(start.slice(0, 4)) > 2100) return { error: "Choose a start month between 1900 and 2100." };
    const monthlyRate = Math.expm1(Math.log1p(annualReturn / 100) / 12);
    const due = timing === "begin" ? finance.PaymentDueTime.Begin : finance.PaymentDueTime.End;
    let balance = mode === "sip" ? 0 : amount;
    let invested = balance, withdrawn = 0, shortfall = 0, depletedAt = null;
    const points = [{ month: 0, time: monthTime(start, -1), opening: balance, contribution: 0, withdrawal: 0, requestedWithdrawal: 0, growth: 0, balance, invested, withdrawn, shortfall }];
    const yearly = [];
    for (let month = 1; month <= years * 12; month++) {
      const opening = balance;
      const increase = (1 + stepUp / 100) ** Math.floor((month - 1) / 12);
      const contribution = mode === "sip" ? amount * increase : 0;
      const requestedWithdrawal = mode === "swp" ? withdrawal * increase : 0;
      let paid = 0;
      if (mode === "swp") {
        const available = Math.max(0, -finance.fv(monthlyRate, 1, 0, opening));
        paid = Math.min(requestedWithdrawal, available);
        balance = Math.max(0, available - paid);
        withdrawn += paid;
        shortfall += requestedWithdrawal - paid;
        if (balance === 0 && depletedAt == null) depletedAt = month;
      } else {
        balance = -finance.fv(monthlyRate, 1, contribution, opening, due);
        invested += contribution;
      }
      if (![balance, invested, withdrawn, shortfall].every(Number.isFinite)) return { error: "These assumptions exceed the supported numerical range." };
      const point = { month, time: monthTime(start, month - 1), opening, contribution, withdrawal: paid, requestedWithdrawal, growth: balance - opening - contribution + paid, balance, invested, withdrawn, shortfall };
      points.push(point);
      if (month % 12 === 0) yearly.push({ year: month / 12, ...point });
    }
    return { settings: { mode, amount, annualReturn, years, start, stepUp, withdrawal: mode === "swp" ? withdrawal : 0, timing }, monthlyRate, points, yearly, balance, invested, withdrawn, shortfall, depletedAt, gains: balance + withdrawn - invested };
  }

  return { project, monthTime };
});