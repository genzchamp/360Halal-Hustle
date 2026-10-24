"use strict";
// Fetches real Yahoo Finance daily candles and evaluates a research-only strategy.
// No orders are sent. Data availability/licensing and Yahoo endpoint stability may vary.
const strategy = require("./research-strategy.js");
const ALLOWED_SYMBOLS = new Set(["AAPL", "MSFT", "TSLA", "NVDA"]);
const DEFAULTS = Object.freeze({ range: "2y", interval: "1d", trainFraction: 0.7 });

function normalizeYahooChart(payload) {
  const result = payload && payload.chart && payload.chart.result && payload.chart.result[0];
  if (!result) {
    const code = payload && payload.chart && payload.chart.error && payload.chart.error.code;
    throw new Error("YAHOO_CHART_NO_RESULT" + (code ? "_" + String(code).replace(/[^A-Za-z0-9_-]/g, "") : ""));
  }
  const timestamps = result.timestamp || [];
  const indicators = result.indicators || {};
  const quote = indicators.quote && indicators.quote[0];
  if (!quote) throw new Error("YAHOO_CHART_MISSING_OHLCV");
  const adjusted = indicators.adjclose && indicators.adjclose[0] && indicators.adjclose[0].adjclose;
  const bars = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open && quote.open[i], high = quote.high && quote.high[i];
    const low = quote.low && quote.low[i], close = quote.close && quote.close[i];
    const volume = quote.volume && quote.volume[i];
    if (![open, high, low, close, volume].every(Number.isFinite) || close <= 0) continue;
    const adjClose = adjusted && adjusted[i];
    const factor = Number.isFinite(adjClose) && adjClose > 0 ? adjClose / close : 1;
    bars.push({ timestamp: new Date(timestamps[i] * 1000).toISOString(), open: open * factor, high: high * factor, low: low * factor, close: close * factor, volume });
  }
  if (bars.length < 100) throw new Error("INSUFFICIENT_VALID_HISTORICAL_BARS_" + bars.length);
  // Reuse the strategy's OHLCV and chronology validator before accepting provider data.
  return strategy.barsOf(bars);
}

function splitChronologically(bars, fraction = DEFAULTS.trainFraction) {
  if (!Array.isArray(bars) || !Number.isFinite(fraction) || fraction < 0.5 || fraction > 0.85) {
    throw new Error("INVALID_CHRONOLOGICAL_SPLIT");
  }
  const splitIndex = Math.floor(bars.length * fraction);
  const train = bars.slice(0, splitIndex);
  const test = bars.slice(splitIndex);
  const minimum = Math.max(strategy.DEFAULTS.emaSlow, strategy.DEFAULTS.breakoutPeriod + 1, strategy.DEFAULTS.rsiPeriod + 1) + 2;
  if (train.length < minimum || test.length < minimum) throw new Error("INSUFFICIENT_DATA_FOR_TRAIN_TEST_SPLIT");
  return { train, test, splitIndex, splitTimestamp: test[0].time };
}

function evaluateSegment(bars, config, evaluationStartIndex = 0) {
  const metrics = strategy.backtest(bars, { ...config, evaluationStartIndex });
  const evaluatedBars = bars.slice(evaluationStartIndex);
  return {
    candles: evaluatedBars.length,
    firstCandle: evaluatedBars[0].time,
    lastCandle: evaluatedBars[evaluatedBars.length - 1].time,
    trades: metrics.trades,
    startingCapital: metrics.startingCapital,
    endingEquity: metrics.endingEquity,
    netProfit: metrics.netProfit,
    returnPct: metrics.returnPct,
    winRate: metrics.winRate,
    expectancy: metrics.expectancy,
    profitFactor: metrics.profitFactor,
    maxDrawdownPct: metrics.maxDrawdownPct,
    costsPaid: metrics.costsPaid,
    tradeLog: metrics.tradeLog,
    limitations: metrics.limitations
  };
}

async function fetchHistoricalBars(symbol, options = {}) {
  const ticker = String(symbol || "").toUpperCase();
  if (!ALLOWED_SYMBOLS.has(ticker)) throw new Error("UNSUPPORTED_SYMBOL");
  const range = options.range || DEFAULTS.range;
  const interval = options.interval || DEFAULTS.interval;
  if (!["1y", "2y", "5y"].includes(range) || !["1d"].includes(interval)) {
    throw new Error("UNSUPPORTED_RANGE_OR_INTERVAL");
  }
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ticker)
    + "?range=" + encodeURIComponent(range) + "&interval=" + encodeURIComponent(interval)
    + "&events=div%2Csplits";
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 OBA-AI-Trader-Research/1.0" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("YAHOO_PROVIDER_HTTP_" + response.status);
  return normalizeYahooChart(await response.json());
}

async function main(argv = process.argv.slice(2)) {
  const symbol = String(argv[0] || "AAPL").toUpperCase();
  const range = argv[1] || DEFAULTS.range;
  const bars = await fetchHistoricalBars(symbol, { range });
  const split = splitChronologically(bars);
  const config = { capital: 10000, riskPct: 0.01, feeBps: 5, slippageBps: 5 };
  const report = {
    reportVersion: "oba-historical-research-report-1.0.0",
    generatedAt: new Date().toISOString(),
    symbol,
    provider: "Yahoo Finance chart endpoint",
    priceAdjustment: "Adjusted-close factor applied to OHLC when supplied by provider; otherwise raw OHLC",
    interval: "1d",
    range,
    sourceBars: bars.length,
    split: { method: "chronological 70/30", trainBars: split.train.length, testBars: split.test.length, testStart: split.splitTimestamp },
    strategyVersion: strategy.VERSION,
    config,
    inSample: evaluateSegment(split.train, config),
    outOfSample: evaluateSegment(bars, config, split.splitIndex),
    warnings: [
      "Research only: this script does not submit orders.",
      "Out-of-sample indicators use only candles available up to each date, including pre-split history for warm-up; trades and metrics begin at the test boundary.",
      "This is a single-symbol, daily-bar test, not a diversified portfolio or proof of future returns.",
      "Estimated fees and slippage are configurable assumptions, not verified broker costs.",
      "Yahoo Finance data may be delayed, revised, incomplete, or subject to provider terms.",
      "Corporate actions, dividends, survivorship bias, parameter overfitting, taxes, spreads, and market impact may affect results.",
      "No Shariah screening or scholar approval is performed."
    ]
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

module.exports = { normalizeYahooChart, splitChronologically, evaluateSegment, fetchHistoricalBars, main };
if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ error: error.message || "HISTORICAL_BACKTEST_FAILED", liveExecution: false }));
    process.exitCode = 1;
  });
}
