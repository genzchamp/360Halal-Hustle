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
  const result = strategy.backtest(bars, options);
  for (const key of ["endingEquity", "netProfit", "returnPct", "maxDrawdownPct", "costsPaid"]) assert.ok(Number.isFinite(result[key]), variant.id + " " + key);
  assert.ok(result.tradeLog.every(t => Number.isFinite(t.pnl) && t.quantity > 0), variant.id + " trade log");
}
assert.equal(strategy.signal(bars, { strategyVariant: "not-real" }).reason, "UNKNOWN_STRATEGY_VARIANT");
console.log("Strategy comparison tests passed: all four variants produce valid research signals and cost-aware backtest metrics.");
