import {validateProfile,validateDocument,clientProjection,CHECKS,VERSION} from './expert-schema.mjs';
const enc=new TextEncoder(),dec=new TextDecoder();
export const b64=b=>btoa(Array.from(new Uint8Array(b),x=>String.fromCharCode(x)).join(''));
export const unb64=s=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
export async function cryptoBox(secret){
 const raw=unb64(secret);if(raw.length!==32)throw new Error('A 32-byte encryption key is required');
 const aes=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
 const hmac=await crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return {async seal(bytes,context){const iv=crypto.getRandomValues(new Uint8Array(12));return {v:1,iv:b64(iv),data:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(context)},aes,bytes))};},async open(x,context){if(x.v!==1)throw new Error('Unsupported encrypted envelope');return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(x.iv),additionalData:enc.encode(context)},aes,unb64(x.data)));},async hash(s){return b64(await crypto.subtle.sign('HMAC',hmac,enc.encode(s)));}};
}
export function makeHandler({repo,box,authenticate,verifyHuman,origins,siteKey,ready=true,adminKey='',sendEmail=null,mailFrom='',mailTeam=''}){
 const json=(data,status=200,origin='')=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization,content-type,x-admin-key','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
 const decrypt=async row=>JSON.parse(dec.decode(await box.open(row.profile_encrypted,'profile:'+row.id)));
 const newSalt=()=>b64(crypto.getRandomValues(new Uint8Array(16)));
 const hashPw=async(pw,salt)=>{const k=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:unb64(salt),iterations:120000,hash:'SHA-256'},k,256);return b64(new Uint8Array(bits));};
 const genTempPw=()=>Array.from(crypto.getRandomValues(new Uint8Array(9)),x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');
 const verifyExpertToken=async(el,t)=>{if(!el||!t)return false;const w=Math.floor(Date.now()/864e5);for(const ns of ['sess','ev']){if(t===await box.hash(ns+':'+el+':'+w)||t===await box.hash(ns+':'+el+':'+(w-1)))return true;}return false;};
 return async request=>{
  const origin=request.headers.get('origin')||'';if(origin&&!origins.includes(origin))return json({error:'origin_denied'},403);
  const reply=(v,s=200)=>json(v,s,origin);
  if(request.method==='OPTIONS')return reply({});
  const url=new URL(request.url),action=url.searchParams.get('action')||'config';
  try{
   if(action==='config'&&request.method==='GET')return reply({version:VERSION,ready,siteKey:ready?siteKey:null});
   if(!ready)return reply({error:'intake_unavailable'},503);
   if(action==='submit'&&request.method==='POST'){
    if(Number(request.headers.get('content-length'))>3*1024*1024+150000)return reply({error:'request_too_large'},413);
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
    if(!await repo.rate(await box.hash('rate:'+ip)))return reply({error:'rate_limit',message:'Too many attempts. Please try again in an hour.'},429);
    // Bound actual streamed bytes as well as Content-Length before parsing multipart.
    const reader=request.body?.getReader();if(!reader)return reply({error:'empty_request'},400);const parts=[];let length=0;
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>3*1024*1024+150000){await reader.cancel();return reply({error:'request_too_large'},413);}parts.push(value);}
    const fd=await new Response(new Blob(parts),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
    if(fd.get('website'))return reply({error:'invalid_request'},400);
    if(!await verifyHuman(String(fd.get('humanToken')||''),ip))return reply({error:'human_check',message:'Complete the verification check again.'},400);
    const raw=fd.get('profile');if(typeof raw!=='string'||raw.length>100000)return reply({error:'invalid_profile'},400);
    let p;try{p=JSON.parse(raw)}catch{return reply({error:'invalid_profile'},400)}if(!p||Array.isArray(p)||typeof p!=='object')return reply({error:'invalid_profile'},400);
    // Store only explicitly supported fields, never arbitrary object properties.
    const allowed=['name','email','phone','country','city','linkedin','role','employer','employment','capability','totalYears','gccYears','leadershipYears','sectors','regions','languages','profile','achievements','conflicts','rate','availability','skills','history','idType','idCountry','idName','idNumber','idExpiry','eligibility','privacy','identityConsent','truth','engagementTerms','consentVersion'];
    p=Object.fromEntries(allowed.map(k=>[k,typeof p[k]==='string'?p[k].trim():p[k]]));
    const errors=validateProfile(p);const file=fd.get('document'),docError=await validateDocument(file);if(docError)errors.document=docError;
    if(Object.keys(errors).length)return reply({error:'validation',fields:errors},422);
    {const _el=String(p.email||'').toLowerCase();const _w=Math.floor(Date.now()/864e5);const _t=String(fd.get('emailToken')||'');const _ok=_t&&(_t===await box.hash('ev:'+_el+':'+_w)||_t===await box.hash('ev:'+_el+':'+(_w-1)));if(!_ok)return reply({error:'email_unverified',message:'Verify your email with the code we sent before submitting.'},400);}
    const requestId=String(fd.get('requestId')||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return reply({error:'invalid_request_id'},400);
    const bytes=new Uint8Array(await file.arrayBuffer());
    const fingerprint=await box.hash(JSON.stringify(p)+'|'+b64(await crypto.subtle.digest('SHA-256',bytes)));
    const previous=await repo.byRequest(requestId);if(previous){if(previous.fingerprint!==fingerprint)return reply({error:'request_changed',message:'This application changed after a previous attempt. Please contact GCCPROs.'},409);return reply({status:'ok',reference:previous.expert_code});}
    const emailHash=await box.hash('email:'+p.email.toLowerCase());if(await repo.byEmail(emailHash))return reply({error:'existing_application',message:'We could not create a new application. If you have applied before, contact admin@gccpros.com to update your record.'},409);
    const id=crypto.randomUUID(),code='GXP-'+crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase(),filePath=id+'/identity.enc';
    const documentEncrypted=await box.seal(bytes,'document:'+id);
    if(p.idType==='Aadhaar (India)'){p.idNumber='XXXX XXXX '+String(p.idNumber).replace(/\D/g,'').slice(-4);}
    const storedProfile={...p,skills:p.skills.map(({skill,level,years,evidence})=>({skill,level,years,evidence})),history:p.history.map(({company,title,location,start,end,current,scope})=>({company,title,location,start,end,current,scope})),documentType:file.type,documentSize:file.size};
    const row={id,expert_code:code,request_id:requestId,email_hash:emailHash,fingerprint,profile_encrypted:await box.seal(enc.encode(JSON.stringify(storedProfile)),'profile:'+id),document_path:filePath};
    await repo.putFile(filePath,enc.encode(JSON.stringify(documentEncrypted)));
    try{await repo.create(row)}catch(err){await repo.removeFile(filePath).catch(()=>{});const saved=await repo.byRequest(requestId);if(saved?.fingerprint===fingerprint)return reply({status:'ok',reference:saved.expert_code});if(err?.code==='23505')return reply({error:'existing_application',message:'An application may already exist. Contact admin@gccpros.com.'},409);throw err;}
    return reply({status:'ok',reference:code});
   }
   if(action==='otpSend'&&request.method==='POST'){
    if(!sendEmail)return reply({error:'intake_unavailable'},503);
    let d;try{d=JSON.parse(await request.text())}catch{return reply({error:'invalid_request'},400);}
    const email=String(d&&d.email||'').trim();const el=email.toLowerCase();
    if(email.length>180||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return reply({error:'invalid_email',message:'Enter a valid email address.'},422);
    const eh=await box.hash('email:'+el);const now=Date.now();
    const prev=await repo.otpGet(eh);let sends=0;if(prev&&prev.last_send&&now-new Date(prev.last_send).getTime()<36e5)sends=prev.sends||0;
    if(sends>=5)return reply({error:'otp_rate',message:'Too many codes requested. Try again in an hour.'},429);
    const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%900000+100000);
    await repo.otpSet({email_hash:eh,code_hash:await box.hash('otp:'+el+':'+code),expires_at:new Date(now+6e5).toISOString(),attempts:0,sends:sends+1,last_send:new Date(now).toISOString()});
    try{await sendEmail({from:mailFrom,to:[email],reply_to:mailTeam,subject:'Your GCCPROs verification code',text:'Your GCCPROs email verification code is '+code+'.\n\nThis code expires in 10 minutes. If you did not request it, ignore this email.\n\nGCCPROs \u00b7 Chartered Times LLP',html:'<div style="font-family:Arial,sans-serif;max-width:520px;color:#122338"><h1 style="font-size:22px">GCCPROs</h1><p style="line-height:1.6">Your email verification code is:</p><p style="font-size:30px;font-weight:800;letter-spacing:5px;color:#0A1628">'+code+'</p><p style="line-height:1.6;color:#536474">This code expires in 10 minutes. If you did not request it, please ignore this email.</p><p style="font-size:12px;color:#536474">GCCPROs \u00b7 Chartered Times LLP</p></div>'},'expert-otp/'+eh+'/'+now);}catch{return reply({error:'otp_send_failed',message:'We could not send the code. Please retry.'},503);}
    return reply({status:'ok'});
   }
   if(action==='otpVerify'&&request.method==='POST'){
    let d;try{d=JSON.parse(await request.text())}catch{return reply({error:'invalid_request'},400);}
    const el=String(d&&d.email||'').trim().toLowerCase();const code=String(d&&d.code||'').trim();
    if(!el||!/^\d{6}$/.test(code))return reply({error:'otp_invalid',message:'Enter the 6-digit code.'},422);
    const eh=await box.hash('email:'+el);const row=await repo.otpGet(eh);const now=Date.now();
    if(!row||!row.expires_at||new Date(row.expires_at).getTime()<now)return reply({error:'otp_expired',message:'This code has expired. Request a new one.'},410);
    if((row.attempts||0)>=6)return reply({error:'otp_locked',message:'Too many attempts. Request a new code.'},429);
    const match=(await box.hash('otp:'+el+':'+code))===row.code_hash;
    if(!match){await repo.otpSet({email_hash:eh,code_hash:row.code_hash,expires_at:row.expires_at,attempts:(row.attempts||0)+1,sends:row.sends||0,last_send:row.last_send});return reply({error:'otp_incorrect',message:'That code is not correct.'},422);}
    await repo.otpSet({email_hash:eh,code_hash:'',expires_at:new Date(now-1).toISOString(),attempts:(row.attempts||0)+1,sends:row.sends||0,last_send:row.last_send});
    const w=Math.floor(now/864e5);return reply({status:'ok',token:await box.hash('ev:'+el+':'+w)});
   }
   if(action==='login'&&request.method==='POST'){
    let d;try{d=JSON.parse(await request.text())}catch{return reply({error:'invalid_request'},400);}
    const el=String(d&&d.email||'').trim().toLowerCase();const pw=String(d&&d.password||'');
    const bad=()=>reply({error:'bad_credentials',message:'Incorrect email or password.'},401);
    const rec=el?await repo.byEmail(await box.hash('email:'+el)):null;
    if(!rec||!rec.password_hash||!rec.password_salt)return bad();
    if(rec.status!=='approved'||rec.closed_at)return reply({error:'not_active',message:'This account is not active for sign in. Contact admin@gccpros.com.'},403);
    if(await hashPw(pw,rec.password_salt)!==rec.password_hash)return bad();
    await repo.audit(rec.id,'expert-self','login',{});
    const w=Math.floor(Date.now()/864e5);
    return reply({status:'ok',token:await box.hash('sess:'+el+':'+w),mustReset:!!rec.must_reset_password});
   }
   if(action==='setPassword'&&request.method==='POST'){
    let d;try{d=JSON.parse(await request.text())}catch{return reply({error:'invalid_request'},400);}
    const el=String(d&&d.email||'').trim().toLowerCase();const t=String(d&&(d.token||d.emailToken)||'');const np=String(d&&d.newPassword||'');
    if(!await verifyExpertToken(el,t))return reply({error:'auth',message:'Your session has expired. Please sign in again.'},401);
    if(np.length<8||np.length>72||!/[A-Za-z]/.test(np)||!/[0-9]/.test(np))return reply({error:'weak_password',message:'Use at least 8 characters, with letters and numbers.'},422);
    const rec=await repo.byEmail(await box.hash('email:'+el));if(!rec)return reply({error:'not_found'},404);
    const salt=newSalt();await repo.setFlags(rec.id,{password_hash:await hashPw(np,salt),password_salt:salt,must_reset_password:false});
    await repo.audit(rec.id,'expert-self','password_set',{});
    const w=Math.floor(Date.now()/864e5);
    return reply({status:'ok',token:await box.hash('sess:'+el+':'+w)});
   }
   if(['self','selfUpdate','helpdesk','engagementRespond','requestCreate'].includes(action)&&request.method==='POST'){
    let d;try{d=JSON.parse(await request.text())}catch{return reply({error:'invalid_request'},400);}
    const el=String(d&&d.email||'').trim().toLowerCase();const t=String(d&&(d.token||d.emailToken)||'');
    if(!await verifyExpertToken(el,t))return reply({error:'auth',message:'Your session has expired. Please sign in again.'},401);
    const eh=await box.hash('email:'+el);const rec=await repo.byEmail(eh);
    if(!rec)return reply({error:'not_found',message:'We could not find a registration for this email.'},404);
    if(action==='helpdesk'){
     if(!sendEmail)return reply({error:'unavailable'},503);
     const subject=String(d.subject||'').trim().slice(0,160)||'Expert helpdesk request';const message=String(d.message||'').trim();
     if(message.length<5||message.length>4000)return reply({error:'invalid_message',message:'Please enter your message (5 to 4000 characters).'},422);
     const esch=v=>String(v).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
     try{await sendEmail({from:mailFrom,to:[mailTeam],reply_to:el,subject:'[Expert helpdesk] '+subject+' | '+rec.expert_code,text:'From: '+el+' ('+rec.expert_code+')\nStatus: '+rec.status+'\n\n'+message,html:'<div style="font-family:Arial,sans-serif;max-width:620px;color:#122338"><p><strong>Expert helpdesk request</strong></p><p>From: '+esch(el)+' ('+esch(rec.expert_code)+')<br>Status: '+esch(rec.status)+'</p><p style="white-space:pre-wrap">'+esch(message)+'</p></div>'},'expert-help/'+rec.id+'/'+Date.now());}catch{return reply({error:'send_failed',message:'We could not send your message. Please retry.'},503);}
     await repo.audit(rec.id,'expert-self','helpdesk_message',{subject});
     return reply({status:'ok'});
    }
    if(action==='requestCreate'){
     const type=['closure','deletion','data_export'].includes(d.type)?d.type:'';if(!type)return reply({error:'invalid_type',message:'Choose a valid request type.'},422);
     const message=String(d.message||'').slice(0,2000);
     await repo.reqInsert({application_id:rec.id,type,message});
     await repo.audit(rec.id,'expert-self','request_'+type,{});
     if(sendEmail){try{await sendEmail({from:mailFrom,to:[mailTeam],reply_to:el,subject:'[Expert request: '+type+'] '+rec.expert_code,text:'Expert '+el+' ('+rec.expert_code+') requested: '+type+'\n\n'+message},'expert-req/'+rec.id+'/'+Date.now());}catch(e){}}
     return reply({status:'ok',message:'Your request has been sent to the GCCPROs team.'});
    }
    if(action==='engagementRespond'){
     const pid=String(d.projectId||'');const resp=['accepted','declined'].includes(d.response)?d.response:'';
     if(!/^[0-9a-f-]{36}$/i.test(pid)||!resp)return reply({error:'invalid_request'},422);
     const prow=((await repo.projList(rec.id))||[]).find(x=>x.id===pid);
     if(!prow)return reply({error:'not_found'},404);
     await repo.projUpdate(pid,{expert_response:resp,status:resp==='accepted'?'active':'cancelled',updated_at:new Date().toISOString()});
     await repo.audit(rec.id,'expert-self','engagement_'+resp,{projectId:pid});
     return reply({status:'ok'});
    }
    const profile=await decrypt(rec);
    if(action==='selfUpdate'){
     const up=d.updates&&typeof d.updates==='object'?d.updates:{};
     const editable=['phone','city','languages','availability','rate','profile','achievements','linkedin'];
     const next={...profile};const changed={};
     for(const k of editable){if(up[k]!==undefined){const v=typeof up[k]==='string'?up[k].trim():up[k];next[k]=v;changed[k]=v;}}
     if(!Object.keys(changed).length)return reply({error:'no_changes',message:'No changes to submit.'},422);
     const errs=validateProfile(next);const bad=Object.keys(errs).filter(k=>editable.includes(k));
     if(bad.length)return reply({error:'validation',fields:Object.fromEntries(bad.map(k=>[k,errs[k]]))},422);
     await repo.changeReqInsert({application_id:rec.id,requested:changed});
     await repo.audit(rec.id,'expert-self','change_requested',{fields:Object.keys(changed)});
     return reply({status:'ok',message:'Your changes were submitted for review.'});
    }
    await repo.audit(rec.id,'expert-self','dashboard_viewed',{});
    const selfKeys=['name','email','phone','country','city','linkedin','role','employer','employment','capability','totalYears','gccYears','leadershipYears','sectors','regions','languages','profile','achievements','rate','availability','skills','history'];
    const selfProfile=Object.fromEntries(selfKeys.map(k=>[k,profile[k]]));
    let engagements=[];const earnings={fees:0,paid:0,pending:0,disbursed:0,currency:'USD',count:0};
    if(rec.status==='approved'&&!rec.closed_at){
     const rows=await repo.projList(rec.id);
     engagements=(rows||[]).map(x=>({id:x.id,title:x.title,clientRef:x.client_ref,status:x.status,eligibility:x.eligibility,response:x.expert_response,fee:x.fee_amount,currency:x.currency,hours:x.hours,start:x.start_date,end:x.end_date,paid:x.paid,disbursedAmount:x.disbursed_amount,disbursedAt:x.disbursed_at,disbursementMode:x.disbursement_mode,disbursementRef:x.disbursement_ref,rating:x.rating,feedback:x.feedback,notes:x.notes}));
     for(const x of engagements){const amt=Number(x.fee)||0;earnings.fees+=amt;if(x.paid)earnings.paid+=(Number(x.disbursedAmount)||amt);else earnings.pending+=amt;earnings.disbursed+=(Number(x.disbursedAmount)||0);if(x.currency)earnings.currency=x.currency;}
     earnings.count=engagements.length;
    }
    const pc=await repo.changeReqPending(rec.id);const reqs=await repo.reqOpen(rec.id);
    return reply({status:'ok',reference:rec.expert_code,applicationStatus:rec.status,blacklisted:!!rec.blacklisted,closed:!!rec.closed_at,mustReset:!!rec.must_reset_password,hasPassword:!!rec.password_hash,createdAt:rec.created_at,editable:['phone','city','languages','availability','rate','profile','achievements','linkedin'],profile:selfProfile,engagements,earnings,pendingChange:pc||null,requests:reqs||[]});
   }
   if(!['list','detail','document','review','blacklist','delete','projects','projectSave','projectDelete','changeRequests','changeDecide','accountRequests','requestDecide'].includes(action))return reply({error:'not_found'},404);
   const actor=(adminKey&&request.headers.get('x-admin-key')===adminKey)?'admin-console':await authenticate(request.headers.get('authorization')||'');if(!actor)return reply({error:'unauthorized'},401);
   if(action==='list'&&request.method==='GET'){
    const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));const rows=await repo.list(offset);
    await repo.audit(null,actor,'list_viewed',{offset,count:rows.length});
    const results=[];for(const row of rows){const p=await decrypt(row);results.push({id:row.id,reference:row.expert_code,name:p.name,email:p.email,capability:p.capability,status:row.status,blacklisted:!!row.blacklisted,createdAt:row.created_at});}return reply({rows:results,hasMore:rows.length===50});
   }
   if(action==='projectSave'&&request.method==='POST'){
    let d;try{d=JSON.parse(await request.text())}catch{return reply({error:'invalid_request'},400);}
    const appId=String(d.applicationId||'');if(!/^[0-9a-f-]{36}$/i.test(appId))return reply({error:'invalid_id'},400);
    const patch={title:String(d.title||'').trim().slice(0,200),client_ref:String(d.clientRef||'').trim().slice(0,200)||null,eligibility:['eligible','assigned','active','completed','cancelled'].includes(d.eligibility)?d.eligibility:'assigned',status:['assigned','active','completed','cancelled'].includes(d.status)?d.status:'assigned',fee_amount:(d.fee===''||d.fee==null)?null:Number(d.fee),currency:String(d.currency||'USD').slice(0,8),hours:(d.hours===''||d.hours==null)?null:Number(d.hours),start_date:d.start||null,end_date:d.end||null,paid:d.paid===true,disbursed_amount:(d.disbursedAmount===''||d.disbursedAmount==null)?null:Number(d.disbursedAmount),disbursed_at:d.disbursedAt||null,disbursement_mode:String(d.disbursementMode||'').slice(0,40)||null,disbursement_ref:String(d.disbursementRef||'').slice(0,120)||null,rating:(d.rating===''||d.rating==null)?null:Number(d.rating),feedback:String(d.feedback||'').slice(0,2000)||null,notes:String(d.notes||'').slice(0,2000)||null,updated_at:new Date().toISOString()};
    if(!patch.title)return reply({error:'invalid_project',message:'Project title is required.'},422);
    if(d.projectId){await repo.projUpdate(String(d.projectId),patch);await repo.audit(appId,actor,'project_updated',{projectId:d.projectId,title:patch.title});}
    else{const appRow=await repo.get(appId);if(!appRow)return reply({error:'not_found'},404);await repo.projInsert({application_id:appId,...patch});await repo.audit(appId,actor,'project_assigned',{title:patch.title});}
    return reply({status:'ok'});
   }
   if(action==='projectDelete'&&request.method==='POST'){
    let d;try{d=JSON.parse(await request.text())}catch{return reply({error:'invalid_request'},400);}
    if(!/^[0-9a-f-]{36}$/i.test(String(d.projectId||'')))return reply({error:'invalid_id'},400);
    await repo.projDelete(String(d.projectId));await repo.audit(/^[0-9a-f-]{36}$/i.test(String(d.applicationId||''))?String(d.applicationId):null,actor,'project_deleted',{projectId:d.projectId});
    return reply({status:'ok'});
   }
   if(action==='changeRequests'&&request.method==='GET'){
    const rows=await repo.changeReqList();const out=[];
    for(const r of (rows||[])){let nm='';try{const rr=await repo.get(r.application_id);if(rr)nm=(await decrypt(rr)).name;}catch(e){}out.push({id:r.id,applicationId:r.application_id,name:nm,requested:r.requested,createdAt:r.created_at});}
    return reply({rows:out});
   }
   if(action==='changeDecide'&&request.method==='POST'){
    let d;try{d=JSON.parse(await request.text())}catch{return reply({error:'invalid_request'},400);}
    if(!/^[0-9a-f-]{36}$/i.test(String(d.id||'')))return reply({error:'invalid_id'},400);
    const cr=await repo.changeReqGet(String(d.id));if(!cr||cr.status!=='pending')return reply({error:'not_found'},404);
    const decision=d.decision==='approved'?'approved':'rejected';
    if(decision==='approved'){const rr=await repo.get(cr.application_id);if(!rr)return reply({error:'not_found'},404);const prof=await decrypt(rr);const next={...prof,...cr.requested};const errs=validateProfile(next);const keys=Object.keys(cr.requested||{});const bad=keys.filter(k=>errs[k]);if(bad.length)return reply({error:'validation',message:'This change is no longer valid: '+errs[bad[0]]},422);await repo.updateProfile(cr.application_id,await box.seal(enc.encode(JSON.stringify(next)),'profile:'+cr.application_id));}
    await repo.changeReqDecide(String(d.id),decision,String(d.note||''));
    await repo.audit(cr.application_id,actor,'change_'+decision,{fields:Object.keys(cr.requested||{})});
    return reply({status:'ok'});
   }
   if(action==='accountRequests'&&request.method==='GET'){
    const rows=await repo.reqList();const out=[];
    for(const r of (rows||[])){let nm='',ref='';try{const rr=await repo.get(r.application_id);if(rr){ref=rr.expert_code;nm=(await decrypt(rr)).name;}}catch(e){}out.push({id:r.id,applicationId:r.application_id,name:nm,reference:ref,type:r.type,message:r.message,createdAt:r.created_at});}
    return reply({rows:out});
   }
   if(action==='requestDecide'&&request.method==='POST'){
    let d;try{d=JSON.parse(await request.text())}catch{return reply({error:'invalid_request'},400);}
    if(!/^[0-9a-f-]{36}$/i.test(String(d.id||'')))return reply({error:'invalid_id'},400);
    const rq=await repo.reqGet(String(d.id));if(!rq||rq.status!=='pending')return reply({error:'not_found'},404);
    const decision=d.decision==='actioned'?'actioned':'declined';
    if(decision==='actioned'&&rq.type==='deletion'){const rr=await repo.get(rq.application_id);if(rr){try{await repo.removeFile(rr.document_path);}catch(e){}await repo.del(rq.application_id);}await repo.audit(null,actor,'request_deletion_actioned',{reference:(await (async()=>{try{const rr=await repo.get(rq.application_id);return rr?rr.expert_code:'';}catch(e){return '';}})())});return reply({status:'ok'});}
    if(decision==='actioned'&&rq.type==='closure'){await repo.setFlags(rq.application_id,{closed_at:new Date().toISOString()});}
    await repo.reqDecide(String(d.id),decision,String(d.note||''));
    await repo.audit(rq.application_id,actor,'request_'+rq.type+'_'+decision,{});
    return reply({status:'ok'});
   }
   const id=url.searchParams.get('id')||'';if(!/^[0-9a-f-]{36}$/i.test(id))return reply({error:'invalid_id'},400);
   const row=await repo.get(id);if(!row)return reply({error:'not_found'},404);
   if(action==='detail'&&request.method==='GET'){
    await repo.audit(id,actor,'profile_viewed',{});const profile=await decrypt(row);
    const review=row.review_encrypted?JSON.parse(dec.decode(await box.open(row.review_encrypted,'review:'+id))):{checks:{},notes:''};
    const audit=await repo.events(id);for(const a of audit){if(a.metadata?.review_encrypted){a.metadata={...a.metadata,review:JSON.parse(dec.decode(await box.open(a.metadata.review_encrypted,'review:'+id)))};delete a.metadata.review_encrypted;}}
    return reply({id,reference:row.expert_code,status:row.status,version:row.version,createdAt:row.created_at,blacklisted:!!row.blacklisted,blacklistReason:row.blacklist_reason||'',profile,review,clientPreview:clientProjection(row,profile),audit,emails:await repo.mailStatus(id)});
   }
   if(action==='document'&&request.method==='GET'){
    await repo.audit(id,actor,'identity_document_viewed',{});const p=await decrypt(row),encrypted=JSON.parse(dec.decode(await repo.getFile(row.document_path))),bytes=await box.open(encrypted,'document:'+id);
    const ext={'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'}[p.documentType];if(!ext)throw new Error('Invalid stored content type');
    return new Response(bytes,{headers:{'Content-Type':p.documentType,'Content-Disposition':`attachment; filename="${row.expert_code}-identity.${ext}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Access-Control-Allow-Origin':origin,'Vary':'Origin'}});
   }
   if(action==='review'&&request.method==='POST'){
    const raw=await request.text();if(raw.length>15000)return reply({error:'request_too_large'},413);const d=JSON.parse(raw);
    if(!['under_review','needs_information','approved','rejected'].includes(d.status)||!Number.isInteger(d.version)||typeof d.notes!=='string'||d.notes.trim().length<20||d.notes.length>6000)return reply({error:'invalid_review',message:'Choose a status and enter a review note of 20–6,000 characters.'},422);
    const checks=Object.fromEntries(CHECKS.map(k=>[k,d.checks?.[k]===true]));
    if(d.status==='approved'&&CHECKS.some(k=>!checks[k]))return reply({error:'verification_incomplete',message:'Verify every review check before approval.'},422);
    const review=await box.seal(enc.encode(JSON.stringify({checks,notes:d.notes.trim()})),'review:'+id);
    const success=await repo.review(id,d.version,d.status,review,actor,checks);
    if(!success)return reply({error:'review_conflict',message:'Another reviewer changed this application. Reload it before saving.'},409);
    if(d.status==='approved'&&!row.password_hash){try{const tp=genTempPw();const salt=newSalt();await repo.setFlags(id,{password_hash:await hashPw(tp,salt),password_salt:salt,must_reset_password:true});const p2=await decrypt(row);if(sendEmail){await sendEmail({from:mailFrom,to:[p2.email],reply_to:mailTeam,subject:'Your GCCPROs expert login',text:'Hello '+(p2.name||'')+',\n\nYour GCCPROs expert profile is approved. Sign in to your private dashboard:\nhttps://www.gccpros.com/expert-dashboard.html\n\nEmail: '+p2.email+'\nTemporary password: '+tp+'\n\nYou will set a new password on first sign in. Please do not share this password.\n\nGCCPROs',html:'<div style="font-family:Arial,sans-serif;max-width:560px;color:#122338"><h2 style="color:#0A1628">Your GCCPROs expert profile is approved</h2><p>Sign in to your private dashboard: <a href="https://www.gccpros.com/expert-dashboard.html">gccpros.com/expert-dashboard.html</a></p><p><b>Email:</b> '+p2.email+'<br><b>Temporary password:</b> <code style="font-size:16px;background:#eef;padding:2px 6px;border-radius:4px">'+tp+'</code></p><p>You will set a new password on first sign in. Please do not share this password.</p></div>'},'expert-cred/'+id+'/'+Date.now());}await repo.audit(id,actor,'credentials_issued',{});}catch(e){}}
    return reply({status:'ok'});
   }
   if(action==='projects'&&request.method==='GET'){
    const rows=await repo.projList(id);
    return reply({rows:(rows||[]).map(x=>({id:x.id,title:x.title,clientRef:x.client_ref,eligibility:x.eligibility,status:x.status,response:x.expert_response,fee:x.fee_amount,currency:x.currency,hours:x.hours,start:x.start_date,end:x.end_date,paid:x.paid,disbursedAmount:x.disbursed_amount,disbursedAt:x.disbursed_at,disbursementMode:x.disbursement_mode,disbursementRef:x.disbursement_ref,rating:x.rating,feedback:x.feedback,notes:x.notes,createdAt:x.created_at}))});
   }
   if(action==='blacklist'&&request.method==='POST'){
    let d={};try{d=JSON.parse(await request.text()||'{}')}catch{}
    const on=d.blacklisted!==false;const reason=String(d.reason||'').slice(0,500);
    await repo.setFlags(id,{blacklisted:on,blacklist_reason:on?reason:null});
    await repo.audit(id,actor,on?'blacklisted':'unblacklisted',{reason});
    return reply({status:'ok'});
   }
   if(action==='delete'&&request.method==='POST'){
    try{await repo.removeFile(row.document_path);}catch(e){}
    await repo.del(id);
    await repo.audit(null,actor,'application_deleted',{reference:row.expert_code});
    return reply({status:'ok'});
   }
   return reply({error:'method_not_allowed'},405);
  }catch{return reply({error:'service_error',message:'We could not confirm completion. Your form is still available; retry or contact admin@gccpros.com.'},503);}
 };
}
