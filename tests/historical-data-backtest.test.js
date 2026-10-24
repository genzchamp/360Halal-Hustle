"use strict";
const assert = require("node:assert/strict");
const { normalizeYahooChart, splitChronologically } = require("../historical-data-backtest.js");
function payload(count = 140) {
  const timestamp = [], open = [], high = [], low = [], close = [], volume = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    timestamp.push(Date.UTC(2024, 0, 1 + i) / 1000);
    const o = price, c = price + (i % 4 === 0 ? -0.2 : 0.3);
    open.push(o); close.push(c); high.push(Math.max(o, c) + 0.5); low.push(Math.min(o, c) - 0.5);
    volume.push(1000 + i); price = c;
  }
  return { chart: { result: [{ timestamp, indicators: { quote: [{ open, high, low, close, volume }] } }] } };
}
const bars = normalizeYahooChart(payload());
assert.equal(bars.length, 140);
assert.equal(bars[0].close, 99.8);
const split = splitChronologically(bars);
assert.equal(split.train.length, 98);
assert.equal(split.test.length, 42);
assert.ok(split.train.at(-1).time < split.test[0].time);
assert.throws(() => normalizeYahooChart({ chart: { result: null, error: { code: "Not Found" } } }), /YAHOO_CHART_NO_RESULT/);
assert.throws(() => splitChronologically(bars, 0.4), /INVALID_CHRONOLOGICAL_SPLIT/);
assert.throws(() => normalizeYahooChart(payload(40)), /INSUFFICIENT_VALID_HISTORICAL_BARS/);
console.log("Historical data tests passed: provider parsing, OHLCV validation, chronological split, and fail-closed errors.");
