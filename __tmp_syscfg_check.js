const URL='https://uggkivypfugdchvjurlo.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZ2tpdnlwZnVnZGNodmp1cmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODkxMTMsImV4cCI6MjA4NjE2NTExM30.gCoe4SF3Ye7YcEWLfUpL1rnA5SwZ06FvJoqi0zpbxbE';
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
async function test(sel){const r=await fetch(`${URL}/rest/v1/system_configs?select=${encodeURIComponent(sel)}&limit=1`,{headers:H});const t=await r.text();console.log(sel,r.status,t);}
(async()=>{await test('key_name,key_value');await test('config_key,config_value');})();
