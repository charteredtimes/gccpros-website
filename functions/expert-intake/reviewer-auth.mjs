// Verification is injected so exactly the same claims policy is testable locally.
export function reviewerAuth(verifyToken,reviewers){
 return async header=>{try{if(!header.startsWith('Bearer '))return null;const {payload:p}=await verifyToken(header.slice(7));const now=Math.floor(Date.now()/1000);if(typeof p.sub!=='string'||!p.sub.length||p.sub.length>128||!Number.isInteger(p.exp)||p.exp<=now||!Number.isInteger(p.iat)||p.iat>now||!Number.isInteger(p.auth_time)||p.auth_time>now||p.email_verified!==true||typeof p.email!=='string'||!reviewers.includes(p.email.toLowerCase()))return null;return p.email.toLowerCase();}catch{return null;}};
}
