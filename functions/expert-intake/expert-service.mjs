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
    const allowed=['name','email','phone','country','city','linkedin','role','employer','employment','capability','totalYears','gccYears','leadershipYears','sectors','regions','languages','profile','achievements','conflicts','rate','availability','skills','history','idType','idCountry','idName','idNumber','idExpiry','eligibility','privacy','identityConsent','truth','consentVersion'];
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
   if(['self','selfUpdate','helpdesk'].includes(action)&&request.method==='POST'){
    let d;try{d=JSON.parse(await request.text())}catch{return reply({error:'invalid_request'},400);}
    const el=String(d&&d.email||'').trim().toLowerCase();const t=String(d&&d.emailToken||'');const w=Math.floor(Date.now()/864e5);
    const okT=el&&t&&(t===await box.hash('ev:'+el+':'+w)||t===await box.hash('ev:'+el+':'+(w-1)));
    if(!okT)return reply({error:'auth',message:'Your session has expired. Please verify your email again.'},401);
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
    const profile=await decrypt(rec);
    if(action==='selfUpdate'){
     const up=d.updates&&typeof d.updates==='object'?d.updates:{};
     const editable=['phone','city','languages','availability','rate','profile','achievements','linkedin'];
     const next={...profile};const changed=[];
     for(const k of editable){if(up[k]!==undefined){next[k]=typeof up[k]==='string'?up[k].trim():up[k];changed.push(k);}}
     const errs=validateProfile(next);const bad=Object.keys(errs).filter(k=>editable.includes(k));
     if(bad.length)return reply({error:'validation',fields:Object.fromEntries(bad.map(k=>[k,errs[k]]))},422);
     await repo.updateProfile(rec.id,await box.seal(enc.encode(JSON.stringify(next)),'profile:'+rec.id));
     await repo.audit(rec.id,'expert-self','self_update',{fields:changed});
     return reply({status:'ok'});
    }
    await repo.audit(rec.id,'expert-self','dashboard_viewed',{});
    const selfKeys=['name','email','phone','country','city','linkedin','role','employer','employment','capability','totalYears','gccYears','leadershipYears','sectors','regions','languages','profile','achievements','rate','availability','skills','history'];
    const selfProfile=Object.fromEntries(selfKeys.map(k=>[k,profile[k]]));
    let projects=[];const earnings={paid:0,pending:0,currency:'USD',count:0};
    if(rec.status==='approved'){
     const rows=await repo.projList(rec.id);
     projects=(rows||[]).map(x=>({id:x.id,title:x.title,clientRef:x.client_ref,status:x.status,fee:x.fee_amount,currency:x.currency,hours:x.hours,start:x.start_date,end:x.end_date,paid:x.paid,notes:x.notes}));
     for(const x of projects){const amt=Number(x.fee)||0;if(x.paid)earnings.paid+=amt;else earnings.pending+=amt;}
     earnings.count=projects.length;if(projects[0]&&projects[0].currency)earnings.currency=projects[0].currency;
    }
    return reply({status:'ok',reference:rec.expert_code,applicationStatus:rec.status,blacklisted:!!rec.blacklisted,createdAt:rec.created_at,editable:['phone','city','languages','availability','rate','profile','achievements','linkedin'],profile:selfProfile,projects,earnings});
   }
   if(!['list','detail','document','review','blacklist','delete','projects','projectSave','projectDelete'].includes(action))return reply({error:'not_found'},404);
   const actor=(adminKey&&request.headers.get('x-admin-key')===adminKey)?'admin-console':await authenticate(request.headers.get('authorization')||'');if(!actor)return reply({error:'unauthorized'},401);
   if(action==='list'&&request.method==='GET'){
    const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));const rows=await repo.list(offset);
    await repo.audit(null,actor,'list_viewed',{offset,count:rows.length});
    const results=[];for(const row of rows){const p=await decrypt(row);results.push({id:row.id,reference:row.expert_code,name:p.name,email:p.email,capability:p.capability,status:row.status,blacklisted:!!row.blacklisted,createdAt:row.created_at});}return reply({rows:results,hasMore:rows.length===50});
   }
   if(action==='projectSave'&&request.method==='POST'){
    let d;try{d=JSON.parse(await request.text())}catch{return reply({error:'invalid_request'},400);}
    const appId=String(d.applicationId||'');if(!/^[0-9a-f-]{36}$/i.test(appId))return reply({error:'invalid_id'},400);
    const patch={title:String(d.title||'').trim().slice(0,200),client_ref:String(d.clientRef||'').trim().slice(0,200)||null,status:['assigned','active','completed','cancelled'].includes(d.status)?d.status:'assigned',fee_amount:(d.fee===''||d.fee==null)?null:Number(d.fee),currency:String(d.currency||'USD').slice(0,8),hours:(d.hours===''||d.hours==null)?null:Number(d.hours),start_date:d.start||null,end_date:d.end||null,paid:d.paid===true,notes:String(d.notes||'').slice(0,2000)||null,updated_at:new Date().toISOString()};
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
    return reply({status:'ok'});
   }
   if(action==='projects'&&request.method==='GET'){
    const rows=await repo.projList(id);
    return reply({rows:(rows||[]).map(x=>({id:x.id,title:x.title,clientRef:x.client_ref,status:x.status,fee:x.fee_amount,currency:x.currency,hours:x.hours,start:x.start_date,end:x.end_date,paid:x.paid,notes:x.notes,createdAt:x.created_at}))});
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
