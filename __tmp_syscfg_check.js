const { requireEnv } = require('./tools/load_env_qa');
// Credenciales fuera del código: ESPEC_credenciales_fuera.md.
const URL = requireEnv('SUPABASE_URL');
const KEY = requireEnv('SUPABASE_ANON_KEY');
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
async function test(sel){const r=await fetch(`${URL}/rest/v1/system_configs?select=${encodeURIComponent(sel)}&limit=1`,{headers:H});const t=await r.text();console.log(sel,r.status,t);}
(async()=>{await test('key_name,key_value');await test('config_key,config_value');})();
