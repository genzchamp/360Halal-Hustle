/* OBA AI Trader — Paper Trading Engine v2
   Frontend simulation only. No broker/API connectivity. */
const OBA_PAPER_KEY="oba_ai_trader_paper_v2";
const START_BALANCE=10000;
function paperState(){try{const s=JSON.parse(localStorage.getItem(OBA_PAPER_KEY));if(s&&Number.isFinite(s.balance)&&Array.isArray(s.positions)&&Array.isArray(s.journal))return s}catch{}return{balance:START_BALANCE,equity:START_BALANCE,positions:[],journal:[]}}
function savePaper(s){localStorage.setItem(OBA_PAPER_KEY,JSON.stringify(s));renderPaper()}
async function syncPaperState(){try{const r=await obaApi("/api/paper/state");const s=paperState();s.balance=Number(r.account?.balance||s.balance);s.equity=Number(r.equity||s.balance);s.positions=(r.positions||[]).filter(p=>p.status==="OPEN").map(p=>({id:p.id,symbol:p.symbol,side:p.side,entry:Number(p.entry),stop:Number(p.stop),target:Number(p.target),qty:Number(p.quantity),current:Number(p.current_price||p.entry),opened:p.opened_at,apiOrderId:p.order_id}));const serverJournal=(r.journal||[]).map(j=>({timestamp:Date.parse(j.created_at)||0,time:new Date(j.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}),day:new Date(j.created_at).toISOString().slice(0,10),symbol:j.symbol,action:j.action,status:j.action==="EXIT"?"CLOSED":j.action,pnl:Number(j.pnl||0),reason:j.notes||"",source:"server"}));const localOnly=(s.journal||[]).filter(j=>j.localOnly===true);const seen=new Set(serverJournal.map(j=>[j.symbol,j.action,j.status,j.reason,j.day].join("|")));const keepLocal=localOnly.filter(j=>!seen.has([j.symbol,j.action,j.status,j.reason,j.day].join("|")));s.journal=[...serverJournal,...keepLocal].sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)).slice(0,100);s.risk=r.risk||null;if(typeof setServerRisk==="function")setServerRisk(s.risk);savePaper(s);return s}catch(e){return paperState()}}
function paperNum(v){const n=Number(v);return Number.isFinite(n)?n:0}
function shariahGate(symbol){
  if(!window.OBA_SHARIAH_ENGINE)return{allowed:false,decision:"UNABLE_TO_VERIFY",reason:"Shariah decision engine did not load.",checks:[]};
  return window.OBA_SHARIAH_ENGINE.evaluate({symbol,transaction:{},screening:{},policyReview:{}});
}
function shariahEscape(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}
function renderShariahDecision(gate){
  const screen=document.getElementById("paperShariahStatus");if(!screen)return;
  const color=gate.decision==="REJECTED"?"var(--red)":gate.decision==="PERMITTED_UNDER_POLICY"?"var(--g)":"var(--gold)";
  const checks=(gate.checks||[]).map(c=>'<li><b>'+shariahEscape(c.status)+' · '+shariahEscape(c.label)+':</b> '+shariahEscape(c.reason)+' '+(c.sources||[]).map(s=>'<a href="'+shariahEscape(s.url)+'" target="_blank" rel="noopener noreferrer">'+shariahEscape(s.title)+'</a>').join(" · ")+'</li>').join("");
  screen.innerHTML='<span class="sub">SHARIAH DECISION · '+shariahEscape(gate.policyVersion||"engine unavailable")+'</span><strong style="display:block;color:'+color+'">'+shariahEscape(gate.decision||"UNABLE_TO_VERIFY")+'</strong><p>'+shariahEscape(gate.summary||gate.reason)+'</p><details><summary>View rule-by-rule evidence and reasons</summary><ol style="padding-left:18px;line-height:1.6">'+checks+'</ol></details><p>Draft policy only. No trade is permitted until current screening evidence and a qualified-scholar-reviewed methodology are verified.</p>';
}
function paperWeek(){const d=new Date(),first=new Date(d.getFullYear(),0,1);return Math.ceil((((d-first)/86400000)+first.getDay()+1)/7)}
function paperRiskInputs(){const s=paperState(),r=s.risk||{};return{positions:Number(r.openPositions??s.positions.length),dailyLoss:Number(r.dailyLossPct||0),weeklyLoss:Number(r.weeklyLossPct||0)}}
async function openPaperOrder(){
  // Refresh provider quotes before opening the ticket so stale hard-coded prices can never be used.
  await refreshMarketQuotes();
  const mt=document.getElementById("mt"),mx=document.getElementById("mx"),m=document.getElementById("m");
  const cfg=getRiskConfig();
  const html=`<div class="screen" id="paperShariahStatus"><span class="sub">SHARIAH DECISION</span><strong>Checking evidence…</strong><p>Missing evidence must block the order.</p></div><div class="formgrid">
<label>Asset<select id="poSymbol" onchange="updatePaperTicket()"><option>AAPL</option><option>MSFT</option></select></label>
<label>Side<select id="poSide"><option value="BUY">Buy</option></select></label>
<label>Entry price (latest provider quote)<input id="poEntry" type="number" step="0.01" placeholder="Waiting for quote…" readonly></label>
<label>Stop price<input id="poStop" type="number" step="0.01" placeholder="Waiting for quote…" oninput="updatePaperRiskReadout()"></label>
<label>Target price<input id="poTarget" type="number" step="0.01" placeholder="Waiting for quote…" oninput="updatePaperRiskReadout()"></label>
<label>Risk per trade<input id="poRisk" type="number" value="${cfg.positionRisk.toFixed(1)}" readonly disabled></label>
<label>Quantity<input id="poQty" type="number" min="1" step="1" value="1" oninput="updatePaperRiskReadout()"></label></div>
<div class="paper-note" id="paperQuoteStatus">Checking the latest provider quote…</div>
<div class="paper-note" id="paperRiskReadout">Calculating risk…</div>
<div class="paper-note">PAPER ONLY · No broker order is sent. A ticker alone is not proof of Shariah permissibility. This draft engine blocks orders unless the required evidence and scholar-reviewed methodology are verified.</div>
<div class="actions"><button id="paperSubmitBtn" class="btn primary" onclick="submitPaperOrder()">Validate paper order</button><button class="btn ghost" onclick="closeM()">Cancel</button></div>`;
  mt.textContent="Paper order ticket";mx.innerHTML=html;m.classList.add("open");
  OBA_LAST_TICKET_SYMBOL="";
  updatePaperTicket();
}
let OBA_LAST_TICKET_SYMBOL="";
function updatePaperTicket(){
  const symbol=document.getElementById("poSymbol")?.value?.toUpperCase();
  const quote=window.OBA_MARKET_QUOTES?.[symbol];
  const price=Number(quote?.price);
  const quoteTime=Date.parse(quote?.fetchedAt||"");
  const fresh=Number.isFinite(quoteTime)&&Date.now()-quoteTime<120000&&Date.now()>=quoteTime;
  const entryEl=document.getElementById("poEntry"),stopEl=document.getElementById("poStop"),targetEl=document.getElementById("poTarget"),qty=document.getElementById("poQty");
  const status=document.getElementById("paperQuoteStatus");
  const changed=symbol!==OBA_LAST_TICKET_SYMBOL;
  if(changed)OBA_LAST_TICKET_SYMBOL=symbol||"";
  if(entryEl){
    entryEl.value=Number.isFinite(price)&&price>0&&fresh?price.toFixed(2):"";
    entryEl.dataset.quoteTime=quote?.fetchedAt||"";
  }
  if(changed&&Number.isFinite(price)&&price>0&&fresh){
    if(stopEl)stopEl.value=(price*0.98).toFixed(2);
    if(targetEl)targetEl.value=(price*1.048).toFixed(2);
  }else if(changed){
    if(stopEl)stopEl.value="";
    if(targetEl)targetEl.value="";
  }
  if(status)status.textContent=Number.isFinite(price)&&price>0&&fresh
    ? "Quote ready: "+symbol+" at $"+price.toFixed(2)+" · received "+new Date(quote.fetchedAt).toLocaleTimeString()+". Confirm stop, target and quantity before submitting."
    : "No fresh provider quote for "+(symbol||"this asset")+". Refresh quotes and try again. Orders are blocked without a fresh quote.";
  const gate=shariahGate(symbol);renderShariahDecision(gate);
  const riskInput=document.getElementById("poRisk"),cfg=getRiskConfig();
  if(riskInput)riskInput.value=cfg.positionRisk.toFixed(1);
  const s=paperState(),riskPct=cfg.positionRisk/100;
  const perShare=Math.max(0,Number(entryEl?.value||0)-Number(stopEl?.value||0));
  const maxRisk=s.balance*riskPct;
  const suggested=perShare>0?Math.max(1,Math.floor(maxRisk/perShare)):1;
  if(qty&&!qty.matches(":focus"))qty.value=suggested;
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
const OBA_PENDING_ORDER_KEY="oba_ai_trader_pending_order_v1";
function newPaperIdempotencyKey(){return crypto?.randomUUID?crypto.randomUUID():("paper-"+Date.now()+"-"+Math.random().toString(36).slice(2))}
function getPendingPaperOrder(payload){
  try{
    const pending=JSON.parse(localStorage.getItem(OBA_PENDING_ORDER_KEY)||"null");
    if(pending&&pending.fingerprint===JSON.stringify(payload)&&pending.key)return pending.key;
  }catch{}
  const key=newPaperIdempotencyKey();
  localStorage.setItem(OBA_PENDING_ORDER_KEY,JSON.stringify({fingerprint:JSON.stringify(payload),key}));
  return key;
}
function clearPendingPaperOrder(){localStorage.removeItem(OBA_PENDING_ORDER_KEY)}
async function submitPaperOrder(){const submitBtn=document.getElementById("paperSubmitBtn");if(submitBtn?.disabled)return;if(submitBtn)submitBtn.disabled=true;const symbol=document.getElementById("poSymbol").value.toUpperCase(),quote=window.OBA_MARKET_QUOTES?.[symbol],quoteTime=Date.parse(quote?.fetchedAt||""),fresh=Number.isFinite(quoteTime)&&Date.now()-quoteTime<120000&&Date.now()>=quoteTime,entry=paperNum(document.getElementById("poEntry").value),stop=paperNum(document.getElementById("poStop").value),target=paperNum(document.getElementById("poTarget").value),qty=Math.floor(paperNum(document.getElementById("poQty").value)),gate=shariahGate(symbol),s=paperState(),selectedRisk=paperNum(document.getElementById("poRisk")?.value)/100;if(!fresh||!Number.isFinite(Number(quote?.price))||Math.abs(entry-Number(quote.price))>0.011){if(submitBtn)submitBtn.disabled=false;modal("Fresh quote required","No paper order was sent. Refresh the provider quote and reopen the ticket so the entry price matches the latest available quote.");return;}
if(!gate.allowed){if(submitBtn)submitBtn.disabled=false;closeM();const why=gate.summary||gate.reason||"Required Islamic screening could not be verified.";modal("Shariah gate blocked",why+" No paper order was sent.");paperLog(symbol,"ENTRY","BLOCKED",0,why+" Decision: "+(gate.decision||"UNABLE_TO_VERIFY")+"; Policy: "+(gate.policyVersion||"unavailable")+"; Checks: "+(gate.checks||[]).filter(c=>c.status!=="PASS").map(c=>c.ruleId+"="+c.status).join(", "));return}
if(qty<1){if(submitBtn)submitBtn.disabled=false;closeM();modal("Order blocked","Quantity must be at least 1.");return}
const rd=paperRiskInputs(),cfg=getRiskConfig(),decision=riskDecision({account:s.balance,entry,stop,target,positions:rd.positions,dailyLoss:rd.dailyLoss*100,weeklyLoss:rd.weeklyLoss*100}),requestedRisk=Math.max(0,entry-stop)*qty,maxRisk=s.balance*cfg.positionRisk/100;
const orderFingerprint={symbol,side:"BUY",entry,stop,target,quantity:qty};
const idempotencyKey=getPendingPaperOrder(orderFingerprint);
if(requestedRisk>maxRisk){if(submitBtn)submitBtn.disabled=false;closeM();modal("Risk gate blocked",`Requested risk is $${requestedRisk.toFixed(2)}; configured maximum is $${maxRisk.toFixed(2)}.`);paperLog(symbol,"ENTRY","BLOCKED",0,"Position risk exceeds limit");return}
if(!decision.allowed){if(submitBtn)submitBtn.disabled=false;closeM();modal("Risk gate blocked",decision.reasons.join(" "));paperLog(symbol,"ENTRY","BLOCKED",0,decision.reasons.join(" "));return}
try{
  const remote=await obaApi("/api/paper/orders",{method:"POST",body:JSON.stringify({account:s.balance,symbol,entry,stop,target,quantity:qty,openPositions:rd.positions,dailyLoss:rd.dailyLoss,idempotencyKey})});
  clearPendingPaperOrder();
  closeM();await syncPaperState();modal("Paper fill confirmed",`BUY ${qty} ${symbol} at ${entry.toFixed(2)}. Render accepted the paper order. The server journal has been refreshed. No real order was sent.`)
}catch(err){if(submitBtn)submitBtn.disabled=false;closeM();modal("Server risk gate blocked",err.message);paperLog(symbol,"ENTRY","BLOCKED",0,"Render API: "+err.message)}
}
function paperLog(symbol,action,status,pnl,reason){const s=paperState();paperLogInto(s,symbol,action,status,pnl,reason);savePaper(s)}
function paperLogInto(s,symbol,action,status,pnl,reason){const d=new Date();s.journal.unshift({timestamp:d.getTime(),time:d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}),day:d.toISOString().slice(0,10),week:paperWeek(),symbol,action,status,pnl:Number(pnl)||0,reason,localOnly:true});s.journal=s.journal.slice(0,100)}
async function simulateMarket(){try{const r=await obaApi("/api/paper/refresh",{method:"POST",body:"{}"});(r.quotes||[]).filter(q=>Number.isFinite(Number(q.price))).forEach(q=>{if(typeof renderMarketQuote==="function")renderMarketQuote(q)});await syncPaperState()}catch(e){const status=document.getElementById("marketConnection");if(status&&e.data?.error==="MARKET_MARKING_NOT_CONFIGURED")status.textContent="Quotes available; position marking needs the server-only market update secret."}}
async function closePaperPosition(id){const s=paperState(),p=s.positions.find(x=>x.id===id);if(!p)return;try{await obaApi("/api/paper/positions/"+encodeURIComponent(id)+"/close",{method:"POST",body:JSON.stringify({price:p.current})});await syncPaperState();modal("Paper position closed","The position was closed and saved to your paper account.")}catch(e){modal("Close blocked",e.message)}}
async function resetPaper(){
  if(!confirm("Reset your paper account? This clears your paper positions, orders and journal, restores the starting balance, and keeps an audit record. No real funds are affected."))return;
  try{
    const remote=await obaApi("/api/paper/reset",{method:"POST",body:"{}"});
    localStorage.removeItem(OBA_PAPER_KEY);
    clearPendingPaperOrder();
    await syncPaperState();
    modal("Paper account reset","Paper account restored to $"+Number(remote.account?.balance||START_BALANCE).toFixed(2)+". Paper positions, orders and journal were cleared.");
  }catch(e){
    modal("Reset blocked",e.message||"The paper account could not be reset. Your current local state was kept.");
  }
}
function renderPaper(){const s=paperState(),avail=s.balance-s.positions.reduce((a,p)=>a+p.entry*p.qty,0),eq=s.balance+s.positions.reduce((a,p)=>a+(p.current-p.entry)*p.qty,0);const bal=document.getElementById("paperBalance"),av=document.getElementById("paperAvailable"),eqe=document.getElementById("paperEquity"),cnt=document.getElementById("paperOpen");if(bal)bal.textContent="$"+s.balance.toFixed(2);if(av)av.textContent="$"+avail.toFixed(2);if(eqe)eqe.textContent="$"+eq.toFixed(2);if(cnt)cnt.textContent=String(s.positions.length);const pos=document.getElementById("paperPositions"),j=document.getElementById("paperJournal");
if(pos)pos.innerHTML=s.positions.length?s.positions.map(p=>`<tr><td>${p.symbol}</td><td>BUY</td><td>$${p.entry.toFixed(2)}</td><td>$${p.current.toFixed(2)}</td><td>${p.qty}</td><td class="${p.current>=p.entry?"pass":"red"}">${(p.current-p.entry)*p.qty>=0?"+":"-"}$${Math.abs((p.current-p.entry)*p.qty).toFixed(2)}</td><td><button class="btn ghost" onclick="closePaperPosition('${p.id}')">Close</button></td></tr>`).join(""):'<tr><td colspan="7" class="sub">No open paper positions.</td></tr>';
if(j)j.innerHTML=s.journal.slice(0,8).map(x=>{const stamp=Number(x.timestamp)||Date.now();const dateText=new Date(stamp).toLocaleDateString([], {year:"numeric",month:"short",day:"2-digit"});const timeText=x.time||new Date(stamp).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});const statusClass=x.status==="BLOCKED"?"red":x.status==="FILLED"||x.status==="TARGET"||x.status==="CLOSED"?"pass":"";return "<tr><td>"+dateText+"</td><td>"+timeText+"</td><td>"+(x.symbol||"—")+"</td><td>"+(x.action||"EVENT")+"</td><td>Paper</td><td>"+(x.reason||"—")+"</td><td class=\""+statusClass+"\">"+(x.status||"RECORDED")+"</td></tr>"}).join("")||'<tr><td colspan="7" class="sub">No paper events yet.</td></tr>';const count=document.getElementById("journalCount");if(count)count.textContent=s.journal.length+" saved events";}
document.addEventListener("DOMContentLoaded",async()=>{renderPaper();await syncPaperState();setInterval(simulateMarket,60000)})