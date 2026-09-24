const { requireEnv } = require('./tools/load_env_qa');
// Credenciales fuera del código: ESPEC_credenciales_fuera.md.
const URL = requireEnv('SUPABASE_URL');
const KEY = requireEnv('SUPABASE_ANON_KEY');
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
(async()=>{const r=await fetch(`${URL}/rest/v1/audit_logs?select=*&limit=1`,{headers:H});const t=await r.text();console.log(r.status);console.log(t);})();
