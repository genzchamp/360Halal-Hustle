import http from "node:http";
import { createClient } from "@supabase/supabase-js";

const PORT=Number(process.env.PORT||8080);
const MAX_RISK=Number(process.env.MAX_RISK_PER_TRADE||0.01);
const MAX_STOP_LOSS_PERCENT=Number(process.env.MAX_STOP_LOSS_PERCENT||0.02);
const MAX_DAILY_LOSS=Number(process.env.MAX_DAILY_LOSS||0.02);
const MAX_WEEKLY_LOSS=Number(process.env.MAX_WEEKLY_LOSS||0.05);
const MAX_OPEN_POSITIONS=Number(process.env.MAX_OPEN_POSITIONS||3);
const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHARIAH_POLICY_VERSION="oba-shariah-policy-draft-0.1.0";
const SHARIAH_POLICY_STATUS="DRAFT_REQUIRES_QUALIFIED_SCHOLAR_REVIEW";
const ALLOWED_ORIGINS=new Set([
  "https://genzchamp.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);
const MAX_BODY_BYTES=64*1024;
const RATE_WINDOW_MS=60_000;
const RATE_LIMIT=60;
const rateBuckets=new Map();

if(!SUPABASE_URL||!SUPABASE_PUBLISHABLE_KEY) console.warn("Supabase environment variables are missing; authenticated API routes will be unavailable.");

function json(res,status,body,origin=""){const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","vary":"Origin","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,authorization"};if(origin&&ALLOWED_ORIGINS.has(origin))headers["access-control-allow-origin"]=origin;res.writeHead(status,headers);res.end(JSON.stringify(body))}
function riskCheck({account=10000,entry,stop,target,quantity=0,openPositions=0,dailyLoss=0,weeklyLoss=0}) {
  entry=Number(entry); stop=Number(stop); target=Number(target);
  if(![entry,stop,target].every(Number.isFinite)||entry<=0||stop<=0||target<=0||target<=entry)
    return {allowed:false,code:"INVALID_ORDER",reason:"Entry, stop and target must be valid positive prices, with target above entry."};
  if(stop>=entry)
    return {allowed:false,code:"STOP_REQUIRED",reason:"Long paper orders require a stop below entry."};
  const stopLossPercent=(entry-stop)/entry;
  if(stopLossPercent>MAX_STOP_LOSS_PERCENT)
    return {allowed:false,code:"STOP_LOSS_LIMIT",reason:"Stop distance exceeds the server maximum stop-loss percentage.",stopLossPercent,maxStopLossPercent:MAX_STOP_LOSS_PERCENT};
  if(openPositions>=MAX_OPEN_POSITIONS)
    return {allowed:false,code:"MAX_POSITIONS",reason:"Maximum open positions reached."};
  if(dailyLoss>=MAX_DAILY_LOSS)
    return {allowed:false,code:"DAILY_LOSS_LIMIT",reason:"Daily loss limit reached."};
  if(weeklyLoss>=MAX_WEEKLY_LOSS)
    return {allowed:false,code:"WEEKLY_LOSS_LIMIT",reason:"Weekly loss limit reached."};
  const riskPerUnit=entry-stop, riskAmount=Number(account)*MAX_RISK, rewardPerUnit=target-entry, requestedQty=Math.floor(Number(quantity)||0);
  if(requestedQty<1)
    return {allowed:false,code:"INVALID_QUANTITY",reason:"Quantity must be at least 1."};
  const requestedRisk=riskPerUnit*requestedQty;
  if(requestedRisk>riskAmount)
    return {allowed:false,code:"POSITION_RISK",reason:"Requested position risk exceeds the server risk limit.",requestedRisk,maxRisk:riskAmount};
  if(rewardPerUnit/riskPerUnit<1)
    return {allowed:false,code:"REWARD_RISK",reason:"Reward/risk must be at least 1:1."};
  return {allowed:true,code:"ALLOWED",riskAmount,quantity:requestedQty,requestedRisk,rewardRisk:rewardPerUnit/riskPerUnit,stopLossPercent};
}
async function body(req){let raw="";let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>MAX_BODY_BYTES)throw new Error("REQUEST_TOO_LARGE");raw+=chunk}return raw?JSON.parse(raw):{}}
function bearer(req){const h=req.headers.authorization||"";return h.startsWith("Bearer ")?h.slice(7).trim():""}
function clientIp(req){return String(req.headers["x-forwarded-for"]||req.socket.remoteAddress||"unknown").split(",")[0].trim()}
function rateLimited(req){const now=Date.now(),key=clientIp(req),bucket=rateBuckets.get(key);if(!bucket||now-bucket.start>=RATE_WINDOW_MS){rateBuckets.set(key,{start:now,count:1});return false}bucket.count+=1;return bucket.count>RATE_LIMIT}
async function auth(req){
  if(!SUPABASE_URL||!SUPABASE_PUBLISHABLE_KEY)return{error:"SERVER_AUTH_NOT_CONFIGURED"};
  const token=bearer(req);if(!token)return{error:"AUTH_REQUIRED"};
  const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},global:{headers:{"Authorization":"Bearer "+token}}});
  const {data,error}=await supabase.auth.getUser(token);
  if(error||!data.user)return{error:"INVALID_AUTH"};
  return{supabase,user:data.user};
}
async function ensureAccount(supabase,userId){
  let {data:account,error}=await supabase.from("paper_accounts").select("*").eq("user_id",userId).order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(error)throw error;
  if(account)return account;
  const created=await supabase.from("paper_accounts").insert({user_id:userId,name:"Main Paper Account",starting_balance:10000,balance:10000}).select("*").single();
  if(created.error)throw created.error;
  return created.data;
}
async function paperState(supabase,userId){
  const account=await ensureAccount(supabase,userId);
  const [{data:positions,error:pe},{data:orders,error:oe},{data:journal,error:je}]=await Promise.all([
    supabase.from("paper_positions").select("*").eq("user_id",userId).order("opened_at",{ascending:false}).limit(200),
    supabase.from("paper_orders").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(200),
    supabase.from("trade_journal").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(100)
  ]);
  if(pe||oe||je)throw pe||oe||je;
  const open=(positions||[]).filter(p=>p.status==="OPEN");
  const unrealized=open.reduce((sum,p)=>sum+(Number(p.current_price||p.entry)-Number(p.entry))*Number(p.quantity),0);
  const now=new Date(), dayStart=new Date(now); dayStart.setHours(0,0,0,0);
  const weekStart=new Date(dayStart), weekday=weekStart.getDay(); weekStart.setDate(weekStart.getDate()-(weekday===0?6:weekday-1));
  const lossSince=(ms)=> (journal||[]).reduce((sum,j)=>{const t=Date.parse(j.created_at||"");const pnl=Number(j.pnl||0);return t>=ms&&pnl<0?sum+Math.abs(pnl):sum},0);
  const balance=Math.max(Number(account.balance)||0,0), dailyLossAmount=lossSince(dayStart.getTime()), weeklyLossAmount=lossSince(weekStart.getTime());
  return {account,equity:balance+unrealized,positions:positions||[],orders:orders||[],journal:journal||[],risk:{maxRiskPerTrade:MAX_RISK,maxDailyLoss:MAX_DAILY_LOSS,maxWeeklyLoss:MAX_WEEKLY_LOSS,maxOpenPositions:MAX_OPEN_POSITIONS,openPositions:open.length,dailyLossAmount, dailyLossPct:balance?dailyLossAmount/balance:0,weeklyLossAmount,weeklyLossPct:balance?weeklyLossAmount/balance:0}};
}
async function closePaperPosition(supabase,userId,positionId,currentPrice,reason="MANUAL"){
  const price=Number(currentPrice);
  if(!Number.isFinite(price)||price<=0)throw new Error("INVALID_CLOSE_PRICE");
  const {data,error}=await supabase.rpc("close_paper_position_atomic",{
    p_position_id:positionId,
    p_current_price:price,
    p_reason:reason
  });
  if(error){
    if(error.message==="OPEN_POSITION_NOT_FOUND")throw new Error("OPEN_POSITION_NOT_FOUND");
    if(error.message==="PAPER_ACCOUNT_NOT_FOUND")throw new Error("PAPER_ACCOUNT_NOT_FOUND");
    if(error.message==="INVALID_CLOSE_PRICE")throw new Error("INVALID_CLOSE_PRICE");
    throw error;
  }
  return data;
}
async function auditEvent(supabase,userId,eventType,payload,status,message){
  await supabase.from("audit_events").insert({user_id:userId,event_type:eventType,symbol:payload?.symbol||null,status,message:message||null,metadata:payload||{}}).then(({error})=>{if(error)console.error("audit insert:",error.message)});
}

const MARKET_SYMBOLS=new Set(["AAPL","MSFT","TSLA","NVDA","AMZN","GOOGL","META","AMD","INTC","NFLX","SPY","QQQ","BTC-USD","ETH-USD","SOL-USD","BNB-USD","XRP-USD"]);
const marketQuoteCache=new Map();
async function getStooqQuote(symbol){
  const key=String(symbol||"").toLowerCase()+".us";
  const response=await fetch("https://stooq.com/q/d/l/?s="+encodeURIComponent(key)+"&i=d",{headers:{"accept":"text/csv","user-agent":"OBA-AI-Trader/1.0"},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error("STOOQ_PROVIDER_HTTP_"+response.status);
  const csv=await response.text(),lines=csv.trim().split(/\r?\n/);
  if(lines.length<2||/^No data/i.test(csv))throw new Error("STOOQ_NO_DATA");
  const header=lines[0].split(",").map(x=>x.trim().toLowerCase());
  const idx={date:header.indexOf("date"),open:header.indexOf("open"),high:header.indexOf("high"),low:header.indexOf("low"),close:header.indexOf("close"),volume:header.indexOf("volume")};
  const bars=lines.slice(1).map(line=>{const a=line.split(",");return{date:a[idx.date],open:Number(a[idx.open]),high:Number(a[idx.high]),low:Number(a[idx.low]),close:Number(a[idx.close]),volume:Number(a[idx.volume])}}).filter(b=>b.date&&Number.isFinite(b.close)&&b.close>0).slice(-100);
  const last=bars[bars.length-1],prev=bars[bars.length-2];
  if(!last)throw new Error("STOOQ_NO_VALID_BARS");
  const quote={symbol:String(symbol).toUpperCase(),price:last.close,currency:"USD",exchange:"US equities",marketState:"DAILY_DATA_DELAYED",marketTime:last.date+"T00:00:00.000Z",previousClose:prev?.close??null,change:prev?last.close-prev.close:null,changePercent:prev?(last.close-prev.close)/prev.close*100:null,bars:bars.map(b=>({time:new Date(b.date+"T00:00:00.000Z").getTime(),close:b.close})),source:"Stooq historical daily data (delayed; not a live quote)",fetchedAt:new Date().toISOString(),dataQuality:"daily-close"};
  marketQuoteCache.set(String(symbol).toUpperCase(),{cachedAt:Date.now(),quote});
  return quote;
}
async function getMarketQuote(symbol){
  const key=String(symbol||"").toUpperCase();
  if(!MARKET_SYMBOLS.has(key))throw new Error("UNSUPPORTED_SYMBOL");
  const cached=marketQuoteCache.get(key);
  if(cached&&Date.now()-cached.cachedAt<15000)return cached.quote;
  let yahooFailure="YAHOO_UNKNOWN";
  try{
    const response=await fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+key+"?range=1d&interval=1m",{headers:{"accept":"application/json","user-agent":"Mozilla/5.0 OBA-AI-Trader/1.0"},signal:AbortSignal.timeout(6000)});
    if(!response.ok)yahooFailure="YAHOO_HTTP_"+response.status;
    else {
      const payload=await response.json(),item=payload?.chart?.result?.[0],meta=item?.meta;
      if(!meta)yahooFailure=payload?.chart?.error?.code?"YAHOO_"+String(payload.chart.error.code).replace(/[^A-Za-z0-9_]/g,"").slice(0,40):"YAHOO_MISSING_METADATA";
      else {
        const price=Number(meta.regularMarketPrice);
        if(!Number.isFinite(price)||price<=0)yahooFailure="YAHOO_INVALID_PRICE";
        else {
          const previous=Number(meta.chartPreviousClose||meta.previousClose||0),series=item.indicators?.quote?.[0]||[];
          const bars=(item.timestamp||[]).map((time,i)=>({time:time*1000,close:series.close?.[i]})).filter(b=>Number.isFinite(Number(b.close))&&Number(b.close)>0).slice(-100);
          const quote={symbol:key,price,currency:meta.currency||"USD",exchange:meta.fullExchangeName||meta.exchangeName||"Unknown",marketState:meta.marketState||"UNKNOWN",marketTime:meta.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():null,previousClose:previous||null,change:previous?price-previous:null,changePercent:previous?(price-previous)/previous*100:null,bars,source:"Yahoo Finance chart data",fetchedAt:new Date().toISOString()};
          marketQuoteCache.set(key,{cachedAt:Date.now(),quote});
          return quote;
        }
      }
    }
  }catch(e){yahooFailure=String(e?.name==="TimeoutError"||e?.name==="AbortError"?"YAHOO_TIMEOUT":e?.message||"YAHOO_FETCH_FAILED").replace(/[^A-Za-z0-9_:-]/g,"_").slice(0,80)}
  try{return await getStooqQuote(key)}
  catch(e){
    const stooqFailure=String(e?.message||"STOOQ_FETCH_FAILED").replace(/[^A-Za-z0-9_:-]/g,"_").slice(0,80);
    const error=new Error("ALL_PROVIDERS_FAILED");
    error.providerDiagnostics={yahoo:yahooFailure,stooq:stooqFailure};
    throw error;
  }
}
const server=http.createServer(async(req,res)=>{
 try{
  const origin=String(req.headers.origin||"");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json(res,403,{error:"ORIGIN_NOT_ALLOWED"});
  if(rateLimited(req))return json(res,429,{error:"RATE_LIMITED",message:"Too many requests. Try again shortly."},origin);
  if(req.method==="OPTIONS")return json(res,204,{},origin);
  if(req.method==="GET"&&req.url==="/")return json(res,200,{ok:true,service:"oba-ai-trader-api",status:"ONLINE",mode:"paper",liveExecution:false,persistence:"supabase",message:"OBA AI Trader API is running."},origin);
  if(req.method==="GET"&&(["/health","/api/health"].includes(new URL(req.url,"http://localhost").pathname)))return json(res,200,{ok:true,service:"oba-ai-trader-api",mode:"paper",liveExecution:false,marketDataSource:"Yahoo Finance chart data",paperPositionMarking:SUPABASE_SERVICE_ROLE_KEY?"provider-quotes-configured":"requires-server-service-role-key",persistence:SUPABASE_URL?"supabase-configured":"not-configured",shariahPolicyVersion:SHARIAH_POLICY_VERSION,shariahPolicyStatus:SHARIAH_POLICY_STATUS,orderSubmissionEnabled:false},origin);
  if(req.method==="GET"&&new URL(req.url,"http://localhost").pathname==="/api/shariah/status")return json(res,200,{policyVersion:SHARIAH_POLICY_VERSION,policyStatus:SHARIAH_POLICY_STATUS,orderSubmissionEnabled:false,decision:"UNABLE_TO_VERIFY",reason:"No verified scholar-approved policy and server-side screening evidence are configured. All orders remain blocked.",liveExecution:false},origin);
  if(req.method==="GET"&&new URL(req.url,"http://localhost").pathname==="/api/market/history"){
    const url=new URL(req.url,"http://localhost");
    const symbol=String(url.searchParams.get("symbol")||"AAPL").trim().toUpperCase();
    const range=String(url.searchParams.get("range")||"5y");
    const interval=String(url.searchParams.get("interval")||"1d");
    const rangesByInterval={"1d":new Set(["1mo","3mo","6mo","1y","2y","5y","10y","max"]),"1h":new Set(["1mo","3mo","6mo","1y"]),"15m":new Set(["5d","1mo"]),"5m":new Set(["1d","5d"])};
    if(!MARKET_SYMBOLS.has(symbol))return json(res,400,{error:"UNSUPPORTED_SYMBOL",message:"Choose a listed stock, ETF, or supported crypto pair."},origin);
    if(!rangesByInterval[interval]||!rangesByInterval[interval].has(range))return json(res,400,{error:"INVALID_HISTORY_RANGE",message:"That history range and interval combination is not supported."},origin);
    try{
      const endpoint="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?range="+encodeURIComponent(range)+"&interval="+encodeURIComponent(interval)+"&events=history";
      const response=await fetch(endpoint,{headers:{"accept":"application/json","user-agent":"Mozilla/5.0 OBA-AI-Trader/1.0"},signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error("HISTORY_PROVIDER_HTTP_"+response.status);
      const payload=await response.json(),item=payload?.chart?.result?.[0],meta=item?.meta,series=item?.indicators?.quote?.[0];
      if(!item||!series||!Array.isArray(item.timestamp))throw new Error("HISTORY_PROVIDER_NO_DATA");
      const candles=item.timestamp.map((t,i)=>({timestamp:new Date(t*1000).toISOString(),open:series.open?.[i],high:series.high?.[i],low:series.low?.[i],close:series.close?.[i],volume:series.volume?.[i]??0})).filter(b=>[b.open,b.high,b.low,b.close].every(v=>Number.isFinite(Number(v))&&Number(v)>0)&&Number(b.high)>=Math.max(Number(b.open),Number(b.close),Number(b.low))&&Number(b.low)<=Math.min(Number(b.open),Number(b.close)));
      if(candles.length<22)throw new Error("HISTORY_TOO_SHORT");
      return json(res,200,{symbol,range,interval,currency:meta?.currency||"USD",exchange:meta?.fullExchangeName||meta?.exchangeName||"Unknown",source:"Yahoo Finance chart history",dataQuality:"historical-provider-candles",fetchedAt:new Date().toISOString(),candles},origin);
    }catch(e){
      const code=String(e?.message||"HISTORY_UNAVAILABLE").replace(/[^A-Za-z0-9_:-]/g,"_").slice(0,80);
      return json(res,503,{error:"HISTORICAL_DATA_UNAVAILABLE",symbol,range,interval,message:"Historical provider candles could not be loaded. Import a trusted OHLCV CSV instead; no synthetic data was substituted.",diagnostic:code},origin);
    }
  }
  if(req.method==="GET"&&req.url.startsWith("/api/market/quotes")){
    const url=new URL(req.url,"http://localhost");
    const symbols=String(url.searchParams.get("symbols")||"AAPL,MSFT").split(",").map(x=>x.trim().toUpperCase());
    if(!symbols.length||symbols.length>4||symbols.some(x=>!MARKET_SYMBOLS.has(x)))return json(res,400,{error:"UNSUPPORTED_SYMBOL",message:"Choose from the supported stock, ETF, or crypto symbols listed in the app."},origin);
    const quotes=await Promise.all(symbols.map(async symbol=>{try{return await getMarketQuote(symbol)}catch(e){return{symbol,error:"MARKET_DATA_UNAVAILABLE",message:"No quote returned. No simulated fallback was used.",providerDiagnostics:e?.providerDiagnostics||{reason:"PROVIDER_REQUEST_FAILED"}}}}));
    return json(res,quotes.some(q=>Number.isFinite(q.price))?200:503,{quotes,notice:"Third-party data may be delayed. Paper mode only; no broker orders are sent.",fetchedAt:new Date().toISOString()},origin);
  }
  if(req.method==="POST"&&req.url==="/api/paper/refresh"){
    const a=await auth(req);if(a.error)return json(res,401,{error:a.error},origin);
    const {data:openPositions,error:positionError}=await a.supabase.from("paper_positions").select("symbol").eq("user_id",a.user.id).eq("status","OPEN");
    if(positionError)throw positionError;
    const symbols=[...new Set((openPositions||[]).map(p=>String(p.symbol||"").toUpperCase()).filter(s=>MARKET_SYMBOLS.has(s)))];
    if(!symbols.length)return json(res,200,{state:await paperState(a.supabase,a.user.id),quotes:[],result:{updatedCount:0,updated:[],closed:[]},priceSource:"third-party-market-data"},origin);
    if(!SUPABASE_SERVICE_ROLE_KEY)return json(res,503,{error:"MARKET_MARKING_NOT_CONFIGURED",message:"Real quote marking needs the server-only Supabase service role secret configured in Render. No simulated price update was used."},origin);
    const quoteResults=await Promise.all(symbols.map(async symbol=>{try{return await getMarketQuote(symbol)}catch{return{symbol,error:"MARKET_DATA_UNAVAILABLE"}}}));
    const quoteMap=Object.fromEntries(quoteResults.filter(q=>Number.isFinite(q.price)&&q.dataQuality!=="daily-close").map(q=>[q.symbol,q.price]));
    if(!Object.keys(quoteMap).length)return json(res,503,{error:"CURRENT_MARKET_QUOTES_UNAVAILABLE",message:"No current intraday provider quotes were returned. Daily historical closes may be displayed for context, but they will not be used to mark positions or trigger paper exits."},origin);
    const admin=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
    const {data:result,error}=await admin.rpc("mark_paper_positions_from_quotes_service",{p_user_id:a.user.id,p_quotes:quoteMap});
    if(error){console.error("provider quote marking failed:",error.message);return json(res,503,{error:"MARKET_MARKING_FAILED",message:"Provider prices were fetched but the saved paper positions could not be updated."},origin);}
    return json(res,200,{state:await paperState(a.supabase,a.user.id),quotes:quoteResults,result,priceSource:"third-party-market-data",notice:"Paper exits are checked when this app polls quotes; this is not an exchange-side stop order."},origin);
  }
  if(req.method==="GET"&&req.url==="/api/paper/state"){
    const a=await auth(req);if(a.error)return json(res,401,{error:a.error},origin);
    return json(res,200,await paperState(a.supabase,a.user.id),origin);
  }
  if(req.method==="POST"&&req.url==="/api/paper/reset"){
    const a=await auth(req);if(a.error)return json(res,401,{error:a.error},origin);
    const {data,error}=await a.supabase.rpc("reset_paper_account_atomic");
    if(error){
      const map={
        AUTH_REQUIRED:["AUTH_REQUIRED","Authentication is required."],
        PAPER_ACCOUNT_NOT_FOUND:["PAPER_ACCOUNT_NOT_FOUND","Paper account could not be found."]
      };
      const [code,reason]=map[String(error.message||"")]||["RESET_REJECTED","Paper account reset was rejected by the server."];
      return json(res,422,{status:"BLOCKED",code,reason},origin);
    }
    return json(res,200,{status:"RESET",...data},origin);
  }
  if(req.method==="POST"&&req.url==="/api/paper/tick")return json(res,410,{error:"SYNTHETIC_TICK_DISABLED",message:"Synthetic position ticks are disabled. Use provider quote refresh for paper positions."},origin);
  if(req.method==="POST"&&req.url.startsWith("/api/paper/positions/")&&req.url.endsWith("/close")){
    const a=await auth(req);if(a.error)return json(res,401,{error:a.error},origin);
    const id=req.url.split("/")[4];const input=await body(req);const result=await closePaperPosition(a.supabase,a.user.id,id,input.price,"MANUAL");
    return json(res,200,result,origin);
  }
  if(req.method==="POST"&&req.url==="/api/risk/check"){
    const a=await auth(req);if(a.error)return json(res,401,{error:a.error},origin);
    const input=await body(req),state=await paperState(a.supabase,a.user.id);
    const decision=riskCheck({...input,account:Number(state.account?.balance)||0,openPositions:Number(state.risk?.openPositions)||0,dailyLoss:Number(state.risk?.dailyLossPct)||0,weeklyLoss:Number(state.risk?.weeklyLossPct)||0});
    await auditEvent(a.supabase,a.user.id,"RISK_CHECK",input,decision.allowed?"ALLOWED":"BLOCKED",decision.reason);return json(res,decision.allowed?200:422,decision,origin);
  }
  if((req.url==="/api/paper/orders"||req.url==="/api/audit")&&(req.method==="GET"||req.method==="POST")){
    const a=await auth(req);if(a.error)return json(res,401,{error:a.error},origin);
    if(req.method==="GET"&&req.url==="/api/audit"){const {data,error}=await a.supabase.from("audit_events").select("*").order("created_at",{ascending:false}).limit(200);if(error)throw error;return json(res,200,{events:data||[]},origin)}
    if(req.method==="GET"&&req.url==="/api/paper/orders"){const {data,error}=await a.supabase.from("paper_orders").select("*").order("created_at",{ascending:false}).limit(200);if(error)throw error;return json(res,200,{orders:data||[]},origin)}
    const input=await body(req),symbol=String(input.symbol||"").toUpperCase();
    // Fail closed at the API as well as the database. Client-side approval claims
    // are not trusted, and the draft policy is not authorized to permit any trade.
    const block={
      status:"BLOCKED",
      code:"SHARIAH_POLICY_NOT_APPROVED",
      symbol:symbol||null,
      decision:"UNABLE_TO_VERIFY",
      policyVersion:SHARIAH_POLICY_VERSION,
      policyStatus:SHARIAH_POLICY_STATUS,
      reason:"No qualified-scholar-approved methodology and independently verified screening evidence are configured. No paper order was sent.",
      liveExecution:false
    };
    await auditEvent(a.supabase,a.user.id,"PAPER_ORDER",input,"BLOCKED",block.reason);
    return json(res,422,block,origin);
  }
  return json(res,404,{error:"NOT_FOUND"},origin);
  }catch(e){console.error(e);const message=e?.message==="REQUEST_TOO_LARGE"?"Request body is too large.":"Request could not be processed.";return json(res,e?.message==="REQUEST_TOO_LARGE"?413:400,{error:e?.message==="REQUEST_TOO_LARGE"?"REQUEST_TOO_LARGE":"BAD_REQUEST",message},String(req.headers.origin||""))}
});
server.listen(PORT,"0.0.0.0",()=>console.log("OBA AI Trader API listening on "+PORT));