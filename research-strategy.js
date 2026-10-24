/* OBA AI Trader research-only strategy. No order execution or Shariah approval. */
(function(root){
"use strict";
const VERSION="oba-breakout-trend-research-1.0.0";
const DEFAULTS={capital:10000,riskPct:0.01,feeBps:5,slippageBps:5,emaFast:20,emaSlow:50,rsiPeriod:14,atrPeriod:14,volumePeriod:20,breakoutPeriod:20,stopAtr:2,rewardRisk:2,maxExposure:0.95};
function barsOf(input){
 if(!Array.isArray(input))throw Error("BARS_MUST_BE_ARRAY");
 const bars=input.map((b,i)=>({time:String(b.timestamp??b.time??i),open:+b.open,high:+b.high,low:+b.low,close:+b.close,volume:+b.volume}));
 for(let i=0;i<bars.length;i++){const b=bars[i];if(![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.open<=0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close)||b.volume<0)throw Error("INVALID_OHLCV_BAR_"+i);if(i&&bars[i].time<bars[i-1].time)throw Error("BARS_NOT_CHRONOLOGICAL");}
 return bars;
}
function indicators(b,c){
 const n=b.length,cl=b.map(x=>x.close),vol=b.map(x=>x.volume),fast=Array(n).fill(null),slow=Array(n).fill(null),rsi=Array(n).fill(null),atr=Array(n).fill(null),volAvg=Array(n).fill(null),breakHigh=Array(n).fill(null);
 function ema(p,out){if(n<p)return;let x=cl.slice(0,p).reduce((a,v)=>a+v,0)/p;out[p-1]=x;const k=2/(p+1);for(let i=p;i<n;i++){x=cl[i]*k+x*(1-k);out[i]=x;}}
 ema(c.emaFast,fast);ema(c.emaSlow,slow);
 if(n>c.rsiPeriod){let g=0,l=0;for(let i=1;i<=c.rsiPeriod;i++){const d=cl[i]-cl[i-1];g+=Math.max(0,d);l+=Math.max(0,-d);}g/=c.rsiPeriod;l/=c.rsiPeriod;rsi[c.rsiPeriod]=l===0?100:100-100/(1+g/l);for(let i=c.rsiPeriod+1;i<n;i++){const d=cl[i]-cl[i-1];g=(g*(c.rsiPeriod-1)+Math.max(0,d))/c.rsiPeriod;l=(l*(c.rsiPeriod-1)+Math.max(0,-d))/c.rsiPeriod;rsi[i]=l===0?100:100-100/(1+g/l);}}
 const tr=b.map((x,i)=>i?Math.max(x.high-x.low,Math.abs(x.high-cl[i-1]),Math.abs(x.low-cl[i-1])):x.high-x.low);
 for(let i=c.atrPeriod-1;i<n;i++)atr[i]=tr.slice(i-c.atrPeriod+1,i+1).reduce((a,v)=>a+v,0)/c.atrPeriod;
 for(let i=c.volumePeriod-1;i<n;i++)volAvg[i]=vol.slice(i-c.volumePeriod+1,i+1).reduce((a,v)=>a+v,0)/c.volumePeriod;
 for(let i=c.breakoutPeriod;i<n;i++)breakHigh[i]=Math.max(...b.slice(i-c.breakoutPeriod,i).map(x=>x.high));
 return{fast,slow,rsi,atr,volAvg,breakHigh};
}
function signal(input,opts={}){const c={...DEFAULTS,...opts},b=barsOf(input),need=Math.max(c.emaSlow,c.rsiPeriod+1,c.atrPeriod,c.volumePeriod,c.breakoutPeriod+1)+1;if(b.length<need)return{version:VERSION,signal:"WAIT",reason:"INSUFFICIENT_HISTORY",requiredBars:need};const z=indicators(b,c),i=b.length-1,x=b[i],checks=[["TREND",z.fast[i]!=null&&z.slow[i]!=null&&z.fast[i]>z.slow[i]&&x.close>z.slow[i]],["BREAKOUT",z.breakHigh[i]!=null&&x.close>z.breakHigh[i]],["RSI",z.rsi[i]!=null&&z.rsi[i]>=50&&z.rsi[i]<=70],["VOLUME",z.volAvg[i]!=null&&x.volume>z.volAvg[i]],["ATR",z.atr[i]!=null&&z.atr[i]>0]];return{version:VERSION,signal:checks.every(x=>x[1])?"BUY_CANDIDATE":"WAIT",time:x.time,close:x.close,atr:z.atr[i],rsi:z.rsi[i],checks:checks.map(x=>({rule:x[0],passed:x[1]})),note:"Research signal only; not an order, forecast, or Shariah approval."};}
function backtest(input,opts={}){const c={...DEFAULTS,...opts},b=barsOf(input);if(!(c.capital>0&&c.riskPct>0&&c.riskPct<=0.02&&c.maxExposure>0&&c.maxExposure<=1&&c.stopAtr>0&&c.rewardRisk>0&&c.feeBps>=0&&c.slippageBps>=0))throw Error("INVALID_BACKTEST_CONFIG");const need=Math.max(c.emaSlow,c.rsiPeriod+1,c.atrPeriod,c.volumePeriod,c.breakoutPeriod+1)+2;if(b.length<need)throw Error("INSUFFICIENT_HISTORY_NEED_"+need+"_BARS");const evaluationStartIndex=Number.isInteger(opts.evaluationStartIndex)?opts.evaluationStartIndex:0;if(evaluationStartIndex<0||evaluationStartIndex>=b.length)throw Error("INVALID_EVALUATION_START_INDEX");const z=indicators(b,c),cost=(c.feeBps+c.slippageBps)/10000;let cash=c.capital,peak=cash,maxDD=0,pos=null,wins=0,gp=0,gl=0,costs=0;const trades=[],curve=[];
 function close(price,i,why){const p=pos,entryCost=p.entry*p.qty*cost,exitCost=price*p.qty*cost,gross=(price-p.entry)*p.qty,net=gross-entryCost-exitCost;cash+=gross-entryCost-exitCost;costs+=entryCost+exitCost;if(net>0){wins++;gp+=net;}else gl+=Math.abs(net);trades.push({entryTime:b[p.i].time,exitTime:b[i].time,entry:p.entry,exit:price,quantity:p.qty,pnl:net,costs:entryCost+exitCost,reason:why});pos=null;}
 for(let i=Math.max(need-1,evaluationStartIndex-1);i<b.length;i++){const x=b[i];if(pos){if(x.open<=pos.stop)close(x.open,i,"GAP_STOP");else if(x.low<=pos.stop)close(pos.stop,i,"STOP");else if(x.open>=pos.target)close(x.open,i,"GAP_TARGET");else if(x.high>=pos.target)close(pos.target,i,"TARGET");}
 if(!pos&&i<b.length-1){const s=signal(b.slice(0,i+1),c);if(s.signal==="BUY_CANDIDATE"&&z.atr[i]>0){const entry=b[i+1].open,stop=entry-z.atr[i]*c.stopAtr,risk=entry-stop,qty=Math.max(0,Math.min(Math.floor(cash*c.riskPct/risk),Math.floor(cash*c.maxExposure/entry)));if(qty>0&&stop>0)pos={entry,stop,target:entry+risk*c.rewardRisk,qty,i:i+1};}}
 if(i>=evaluationStartIndex){const eq=cash+(pos?(x.close-pos.entry)*pos.qty-pos.entry*pos.qty*cost:0);peak=Math.max(peak,eq);maxDD=Math.max(maxDD,peak?(peak-eq)/peak:0);curve.push({time:x.time,equity:eq});}}
 if(pos){close(b[b.length-1].close,b.length-1,"END_OF_DATA");const last=curve[curve.length-1];if(last){last.equity=cash;peak=Math.max(peak,cash);maxDD=Math.max(maxDD,peak?(peak-cash)/peak:0);}}const net=cash-c.capital;return{version:VERSION,candles:b.length-evaluationStartIndex,trades:trades.length,startingCapital:c.capital,endingEquity:cash,netProfit:net,returnPct:net/c.capital,winRate:trades.length?wins/trades.length:0,expectancy:trades.length?net/trades.length:0,profitFactor:gl?gp/gl:gp?null:0,maxDrawdownPct:maxDD,costsPaid:costs,tradeLog:trades,equityCurve:curve,limitations:["Research only; no orders are sent.","No Shariah determination is made.","Backtests do not predict future returns.","Verify data quality and test out of sample."]};}
const api={VERSION,DEFAULTS,signal,backtest,barsOf,indicators};if(typeof module!=="undefined"&&module.exports)module.exports=api;root.OBA_RESEARCH_STRATEGY=api;
})(typeof window!=="undefined"?window:globalThis);
