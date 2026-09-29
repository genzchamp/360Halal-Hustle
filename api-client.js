/* OBA AI Trader — API client
   Public paper-mode API only. No broker credentials or live execution. */
const OBA_API_BASE="https://oba-ai-trader-api.onrender.com";
async function obaApi(path,options={}){
  const res=await fetch(OBA_API_BASE+path,{...options,headers:{"content-type":"application/json",...(options.headers||{})}});
  const data=await res.json().catch(()=>({error:"INVALID_JSON"}));
  if(!res.ok){const err=new Error(data.reason||data.message||data.error||("API request failed: "+res.status));err.status=res.status;err.data=data;throw err}
  return data;
}
async function obaApiHealth(){return obaApi("/health")}
