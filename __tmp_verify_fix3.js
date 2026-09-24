const { requireEnv } = require('./tools/load_env_qa');
// Credenciales fuera del código: ESPEC_credenciales_fuera.md.
const URL = requireEnv('SUPABASE_URL');
const KEY = requireEnv('SUPABASE_ANON_KEY');
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
async function q(label,path){const r=await fetch(`${URL}/rest/v1/${path}`,{headers:H});const t=await r.text();console.log(label, r.status); if(!r.ok) console.log(t);}
(async()=>{
  await q('Groups UIS', 'groups?select=id,group_code,institution_id,max_capacity,last_admin_lat,last_admin_lng&institution_id=eq.fd138e39-9d18-4797-851e-1c038f512592');
  await q('Admins query', 'profiles?select=id,nombre_completo,documento_id,pin,rol,grupo,monedas,is_active,account_locked,institution_id,last_login_at,teacher_credits,force_password_reset&rol=in.(admin,teacher)&is_active=eq.true&limit=5');
})();
