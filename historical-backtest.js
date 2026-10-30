(function(){
const KEY='oba_ai_trader_historical_bt_v2';
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function money(n){return '$'+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function pct(n){return (Number(n||0)*100).toFixed(2)+'%';}
function overlay(){let x=document.getElementById('hbModal');if(x)return x;x=document.createElement('div');x.id='hbModal';x.className='modal';x.innerHTML='<div class="box hbbox"><button class="x" onclick="closeHistoricalBacktest()">×</button><div class="ey">HISTORICAL BACKTEST V2</div><h3>Test your rules on candle data</h3><p>Import OHLCV CSV from a trusted historical-data source. The engine runs locally in your browser. The demo sample is synthetic, not real market history.</p><div class="formgrid"><label>Market<select id="hbSymbol"><option value="AAPL">Apple · AAPL</option><option value="MSFT">Microsoft · MSFT</option><option value="NVDA">NVIDIA · NVDA</option><option value="TSLA">Tesla · TSLA</option><option value="AMZN">Amazon · AMZN</option><option value="GOOGL">Alphabet · GOOGL</option><option value="META">Meta · META</option><option value="AMD">AMD · AMD</option><option value="INTC">Intel · INTC</option><option value="NFLX">Netflix · NFLX</option><option value="SPY">S&P 500 ETF · SPY</option><option value="QQQ">Nasdaq 100 ETF · QQQ</option><option value="BTC-USD">Bitcoin · BTC-USD</option><option value="ETH-USD">Ethereum · ETH-USD</option><option value="SOL-USD">Solana · SOL-USD</option><option value="BNB-USD">BNB · BNB-USD</option><option value="XRP-USD">XRP · XRP-USD</option></select></label><label>Test period<select id="hbRange"><option value="1d">24 hours</option><option value="2d">2 days</option><option value="3d">3 days</option><option value="5d">5 days</option><option value="1w">1 week</option><option value="1mo">1 month</option><option value="3mo">3 months</option><option value="6mo">6 months</option><option value="1y">1 year</option><option value="2y">2 years</option><option value="5y" selected>5 years</option><option value="10y">10 years</option><option value="max">Maximum available</option></select></label><label>Starting capital<input id="hbCapital" type="number" value="10000" min="1"></label><label>Risk / trade %<input id="hbRisk" type="number" value="1" min="0.01" max="10" step="0.1"></label><label>Stop loss %<input id="hbSL" type="number" value="2" min="0.1" max="50" step="0.1"></label><label>Take profit %<input id="hbTP" type="number" value="4.8" min="0.1" max="100" step="0.1"></label></div><div class="actions"><button class="btn primary" onclick="loadHistoricalMarketData()">Load selected market history</button><label class="btn ghost" style="display:inline-block"><input id="hbFile" type="file" accept=".csv,text/csv" style="display:none">Import CSV</label><button class="btn ghost" onclick="loadHistoricalSample()">Load synthetic demo sample</button><button class="btn primary" onclick="runHistoricalBacktest()">Run backtest</button></div><div id="hbData" class="paper-note" style="margin-top:12px">No candles loaded.</div><div id="hbOut"></div><section class="paper-note" style="margin-top:14px"><b>Automatically saved test history</b><p id="hbSaveStatus">Each run is saved in this browser. Sign in to sync your test history privately to your OBA account.</p><div class="actions"><button class="btn ghost" type="button" onclick="loadSavedBacktestHistory()">Refresh saved history</button><button class="btn ghost" type="button" onclick="exportBacktestHistory()">Export test history CSV</button></div><div id="hbHistoryList" class="tablewrap" style="margin-top:10px">No saved runs yet.</div></section></div>';document.body.appendChild(x);x.onclick=e=>{if(e.target===x)closeHistoricalBacktest()};document.getElementById('hbFile').addEventListener('change',e=>{const f=e.target.files[0];if(f)f.text().then(t=>setHistoricalData(parseCSV(t),'Imported: '+f.name)).catch(()=>setHistoricalData([],'Could not read file.'))});return x;}
function openHistoricalBacktest(){overlay().classList.add('open');loadSavedBacktestHistory()}
function closeHistoricalBacktest(){const x=document.getElementById('hbModal');if(x)x.classList.remove('open')}
function parseCSV(text){const lines=text.trim().split(/\r?\n/).filter(Boolean);if(lines.length<2)return[];const head=lines[0].split(',').map(x=>x.trim().toLowerCase());const idx=k=>head.indexOf(k);const ti=idx('timestamp')>=0?idx('timestamp'):idx('time');const oi=idx('open'),hi=idx('high'),li=idx('low'),ci=idx('close'),vi=idx('volume');if([oi,hi,li,ci].some(x=>x<0))return[];return lines.slice(1).map(line=>line.split(',')).map(r=>({timestamp:ti>=0?r[ti]:'',open:+r[oi],high:+r[hi],low:+r[li],close:+r[ci],volume:vi>=0?+r[vi]:0})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.high>=c.low&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close));}
function setHistoricalData(data,label){window.OBA_HB_DATA=data;if(!String(label||'').startsWith('Provider history:'))window.OBA_HB_SYMBOL=null;const el=document.getElementById('hbData');if(el)el.textContent=data.length?(label+' · '+data.length+' valid candles loaded.'):'No valid candles found. Required columns: timestamp, open, high, low, close, volume.';}
function sample(){let p=100,out=[];for(let i=0;i<220;i++){const drift=i<90?0.001:i<150?-0.0002:0.0007;const wave=Math.sin(i/6)*0.012;const ret=drift+wave+(Math.sin(i*3.1)*0.004);const o=p;p=p*(1+ret);const c=p;const h=Math.max(o,c)*(1+0.004+Math.abs(Math.sin(i))*0.003);const l=Math.min(o,c)*(1-0.004-Math.abs(Math.cos(i))*0.003);out.push({timestamp:'Sample '+(i+1),open:o,high:h,low:l,close:c,volume:1000+i*7});}return out;}
function loadHistoricalSample(){setHistoricalData(sample(),'SYNTHETIC DEMO ONLY — not real market history');}
async function loadHistoricalMarketData(){
 const symbol=document.getElementById('hbSymbol')?.value||'AAPL';
 const period=document.getElementById('hbRange')?.value||'5y';
 const intradayDays=['1d','2d','3d','5d'].includes(period);
 const interval=intradayDays?'5m':period==='1w'?'15m':'1d';
 const providerRange=intradayDays?(period==='1d'?'1d':'5d'):period==='1w'?'1mo':period;
 const status=document.getElementById('hbData');
 if(status)status.textContent='Loading '+symbol+' historical candles ('+period+', '+interval+' candles)…';
 try{
  if(typeof OBA_API_BASE==='undefined')throw new Error('Market-data API configuration is unavailable.');
  const response=await fetch(OBA_API_BASE+'/api/market/history?symbol='+encodeURIComponent(symbol)+'&range='+encodeURIComponent(providerRange)+'&interval='+encodeURIComponent(interval));
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.message||payload.error||'Historical data request failed.');
  const candles=(payload.candles||[]).map(c=>({timestamp:c.timestamp,open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close),volume:Number(c.volume||0)}));
  const lookbackMs=period==='2d'?2*86400000:period==='3d'?3*86400000:period==='5d'?5*86400000:period==='1w'?7*86400000:0;
  let filteredCandles=candles;
  if(lookbackMs){const cutoff=Date.now()-lookbackMs;filteredCandles=candles.filter(c=>Date.parse(c.timestamp)>=cutoff);}

  if(filteredCandles.length<22)throw new Error('Provider returned fewer than 22 usable candles for this period. Intraday periods need enough candles; try a longer period or a different interval.');
  window.OBA_HB_SYMBOL=symbol;
  setHistoricalData(filteredCandles,'Provider history: '+symbol+' · '+period+' · '+interval+' candles · '+(payload.exchange||'market')+' · '+(payload.source||'historical data'));
 }catch(e){if(status)status.textContent='Could not load '+symbol+' history: '+(e.message||'provider unavailable')+'. You can import an OHLCV CSV. No synthetic fallback was used.';}
}
function backtest(data,cfg){
if(!Array.isArray(data)||data.length<22)throw new Error('At least 22 valid candles are required.');
for(let i=0;i<data.length;i++){const c=data[i];if(![c.open,c.high,c.low,c.close,c.volume??0].every(Number.isFinite)||c.open<=0||c.low<=0||c.high<Math.max(c.open,c.close,c.low)||c.low>Math.min(c.open,c.close))throw new Error('Invalid OHLC candle at row '+(i+1)+'.');}
const costRate=0.001; // 5 bps fee + 5 bps slippage on entry and exit
let cash=cfg.capital,peak=cash,maxDD=0,position=null,trades=[],equityCurve=[];
function closePosition(price,i,reason){const p=position,entryCost=p.entry*p.qty*costRate,exitCost=price*p.qty*costRate,gross=(price-p.entry)*p.qty,net=gross-entryCost-exitCost;cash+=net;trades.push({entryBar:p.entryBar,exitBar:i,entry:p.entry,exit:price,qty:p.qty,pnl:net,costs:entryCost+exitCost,reason});position=null;}
for(let i=21;i<data.length;i++){
 const c=data[i],hadPosition=!!position;
 if(position){
  if(c.open<=position.stop)closePosition(c.open,i,'Gap stop');
  else if(c.low<=position.stop)closePosition(position.stop,i,'Stop');
  else if(c.open>=position.target)closePosition(c.open,i,'Gap target');
  else if(c.high>=position.target)closePosition(position.target,i,'Target');
 }
 if(!position&&!hadPosition){
  const signalBar=data[i-1],prior=data.slice(i-21,i-1),priorHigh=Math.max(...prior.map(x=>x.high));
  if(signalBar.close>priorHigh){
   const entry=c.open,stop=entry*(1-cfg.sl),target=entry*(1+cfg.tp),riskPerUnit=entry-stop;
   const riskBudget=Math.max(0,cash)*Math.min(cfg.risk,0.02);
   const qty=Math.min(riskBudget/riskPerUnit,Math.max(0,cash)*0.95/entry);
   if(Number.isFinite(qty)&&qty>0&&stop>0){
    position={entry,stop,target,qty,entryBar:i};
    // The entry candle must be evaluated too. If both levels are touched intrabar,
    // use the conservative stop-first assumption because OHLC bars cannot reveal path.
    if(c.low<=position.stop)closePosition(position.stop,i,'Entry-bar stop (conservative)');
    else if(c.high>=position.target)closePosition(position.target,i,'Entry-bar target');
   }
  }
 }
 let equity=cash;
 if(position){
  // Net mark-to-market includes estimated entry and exit costs.
  equity=cash+(c.close-position.entry)*position.qty-(position.entry+c.close)*position.qty*costRate;
 }
 peak=Math.max(peak,equity);maxDD=Math.max(maxDD,peak>0?(peak-equity)/peak:0);
 equityCurve.push({i,equity,drawdown:peak>0?(peak-equity)/peak:0});
}
if(position){const last=data[data.length-1];closePosition(last.close,data.length-1,'End of data');if(equityCurve.length)equityCurve[equityCurve.length-1].equity=cash;}
const wins=trades.filter(t=>t.pnl>0),losses=trades.filter(t=>t.pnl<0),grossW=wins.reduce((a,t)=>a+t.pnl,0),grossL=-losses.reduce((a,t)=>a+t.pnl,0);
return{ending:cash,net:cash-cfg.capital,winRate:trades.length?wins.length/trades.length:0,maxDD,expectancy:trades.length?(cash-cfg.capital)/trades.length:0,profitFactor:grossL?grossW/grossL:(grossW?Infinity:0),costs:trades.reduce((a,t)=>a+t.costs,0),trades,equityCurve};
}
function sensitivityHTML(data,cfg){
 const sls=[0.5,1,1.5].map(m=>Math.max(0.001,Math.min(0.5,cfg.sl*m)));
 const tps=[0.5,1,1.5].map(m=>Math.max(0.001,Math.min(1,cfg.tp*m)));
 let h='<div class="paper-note" style="margin-top:12px"><b>Stop/target sensitivity check</b><br>Each cell reruns the same historical data with a different fixed stop/target. Large changes indicate parameter sensitivity, not a dependable signal. Costs are included; this is not out-of-sample validation.</div><div class="tablewrap paper-table"><table><thead><tr><th>STOP ↓ / TARGET →</th>'+tps.map(t=>'<th>'+pct(t)+' TP</th>').join('')+'</tr></thead><tbody>';
 for(const sl of sls){h+='<tr><th>'+pct(sl)+' SL</th>'+tps.map(tp=>{const r=backtest(data,{...cfg,sl,tp});return '<td class="'+(r.net>=0?'pass':'red')+'">'+money(r.net)+'<br><small>'+r.trades.length+' trades</small></td>';}).join('')+'</tr>';}
 return h+'</tbody></table></div>';
}
const HISTORY_KEY='oba_ai_trader_backtest_history_v1';
function readLocalHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return[]}}
function writeLocalHistory(rows){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(rows.slice(0,300)))}catch(e){console.warn('Could not save local backtest history',e)}}
function renderBacktestHistory(rows){
 const el=document.getElementById('hbHistoryList');if(!el)return;
 if(!rows.length){el.textContent='No saved runs yet.';return;}
 el.innerHTML='<table><thead><tr><th>DATE</th><th>MARKET</th><th>PERIOD</th><th>SL / TP</th><th>NET P&L</th><th>MAX DD</th><th>TRADES</th><th>SOURCE</th></tr></thead><tbody>'+rows.map(x=>{const p=x.parameters||{},m=x.metrics||{};return '<tr><td>'+esc(new Date(x.created_at||x.createdAt||Date.now()).toLocaleString())+'</td><td>'+esc(x.symbol||'—')+'</td><td>'+esc(x.test_period||x.period||'—')+'</td><td>'+esc(p.stopLossPct??p.slPct??'—')+'% / '+esc(p.takeProfitPct??p.tpPct??'—')+'%</td><td class="'+(Number(m.netPnl??m.net)>=0?'pass':'red')+'">'+money(m.netPnl??m.net??0)+'</td><td>'+pct(m.maxDrawdown??m.maxDD??0)+'</td><td>'+esc(m.tradeCount??m.trades??0)+'</td><td>'+esc(x.data_source||x.dataSource||'—')+'</td></tr>'}).join('')+'</tbody></table>';
}
async function loadSavedBacktestHistory(){
 const local=readLocalHistory();renderBacktestHistory(local);
 const status=document.getElementById('hbSaveStatus');
 try{
  if(typeof supabaseClient==='undefined'){if(status)status.textContent='Saved locally on this device. Account sync is not configured.';return;}
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){if(status)status.textContent='Saved locally on this device. Sign in to sync your history privately across devices.';return;}
  const {data,error}=await supabaseClient.from('backtest_runs').select('*').order('created_at',{ascending:false}).limit(100);
  if(error)throw error;
  renderBacktestHistory(data||[]);
  if(status)status.textContent='Cloud sync active. Your saved test results are private to your signed-in account.';
 }catch(e){if(status)status.textContent='Local history is safe on this device; cloud sync could not be loaded: '+(e.message||'try again');}
}
async function saveBacktestRun(symbol,period,interval,data,cfg,result){
 const record={created_at:new Date().toISOString(),symbol:symbol||'IMPORTED',test_period:period||'Imported data',interval:interval||'CSV',strategy_name:'20-candle breakout',parameters:{capital:cfg.capital,riskPct:cfg.risk*100,stopLossPct:cfg.sl*100,takeProfitPct:cfg.tp*100},metrics:{endingEquity:result.ending,netPnl:result.net,winRate:result.winRate,maxDrawdown:result.maxDD,expectancy:result.expectancy,profitFactor:Number.isFinite(result.profitFactor)?result.profitFactor:null,costs:result.costs,tradeCount:result.trades.length},candle_count:data.length,data_source:window.OBA_HB_SYMBOL?'Yahoo Finance historical provider':'Imported CSV or demo'};
 const local=readLocalHistory();local.unshift(record);writeLocalHistory(local);renderBacktestHistory(local);
 const status=document.getElementById('hbSaveStatus');
 try{
  if(typeof supabaseClient==='undefined')throw new Error('Account sync is unavailable.');
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){if(status)status.textContent='Run saved on this device. Sign in to securely sync it to your account.';return;}
  const start=Date.parse(data[0]?.timestamp),end=Date.parse(data[data.length-1]?.timestamp);
  const payload={user_id:session.user.id,symbol:record.symbol,test_period:record.test_period,interval:record.interval,strategy_name:record.strategy_name,parameters:record.parameters,metrics:record.metrics,candle_count:record.candle_count,data_source:record.data_source,data_start:Number.isFinite(start)?new Date(start).toISOString():null,data_end:Number.isFinite(end)?new Date(end).toISOString():null};
  const {error}=await supabaseClient.from('backtest_runs').insert(payload);
  if(error)throw error;
  if(status)status.textContent='Saved on this device and synced privately to your account.';
  await loadSavedBacktestHistory();
 }catch(e){if(status)status.textContent='Saved locally, but account sync failed: '+(e.message||'check connection');}
}
function exportBacktestHistory(){
 const rows=readLocalHistory();if(!rows.length)return;
 const cols=['created_at','symbol','test_period','interval','stopLossPct','takeProfitPct','netPnl','maxDrawdown','winRate','tradeCount','candle_count','data_source'];
 const csv=[cols.join(','),...rows.map(x=>{const p=x.parameters||{},m=x.metrics||{};return [x.created_at,x.symbol,x.test_period,x.interval,p.stopLossPct,p.takeProfitPct,m.netPnl,m.maxDrawdown,m.winRate,m.tradeCount,x.candle_count,x.data_source].map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')})].join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='oba-ai-trader-backtest-history.csv';a.click();URL.revokeObjectURL(a.href);
}
function runHistoricalBacktest(){const data=window.OBA_HB_DATA||[];const out=document.getElementById('hbOut');if(!data.length){out.innerHTML='<div class="paper-note" style="margin-top:12px">Load a CSV or sample candles first.</div>';return;}const cfg={capital:+hbCapital.value,risk:+hbRisk.value/100,sl:+hbSL.value/100,tp:+hbTP.value/100};if(!(cfg.capital>0&&cfg.risk>0&&cfg.sl>0&&cfg.tp>0)){out.innerHTML='<div class="paper-note" style="margin-top:12px">Check the backtest settings.</div>';return;}const r=backtest(data,cfg);const testedSymbol=window.OBA_HB_SYMBOL||'Imported CSV / demo';const period=document.getElementById('hbRange')?.value||'Imported data';const interval=['1d','2d','3d','5d'].includes(period)?'5m':period==='1w'?'15m':'1d';saveBacktestRun(window.OBA_HB_SYMBOL,period,interval,data,cfg,r);out.innerHTML='<div class="paper-note" style="margin-top:12px">Market tested: '+esc(testedSymbol)+' · Candles: '+data.length+' · Strategy: breakout over prior 20 candles · Fixed costs included.</div><div class="bt-results"><div class="bt-stat"><small>ENDING EQUITY</small><b>'+money(r.ending)+'</b></div><div class="bt-stat"><small>NET P&L</small><b class="'+(r.net>=0?'pass':'red')+'">'+money(r.net)+'</b></div><div class="bt-stat"><small>WIN RATE</small><b>'+pct(r.winRate)+'</b></div><div class="bt-stat"><small>MAX DRAWDOWN</small><b class="red">'+pct(r.maxDD)+'</b></div><div class="bt-stat"><small>EXPECTANCY / TRADE</small><b>'+money(r.expectancy)+'</b></div><div class="bt-stat"><small>PROFIT FACTOR</small><b>'+((r.profitFactor===Infinity)?'∞':r.profitFactor.toFixed(2))+'</b></div></div><div class="equitybox"><div class="sub">EQUITY CURVE · ending account value by test step</div><svg class="equitysvg" viewBox="0 0 900 190" preserveAspectRatio="none"><polyline fill="none" stroke="#9eea62" stroke-width="3" points="'+r.equityCurve.map((p,n)=>{const min=Math.min(...r.equityCurve.map(x=>x.equity)),max=Math.max(...r.equityCurve.map(x=>x.equity));const x=r.equityCurve.length===1?0:n/(r.equityCurve.length-1)*900,y=175-(p.equity-min)/Math.max(1,max-min)*150;return x+','+y}).join(' ')+'"/></svg></div><div class="paper-note" style="margin-top:12px">'+r.trades.length+' completed trades · Breakout over prior 20 candles · Fixed SL/TP · 1% risk default. Results are historical-test output only, not a forecast.</div><div class="tablewrap paper-table"><table><thead><tr><th>#</th><th>ENTRY</th><th>EXIT</th><th>QTY</th><th>P&L</th><th>REASON</th></tr></thead><tbody>'+r.trades.slice(-30).map((t,n)=>'<tr><td>'+ (n+1)+'</td><td>'+money(t.entry)+'</td><td>'+money(t.exit)+'</td><td>'+t.qty.toFixed(3)+'</td><td class="'+(t.pnl>=0?'pass':'red')+'">'+money(t.pnl)+'</td><td>'+esc(t.reason)+'</td></tr>').join('')+'</tbody></table></div>'+sensitivityHTML(data,cfg);}
window.openHistoricalBacktest=openHistoricalBacktest;window.closeHistoricalBacktest=closeHistoricalBacktest;window.loadHistoricalSample=loadHistoricalSample;window.loadHistoricalMarketData=loadHistoricalMarketData;window.runHistoricalBacktest=runHistoricalBacktest;
})();