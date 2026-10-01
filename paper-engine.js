/* OBA AI Trader — Paper Trading Engine v2
   Frontend simulation only. No broker/API connectivity. */
const OBA_PAPER_KEY="oba_ai_trader_paper_v2";
const SHARIAH_WATCHLIST={AAPL:{status:"approved",label:"Approved prototype watchlist"},MSFT:{status:"approved",label:"Approved prototype watchlist"}};
const START_BALANCE=10000;
function paperState(){try{const s=JSON.parse(localStorage.getItem(OBA_PAPER_KEY));if(s&&Number.isFinite(s.balance)&&Array.isArray(s.positions)&&Array.isArray(s.journal))return s}catch{}return{balance:START_BALANCE,equity:START_BALANCE,positions:[],journal:[]}}
function savePaper(s){localStorage.setItem(OBA_PAPER_KEY,JSON.stringify(s));renderPaper()}
async function syncPaperState(){try{const r=await obaApi("/api/paper/state");const s=paperState();s.balance=Number(r.account?.balance||s.balance);s.equity=Number(r.equity||s.balance);s.positions=(r.positions||[]).filter(p=>p.status==="OPEN").map(p=>({id:p.id,symbol:p.symbol,side:p.side,entry:Number(p.entry),stop:Number(p.stop),target:Number(p.target),qty:Number(p.quantity),current:Number(p.current_price||p.entry),opened:p.opened_at,apiOrderId:p.order_id}));savePaper(s);return s}catch(e){return paperState()}}
function paperNum(v){const n=Number(v);return Number.isFinite(n)?n:0}
function shariahGate(symbol){const x=SHARIAH_WATCHLIST[String(symbol).toUpperCase()];return x?{allowed:true,reason:x.label+"; this is not a fatwa or live certification."}:{allowed:false,reason:"Symbol is not on the prototype approved watchlist."}}
function paperWeek(){const d=new Date(),first=new Date(d.getFullYear(),0,1);return Math.ceil((((d-first)/86400000)+first.getDay()+1)/7)}
function paperRiskInputs(){const s=paperState();const daily=s.journal.filter(x=>x.day===new Date().toISOString().slice(0,10)&&x.pnl<0).reduce((a,x)=>a+Math.abs(x.pnl),0);const weekly=s.journal.filter(x=>x.week===paperWeek()&&x.pnl<0).reduce((a,x)=>a+Math.abs(x.pnl),0);return{positions:s.positions.length,dailyLoss:daily/s.balance,weeklyLoss:weekly/s.balance}}
function openPaperOrder(){const mt=document.getElementById("mt"),mx=document.getElementById("mx"),m=document.getElementById("m");const cfg=getRiskConfig();const html=`<div class="screen" id="paperShariahStatus"><span class="sub">SHARIAH SCREENING</span><strong>Checking selected asset…</strong><p>Prototype watchlist only. Not a fatwa or live certification.</p></div><div class="formgrid">
<label>Asset<select id="poSymbol" onchange="updatePaperTicket()"><option>AAPL</option><option>MSFT</option><option>TSLA</option><option>NVDA</option></select></label>
<label>Side<select id="poSide"><option value="BUY">Buy</option></select></label>
<label>Entry price<input id="poEntry" type="number" step="0.01" value="252.84" oninput="updatePaperTicket()"></label>
<label>Stop price<input id="poStop" type="number" step="0.01" value="250.32" oninput="updatePaperTicket()"></label>
<label>Target price<input id="poTarget" type="number" step="0.01" value="258.38" oninput="updatePaperTicket()"></label>
<label>Risk per trade<input id="poRisk" type="number" min="0.1" max="5" step="0.1" value="${(cfg.positionRisk*100).toFixed(1)}" oninput="updatePaperTicket()"></label>
<label>Quantity<input id="poQty" type="number" min="1" step="1" value="39" oninput="updatePaperRiskReadout()"></label></div>
<div class="paper-note" id="paperRiskReadout">Calculating risk…</div>
<div class="paper-note">PAPER ONLY · Order fills at the simulated entry price. Shariah screening runs before the deterministic risk gate.</div>
<div class="actions"><button class="btn primary" onclick="submitPaperOrder()">Validate & simulate fill</button><button class="btn ghost" onclick="closeM()">Cancel</button></div>`;
mt.textContent="Paper order ticket";mx.innerHTML=html;m.classList.add("open");updatePaperTicket()}
function updatePaperTicket(){
  const symbol=document.getElementById("poSymbol")?.value?.toUpperCase();
  const entry=paperNum(document.getElementById("poEntry")?.value);
  const stop=paperNum(document.getElementById("poStop")?.value);
  const riskInput=document.getElementById("poRisk");
  const qty=document.getElementById("poQty");
  const cfg=getRiskConfig();
  const gate=shariahGate(symbol);
  const status=document.getElementById("paperShariahStatus");
  if(status)status.innerHTML=`<span class="sub">SHARIAH SCREENING</span><strong style="color:${gate.allowed?"var(--g)":"var(--gold)"}">${gate.allowed?"✓ "+gate.reason:"⚠ "+gate.reason}</strong><p>Prototype status only; production screening needs documented methodology, current data and scholarly review.</p>`;
  if(riskInput && !riskInput.matches(":focus")) riskInput.value=(cfg.positionRisk*100).toFixed(1);
  const s=paperState();
  const riskPct=paperNum(riskInput?.value)/100;
  const perShare=Math.max(0,entry-stop);
  const maxRisk=s.balance*riskPct;
  const suggested=perShare>0?Math.max(1,Math.floor(maxRisk/perShare)):1;
  if(qty && !qty.matches(":focus")) qty.value=suggested;
  updatePaperRiskReadout();
}
function updatePaperRiskReadout(){
  const entry=paperNum(document.getElementById("poEntry")?.value);
  const stop=paperNum(document.getElementById("poStop")?.value);
  const qty=Math.floor(paperNum(document.getElementById("poQty")?.value));
  const riskPct=paperNum(document.getElementById("poRisk")?.value)/100;
  const s=paperState();
  const risk=Math.max(0,entry-stop)*qty;
  const max=s.balance*riskPct;
  const el=document.getElementById("paperRiskReadout");
  if(el)el.innerHTML=`<b>Position risk:</b> ${risk.toFixed(2)} / ${max.toFixed(2)} allowed · ${max>0?((risk/max)*100).toFixed(0):0}% of selected risk budget. ${risk<=max?"✓ Within selected risk":"⚠ Reduce quantity or tighten the stop."}`;
}
async function submitPaperOrder(){const symbol=document.getElementById("poSymbol").value.toUpperCase(),entry=paperNum(document.getElementById("poEntry").value),stop=paperNum(document.getElementById("poStop").value),target=paperNum(document.getElementById("poTarget").value),qty=Math.floor(paperNum(document.getElementById("poQty").value)),gate=shariahGate(symbol),s=paperState(),selectedRisk=paperNum(document.getElementById("poRisk")?.value)/100;
if(!gate.allowed){closeM();modal("Shariah gate blocked",gate.reason);paperLog(symbol,"ENTRY","BLOCKED",0,gate.reason);return}
if(qty<1){closeM();modal("Order blocked","Quantity must be at least 1.");return}
const rd=paperRiskInputs(),decision=riskDecision({account:s.balance,entry,stop,target,positions:rd.positions,dailyLoss:rd.dailyLoss*100,weeklyLoss:rd.weeklyLoss*100}),requestedRisk=Math.max(0,entry-stop)*qty,maxRisk=s.balance*selectedRisk;
if(requestedRisk>maxRisk){closeM();modal("Risk gate blocked",`Requested risk is $${requestedRisk.toFixed(2)}; configured maximum is $${maxRisk.toFixed(2)}.`);paperLog(symbol,"ENTRY","BLOCKED",0,"Position risk exceeds limit");return}
if(!decision.allowed){closeM();modal("Risk gate blocked",decision.reasons.join(" "));paperLog(symbol,"ENTRY","BLOCKED",0,decision.reasons.join(" "));return}
try{
  const remote=await obaApi("/api/paper/orders",{method:"POST",body:JSON.stringify({account:s.balance,symbol,entry,stop,target,quantity:qty,openPositions:rd.positions,dailyLoss:rd.dailyLoss})});
  const position={id:remote.id||Date.now().toString(),symbol,side:"BUY",entry,stop,target,qty:Math.floor(Number(remote.quantity)||qty),current:entry,opened:new Date().toISOString(),apiOrderId:remote.id};
  s.positions.push(position);paperLogInto(s,symbol,"ENTRY","FILLED",0,"Render API accepted; Shariah gate passed; server risk gate passed");savePaper(s);closeM();modal("Paper fill confirmed",`BUY ${position.qty} ${symbol} at $${entry.toFixed(2)}. Render accepted the paper order. No real order was sent.`)
}catch(err){closeM();modal("Server risk gate blocked",err.message);paperLog(symbol,"ENTRY","BLOCKED",0,"Render API: "+err.message)}
}
function paperLog(symbol,action,status,pnl,reason){const s=paperState();paperLogInto(s,symbol,action,status,pnl,reason);savePaper(s)}
function paperLogInto(s,symbol,action,status,pnl,reason){const d=new Date();s.journal.unshift({time:d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}),day:d.toISOString().slice(0,10),week:paperWeek(),symbol,action,status,pnl:Number(pnl)||0,reason});s.journal=s.journal.slice(0,30)}
async function simulateMarket(){try{const r=await obaApi("/api/paper/tick",{method:"POST",body:"{}"});await syncPaperState()}catch(e){}}
function closePaperPosition(id){const s=paperState(),i=s.positions.findIndex(p=>p.id===id);if(i<0)return;const p=s.positions[i],pnl=(p.current-p.entry)*p.qty;s.balance+=pnl;s.positions.splice(i,1);paperLogInto(s,p.symbol,"EXIT","MANUAL",pnl,"User closed paper position");s.equity=s.balance;savePaper(s)}
function resetPaper(){if(!confirm("Reset paper account and journal?"))return;localStorage.removeItem(OBA_PAPER_KEY);renderPaper();modal("Paper account reset","Starting balance restored to $10,000. No real funds were affected.")}
function renderPaper(){const s=paperState(),avail=s.balance-s.positions.reduce((a,p)=>a+p.entry*p.qty,0),eq=s.balance+s.positions.reduce((a,p)=>a+(p.current-p.entry)*p.qty,0);const bal=document.getElementById("paperBalance"),av=document.getElementById("paperAvailable"),eqe=document.getElementById("paperEquity"),cnt=document.getElementById("paperOpen");if(bal)bal.textContent="$"+s.balance.toFixed(2);if(av)av.textContent="$"+avail.toFixed(2);if(eqe)eqe.textContent="$"+eq.toFixed(2);if(cnt)cnt.textContent=String(s.positions.length);const pos=document.getElementById("paperPositions"),j=document.getElementById("paperJournal");
if(pos)pos.innerHTML=s.positions.length?s.positions.map(p=>`<tr><td>${p.symbol}</td><td>BUY</td><td>$${p.entry.toFixed(2)}</td><td>$${p.current.toFixed(2)}</td><td>${p.qty}</td><td class="${p.current>=p.entry?"pass":"red"}">${(p.current-p.entry)*p.qty>=0?"+":"-"}$${Math.abs((p.current-p.entry)*p.qty).toFixed(2)}</td><td><button class="btn ghost" onclick="closePaperPosition('${p.id}')">Close</button></td></tr>`).join(""):'<tr><td colspan="7" class="sub">No open paper positions.</td></tr>';
if(j)j.innerHTML=s.journal.slice(0,8).map(x=>`<tr><td>${x.time}</td><td>${x.symbol}</td><td>${x.action}</td><td>Paper</td><td>${x.reason}</td><td class="${x.status==="BLOCKED"?"red":x.status==="FILLED"||x.status==="TARGET"?"pass":""}">${x.status}</td></tr>`).join("")||'<tr><td colspan="6" class="sub">No paper events yet.</td></tr>'}
document.addEventListener("DOMContentLoaded",async()=>{renderPaper();await syncPaperState();setInterval(simulateMarket,5000)})