const URL='https://uggkivypfugdchvjurlo.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZ2tpdnlwZnVnZGNodmp1cmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODkxMTMsImV4cCI6MjA4NjE2NTExM30.gCoe4SF3Ye7YcEWLfUpL1rnA5SwZ06FvJoqi0zpbxbE';
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
async function q(label,path){const r=await fetch(`${URL}/rest/v1/${path}`,{headers:H});const t=await r.text();console.log(label, r.status); if(!r.ok) console.log(t);}
(async()=>{
  await q('Schools list','institutions?select=id,name,subscription_plan,active_ai_provider,ai_credit_pool,ai_used_credits,ai_credits_used,coin_pool,is_suspended,api_key&order=name.asc&limit=10');
  await q('Users fetch','profiles?select=id,nombre_completo,documento_id,pin,rol,grupo,monedas,is_active,account_locked,institution_id,last_login_at,teacher_credits,force_password_reset&is_active=eq.true&limit=10');
  await q('Admins section users','profiles?select=id,nombre_completo,documento_id,pin,rol,grupo,monedas,is_active,account_locked,institution_id,last_login_at,teacher_credits,force_password_reset&rol=in.(admin,teacher)&is_active=eq.true&limit=10');
  await q('System config','system_configs?select=key_name,key_value&limit=5');
})();
