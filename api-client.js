/* OBA AI Trader — API client
   Public paper-mode API only. No broker credentials or live execution. */
const OBA_API_BASE="https://oba-ai-trader-api.onrender.com";
async function obaApi(path,options={}){
  const session=typeof getSupabaseSession==="function"?await getSupabaseSession():null;
  const headers={"content-type":"application/json",...(options.headers||{})};
  if(session?.access_token) headers.authorization="Bearer "+session.access_token;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  let res;
  try{res=await fetch(OBA_API_BASE+path,{...options,headers,signal:controller.signal})}catch(e){if(e.name==="AbortError")throw new Error("The market-data service took too long to respond. It may be waking up; try refreshing in a moment.");throw new Error("Could not reach the market-data service. Check the connection and try again.")}finally{clearTimeout(timer)}
  const data=await res.json().catch(()=>({error:"INVALID_JSON"}));
  if(!res.ok){const err=new Error(data.reason||data.message||data.error||("API request failed: "+res.status));err.status=res.status;err.data=data;throw err}
  return data;
}
async function obaApiHealth(){return obaApi("/health")}
