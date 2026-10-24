"use strict";
const assert = require("node:assert/strict");
const strategy = require("../research-strategy.js");
const { VARIANTS } = require("../strategy-comparison.js");
assert.deepEqual(VARIANTS.map(x => x.id), ["baseline", "bollinger", "fibonacci", "combined"]);
const expectedSetupRules = {
  baseline: "BREAKOUT",
  bollinger: "BOLLINGER_BREAKOUT_EXPANSION",
  fibonacci: "FIBONACCI_PULLBACK_REVERSAL",
  combined: "FIBONACCI_PULLBACK_BOLLINGER_EXPANSION"
};
const bars = [];
let price = 100;
for (let i = 0; i < 240; i++) {
  // Alternating rises and pullbacks exercise more than one market shape.
  const change = i % 7 < 4 ? 0.7 : -0.35;
  const open = price;
  const close = Math.max(1, price + change);
  const high = Math.max(open, close) + 0.25;
  const low = Math.min(open, close) - 0.25;
  const volume = 1000 + (i % 11) * 150;
  bars.push({ timestamp: new Date(Date.UTC(2024, 0, 1 + i)).toISOString(), open, high, low, close, volume });
  price = close;
}
for (const variant of VARIANTS) {
  const options = { strategyVariant: variant.id, emaFast: 5, emaSlow: 12, rsiPeriod: 5, atrPeriod: 5, volumePeriod: 5, breakoutPeriod: 10, bollingerPeriod: 10, fibonacciPeriod: 20, capital: 10000, riskPct: 0.01, feeBps: 5, slippageBps: 5 };
  const signal = strategy.signal(bars, options);
  assert.equal(signal.strategyVariant, variant.id);
  assert.ok(signal.checks.some(check => check.rule === expectedSetupRules[variant.id]), variant.id + " must route through its own setup rule");
  assert.ok(["WAIT", "BUY_CANDIDATE"].includes(signal.signal), variant.id + " should return a known signal");

  // Behavioral regression: across many rolling prefixes, the named setup check
  // must match that variant's actual indicator condition, not merely its label.
  let checkedPrefixes = 0;
  for (let end = 30; end <= bars.length; end += 3) {
    const prefix = bars.slice(0, end);
    const current = strategy.signal(prefix, options);
    if (!current.checks) continue;
    const z = strategy.indicators(prefix, { ...strategy.DEFAULTS, ...options });
    const i = prefix.length - 1;
    const last = prefix[i];
    const range = z.fibHigh[i] != null && z.fibLow[i] != null ? z.fibHigh[i] - z.fibLow[i] : 0;
    const fib382 = z.fibHigh[i] - range * 0.382;
    const fib618 = z.fibHigh[i] - range * 0.618;
    const expected = {
      baseline: z.breakHigh[i] != null && last.close > z.breakHigh[i],
      bollinger: z.bbUpper[i] != null && last.close > z.bbUpper[i] && z.bbWidth[i] != null && z.bbWidth[i - 1] != null && z.bbWidth[i] > z.bbWidth[i - 1],
      fibonacci: range > 0 && last.close <= fib382 && last.close >= fib618 && i > 0 && last.close > prefix[i - 1].close,
      combined: range > 0 && last.close <= fib382 && last.close >= fib618 && i > 0 && last.close > prefix[i - 1].close && z.bbWidth[i] != null && z.bbWidth[i - 1] != null && z.bbWidth[i] > z.bbWidth[i - 1]
    }[variant.id];
    const setupCheck = current.checks.find(check => check.rule === expectedSetupRules[variant.id]);
    assert.ok(setupCheck, variant.id + " must expose its setup check on every warmed-up prefix");
    assert.equal(setupCheck.passed, expected, variant.id + " setup behavior mismatch at prefix length " + end);
    checkedPrefixes++;
  }
  assert.ok(checkedPrefixes >= 50, variant.id + " should be exercised across many market prefixes");

  const result = strategy.backtest(bars, options);
  for (const key of ["endingEquity", "netProfit", "returnPct", "maxDrawdownPct", "costsPaid"]) assert.ok(Number.isFinite(result[key]), variant.id + " " + key);
  assert.ok(result.tradeLog.every(t => Number.isFinite(t.pnl) && t.quantity > 0), variant.id + " trade log");
}
assert.equal(strategy.signal(bars, { strategyVariant: "not-real" }).reason, "UNKNOWN_STRATEGY_VARIANT");
console.log("Strategy comparison tests passed: all four variants match their setup conditions across rolling market prefixes and produce valid cost-aware backtest metrics.");
