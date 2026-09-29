/* OBA AI Trader — Paper Trading Engine v2
   Frontend simulation only. No broker/API connectivity. */
const OBA_PAPER_KEY="oba_ai_trader_paper_v2";
const SHARIAH_WATCHLIST={AAPL:{status:"approved",label:"Approved prototype watchlist"},MSFT:{status:"approved",label:"Approved prototype watchlist"}};
const START_BALANCE=10000;
function paperState(){try{const s=JSON.parse(localStorage.getItem(OBA_PAPER_KEY));if(s&&Number.isFinite(s.balance)&&Array.isArray(s.positions)&&Array.isArray(s.journal))return s}catch{}return{balance:START_BALANCE,equity:START_BALANCE,positions:[],journal:[]}}
function savePaper(s){localStorage.setItem(OBA_PAPER_KEY,JSON.stringify(s));renderPaper()}
function paperNum(v){const n=Number(v);return Number.isFinite(n)?n:0}
function shariahGate(symbol){const x=SHARIAH_WATCHLIST[String(symbol).toUpperCase()];return x?{allowed:true,reason:x.label+"; this is not a fatwa or live certification."}:{allowed:false,reason:"Symbol is not on the prototype approved watchlist."}}
function paperWeek(){const d=new Date(),first=new Date(d.getFullYear(),0,1);return Math.ceil((((d-first)/86400000)+first.getDay()+1)/7)}
function paperRiskInputs(){const s=paperState();const daily=s.journal.filter(x=>x.day===new Date().toISOString().slice(0,10)&&x.pnl<0).reduce((a,x)=>a+Math.abs(x.pnl),0);const weekly=s.journal.filter(x=>x.week===paperWeek()&&x.pnl<0).reduce((a,x)=>a+Math.abs(x.pnl),0);return{positions:s.positions.length,dailyLoss:daily/s.balance,weeklyLoss:weekly/s.balance}}
function openPaperOrder(){const html=\`<div class="formgrid">
<label>Asset<select id="poSymbol"><option>AAPL</option><option>MSFT</option><option>TSLA</option><option>NVDA</option></select></label>
<label>Side<select id="poSide"><option value="BUY">Buy</option></select></label>
<label>Entry price<input id="poEntry" type="number" step="0.01" value="252.84"></label>
<label>Stop price<input id="poStop" type="number" step="0.01" value="247.78"></label>
<label>Target price<input id="poTarget" type="number" step="0.01" value="264.98"></label>
<label>Quantity<input id="poQty" type="number" min="1" step="1" value="10"></label></div>
<div class="paper-note">PAPER ONLY · Order fills at the simulated entry price. Shariah screening and deterministic risk checks run before the fill.</div>
<div class="actions"><button class="btn primary" onclick="submitPaperOrder()">Validate & simulate fill</button><button class="btn ghost" onclick="closeM()">Cancel</button></div>\`;
mt.textContent="Paper order ticket";mx.innerHTML=html;m.classList.add("open")}
function submitPaperOrder(){const symbol=document.getElementById("poSymbol").value.toUpperCase(),entry=paperNum(document.getElementById("poEntry").value),stop=paperNum(document.getElementById("poStop").value),target=paperNum(document.getElementById("poTarget").value),qty=Math.floor(paperNum(document.getElementById("poQty").value)),gate=shariahGate(symbol),s=paperState();
if(!gate.allowed){closeM();modal("Shariah gate blocked",gate.reason);paperLog(symbol,"ENTRY","BLOCKED",0,gate.reason);return}
if(qty<1){closeM();modal("Order blocked","Quantity must be at least 1.");return}
const rd=paperRiskInputs(),decision=riskDecision({account:s.balance,entry,stop,target,positions:rd.positions,dailyLoss:rd.dailyLoss*100,weeklyLoss:rd.weeklyLoss*100}),requestedRisk=entry*qty*(decision.stopPct/100),maxRisk=s.balance*(getRiskConfig().positionRisk/100);
if(requestedRisk>maxRisk){closeM();modal("Risk gate blocked",`Requested risk is $${requestedRisk.toFixed(2)}; configured maximum is $${maxRisk.toFixed(2)}.`);paperLog(symbol,"ENTRY","BLOCKED",0,"Position risk exceeds limit");return}
if(!decision.allowed){closeM();modal("Risk gate blocked",decision.reasons.join(" "));paperLog(symbol,"ENTRY","BLOCKED",0,decision.reasons.join(" "));return}
try{
  const remote=await obaApi("/api/paper/orders",{method:"POST",body:JSON.stringify({account:s.balance,symbol,entry,stop,target,openPositions:rd.positions,dailyLoss:rd.dailyLoss})});
  const position={id:remote.id||Date.now().toString(),symbol,side:"BUY",entry,stop,target,qty:Math.floor(Number(remote.quantity)||qty),current:entry,opened:new Date().toISOString(),apiOrderId:remote.id};
  s.positions.push(position);paperLogInto(s,symbol,"ENTRY","FILLED",0,"Render API accepted; Shariah gate passed; server risk gate passed");savePaper(s);closeM();modal("Paper fill confirmed",`BUY ${position.qty} ${symbol} at $${entry.toFixed(2)}. Render accepted the paper order. No real order was sent.`)
}catch(err){closeM();modal("Server risk gate blocked",err.message);paperLog(symbol,"ENTRY","BLOCKED",0,"Render API: "+err.message)}
}
function paperLog(symbol,action,status,pnl,reason){const s=paperState();paperLogInto(s,symbol,action,status,pnl,reason);savePaper(s)}
function paperLogInto(s,symbol,action,status,pnl,reason){const d=new Date();s.journal.unshift({time:d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}),day:d.toISOString().slice(0,10),week:paperWeek(),symbol,action,status,pnl:Number(pnl)||0,reason});s.journal=s.journal.slice(0,30)}
function simulateMarket(){const s=paperState();s.positions.forEach(p=>{p.current=Math.max(.01,p.current*(1+(Math.random()-.46)*.012))});const closed=[];s.positions=s.positions.filter(p=>{if(p.current<=p.stop||p.current>=p.target){const pnl=(p.current-p.entry)*p.qty;s.balance+=pnl;closed.push({p,pnl});return false}return true});closed.forEach(({p,pnl})=>paperLogInto(s,p.symbol,"EXIT",pnl>=0?"TARGET":"STOP",pnl,pnl>=0?"Target reached":"Stop-loss reached"));s.equity=s.balance+s.positions.reduce((a,p)=>a+(p.current-p.entry)*p.qty,0);savePaper(s)}
function closePaperPosition(id){const s=paperState(),i=s.positions.findIndex(p=>p.id===id);if(i<0)return;const p=s.positions[i],pnl=(p.current-p.entry)*p.qty;s.balance+=pnl;s.positions.splice(i,1);paperLogInto(s,p.symbol,"EXIT","MANUAL",pnl,"User closed paper position");s.equity=s.balance;savePaper(s)}
function resetPaper(){if(!confirm("Reset paper account and journal?"))return;localStorage.removeItem(OBA_PAPER_KEY);renderPaper();modal("Paper account reset","Starting balance restored to $10,000. No real funds were affected.")}
function renderPaper(){const s=paperState(),avail=s.balance-s.positions.reduce((a,p)=>a+p.entry*p.qty,0),eq=s.balance+s.positions.reduce((a,p)=>a+(p.current-p.entry)*p.qty,0);const bal=document.getElementById("paperBalance"),av=document.getElementById("paperAvailable"),eqe=document.getElementById("paperEquity"),cnt=document.getElementById("paperOpen");if(bal)bal.textContent="$"+s.balance.toFixed(2);if(av)av.textContent="$"+avail.toFixed(2);if(eqe)eqe.textContent="$"+eq.toFixed(2);if(cnt)cnt.textContent=String(s.positions.length);const pos=document.getElementById("paperPositions"),j=document.getElementById("paperJournal");
if(pos)pos.innerHTML=s.positions.length?s.positions.map(p=>\`<tr><td>\${p.symbol}</td><td>BUY</td><td>$\${p.entry.toFixed(2)}</td><td>$\${p.current.toFixed(2)}</td><td>\${p.qty}</td><td class="\${p.current>=p.entry?"pass":"red"}">\${(p.current-p.entry)*p.qty>=0?"+":"-"}$\${Math.abs((p.current-p.entry)*p.qty).toFixed(2)}</td><td><button class="btn ghost" onclick="closePaperPosition('\${p.id}')">Close</button></td></tr>\`).join(""):'<tr><td colspan="7" class="sub">No open paper positions.</td></tr>';
if(j)j.innerHTML=s.journal.slice(0,8).map(x=>\`<tr><td>\${x.time}</td><td>\${x.symbol}</td><td>\${x.action}</td><td>Paper</td><td>\${x.reason}</td><td class="\${x.status==="BLOCKED"?"red":x.status==="FILLED"||x.status==="TARGET"?"pass":""}">\${x.status}</td></tr>\`).join("")||'<tr><td colspan="6" class="sub">No paper events yet.</td></tr>'}
document.addEventListener("DOMContentLoaded",()=>{renderPaper();setInterval(simulateMarket,5000)})