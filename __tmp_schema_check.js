const { requireEnv } = require('./tools/load_env_qa');
// Credenciales fuera del código: ESPEC_credenciales_fuera.md.
const URL = requireEnv('SUPABASE_URL');
const KEY = requireEnv('SUPABASE_ANON_KEY');
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
async function get(path){const r=await fetch(`${URL}/rest/v1/${path}`,{headers:H});const t=await r.text();let d;try{d=t?JSON.parse(t):null}catch{d=t}return {ok:r.ok,status:r.status,data:d};}
(async()=>{
  const infoInst=await get("information_schema.columns?select=column_name&table_name=eq.institutions&order=ordinal_position.asc");
  const infoSys=await get("information_schema.columns?select=column_name&table_name=eq.system_configs&order=ordinal_position.asc");
  const instSample=await get("institutions?select=*&limit=1");
  const sysSample=await get("system_configs?select=*&limit=1");
  console.log('info institutions',infoInst.status,JSON.stringify(infoInst.data));
  console.log('info system_configs',infoSys.status,JSON.stringify(infoSys.data));
  console.log('institutions sample keys',instSample.ok&&instSample.data&&instSample.data[0]?Object.keys(instSample.data[0]):instSample.status);
  console.log('system_configs sample keys',sysSample.ok&&sysSample.data&&sysSample.data[0]?Object.keys(sysSample.data[0]):sysSample.status);
})();
