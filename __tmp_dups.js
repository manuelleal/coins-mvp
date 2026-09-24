const { requireEnv } = require('./tools/load_env_qa');
// Credenciales fuera del código: ESPEC_credenciales_fuera.md.
const URL = requireEnv('SUPABASE_URL');
const KEY = requireEnv('SUPABASE_ANON_KEY');
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
(async()=>{
 const r=await fetch(`${URL}/rest/v1/institutions?select=id,name,subscription_plan,created_at&order=name.asc,created_at.asc`,{headers:H});
 const t=await r.text();
 const d=JSON.parse(t);
 const by={};
 d.forEach(x=>{const k=(x.name||'').trim(); by[k]=(by[k]||[]).concat(x);});
 Object.entries(by).filter(([k,v])=>v.length>1).forEach(([k,v])=>{console.log('DUP',k,v.length);v.forEach(z=>console.log(' ',z.id,z.created_at,z.subscription_plan));});
 console.log('UIS_count',(by['UIS']||[]).length);
 console.log('Colegio Test_count',(by['Colegio Test']||[]).length);
})();
