const URL='https://uggkivypfugdchvjurlo.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZ2tpdnlwZnVnZGNodmp1cmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODkxMTMsImV4cCI6MjA4NjE2NTExM30.gCoe4SF3Ye7YcEWLfUpL1rnA5SwZ06FvJoqi0zpbxbE';
const H={apikey:KEY,Authorization:`Bearer ${KEY}`};
(async()=>{const r=await fetch(`${URL}/rest/v1/audit_logs?select=*&limit=1`,{headers:H});const t=await r.text();console.log(r.status);console.log(t);})();
