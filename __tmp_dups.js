const URL='https://uggkivypfugdchvjurlo.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZ2tpdnlwZnVnZGNodmp1cmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODkxMTMsImV4cCI6MjA4NjE2NTExM30.gCoe4SF3Ye7YcEWLfUpL1rnA5SwZ06FvJoqi0zpbxbE';
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
