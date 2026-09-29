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

function getRiskConfig(){
  try { return {...DEFAULT_RISK, ...(JSON.parse(localStorage.getItem(OBA_RISK_KEY)) || {})}; }
  catch { return {...DEFAULT_RISK}; }
}
function saveRiskConfig(cfg){
  localStorage.setItem(OBA_RISK_KEY, JSON.stringify(cfg));
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
    <label>Risk / position (%)<input id="rp" type="number" min="0.1" max="10" step="0.1" value="${c.positionRisk}"></label>
    <label>Daily loss limit (%)<input id="rd" type="number" min="0.1" max="50" step="0.1" value="${c.dailyLoss}"></label>
    <label>Weekly loss limit (%)<input id="rw" type="number" min="0.1" max="100" step="0.1" value="${c.weeklyLoss}"></label>
    <label>Max open positions<input id="rm" type="number" min="1" max="50" step="1" value="${c.maxPositions}"></label>
    <label>Stop-loss (%)<input id="rs" type="number" min="0.1" max="50" step="0.1" value="${c.stopLoss}"></label>
    <label>Take-profit (%)<input id="rt" type="number" min="0.1" max="100" step="0.1" value="${c.takeProfit}"></label>
  </div>
  <label class="check"><input id="rstop" type="checkbox" ${c.stopRequired?"checked":""}> Mandatory stop-loss</label>
  <div class="actions"><button class="btn primary" onclick="applyRiskConfig()">Save controls</button><button class="btn ghost" onclick="closeM()">Cancel</button></div>`;
  mt.textContent="Risk controls"; mx.innerHTML=body; m.classList.add("open");
}
function applyRiskConfig(){
  const n=id=>Number(document.getElementById(id).value);
  const cfg={positionRisk:n("rp"),dailyLoss:n("rd"),weeklyLoss:n("rw"),maxPositions:Math.max(1,Math.floor(n("rm"))),stopLoss:n("rs"),takeProfit:n("rt"),stopRequired:document.getElementById("rstop").checked};
  if(Object.values(cfg).some(v=>typeof v==="number" && (!Number.isFinite(v)||v<=0))) return;
  saveRiskConfig(cfg); closeM(); modal("Controls saved","Your paper-trading risk rules are now stored on this device. Real execution is not connected.");
}
document.addEventListener("DOMContentLoaded",renderRiskConfig);
