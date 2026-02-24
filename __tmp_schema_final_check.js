const URL='https://uggkivypfugdchvjurlo.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZ2tpdnlwZnVnZGNodmp1cmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODkxMTMsImV4cCI6MjA4NjE2NTExM30.gCoe4SF3Ye7YcEWLfUpL1rnA5SwZ06FvJoqi0zpbxbE';
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
async function q(label,path){const r=await fetch(`${URL}/rest/v1/${path}`,{headers:H});console.log(label,r.status); if(!r.ok){console.log(await r.text())}}
(async()=>{
 await q('Groups list schema check','groups?select=id,group_code,institution_id,max_capacity,last_admin_lat,last_admin_lng&limit=1');
 await q('Users group filter schema check','groups?select=group_code&institution_id=eq.fd138e39-9d18-4797-851e-1c038f512592');
 await q('Admins select schema check','profiles?select=id,nombre_completo,documento_id,pin,rol,grupo,monedas,is_active,account_locked,institution_id,last_login_at,teacher_credits,force_password_reset&rol=in.(admin,teacher)&is_active=eq.true&limit=1');
})();
