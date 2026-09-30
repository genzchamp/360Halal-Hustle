import http from "node:http";
import { createClient } from "@supabase/supabase-js";

const PORT=Number(process.env.PORT||8080);
const MAX_RISK=Number(process.env.MAX_RISK_PER_TRADE||0.01);
const MAX_DAILY_LOSS=Number(process.env.MAX_DAILY_LOSS||0.02);
const MAX_OPEN_POSITIONS=Number(process.env.MAX_OPEN_POSITIONS||3);
const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY;
const SHARIAH_WATCHLIST=new Set(["AAPL","MSFT"]);

if(!SUPABASE_URL||!SUPABASE_PUBLISHABLE_KEY) console.warn("Supabase environment variables are missing; authenticated API routes will be unavailable.");

function json(res,status,body){res.writeHead(status,{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,authorization"});res.end(JSON.stringify(body))}
function riskCheck({account=10000,entry,stop,target,quantity=0,openPositions=0,dailyLoss=0}){entry=Number(entry);stop=Number(stop);target=Number(target);if(![entry,stop,target].every(Number.isFinite)||entry<=0||stop<=0||target<=entry)return{allowed:false,code:"INVALID_ORDER",reason:"Invalid entry, stop or target."};if(stop>=entry)return{allowed:false,code:"STOP_REQUIRED",reason:"Long paper orders require a stop below entry."};if(openPositions>=MAX_OPEN_POSITIONS)return{allowed:false,code:"MAX_POSITIONS",reason:"Maximum open positions reached."};if(dailyLoss>=MAX_DAILY_LOSS)return{allowed:false,code:"DAILY_LOSS_LIMIT",reason:"Daily loss limit reached."};const riskPerUnit=entry-stop,riskAmount=Number(account)*MAX_RISK,rewardPerUnit=target-entry,requestedQty=Math.floor(Number(quantity)||0);if(requestedQty<1)return{allowed:false,code:"INVALID_QUANTITY",reason:"Quantity must be at least 1."};const requestedRisk=riskPerUnit*requestedQty;if(requestedRisk>riskAmount)return{allowed:false,code:"POSITION_RISK",reason:"Requested position risk exceeds the server risk limit.",requestedRisk,maxRisk:riskAmount};if(rewardPerUnit/riskPerUnit<1)return{allowed:false,code:"REWARD_RISK",reason:"Reward/risk must be at least 1:1."};return{allowed:true,code:"ALLOWED",riskAmount,quantity:requestedQty,requestedRisk,rewardRisk:rewardPerUnit/riskPerUnit}}
async function body(req){let raw="";for await(const chunk of req)raw+=chunk;return raw?JSON.parse(raw):{}}
function bearer(req){const h=req.headers.authorization||"";return h.startsWith("Bearer ")?h.slice(7).trim():""}
async function auth(req){
  if(!SUPABASE_URL||!SUPABASE_PUBLISHABLE_KEY)return{error:"SERVER_AUTH_NOT_CONFIGURED"};
  const token=bearer(req);if(!token)return{error:"AUTH_REQUIRED"};
  const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
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
async function auditEvent(supabase,userId,eventType,payload,status,message){
  await supabase.from("audit_events").insert({user_id:userId,event_type:eventType,symbol:payload?.symbol||null,status,message:message||null,metadata:payload||{}}).then(({error})=>{if(error)console.error("audit insert:",error.message)});
}
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method==="OPTIONS")return json(res,204,{});
  if(req.method==="GET"&&req.url==="/")return json(res,200,{ok:true,service:"oba-ai-trader-api",status:"ONLINE",mode:"paper",liveExecution:false,persistence:"supabase",message:"OBA AI Trader API is running."});
  if(req.method==="GET"&&(req.url==="/health"||req.url==="/api/health"))return json(res,200,{ok:true,service:"oba-ai-trader-api",mode:"paper",liveExecution:false,persistence:SUPABASE_URL?"supabase-configured":"not-configured"});
  if(req.method==="POST"&&req.url==="/api/risk/check"){
    const a=await auth(req);if(a.error)return json(res,401,{error:a.error});
    const input=await body(req),decision=riskCheck(input);await auditEvent(a.supabase,a.user.id,"RISK_CHECK",input,decision.allowed?"ALLOWED":"BLOCKED",decision.reason);return json(res,decision.allowed?200:422,decision);
  }
  if((req.url==="/api/paper/orders"||req.url==="/api/audit")&&(req.method==="GET"||req.method==="POST")){
    const a=await auth(req);if(a.error)return json(res,401,{error:a.error});
    if(req.method==="GET"&&req.url==="/api/audit"){const {data,error}=await a.supabase.from("audit_events").select("*").order("created_at",{ascending:false}).limit(200);if(error)throw error;return json(res,200,{events:data||[]})}
    if(req.method==="GET"&&req.url==="/api/paper/orders"){const {data,error}=await a.supabase.from("paper_orders").select("*").order("created_at",{ascending:false}).limit(200);if(error)throw error;return json(res,200,{orders:data||[]})}
    const input=await body(req),symbol=String(input.symbol||"").toUpperCase(),account=await ensureAccount(a.supabase,a.user.id);
    if(!SHARIAH_WATCHLIST.has(symbol)){await auditEvent(a.supabase,a.user.id,"PAPER_ORDER",input,"BLOCKED","Symbol is not on the prototype approved watchlist.");return json(res,422,{status:"BLOCKED",code:"SHARIAH_GATE",reason:"Symbol is not on the prototype approved watchlist."})}
    const decision=riskCheck({...input,account:account.balance});
    await auditEvent(a.supabase,a.user.id,"PAPER_ORDER",input,decision.allowed?"ACCEPTED":"BLOCKED",decision.reason);
    if(!decision.allowed)return json(res,422,{status:"BLOCKED",...decision});
    const orderInsert={user_id:a.user.id,account_id:account.id,symbol,side:"BUY",entry:Number(input.entry),stop:Number(input.stop),target:Number(input.target),quantity:decision.quantity,status:"ACCEPTED"};
    const {data:order,error:orderError}=await a.supabase.from("paper_orders").insert(orderInsert).select("*").single();if(orderError)throw orderError;
    const pos=await a.supabase.from("paper_positions").insert({user_id:a.user.id,account_id:account.id,order_id:order.id,symbol,side:"BUY",entry:order.entry,stop:order.stop,target:order.target,quantity:order.quantity,status:"OPEN"}).select("*").single();if(pos.error)throw pos.error;
    return json(res,201,{id:order.id,status:"SIMULATED",side:order.side,symbol:order.symbol,entry:order.entry,stop:order.stop,target:order.target,quantity:order.quantity,createdAt:order.created_at});
  }
  return json(res,404,{error:"NOT_FOUND"});
 }catch(e){console.error(e);return json(res,400,{error:"BAD_REQUEST",message:e.message})}
});
server.listen(PORT,"0.0.0.0",()=>console.log("OBA AI Trader API listening on "+PORT));