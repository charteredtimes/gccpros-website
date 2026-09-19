import {createRemoteJWKSet,jwtVerify} from 'npm:jose@5.9.6';
import {cryptoBox,makeHandler} from './expert-service.mjs';
import {reviewerAuth} from './reviewer-auth.mjs';
import {dispatchEmails} from './expert-mail.mjs';
const env=(key:string)=>Deno.env.get(key)||'';
const base=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY');
const allowedOrigins=['https://www.gccpros.com','https://gccpros.com'];
const reviewers=env('EXPERT_REVIEWER_EMAILS').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
const project='gccpros-9aadb';
const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
async function api(path:string,options:RequestInit={}){
 const r=await fetch(base+path,{...options,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});
 if(!r.ok){let err;try{err=await r.json()}catch{}throw Object.assign(new Error('Database operation failed'),{code:err?.code});}
 if(r.status===204)return null;const _t=await r.text();return _t?JSON.parse(_t):null;
}
const table='/rest/v1/expert_applications',bucket='/storage/v1/object/expert-identity-private/';
const one=async(q:string)=>(await api(table+'?'+q+'&select=*&limit=1'))[0]||null;
const repo={
 rate:async(key:string)=>api('/rest/v1/rpc/expert_rate',{method:'POST',body:JSON.stringify({p_key:key})}),
 byRequest:async(id:string)=>one('request_id=eq.'+encodeURIComponent(id)),byEmail:async(hash:string)=>one('email_hash=eq.'+encodeURIComponent(hash)),get:async(id:string)=>one('id=eq.'+encodeURIComponent(id)),
 list:async(offset:number)=>api(table+'?select=*&order=created_at.desc&limit=50&offset='+offset),
 create:async(row:unknown)=>api('/rest/v1/rpc/expert_create',{method:'POST',body:JSON.stringify({p_row:row})}),
 async putFile(path:string,data:Uint8Array){await api(bucket+path,{method:'POST',headers:{'Content-Type':'application/octet-stream','x-upsert':'false'},body:data});},
 async removeFile(path:string){await api('/storage/v1/object/expert-identity-private',{method:'DELETE',body:JSON.stringify({prefixes:[path]})});},
 async getFile(path:string){const r=await fetch(base+bucket+path,{headers:{apikey:service,Authorization:'Bearer '+service},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Document unavailable');return new Uint8Array(await r.arrayBuffer());},
 audit:async(id:string|null,actor:string,action:string,metadata:unknown)=>api('/rest/v1/expert_audit_events',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({application_id:id,actor,action,metadata})}),
 events:async(id:string)=>api('/rest/v1/expert_audit_events?application_id=eq.'+encodeURIComponent(id)+'&order=created_at.desc&limit=200&select=actor,action,metadata,created_at'),
 review:async(id:string,version:number,status:string,review:unknown,actor:string,checks:unknown)=>api('/rest/v1/rpc/expert_review',{method:'POST',body:JSON.stringify({p_id:id,p_version:version,p_status:status,p_review:review,p_actor:actor,p_checks:checks})}),
 claimMail:()=>api('/rest/v1/rpc/expert_claim_mail',{method:'POST',body:'{}'}),
 finishMail:(id:string,lease:string,ok:boolean,provider:string|null)=>api('/rest/v1/rpc/expert_finish_mail',{method:'POST',body:JSON.stringify({p_id:id,p_lease:lease,p_ok:ok,p_provider:provider})}),
 mailStatus:(id:string)=>api('/rest/v1/expert_email_jobs?application_id=eq.'+encodeURIComponent(id)+'&select=event,status,attempts,sent_at,last_error&order=created_at'),
 otpGet:async(hash:string)=>(await api('/rest/v1/expert_email_otps?email_hash=eq.'+encodeURIComponent(hash)+'&select=*&limit=1'))[0]||null,
 otpSet:async(row:unknown)=>{const r=await fetch(base+'/rest/v1/expert_email_otps?on_conflict=email_hash',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row),signal:AbortSignal.timeout(15000)});if(!r.ok){let e;try{e=await r.json()}catch{/*ignore*/}throw Object.assign(new Error('otp store failed'),{code:e&&e.code});}},
 setFlags:(id:string,patch:unknown)=>api(table+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)}),
 del:(id:string)=>api(table+'?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}}),
 updateProfile:(id:string,encp:unknown)=>api(table+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({profile_encrypted:encp})}),
 projList:(appId:string)=>api('/rest/v1/expert_projects?application_id=eq.'+encodeURIComponent(appId)+'&select=*&order=created_at.desc'),
 projInsert:(rowp:unknown)=>api('/rest/v1/expert_projects',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rowp)}),
 projUpdate:(pid:string,patch:unknown)=>api('/rest/v1/expert_projects?id=eq.'+encodeURIComponent(pid),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)}),
 projDelete:(pid:string)=>api('/rest/v1/expert_projects?id=eq.'+encodeURIComponent(pid),{method:'DELETE',headers:{Prefer:'return=minimal'}}),
 changeReqInsert:(row:unknown)=>api('/rest/v1/expert_change_requests',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)}),
 changeReqList:()=>api('/rest/v1/expert_change_requests?status=eq.pending&select=*&order=created_at.desc&limit=100'),
 changeReqGet:(id:string)=>api('/rest/v1/expert_change_requests?id=eq.'+encodeURIComponent(id)+'&select=*&limit=1').then((r:any)=>r[0]||null),
 changeReqPending:(appId:string)=>api('/rest/v1/expert_change_requests?application_id=eq.'+encodeURIComponent(appId)+'&status=eq.pending&select=*&order=created_at.desc&limit=1').then((r:any)=>r[0]||null),
 changeReqDecide:(id:string,status:string,note:string)=>api('/rest/v1/expert_change_requests?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status,reviewer_note:note,decided_at:new Date().toISOString()})}),
 reqInsert:(row:unknown)=>api('/rest/v1/expert_requests',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)}),
 reqList:()=>api('/rest/v1/expert_requests?status=eq.pending&select=*&order=created_at.desc&limit=100'),
 reqGet:(id:string)=>api('/rest/v1/expert_requests?id=eq.'+encodeURIComponent(id)+'&select=*&limit=1').then((r:any)=>r[0]||null),
 reqOpen:(appId:string)=>api('/rest/v1/expert_requests?application_id=eq.'+encodeURIComponent(appId)+'&status=eq.pending&select=type,status,created_at&order=created_at.desc'),
 reqDecide:(id:string,status:string,note:string)=>api('/rest/v1/expert_requests?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status,admin_note:note,decided_at:new Date().toISOString()})})
,
 slotList:(pid:string)=>api('/rest/v1/expert_slots?project_id=eq.'+encodeURIComponent(pid)+'&select=*&order=start_ts'),
 slotInsert:(row:unknown)=>api('/rest/v1/expert_slots',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)}),
 slotClearProposed:(pid:string)=>api('/rest/v1/expert_slots?project_id=eq.'+encodeURIComponent(pid)+'&status=eq.proposed',{method:'DELETE',headers:{Prefer:'return=minimal'}}),
 slotUpdate:(id:string,patch:unknown)=>api('/rest/v1/expert_slots?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)}),
 slotRejectOthers:(pid:string,keep:string)=>api('/rest/v1/expert_slots?project_id=eq.'+encodeURIComponent(pid)+'&id=neq.'+encodeURIComponent(keep),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'rejected'})}),
 tsList:(pid:string)=>api('/rest/v1/expert_timesheets?project_id=eq.'+encodeURIComponent(pid)+'&select=*&order=work_date.desc'),
 tsByApp:(appId:string)=>api('/rest/v1/expert_timesheets?application_id=eq.'+encodeURIComponent(appId)+'&select=*&order=work_date.desc'),
 tsPending:()=>api('/rest/v1/expert_timesheets?status=eq.submitted&select=*&order=created_at.desc&limit=200'),
 tsInsert:(row:unknown)=>api('/rest/v1/expert_timesheets',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)}),
 tsGet:(id:string)=>api('/rest/v1/expert_timesheets?id=eq.'+encodeURIComponent(id)+'&select=*&limit=1').then((r:any)=>r[0]||null),
 tsUpdate:(id:string,patch:unknown)=>api('/rest/v1/expert_timesheets?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)})
};
const authenticate=reviewerAuth((token:string)=>jwtVerify(token,jwks,{issuer:'https://securetoken.google.com/'+project,audience:project,algorithms:['RS256']}),reviewers);
async function verifyHuman(token:string,ip:string){if(!token||token.length>2048)return false;try{const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env('EXPERT_TURNSTILE_SECRET'),response:token,remoteip:ip}),signal:AbortSignal.timeout(10000)});const d=await r.json();return d.success===true&&['gccpros.com','www.gccpros.com'].includes(d.hostname)&&d.action==='expert_registration';}catch{return false;}}
let handler:ReturnType<typeof makeHandler>,dispatch:()=>Promise<unknown>;
try{
 const box=await cryptoBox(env('EXPERT_DATA_KEY'));
 const sendEmailResend=async(message:unknown,key:string)=>{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env('RESEND_API_KEY'),'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(message),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok||!j.id)throw new Error('Email not accepted');return j.id;};
 let ready=Boolean(base&&service&&reviewers.length&&env('EXPERT_TURNSTILE_SITE_KEY')&&env('EXPERT_TURNSTILE_SECRET')&&env('RESEND_API_KEY')&&env('EXPERT_FROM_EMAIL')&&env('EXPERT_MAIL_WORKER_TOKEN').length>=40);
 if(ready){try{await api(table+'?select=id&limit=0');const bucketInfo=await api('/storage/v1/bucket/expert-identity-private');ready=bucketInfo.public===false;}catch{ready=false;}}
 dispatch=()=>dispatchEmails({repo,box,from:env('EXPERT_FROM_EMAIL'),team:'admin@gccpros.com',sendEmail:sendEmailResend});
 handler=makeHandler({repo,box,authenticate,verifyHuman,origins:allowedOrigins,siteKey:env('EXPERT_TURNSTILE_SITE_KEY'),ready,adminKey:env('GCP_ADMIN_KEY'),sendEmail:sendEmailResend,mailFrom:env('EXPERT_FROM_EMAIL'),mailTeam:'admin@gccpros.com'});
}catch{handler=makeHandler({repo,box:null,authenticate,verifyHuman,origins:allowedOrigins,siteKey:'',ready:false,adminKey:env('GCP_ADMIN_KEY'),sendEmail:null,mailFrom:'',mailTeam:''});}
Deno.serve(async(request:Request)=>{
 const action=new URL(request.url).searchParams.get('action');
 if(action==='dispatch'){
  const token=env('EXPERT_MAIL_WORKER_TOKEN');if(request.method!=='POST'||token.length<40||request.headers.get('authorization')!=='Bearer '+token)return new Response('Unauthorized',{status:401});
  try{return Response.json(await dispatch(),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'mail_dispatch_unavailable'},{status:503})}
 }
 const r=await handler(request);
 if(r.ok&&request.method==='POST'&&['submit','review'].includes(action||''))EdgeRuntime.waitUntil(dispatch().catch(()=>{}));
 return r;
});
