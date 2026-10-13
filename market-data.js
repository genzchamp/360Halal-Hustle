/* OBA AI Trader — third-party market data display.
   Quote timestamps are provider-supplied; data may be delayed. No trade execution. */
window.OBA_MARKET_QUOTES = window.OBA_MARKET_QUOTES || {};
function marketMoney(value,currency="USD"){
  if(!Number.isFinite(Number(value)))return "—";
  return new Intl.NumberFormat("en-US",{style:"currency",currency,maximumFractionDigits:2}).format(Number(value));
}
function renderMarketChart(bars){
  const svg=document.getElementById("marketChart");
  if(!svg)return;
  const points=(bars||[]).filter(b=>Number.isFinite(Number(b.close))).map(b=>Number(b.close));
  if(points.length<2){svg.innerHTML='<text x="450" y="112" text-anchor="middle" fill="#89958f" font-size="14">Chart data unavailable</text>';return;}
  const min=Math.min(...points),max=Math.max(...points),span=max-min||1;
  const coords=points.map((p,i)=>({x:i*900/(points.length-1),y:190-(p-min)/span*155}));
  const line=coords.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
  const area=line+" L900 220 L0 220 Z";
  svg.innerHTML='<defs><linearGradient id="marketFill" x2="0" y2="1"><stop stop-color="#9eea62" stop-opacity=".22"/><stop offset="1" stop-color="#9eea62" stop-opacity="0"/></linearGradient></defs><path d="'+area+'" fill="url(#marketFill)"/><path d="'+line+'" fill="none" stroke="#9eea62" stroke-width="2.5"/>';
}
function renderMarketQuote(q){
  if(!q||!Number.isFinite(Number(q.price)))return;
  window.OBA_MARKET_QUOTES[q.symbol]=q;
  if(q.symbol!=="AAPL")return;
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
  set("marketPrice",marketMoney(q.price,q.currency||"USD"));
  const change=q.changePercent;
  set("marketChange",Number.isFinite(Number(change))?((change>=0?"+":"")+Number(change).toFixed(2)+"%"):"Change unavailable");
  const ch=document.getElementById("marketChange");if(ch)ch.className=Number(change)>=0?"up":"red";
  set("marketMeta",(q.exchange||"US Equity")+" · "+(q.marketState||"Market status unavailable"));
  set("marketState",q.marketState||"Unknown");
  set("marketTrend",Number(change)>0.15?"Positive session":Number(change)<-0.15?"Negative session":"Mixed / flat");
  set("marketSummary",Number.isFinite(Number(change))?"AAPL is "+(Number(change)>0.15?"higher":Number(change)<-0.15?"lower":"little changed")+" versus the provider-reported previous close ("+(Number(change)>=0?"+":"")+Number(change).toFixed(2)+"%). This is descriptive market context, not an AI prediction or a recommendation to trade.":"A quote was received, but the provider did not return a usable previous-close comparison. No directional conclusion is available.");
  set("marketSource","Source: "+(q.source||"third-party provider"));
  const time=q.marketTime?new Date(q.marketTime):null;
  set("marketUpdated",time&&!Number.isNaN(time.getTime())?"Provider time: "+time.toLocaleString():"Provider timestamp unavailable");
  renderMarketChart(q.bars);
}
async function refreshMarketQuotes(){
  const status=document.getElementById("marketConnection");
  if(status)status.textContent="Fetching third-party quotes…";
  try{
    const data=await obaApi("/api/market/quotes?symbols=AAPL,MSFT");
    (data.quotes||[]).forEach(renderMarketQuote);
    const usable=(data.quotes||[]).filter(q=>Number.isFinite(Number(q.price))).length;
    if(status)status.textContent=usable?"Market data connected · "+usable+" quotes returned":"No quote available; no synthetic fallback used";
    const list=document.getElementById("secondaryQuotes");
    if(list)list.innerHTML=(data.quotes||[]).filter(q=>q.symbol!=="AAPL").map(q=>Number.isFinite(Number(q.price))?'<span><b>'+q.symbol+'</b> '+marketMoney(q.price,q.currency||"USD")+' <small>'+(q.marketState||"")+'</small></span>':'<span><b>'+q.symbol+'</b> quote unavailable</span>').join("");
  }catch(e){
    if(status)status.textContent="Market data unavailable · "+(e.message||"try again");
  }
}
document.addEventListener("DOMContentLoaded",()=>{
  refreshMarketQuotes();
  setInterval(refreshMarketQuotes,60000);
});
