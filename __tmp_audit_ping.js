const { requireEnv } = require('./tools/load_env_qa');
// Credenciales fuera del código: ESPEC_credenciales_fuera.md.
const URL = requireEnv('SUPABASE_URL');
const KEY = requireEnv('SUPABASE_ANON_KEY');
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
(async()=>{const r=await fetch(`${URL}/rest/v1/audit_logs?select=created_at,user_name,action,target_type,target_id,ip_address&order=created_at.desc&limit=5`,{headers:H});console.log(r.status);console.log(await r.text());})();
