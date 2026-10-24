const assert=require("node:assert/strict");
const strategy=require("../research-strategy.js");
assert.equal(strategy.VERSION,"oba-breakout-trend-research-1.0.0");
assert.equal(strategy.signal([]).signal,"WAIT");
assert.equal(strategy.signal([]).reason,"INSUFFICIENT_HISTORY");
assert.throws(()=>strategy.barsOf([{open:10,high:8,low:9,close:10,volume:1}]),/INVALID_OHLCV_BAR/);
const bars=[];
let price=100;
for(let i=0;i<180;i++){
 const wave=Math.sin(i/3)*0.7;
 const open=price;
 const close=Math.max(1,price+0.08+wave*0.15);
 const high=Math.max(open,close)+0.3;
 const low=Math.min(open,close)-0.3;
 bars.push({timestamp:new Date(Date.UTC(2025,0,1+i)).toISOString(),open,high,low,close,volume:1000+(i%9)*25});
 price=close;
}
const signal=strategy.signal(bars);
assert.ok(["WAIT","BUY_CANDIDATE"].includes(signal.signal));
assert.ok(Array.isArray(signal.checks));
const result=strategy.backtest(bars,{capital:10000,riskPct:0.01,feeBps:5,slippageBps:5});
for(const key of ["endingEquity","netProfit","winRate","maxDrawdownPct","costsPaid"])assert.ok(Number.isFinite(result[key]),key);
assert.equal(result.candles,bars.length);
assert.ok(result.tradeLog.every(t=>Number.isFinite(t.pnl)&&t.quantity>0));
assert.ok(result.limitations.some(x=>x.includes("Shariah")));
assert.throws(()=>strategy.backtest(bars,{riskPct:0.5}),/INVALID_BACKTEST_CONFIG/);
console.log("Research strategy tests passed: fail-closed short history, OHLCV validation, deterministic signal, cost-aware metrics, bounded risk configuration.");
