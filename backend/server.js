import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 8080);
const MAX_RISK = Number(process.env.MAX_RISK_PER_TRADE || 0.01);
const MAX_DAILY_LOSS = Number(process.env.MAX_DAILY_LOSS || 0.02);
const MAX_OPEN_POSITIONS = Number(process.env.MAX_OPEN_POSITIONS || 3);

const audit = [];
const paperOrders = [];

function json(res, status, body) {
  res.writeHead(status, {"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,authorization"});
  res.end(JSON.stringify(body));
}

function riskCheck({account=10000, entry, stop, target, quantity=0, openPositions=0, dailyLoss=0}) {
  entry=Number(entry); stop=Number(stop); target=Number(target);
  if (![entry,stop,target].every(Number.isFinite) || entry<=0 || stop<=0 || target<=entry)
    return {allowed:false, code:"INVALID_ORDER", reason:"Invalid entry, stop or target."};
  if (stop>=entry) return {allowed:false, code:"STOP_REQUIRED", reason:"Long paper orders require a stop below entry."};
  if (openPositions>=MAX_OPEN_POSITIONS)
    return {allowed:false, code:"MAX_POSITIONS", reason:"Maximum open positions reached."};
  if (dailyLoss>=MAX_DAILY_LOSS)
    return {allowed:false, code:"DAILY_LOSS_LIMIT", reason:"Daily loss limit reached."};
  const riskPerUnit=entry-stop;
  const riskAmount=Number(account)*MAX_RISK;
  const qty=riskAmount/riskPerUnit;
  const rewardPerUnit=target-entry;
  const requestedQty=Math.floor(Number(quantity)||0);
  if(requestedQty<1) return {allowed:false, code:"INVALID_QUANTITY", reason:"Quantity must be at least 1."};
  const requestedRisk=riskPerUnit*requestedQty;
  if(requestedRisk>riskAmount) return {allowed:false, code:"POSITION_RISK", reason:"Requested position risk exceeds the server risk limit.", requestedRisk, maxRisk:riskAmount};
  if (rewardPerUnit/riskPerUnit<1)
    return {allowed:false, code:"REWARD_RISK", reason:"Reward/risk must be at least 1:1."};
  return {allowed:true, code:"ALLOWED", riskAmount, quantity:requestedQty, requestedRisk, rewardRisk:rewardPerUnit/riskPerUnit};
}

async function body(req) {
  let raw="";
  for await (const chunk of req) raw+=chunk;
  return raw?JSON.parse(raw):{};
}

const server=http.createServer(async (req,res)=>{
  try {
    if(req.method==="OPTIONS") return json(res,204,{});
    if(req.method==="GET" && (req.url==="/health" || req.url==="/api/health"))
      return json(res,200,{ok:true,service:"oba-ai-trader-api",mode:"paper",liveExecution:false});
    if(req.method==="POST" && req.url==="/api/risk/check"){
      const input=await body(req), decision=riskCheck(input);
      audit.push({id:randomUUID(),type:"RISK_CHECK",at:new Date().toISOString(),input,decision});
      return json(res,decision.allowed?200:422,decision);
    }
    if(req.method==="POST" && req.url==="/api/paper/orders"){
      const input=await body(req), decision=riskCheck(input);
      const event={id:randomUUID(),at:new Date().toISOString(),input,decision,status:decision.allowed?"ACCEPTED":"BLOCKED"};
      audit.push({id:event.id,type:"PAPER_ORDER",...event});
      if(!decision.allowed) return json(res,422,event);
      const order={id:event.id,status:"SIMULATED",side:"BUY",symbol:input.symbol||"UNKNOWN",entry:Number(input.entry),stop:Number(input.stop),target:Number(input.target),quantity:decision.quantity,createdAt:event.at};
      paperOrders.push(order);
      return json(res,201,order);
    }
    if(req.method==="GET" && req.url==="/api/audit")
      return json(res,200,{events:audit.slice(-200)});
    if(req.method==="GET" && req.url==="/api/paper/orders")
      return json(res,200,{orders:paperOrders});
    return json(res,404,{error:"NOT_FOUND"});
  } catch(e) {
    return json(res,400,{error:"BAD_REQUEST",message:e.message});
  }
});

server.listen(PORT,"0.0.0.0",()=>console.log("OBA AI Trader API listening on "+PORT));