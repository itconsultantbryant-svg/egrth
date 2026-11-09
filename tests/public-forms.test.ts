import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { disposablePostgres } from './helpers/disposable-postgres';
import { testServer } from './helpers/test-server';
import { pool as defaultPool } from '@ecogrowth/db';
import { enquirySchema } from '../apps/api/src/public-forms';

const origin='http://localhost:5173',url='http://127.0.0.1:3118/api/v1';
let fixture:Awaited<ReturnType<typeof disposablePostgres>>,server:ReturnType<typeof testServer>;
const body=()=>({kind:'ASSESSMENT',name:'Public form fixture',email:'enquiry@example.test',phone:'+231 0000000',businessName:'Isolated fixture kitchen',location:'Fictional Sinkor landmark',sector:'Restaurant',service:'Site assessment & collection',message:'Isolated automated test, not a real customer request.',preferredContact:'EMAIL',consent:true,website:'',requestKey:randomUUID()});
const post=(path:string,data:unknown,headers:Record<string,string>={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(data)});
async function session(identity:string){
 const response=await post('/auth/sign-in/email',{email:identity+'@demo.ecogrowth.test',password:process.env.DEMO_SEED_PASSWORD});expect(response.status).toBe(200);
 const cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const membership=(await fixture.pool.query('SELECT m.id FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE u.email=$1 ORDER BY m.role LIMIT 1',[identity+'@demo.ecogrowth.test'])).rows[0].id;
 // Admin has explicit customer memberships too; choose the platform one.
 const id=identity==='admin'?(await fixture.pool.query("SELECT m.id FROM memberships m JOIN \"user\" u ON u.id=m.user_id WHERE u.email=$1 AND m.role='PLATFORM_ADMIN'",[identity+'@demo.ecogrowth.test'])).rows[0].id:membership;
 return {Cookie:cookie,'X-Membership-Id':id};
}
describe('public enquiry and newsletter forms against isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  fixture=await disposablePostgres();
  server=testServer(['--import','tsx','apps/api/src/dev.ts'],{DATABASE_URL:fixture.url,PORT:'3118',ALLOWED_ORIGINS:origin,BETTER_AUTH_URL:'http://localhost:3118'});
  await server.ready(url+'/health');
 },120000);
 beforeEach(async()=>{await fixture.pool.query('DELETE FROM public_form_limits');});
 afterAll(async()=>{await server?.stop();await fixture?.cleanup();await defaultPool.end();});
 it('validates assessment business/location, callback number and consent',()=>{
  expect(enquirySchema.safeParse({...body(),businessName:''}).success).toBe(false);
  expect(enquirySchema.safeParse({...body(),preferredContact:'PHONE',phone:''}).success).toBe(false);
  expect(enquirySchema.safeParse({...body(),consent:false}).success).toBe(false);
 });
 it('saves an assessment without login and replays the same submission once',async()=>{
  const data=body();const first=await post('/public/enquiries',data);expect(first.status).toBe(201);
  const result=await first.json();expect(result.reference).toMatch(/^EG-/);expect(result).not.toHaveProperty('email');
  const replay=await post('/public/enquiries',data);expect((await replay.json()).reference).toBe(result.reference);
  expect((await fixture.pool.query('SELECT id FROM enquiries WHERE request_key=$1',[data.requestKey])).rowCount).toBe(1);
  expect((await post('/public/enquiries',{...data,message:'A different request using the old key.'})).status).toBe(409);
 });
 it('denies untrusted origins, spam traps and public access to stored contact details',async()=>{
  expect((await post('/public/enquiries',body(),{Origin:'https://other.example'})).status).toBe(403);
  expect((await post('/public/enquiries',{...body(),website:'spam.example'})).status).toBe(422);
  expect((await fetch(url+'/enquiries')).status).toBe(401);
 });
 it('lets authorized operations read and audit follow-up while customers are denied',async()=>{
  const data=body();await post('/public/enquiries',data);
  const row=(await fixture.pool.query('SELECT * FROM enquiries WHERE request_key=$1',[data.requestKey])).rows[0];
  const admin=await session('admin'),customer=await session('customer1');
  expect((await fetch(url+'/enquiries',{headers:customer})).status).toBe(403);
  const list=await fetch(url+'/enquiries',{headers:admin});expect(list.status).toBe(200);expect((await list.json()).data.some((v:any)=>v.id===row.id)).toBe(true);
  const review=await post(`/enquiries/${row.id}/review`,{version:1,status:'CONTACTED',notes:'Isolated test follow-up recorded.'},admin);expect(review.status).toBe(200);
  expect((await post(`/enquiries/${row.id}/review`,{version:1,status:'CLOSED',notes:'Stale test update.'},admin)).status).toBe(409);
  expect((await fixture.pool.query("SELECT id FROM audit_events WHERE target_id=$1 AND action='enquiry-reviewed'",[row.id])).rowCount).toBe(1);
 });
 it('records separate newsletter consent, deduplicates and supports token-based unsubscribe',async()=>{
  const data={email:'newsletter@example.test',consent:true,website:''};
  const response=await post('/public/newsletter',data);expect(response.status).toBe(202);const first=await response.json();
  const duplicate=await post('/public/newsletter',data);expect(duplicate.status).toBe(202);expect((await duplicate.json()).unsubscribeToken).toHaveLength(64);
  expect((await fixture.pool.query('SELECT id FROM newsletter_subscriptions WHERE email=$1',[data.email])).rowCount).toBe(1);
  expect((await post('/public/newsletter/unsubscribe',{token:first.unsubscribeToken})).status).toBe(200);
  expect((await fixture.pool.query('SELECT status FROM newsletter_subscriptions WHERE email=$1',[data.email])).rows[0].status).toBe('UNSUBSCRIBED');
  expect((await post('/public/newsletter',{...data,consent:false})).status).toBe(422);
 });
 it('enforces a durable public limit even when forwarded-for is forged locally',async()=>{
  for(let i=0;i<12;i++)expect((await post('/public/newsletter',{email:`limit${i}@example.test`,consent:true,website:''},{'X-Forwarded-For':`192.0.2.${i}`})).status).toBe(202);
  const response=await post('/public/newsletter',{email:'blocked@example.test',consent:true,website:''});expect(response.status).toBe(429);expect(response.headers.get('retry-after')).toBe('3600');
 });
});
