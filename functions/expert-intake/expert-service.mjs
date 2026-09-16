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
export function makeHandler({repo,box,authenticate,verifyHuman,origins,siteKey,ready=true,adminKey=''}){
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
   if(!['list','detail','document','review'].includes(action))return reply({error:'not_found'},404);
   const actor=(adminKey&&request.headers.get('x-admin-key')===adminKey)?'admin-console':await authenticate(request.headers.get('authorization')||'');if(!actor)return reply({error:'unauthorized'},401);
   if(action==='list'&&request.method==='GET'){
    const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));const rows=await repo.list(offset);
    await repo.audit(null,actor,'list_viewed',{offset,count:rows.length});
    const results=[];for(const row of rows){const p=await decrypt(row);results.push({id:row.id,reference:row.expert_code,name:p.name,email:p.email,capability:p.capability,status:row.status,createdAt:row.created_at});}return reply({rows:results,hasMore:rows.length===50});
   }
   const id=url.searchParams.get('id')||'';if(!/^[0-9a-f-]{36}$/i.test(id))return reply({error:'invalid_id'},400);
   const row=await repo.get(id);if(!row)return reply({error:'not_found'},404);
   if(action==='detail'&&request.method==='GET'){
    await repo.audit(id,actor,'profile_viewed',{});const profile=await decrypt(row);
    const review=row.review_encrypted?JSON.parse(dec.decode(await box.open(row.review_encrypted,'review:'+id))):{checks:{},notes:''};
    const audit=await repo.events(id);for(const a of audit){if(a.metadata?.review_encrypted){a.metadata={...a.metadata,review:JSON.parse(dec.decode(await box.open(a.metadata.review_encrypted,'review:'+id)))};delete a.metadata.review_encrypted;}}
    return reply({id,reference:row.expert_code,status:row.status,version:row.version,createdAt:row.created_at,profile,review,clientPreview:clientProjection(row,profile),audit,emails:await repo.mailStatus(id)});
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
   return reply({error:'method_not_allowed'},405);
  }catch{return reply({error:'service_error',message:'We could not confirm completion. Your form is still available; retry or contact admin@gccpros.com.'},503);}
 };
}
