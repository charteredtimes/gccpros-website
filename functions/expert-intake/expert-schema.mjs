export const VERSION='expert-intake-2026-09-18-v4';
export const CAPABILITIES=['Setup & strategy','Leadership & talent','Technology & AI','Finance & operations'];
export const SKILLS=['GCC strategy & business case','Location selection & incentives','GCC setup & launch','Operating model & governance','Leadership & organisation design','Talent acquisition & workforce planning','Culture & change management','Product & platform engineering','Cloud & infrastructure','Data engineering & analytics','AI / ML & GenAI','Cybersecurity & privacy','Finance / accounting / FP&A','Global business services','Procurement & supply chain','Risk / compliance / controls','Service excellence & transformation','Legal / tax / entity setup'];
export const LEVELS=['Practitioner','Senior specialist','Functional leader','Enterprise leader'];
export const SECTORS=['GCC','Financial services','Technology','Healthcare & life sciences','Retail & consumer','Industrial & engineering','Energy & utilities','Telecom & media','Cross-industry','Others'];
export const REGIONS=['India','APAC','Europe','North America','Middle East & Africa','Latin America'];
export const ID_TYPES=['Passport','Driving licence','PAN card','Voter ID (EPIC)','National ID — masked'];
export const EMPLOYMENT=['Currently employed','Independent / portfolio career','Retired'];
export const CHECKS=['email','phone','identity','linkedin','experience','skills','conflicts'];
export function validateProfile(p,now=new Date()){
 const e={};const text=(key,min,max)=>{if(typeof p[key]!=='string'||p[key].trim().length<min||p[key].trim().length>max)e[key]=`Enter ${min}–${max} characters.`;};
 text('name',2,120);if(!e.name&&(!/^[\p{L}\p{M} .’'\-]+$/u.test(p.name)||!/[\p{L}].*[\p{L}]/u.test(p.name)))e.name='Enter your legal name using letters, spaces, apostrophes or hyphens.';
 text('email',5,180);if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email||''))e.email='Enter a valid email address.';
 if(!/^\+[1-9]\d{7,14}$/.test(p.phone||'')||/^(\d)\1+$/.test((p.phone||'').replace(/^\+\d{1,3}/,'')))e.phone='Use an international phone number, for example +919876543210 (8–15 digits).';
 for(const k of ['country','city'])text(k,2,80);
 try{const u=new URL(p.linkedin);if(u.protocol!=='https:'||!['linkedin.com','www.linkedin.com'].includes(u.hostname)||!/^\/in\/[a-zA-Z0-9_%\-]+\/?$/.test(u.pathname)||u.search||u.hash||u.username||u.password||u.port)throw 0;}catch{e.linkedin='Use your personal https://www.linkedin.com/in/profile URL without tracking parameters.';}
 text('role',3,160);text('employer',2,180);if(!EMPLOYMENT.includes(p.employment))e.employment='Select an employment status.';
 if(!CAPABILITIES.includes(p.capability))e.capability='Select a primary capability.';
 for(const k of ['totalYears','gccYears','leadershipYears'])if(!Number.isInteger(p[k])||p[k]<0||p[k]>60)e[k]='Enter whole years between 0 and 60.';
 if(p.totalYears<5)e.totalYears='This network requires at least five years of professional experience.';
 if(p.gccYears>p.totalYears)e.gccYears='GCC experience cannot exceed total experience.';
 if(p.leadershipYears>p.totalYears)e.leadershipYears='Leadership experience cannot exceed total experience.';
 for(const [k,options,max]of [['sectors',SECTORS,5],['regions',REGIONS,6]])if(!Array.isArray(p[k])||p[k].length<1||p[k].length>max||new Set(p[k]).size!==p[k].length||p[k].some(x=>!options.includes(x)))e[k]=`Choose between 1 and ${max} options.`;
 text('languages',2,150);text('profile',150,6000);text('achievements',80,4000);text('conflicts',20,2000);
 if(!Number.isInteger(p.rate)||p.rate<200||p.rate>500||p.rate%25)e.rate='Choose USD 200–500 in increments of 25.';
 if(!Number.isInteger(p.availability)||p.availability<1||p.availability>160)e.availability='Enter 1–160 available hours per month.';
 if(!Array.isArray(p.skills)||p.skills.length<2||p.skills.length>12)e.skills='Map at least two and no more than twelve skills.';
 else{const seen=new Set();p.skills.forEach((s,i)=>{if(!s||typeof s!=='object'){e[`skills.${i}.skill`]='Choose a valid skill.';return;}if(!SKILLS.includes(s.skill)||seen.has(s.skill))e[`skills.${i}.skill`]='Choose a distinct skill.';seen.add(s.skill);if(!LEVELS.includes(s.level))e[`skills.${i}.level`]='Choose a proficiency level.';if(!Number.isInteger(s.years)||s.years<1||s.years>p.totalYears)e[`skills.${i}.years`]='Skill experience must be 1 year or more and no greater than total experience.';if(typeof s.evidence!=='string'||s.evidence.trim().length<40||s.evidence.length>1500)e[`skills.${i}.evidence`]='Describe a relevant outcome in 40–1,500 characters.';});}
 const currentMonth=now.toISOString().slice(0,7);const validMonth=s=>typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s)&&s>='1960-01'&&s<=currentMonth;
 if(!Array.isArray(p.history)||p.history.length<1||p.history.length>10)e.history='Add between one and ten relevant roles.';
 else p.history.forEach((h,i)=>{if(!h||typeof h!=='object'){e[`history.${i}.company`]='Enter a valid role.';return;}for(const k of ['company','title','location'])if(typeof h[k]!=='string'||h[k].trim().length<2||h[k].length>180)e[`history.${i}.${k}`]='Enter 2–180 characters.';if(!validMonth(h.start))e[`history.${i}.start`]='Enter a valid start month, not in the future.';if(typeof h.current!=='boolean')e[`history.${i}.current`]='Choose whether this role is current.';if(!h.current&&(!validMonth(h.end)||h.end<h.start))e[`history.${i}.end`]='End month must follow the start and cannot be in the future.';if(h.current&&h.end)e[`history.${i}.end`]='Clear the end month for a current role.';if(typeof h.scope!=='string'||h.scope.trim().length<60||h.scope.length>2500)e[`history.${i}.scope`]='Describe responsibilities and outcomes in 60–2,500 characters.';});
 if(!ID_TYPES.includes(p.idType))e.idType='Choose a government ID type.';
 text('idCountry',2,80);text('idName',2,120);
 const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 {const _t=v=>String(v||'').normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);const _a=_t(p.name),_b=_t(p.idName);const _sub=(x,y)=>x.length>0&&x.every(t=>y.includes(t));if(!(_a.length&&_b.length&&(_sub(_a,_b)||_sub(_b,_a))))e.idName='The name on your ID must match your profile name. Your ID shows "'+(p.idName||'')+'" and your profile name is "'+(p.name||'')+'". Use the same name on both, or email admin@gccpros.com if they legitimately differ.';}
 if(p.idType==='National ID — masked'){if(!/^[A-Z0-9]{4}$/i.test(p.idNumber||''))e.idNumber='Enter only the last four characters, never the full national ID number.';}
 else if(p.idType==='PAN card'){if(!/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test((p.idNumber||'').replace(/\s/g,'')))e.idNumber='A PAN is 10 characters: five letters, four digits, then one letter (e.g. ABCDE1234F).';}
 else if(p.idType==='Voter ID (EPIC)'){if(!/^[A-Z]{3}[0-9]{7}$/i.test((p.idNumber||'').replace(/\s/g,'')))e.idNumber='A Voter ID (EPIC) number is three letters followed by seven digits (e.g. ABC1234567).';}
 else if(!/^[A-Z0-9 -]{6,24}$/i.test(p.idNumber||''))e.idNumber='Enter the government ID number using 6–24 letters, numbers, spaces or hyphens.';
 if(p.idType==='Passport'&&/^india$/i.test(p.idCountry||'')&&!/^[A-Z][0-9]{7}$/i.test(p.idNumber||''))e.idNumber='An Indian passport number is one letter followed by seven digits.';
 if(['Passport','Driving licence'].includes(p.idType)||p.idExpiry){const d=new Date(p.idExpiry+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(p.idExpiry||'')||!Number.isFinite(+d)||d.toISOString().slice(0,10)!==p.idExpiry||p.idExpiry<now.toISOString().slice(0,10))e.idExpiry='Enter a valid, unexpired date.';}
 for(const k of ['eligibility','privacy','identityConsent','truth','engagementTerms'])if(p[k]!==true)e[k]='Please confirm this required acknowledgement.';
 if(p.consentVersion!==VERSION)e.consentVersion='Refresh the page to load the current consent notice.';
 return e;
}
export async function validateDocument(file){
 if(!file||typeof file.arrayBuffer!=='function'||file.size<100)return 'Upload a readable government ID document.';
 if(file.size>3*1024*1024)return 'The document must be no larger than 3 MB.';
 const b=new Uint8Array(await file.slice(0,16).arrayBuffer());
 const png=[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x),jpg=b[0]===255&&b[1]===216&&b[2]===255,pdf=new TextDecoder().decode(b).startsWith('%PDF-');
 if(!((file.type==='image/png'&&png&&/\.png$/i.test(file.name))||(file.type==='image/jpeg'&&jpg&&/\.jpe?g$/i.test(file.name))||(file.type==='application/pdf'&&pdf&&/\.pdf$/i.test(file.name))))return 'Upload a genuine PDF, JPG or PNG file; renamed files are rejected.';
 return '';
}
export function clientProjection(row,p){return {expertCode:row.expert_code,capability:p.capability,experienceBand:p.totalYears>=20?'20+ years':p.totalYears>=15?'15-19 years':p.totalYears>=10?'10-14 years':'5-9 years',skills:p.skills.map(x=>x.skill),sectors:p.sectors};}
