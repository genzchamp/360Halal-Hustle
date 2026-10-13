/* OBA AI Trader — Supabase browser auth
   Publishable key only. Never place a Supabase secret/service-role key here. */
const OBA_SUPABASE_URL = "https://dlcncozasilbfsfwcjcq.supabase.co";
const OBA_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WzM9SwxQRaeBN3deVmx7BQ_iHw4T4n2";

const supabaseClient = window.supabase.createClient(OBA_SUPABASE_URL,OBA_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const OBA_AUTH_REDIRECT = window.location.origin + window.location.pathname;
const OBA_STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/;

function obaAuthMessage(msg,ok=false,target="obaAuthMsg"){const el=document.getElementById(target);if(el){el.textContent=msg;el.style.color=ok?"var(--g)":"var(--muted)"}}
function obaAuthModal(open=true){const el=document.getElementById("obaAuthModal");if(el)el.classList.toggle("open",open)}
function obaProfileModal(open=true){const el=document.getElementById("obaProfileModal");if(el)el.classList.toggle("open",open)}
function obaPasswordModal(open=true){const el=document.getElementById("obaPasswordModal");if(el)el.classList.toggle("open",open)}
function obaTogglePassword(inputId,button){const input=document.getElementById(inputId);if(!input)return;const show=input.type==="password";input.type=show?"text":"password";button.textContent=show?"Hide":"Show";button.setAttribute("aria-label",show?"Hide password":"Show password")}
async function obaSignIn(){
  const email=document.getElementById("obaAuthEmail").value.trim(),password=document.getElementById("obaAuthPassword").value;
  if(!email||!password)return obaAuthMessage("Enter your email and password.");
  obaAuthMessage("Signing in…");
  const {error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error)return obaAuthMessage(error.message);
  obaAuthModal(false);renderOBAAuth();
}
async function obaSignUp(){
  const email=document.getElementById("obaAuthEmail").value.trim(),password=document.getElementById("obaAuthPassword").value;
  if(!email)return obaAuthMessage("Enter a valid email.");
  if(!OBA_STRONG_PASSWORD.test(password))return obaAuthMessage("Use 12+ characters with uppercase, lowercase, a number and a symbol.");
  obaAuthMessage("Creating account…");
  const {data,error}=await supabaseClient.auth.signUp({email,password,options:{emailRedirectTo:OBA_AUTH_REDIRECT}});
  if(error)return obaAuthMessage(error.message);
  obaAuthMessage(data.session?"Account created and signed in.":"Account created. Check your email to confirm your account.",true);
  if(data.session)obaAuthModal(false);
}
async function obaForgotPassword(){
  const email=document.getElementById("obaAuthEmail").value.trim();
  if(!email)return obaAuthMessage("Enter your account email first.");
  obaAuthMessage("Requesting password reset…");
  const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:OBA_AUTH_REDIRECT});
  if(error)return obaAuthMessage(error.message);
  obaAuthMessage("If an account exists for that email, a password-reset link will be sent. Check your inbox and Spam.",true);
}
async function obaRequestProfilePasswordReset(){
  const session=await getSupabaseSession(),email=session?.user?.email;
  if(!email)return obaAuthMessage("Please sign in again to manage your account.",false,"obaProfileMsg");
  obaAuthMessage("Requesting password reset…",false,"obaProfileMsg");
  const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:OBA_AUTH_REDIRECT});
  if(error)return obaAuthMessage(error.message,false,"obaProfileMsg");
  obaAuthMessage("If email delivery succeeds, a password-reset link will arrive shortly. Check Spam too.",true,"obaProfileMsg");
}
async function obaSaveNewPassword(){
  const password=document.getElementById("obaNewPassword").value;
  if(!OBA_STRONG_PASSWORD.test(password))return obaAuthMessage("Use 12+ characters with uppercase, lowercase, a number and a symbol.",false,"obaPasswordMsg");
  obaAuthMessage("Updating password…",false,"obaPasswordMsg");
  const {error}=await supabaseClient.auth.updateUser({password});
  if(error)return obaAuthMessage(error.message,false,"obaPasswordMsg");
  document.getElementById("obaNewPassword").value="";
  obaPasswordModal(false);
  obaAuthMessage("Password updated successfully.",true,"obaProfileMsg");
  obaProfileModal(true);
}
async function obaSignOut(){
  const {error}=await supabaseClient.auth.signOut({scope:"local"});
  if(error)return obaAuthMessage(error.message,false,"obaProfileMsg");
  obaProfileModal(false);renderOBAAuth();
}
async function getSupabaseSession(){const {data}=await supabaseClient.auth.getSession();return data.session}
function obaAuthOpen(){obaProfileModal(false);obaAuthModal(true);setTimeout(()=>document.getElementById("obaAuthEmail")?.focus(),50)}
async function obaOpenProfile(){
  const session=await getSupabaseSession();
  if(!session){obaAuthOpen();return}
  const emailEl=document.getElementById("obaProfileEmail");
  if(emailEl)emailEl.textContent=session.user.email||"Signed-in account";
  const createdEl=document.getElementById("obaProfileCreated");
  if(createdEl)createdEl.textContent=session.user.created_at?new Date(session.user.created_at).toLocaleDateString():"—";
  obaAuthModal(false);obaProfileModal(true);
}
function renderOBAAuth(){
  const btn=document.getElementById("obaAuthButton")||document.querySelector("nav .safe")||document.querySelector(".safe");
  if(!btn)return;
  getSupabaseSession().then(session=>{
    const current=document.getElementById("obaAuthButton")||document.querySelector("nav .safe")||document.querySelector(".safe");
    if(!current)return;
    const button=document.createElement("button");
    button.id="obaAuthButton";button.className="safe";button.type="button";
    button.style.cssText="cursor:pointer;background:transparent;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    button.textContent=session?.user?.email||"Sign in";
    button.onclick=session?obaOpenProfile:obaAuthOpen;
    current.replaceWith(button);
  });
}
function injectOBAAuthUI(){
  if(document.getElementById("obaAuthModal"))return;
  const style=document.createElement("style");
  style.textContent=`
  #obaAuthModal .box,#obaProfileModal .box,#obaPasswordModal .box{width:min(430px,100%);max-height:88vh;overflow:auto}
  #obaAuthModal .auth-actions,#obaProfileModal .auth-actions,#obaPasswordModal .auth-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  #obaAuthModal .auth-actions .btn,#obaProfileModal .auth-actions .btn,#obaPasswordModal .auth-actions .btn{flex:1;min-width:120px}
  #obaAuthMsg,#obaProfileMsg,#obaPasswordMsg{min-height:16px;margin:8px 0 0;font-size:10px}
  #obaAuthHint{font-size:9px;color:var(--muted);line-height:1.5;margin-top:10px}
  .oba-password-wrap{display:flex;gap:6px;align-items:stretch;margin-top:6px}
  .oba-password-wrap input{flex:1;min-width:0;margin-top:0!important}
  .oba-eye{border:1px solid var(--line);background:#121a16;color:var(--g);border-radius:8px;padding:0 10px;font:700 10px Inter;cursor:pointer}
  .oba-link-btn{border:0;background:transparent;color:var(--g);text-decoration:underline;font:600 10px Inter;cursor:pointer;padding:8px 0}
  .oba-profile-row{border:1px solid var(--line);border-radius:10px;padding:12px;margin:12px 0;background:#ffffff04}
  .oba-profile-row small{display:block;color:var(--muted);font-size:9px;margin-bottom:6px}
  .oba-profile-row b{overflow-wrap:anywhere;font-size:12px}
  `;
  document.head.appendChild(style);
  const wrap=document.createElement("div");wrap.id="obaAuthModal";wrap.className="modal";
  wrap.innerHTML=`<div class="box"><button class="x" type="button" onclick="obaAuthModal(false)" aria-label="Close">×</button><div class="ey">OBA AI TRADER</div><h3>Secure your paper account</h3><p>Sign in to connect your paper trading activity to your own account. No broker or real-money execution is enabled.</p><div class="formgrid" style="grid-template-columns:1fr"><label>Email<input id="obaAuthEmail" type="email" autocomplete="email" placeholder="you@example.com"></label><label>Password<div class="oba-password-wrap"><input id="obaAuthPassword" type="password" autocomplete="current-password" placeholder="Your password"><button class="oba-eye" type="button" onclick="obaTogglePassword('obaAuthPassword',this)">Show</button></div></label></div><div class="auth-actions"><button class="btn primary" type="button" onclick="obaSignIn()">Sign in</button><button class="btn ghost" type="button" onclick="obaSignUp()">Create account</button></div><button class="oba-link-btn" type="button" onclick="obaForgotPassword()">Forgot password?</button><div id="obaAuthMsg" role="status" aria-live="polite"></div><div id="obaAuthHint">Use a strong password. Email confirmation may be required for new accounts.</div></div>`;
  document.body.appendChild(wrap);
  const profile=document.createElement("div");profile.id="obaProfileModal";profile.className="modal";
  profile.innerHTML=`<div class="box"><button class="x" type="button" onclick="obaProfileModal(false)" aria-label="Close">×</button><div class="ey">ACCOUNT</div><h3>Your profile</h3><p>Manage your OBA AI Trader paper-account sign-in details.</p><div class="oba-profile-row"><small>EMAIL ADDRESS</small><b id="obaProfileEmail">—</b></div><div class="oba-profile-row"><small>ACCOUNT CREATED</small><b id="obaProfileCreated">—</b></div><div class="auth-actions"><button class="btn primary" type="button" onclick="obaRequestProfilePasswordReset()">Reset password</button><button class="btn ghost" type="button" onclick="obaSignOut()">Sign out</button></div><div id="obaProfileMsg" role="status" aria-live="polite"></div></div>`;
  document.body.appendChild(profile);
  const password=document.createElement("div");password.id="obaPasswordModal";password.className="modal";
  password.innerHTML=`<div class="box"><div class="ey">ACCOUNT SECURITY</div><h3>Set a new password</h3><p>Choose a strong password for your OBA AI Trader account.</p><label style="display:block;color:#aab5b0;font-size:10px">New password<div class="oba-password-wrap"><input id="obaNewPassword" type="password" autocomplete="new-password" placeholder="12+ characters"><button class="oba-eye" type="button" onclick="obaTogglePassword('obaNewPassword',this)">Show</button></div></label><div class="auth-actions"><button class="btn primary" type="button" onclick="obaSaveNewPassword()">Save new password</button></div><div id="obaPasswordMsg" role="status" aria-live="polite"></div></div>`;
  document.body.appendChild(password);
  [wrap,profile,password].forEach(el=>el.addEventListener("click",e=>{if(e.target===el&&el!==password)el.classList.remove("open")}));
}
document.addEventListener("DOMContentLoaded",()=>{
  injectOBAAuthUI();renderOBAAuth();
  supabaseClient.auth.onAuthStateChange((event,session)=>{
    renderOBAAuth();
    if(event==="PASSWORD_RECOVERY"){obaProfileModal(false);obaAuthModal(false);obaPasswordModal(true)}
    if(event==="SIGNED_OUT"){obaProfileModal(false)}
  });
});
