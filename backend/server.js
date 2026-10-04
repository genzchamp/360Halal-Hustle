import http from "node:http";
import { createClient } from "@supabase/supabase-js";

const PORT=Number(process.env.PORT||8080);
const MAX_RISK=Number(process.env.MAX_RISK_PER_TRADE||0.01);
const MAX_DAILY_LOSS=Number(process.env.MAX_DAILY_LOSS||0.02);
const MAX_WEEKLY_LOSS=Number(process.env.MAX_WEEKLY_LOSS||0.05);
const MAX_OPEN_POSITIONS=Number(process.env.MAX_OPEN_POSITIONS||3);
const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY;
const SHARIAH_WATCHLIST=new Set(["AAPL","MSFT"]);
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
function riskCheck({account=10000,entry,stop,target,quantity=0,openPositions=0,dailyLoss=0,weeklyLoss=0}){entry=Number(entry);stop=Number(stop);target=Number(target);if(![entry,stop,target].every(Number.isFinite)||entry<=0||stop<=0||target<=entry)return{allowed:false,code:"INVALID_ORDER",reason:"Invalid entry, stop or target."};if(stop>=entry)return{allowed:false,code:"STOP_REQUIRED",reason:"Long paper orders require a stop below entry."};if(openPositions>=MAX_OPEN_POSITIONS)return{allowed:false,code:"MAX_POSITIONS",reason:"Maximum open positions reached."};if(dailyLoss>=MAX_DAILY_LOSS)return{allowed:false,code:"DAILY_LOSS_LIMIT",reason:"Daily loss limit reached."};if(weeklyLoss>=MAX_WEEKLY_LOSS)return{allowed:false,code:"WEEKLY_LOSS_LIMIT",reason:"Weekly loss limit reached."};const riskPerUnit=entry-stop,riskAmount=Number(account)*MAX_RISK,rewardPerUnit=target-entry,requestedQty=Math.floor(Number(quantity)||0);if(requestedQty<1)return{allowed:false,code:"INVALID_QUANTITY",reason:"Quantity must be at least 1."};const requestedRisk=riskPerUnit*requestedQty;if(requestedRisk>riskAmount)return{allowed:false,code:"POSITION_RISK",reason:"Requested position risk exceeds the server risk limit.",requestedRisk,maxRisk:riskAmount};if(rewardPerUnit/riskPerUnit<1)return{allowed:false,code:"REWARD_RISK",reason:"Reward/risk must be at least 1:1."};return{allowed:true,code:"ALLOWED",riskAmount,quantity:requestedQty,requestedRisk,rewardRisk:rewardPerUnit/riskPerUnit}}
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
const server=http.createServer(async(req,res)=>{
 try{
  const origin=String(req.headers.origin||"");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json(res,403,{error:"ORIGIN_NOT_ALLOWED"});
  if(rateLimited(req))return json(res,429,{error:"RATE_LIMITED",message:"Too many requests. Try again shortly."},origin);
  if(req.method==="OPTIONS")return json(res,204,{},origin);
  if(req.method==="GET"&&req.url==="/")return json(res,200,{ok:true,service:"oba-ai-trader-api",status:"ONLINE",mode:"paper",liveExecution:false,persistence:"supabase",message:"OBA AI Trader API is running."},origin);
  if(req.method==="GET"&&(req.url==="/health"||req.url==="/api/health"))return json(res,200,{ok:true,service:"oba-ai-trader-api",mode:"paper",liveExecution:false,persistence:SUPABASE_URL?"supabase-configured":"not-configured"},origin);
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
  if(req.method==="POST"&&req.url==="/api/paper/tick"){
    const a=await auth(req);if(a.error)return json(res,401,{error:a.error},origin);
    const {data:tickResult,error}=await a.supabase.rpc("tick_paper_positions_atomic");
    if(error){
      if(error.message==="AUTH_REQUIRED")return json(res,401,{error:"AUTH_REQUIRED"},origin);
      throw error;
    }
    const closed=Array.isArray(tickResult)?tickResult:[];
    return json(res,200,{state:await paperState(a.supabase,a.user.id),closed},origin);
  }
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
    if(!SHARIAH_WATCHLIST.has(symbol)){
      await auditEvent(a.supabase,a.user.id,"PAPER_ORDER",input,"BLOCKED","Symbol is not on the prototype approved watchlist.");
      return json(res,422,{status:"BLOCKED",code:"SHARIAH_GATE",reason:"Symbol is not on the prototype approved watchlist."},origin);
    }
    const rpc=await a.supabase.rpc("create_paper_order_atomic",{
      p_symbol:symbol,
      p_entry:Number(input.entry),
      p_stop:Number(input.stop),
      p_target:Number(input.target),
      p_quantity:Number(input.quantity),
      p_side:"BUY",
      p_idempotency_key:String(input.idempotencyKey||"")||null
    });
    if(rpc.error){
      const map={
        AUTH_REQUIRED:["AUTH_REQUIRED","Authentication is required."],
        SHARIAH_GATE:["SHARIAH_GATE","Symbol is not on the approved watchlist."],
        SIDE_NOT_ALLOWED:["SIDE_NOT_ALLOWED","Only BUY paper orders are enabled."],
        INVALID_ORDER:["INVALID_ORDER","Invalid entry, stop or target."],
        STOP_REQUIRED:["STOP_REQUIRED","Long paper orders require a stop below entry."],
        INVALID_QUANTITY:["INVALID_QUANTITY","Quantity must be at least 1."],
        INVALID_IDEMPOTENCY_KEY:["INVALID_IDEMPOTENCY_KEY","Invalid order request key."],
        MAX_POSITIONS:["MAX_POSITIONS","Maximum open positions reached."],
        DAILY_LOSS_LIMIT:["DAILY_LOSS_LIMIT","Daily loss limit reached."],
        WEEKLY_LOSS_LIMIT:["WEEKLY_LOSS_LIMIT","Weekly loss limit reached."],
        POSITION_RISK:["POSITION_RISK","Requested position risk exceeds the server risk limit."],
        REWARD_RISK:["REWARD_RISK","Reward/risk must be at least 1:1."],
        PAPER_ACCOUNT_NOT_FOUND:["PAPER_ACCOUNT_NOT_FOUND","Paper account could not be created or found."]
      };
      const key=String(rpc.error.message||"").split(":")[0];
      const [code,reason]=map[key]||["ORDER_REJECTED","Paper order was rejected by the server risk gate."];
      await auditEvent(a.supabase,a.user.id,"PAPER_ORDER",input,"BLOCKED",reason);
      return json(res,422,{status:"BLOCKED",code,reason},origin);
    }
    const order=rpc.data?.order;
    return json(res,201,{id:order?.id,status:"SIMULATED",side:order?.side,symbol:order?.symbol,entry:order?.entry,stop:order?.stop,target:order?.target,quantity:order?.quantity,createdAt:order?.created_at},origin);
  }
  return json(res,404,{error:"NOT_FOUND"},origin);
  }catch(e){console.error(e);const message=e?.message==="REQUEST_TOO_LARGE"?"Request body is too large.":"Request could not be processed.";return json(res,e?.message==="REQUEST_TOO_LARGE"?413:400,{error:e?.message==="REQUEST_TOO_LARGE"?"REQUEST_TOO_LARGE":"BAD_REQUEST",message},String(req.headers.origin||""))}
});
server.listen(PORT,"0.0.0.0",()=>console.log("OBA AI Trader API listening on "+PORT));