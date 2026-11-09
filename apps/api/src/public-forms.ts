import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { z } from 'zod';
import { db, sql } from '@ecogrowth/db';
import { ApiError } from './access.js';
import { origins } from './auth.js';

const text=(max:number)=>z.string().trim().max(max).default('');
const email=z.string().trim().email().max(254).transform(value=>value.toLowerCase());
export const enquirySchema=z.object({
 kind:z.enum(['ASSESSMENT','CONTACT']), name:z.string().trim().min(2).max(120),email,
 phone:text(50),businessName:text(160),sector:text(80),location:text(500),service:text(100),
 message:z.string().trim().min(10).max(4000),preferredContact:z.enum(['EMAIL','PHONE']).default('EMAIL'),
 consent:z.literal(true),website:text(200),requestKey:z.string().uuid()
}).refine(v=>v.kind!=='ASSESSMENT'||v.businessName.length>=2&&v.location.length>=3,{message:'Add your business name and site location.',path:['businessName']})
 .refine(v=>v.preferredContact!=='PHONE'||v.phone.length>=6,{message:'Provide a phone number for a phone callback.',path:['phone']});
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');

async function publicLimit(c:Context){
 if(!origins.includes(c.req.header('origin')||''))throw new ApiError(403,'ORIGIN_REQUIRED','Please submit from the EcoGrowth website.');
 // Only trust the platform's overwritten header in hosted Vercel, not arbitrary X-Forwarded-For.
 const ip=process.env.VERCEL?c.req.header('x-vercel-forwarded-for')?.split(',')[0].trim()||'unknown':'local';
 const key=createHmac('sha256',process.env.BETTER_AUTH_SECRET||'local-form-limit').update(ip).digest('hex');
 const count=(await db.execute(sql`INSERT INTO public_form_limits(key,window_start,count) VALUES(${key},date_trunc('hour',now()),1) ON CONFLICT(key,window_start) DO UPDATE SET count=public_form_limits.count+1 RETURNING count`)).rows[0];
 if(Number(count.count)>12){c.header('Retry-After','3600');throw new ApiError(429,'RATE_LIMITED','Too many submissions. Please try again later.');}
 // Bounded opportunistic retention cleanup, not an unawaited task.
 await db.execute(sql`DELETE FROM public_form_limits WHERE (key,window_start) IN (SELECT key,window_start FROM public_form_limits WHERE window_start<now()-interval '2 days' LIMIT 100)`);
}

export async function submitEnquiry(c:Context){
 await publicLimit(c);
 const data=enquirySchema.parse(await c.req.json());
 if(data.website)throw new ApiError(422,'INVALID_SUBMISSION','Please check the form and try again.');
 const {requestKey,website,...body}=data;
 const digest=hash(JSON.stringify(body));
 const result=await db.transaction(async tx=>{
  await tx.execute(sql`INSERT INTO enquiries(kind,name,email,phone,business_name,sector,location,service,message,preferred_contact,request_key,request_hash) VALUES(${data.kind},${data.name},${data.email},${data.phone},${data.businessName},${data.sector},${data.location},${data.service},${data.message},${data.preferredContact},${requestKey},${digest}) ON CONFLICT(request_key) DO NOTHING`);
  const row=(await tx.execute(sql`SELECT reference,request_hash FROM enquiries WHERE request_key=${requestKey}`)).rows[0];
  if(row.request_hash!==digest)throw new ApiError(409,'REQUEST_CHANGED','This submission key was already used. Reload before sending a different request.');
  return {reference:row.reference};
 });
 return c.json({...result,message:'Your request is saved. Our team can review your details and contact you. Service and response time are not yet confirmed.'},201);
}

export async function subscribeNewsletter(c:Context){
 await publicLimit(c);
 const data=z.object({email,consent:z.literal(true),website:text(200)}).parse(await c.req.json());
 if(data.website)throw new ApiError(422,'INVALID_SUBMISSION','Please check the form.');
 const token=randomBytes(32).toString('hex');
 await db.execute(sql`INSERT INTO newsletter_subscriptions(email,unsubscribe_hash) VALUES(${data.email},${hash(token)}) ON CONFLICT(email) DO NOTHING`);
 // Never reveal whether an address already existed, and never rotate another subscriber's token.
 return c.json({message:'Your newsletter request has been received. Newsletters are not yet being sent. Save the link below; it applies if this address was newly registered. For an existing subscription, use your original link or contact us.',unsubscribeToken:token},202);
}

export async function unsubscribeNewsletter(c:Context){
 await publicLimit(c);
 const {token}=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).parse(await c.req.json());
 await db.execute(sql`UPDATE newsletter_subscriptions SET status='UNSUBSCRIBED',updated_at=now() WHERE unsubscribe_hash=${hash(token)}`);
 return c.json({message:'If this link matched a subscription, it is now unsubscribed.'});
}
