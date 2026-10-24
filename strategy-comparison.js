"use strict";
// Compares research-only variants on identical chronological data. No orders are sent.
const { fetchHistoricalBars, splitChronologically, evaluateSegment } = require("./historical-data-backtest.js");
const VARIANTS = Object.freeze([
  { id: "baseline", description: "EMA trend + 20-candle breakout + RSI + volume + ATR risk" },
  { id: "bollinger", description: "EMA trend + Bollinger upper-band breakout with expanding band width + RSI + volume + ATR risk" },
  { id: "fibonacci", description: "EMA trend + Fibonacci 38.2%-61.8% pullback zone with upward close confirmation + RSI + volume + ATR risk" },
  { id: "combined", description: "EMA trend + Fibonacci pullback + expanding Bollinger width + RSI + volume + ATR risk" }
]);
async function compareStrategies(symbol = "AAPL", range = "2y") {
  const bars = await fetchHistoricalBars(symbol, { range });
  const split = splitChronologically(bars);
  const config = { capital: 10000, riskPct: 0.01, feeBps: 5, slippageBps: 5 };
  const results = VARIANTS.map(variant => {
    const variantConfig = { ...config, strategyVariant: variant.id };
    return {
      strategy: variant.id,
      description: variant.description,
      inSample: evaluateSegment(split.train, variantConfig),
      outOfSample: evaluateSegment(bars, variantConfig, split.splitIndex)
    };
  });
  return {
    reportVersion: "oba-strategy-comparison-1.0.0",
    generatedAt: new Date().toISOString(),
    symbol: String(symbol).toUpperCase(),
    provider: "Yahoo Finance chart endpoint",
    range,
    interval: "1d",
    split: { method: "chronological 70/30", sourceBars: bars.length, trainBars: split.train.length, testBars: split.test.length, testStart: split.splitTimestamp },
    config,
    variants: results,
    warnings: [
      "Research only: no orders are sent.",
      "All variants use identical data periods, starting capital, and estimated fee/slippage assumptions.",
      "A small number of trades makes results inconclusive; compare trade counts and out-of-sample results, not returns alone.",
      "Do not tune variants repeatedly against the same out-of-sample period.",
      "Yahoo Finance data may be delayed, revised, incomplete, or subject to provider terms.",
      "Adjusted-close factors and corporate actions can distort intraday execution assumptions when only daily candles are used.",
      "No Shariah screening or scholar approval is performed."
    ]
  };
}
async function main(argv = process.argv.slice(2)) {
  const symbol = String(argv[0] || "AAPL").toUpperCase();
  const range = argv[1] || "2y";
  const report = await compareStrategies(symbol, range);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
module.exports = { VARIANTS, compareStrategies, main };
if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ error: error.message || "STRATEGY_COMPARISON_FAILED", liveExecution: false }));
    process.exitCode = 1;
  });
}
