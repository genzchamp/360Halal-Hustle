/* OBA AI Trader — deterministic client-side risk engine
   Prototype only. No broker connectivity or real orders. */
const OBA_RISK_KEY = "oba_ai_trader_risk_v1";
const DEFAULT_RISK = {
  positionRisk: 1,
  dailyLoss: 2,
  weeklyLoss: 5,
  maxPositions: 3,
  stopRequired: true,
  takeProfit: 4.8,
  stopLoss: 2
};

let OBA_SERVER_RISK = null;
function setServerRisk(r){
  if(!r) return;
  OBA_SERVER_RISK={positionRisk:Number(r.maxRiskPerTrade||0.01)*100,dailyLoss:Number(r.maxDailyLoss||0.02)*100,weeklyLoss:Number(r.maxWeeklyLoss||0.05)*100,maxPositions:Number(r.maxOpenPositions||3)};
  renderRiskConfig();
}
function getRiskConfig(){
  let local={}; try{local=JSON.parse(localStorage.getItem(OBA_RISK_KEY))||{}}catch{}
  const server=OBA_SERVER_RISK||{positionRisk:DEFAULT_RISK.positionRisk,dailyLoss:DEFAULT_RISK.dailyLoss,weeklyLoss:DEFAULT_RISK.weeklyLoss,maxPositions:DEFAULT_RISK.maxPositions};
  return {...DEFAULT_RISK,...local,positionRisk:server.positionRisk,dailyLoss:server.dailyLoss,weeklyLoss:server.weeklyLoss,maxPositions:server.maxPositions,stopRequired:true};
}
function saveRiskConfig(cfg){
  const current=getRiskConfig(),safePrefs={stopLoss:Number(cfg.stopLoss),takeProfit:Number(cfg.takeProfit)};
  if(Object.values(safePrefs).some(v=>!Number.isFinite(v)||v<=0)) return;
  localStorage.setItem(OBA_RISK_KEY,JSON.stringify({...current,...safePrefs,positionRisk:current.positionRisk,dailyLoss:current.dailyLoss,weeklyLoss:current.weeklyLoss,maxPositions:current.maxPositions,stopRequired:true}));
  renderRiskConfig();
}
function fmt(v){ return Number(v).toFixed(v % 1 ? 1 : 0) + "%"; }

function renderRiskConfig(){
  const c=getRiskConfig();
  const map={
    riskPosition:fmt(c.positionRisk),
    riskDaily:fmt(c.dailyLoss),
    riskWeekly:fmt(c.weeklyLoss),
    riskPositions:String(c.maxPositions),
    riskStop:c.stopRequired?"ON":"OFF",
    riskTarget:fmt(c.takeProfit)
  };
  Object.entries(map).forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.textContent=val;});
}

function riskDecision({account=10000, entry, stop, target, positions=0, dailyLoss=0, weeklyLoss=0}){
  const c=getRiskConfig();
  const reasons=[];
  if(!Number.isFinite(entry)||!Number.isFinite(stop)||entry<=0||stop<=0) reasons.push("Invalid entry or stop price.");
  const stopPct = Number.isFinite(entry)&&entry>0 ? Math.abs(entry-stop)/entry*100 : Infinity;
  const targetPct = Number.isFinite(entry)&&entry>0&&Number.isFinite(target) ? Math.abs(target-entry)/entry*100 : 0;
  if(c.stopRequired && (!Number.isFinite(stopPct)||stopPct<=0)) reasons.push("A valid stop-loss is required.");
  if(stopPct>c.positionRisk*2) reasons.push("Stop distance exceeds the configured risk envelope.");
  if(targetPct>0 && targetPct/Math.max(stopPct,0.0001)<1) reasons.push("Take-profit is below a 1:1 reward-to-risk ratio.");
  if(positions>=c.maxPositions) reasons.push("Maximum open positions reached.");
  if(dailyLoss>=c.dailyLoss) reasons.push("Daily loss limit reached.");
  if(weeklyLoss>=c.weeklyLoss) reasons.push("Weekly loss limit reached.");
  const riskAmount=account*(c.positionRisk/100);
  const qty=stopPct>0&&Number.isFinite(stopPct)?Math.floor(riskAmount/(entry*(stopPct/100))):0;
  return {allowed:reasons.length===0, reasons, stopPct, targetPct, riskAmount, suggestedQty:qty};
}

function openRiskConfig(){
  const c=getRiskConfig();
  const body=`<div class="formgrid">
    <label>Risk / position (%)<input id="rp" type="number" min="0.1" max="10" step="0.1" value="${c.positionRisk}" readonly disabled></label>
    <label>Daily loss limit (%)<input id="rd" type="number" min="0.1" max="50" step="0.1" value="${c.dailyLoss}" readonly disabled></label>
    <label>Weekly loss limit (%)<input id="rw" type="number" min="0.1" max="100" step="0.1" value="${c.weeklyLoss}" readonly disabled></label>
    <label>Max open positions<input id="rm" type="number" min="1" max="50" step="1" value="${c.maxPositions}" readonly disabled></label>
    <label>Stop-loss (%)<input id="rs" type="number" min="0.1" max="50" step="0.1" value="${c.stopLoss}"></label>
    <label>Take-profit (%)<input id="rt" type="number" min="0.1" max="100" step="0.1" value="${c.takeProfit}"></label>
  </div>
  <div class="paper-note">Safety limits are server-enforced and cannot be changed from this browser. Only stop-loss and take-profit preferences are stored locally.</div>
  <div class="actions"><button class="btn primary" onclick="applyRiskConfig()">Save controls</button><button class="btn ghost" onclick="closeM()">Cancel</button></div>`;
  mt.textContent="Risk controls"; mx.innerHTML=body; m.classList.add("open");
}
function applyRiskConfig(){
  const n=id=>Number(document.getElementById(id).value);
  const cfg={stopLoss:n("rs"),takeProfit:n("rt")};
  if(Object.values(cfg).some(v=>!Number.isFinite(v)||v<=0)) return;
  saveRiskConfig(cfg); closeM(); modal("Controls saved","Server safety limits remain enforced. Your stop-loss and take-profit preferences were saved locally.");
}
document.addEventListener("DOMContentLoaded",renderRiskConfig);
