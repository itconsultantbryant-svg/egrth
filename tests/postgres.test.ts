import 'dotenv/config';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db,sql,pool } from '@ecogrowth/db';
import { actorFor, object, type Actor } from '../apps/api/src/access';
import { command } from '../apps/api/src/commands';
import { app } from '../apps/api/src/app';
import { auth } from '../apps/api/src/auth';
let admin:Actor,collector:Actor,receiver:Actor,customer:Actor,otherCustomer:Actor;
const run=(a:Actor,name:string,data:unknown,key=randomUUID())=>command(a,name,data,key) as Promise<any>;
const sessionCookies=new Map<string,string>();
async function sessionCookie(identity:string){
 if(sessionCookies.has(identity))return sessionCookies.get(identity)!;
 // Mint one real signed session through the maintained auth API. HTTP login/rate-limiting
 // is exercised by browser flows; business-route tests must not repeatedly exhaust it.
 const response=await auth.api.signInEmail({body:{email:identity+'@demo.ecogrowth.test',password:process.env.DEMO_SEED_PASSWORD!},asResponse:true});
 expect(response.status).toBe(200);const cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');sessionCookies.set(identity,cookie);return cookie;
}
describe('real PostgreSQL pilot integration',()=>{
 beforeAll(async()=>{
  if(process.env.DEMO_MODE!=='true'||process.env.NODE_ENV==='production'||!process.env.DATABASE_URL?.includes('127.0.0.1:55432'))throw new Error('Integration suite only runs against explicitly isolated local demo PostgreSQL on port 55432.');
  const membership=async(email:string)=>{const r=(await db.execute(sql`SELECT m.id,m.user_id FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE u.email=${email} ORDER BY m.role LIMIT 1`)).rows[0];return actorFor(r.user_id as string,r.id as string);};
  admin=await membership('operations@demo.ecogrowth.test');collector=await membership('collector@demo.ecogrowth.test');receiver=await membership('receiver@demo.ecogrowth.test');customer=await membership('customer1@demo.ecogrowth.test');otherCustomer=await membership('customer2@demo.ecogrowth.test');
 });
 afterAll(async()=>{await pool.end();});
 it('migration and fixtures persist in PostgreSQL',async()=>{const r=(await db.execute(sql`SELECT count(*)::integer count FROM sites`)).rows[0];expect(Number(r.count)).toBeGreaterThanOrEqual(5);});
 it('cross-tenant object lookup is denied',async()=>{const s=(await db.execute(sql`SELECT id FROM sites WHERE organization_id=${otherCustomer.organizationId} LIMIT 1`)).rows[0];await expect(db.transaction(tx=>object(tx,customer,'sites',s.id as string,'read'))).rejects.toMatchObject({status:404});});
 it('a user cannot switch to someone else’s membership',async()=>{await expect(actorFor(customer.userId,admin.membershipId)).rejects.toMatchObject({status:403});});
 it('public registration has no implicit organization access',async()=>{await expect(actorFor(customer.userId,null)).rejects.toMatchObject({code:'MEMBERSHIP_REQUIRED'});});
 it('unauthenticated API and export requests fail closed',async()=>{for(const path of ['/sites','/sites?format=csv','/attachments/11111111-1111-4111-8111-111111111111/download-url']){const r=await app.request('/api/v1'+path);expect(r.status).toBe(401);}});
 it('scheduler retries cannot duplicate occurrences',async()=>{const date=new Date().toISOString().slice(0,10);const first=await run(admin,'generate-jobs',{from:date,to:date});const second=await run(admin,'generate-jobs',{from:date,to:date});expect(first.generated).toBe(0);expect(second.generated).toBe(0);});
 it('idempotency is stable and detects a different payload',async()=>{const date=new Date().toISOString().slice(0,10),key=randomUUID();const first=await run(admin,'generate-jobs',{from:date,to:date},key);expect(await run(admin,'generate-jobs',{from:date,to:date},key)).toEqual(first);const later=new Date(Date.now()+86400000).toISOString().slice(0,10);await expect(run(admin,'generate-jobs',{from:date,to:later},key)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});});
 it('collector cannot fabricate a completed-to-arrived transition',async()=>{const j=(await db.execute(sql`SELECT * FROM job_occurrences WHERE collector_id=${collector.userId} AND state='COLLECTED' LIMIT 1`)).rows[0];await expect(run(collector,'transition-job',{id:j.id,state:'ARRIVED',version:j.version,reason:'Trying to rewrite completed evidence'})).rejects.toMatchObject({code:'INVALID_STATE'});});
 it('partial rejection and discrepancy preserve original stage mass',async()=>{const r=(await db.execute(sql`SELECT rr.*, (SELECT sum(grams) FROM delivery_allocations da WHERE da.manifest_id=rr.manifest_id) collected FROM receiving_records rr ORDER BY created_at LIMIT 1`)).rows[0];expect(Number(r.received_grams)).toBe(Number(r.accepted_grams)+Number(r.rejected_grams));expect(Number(r.collected)-Number(r.received_grams)).toBe(2000);const sum=(await db.execute(sql`SELECT sum(accepted_grams)::bigint accepted,sum(rejected_grams)::bigint rejected FROM receiving_allocations WHERE receiving_id=${r.id}`)).rows[0];expect(Number(sum.accepted)).toBe(Number(r.accepted_grams));expect(Number(sum.rejected)).toBe(Number(r.rejected_grams));});
 it('concurrent split allocations cannot overspend a source',async()=>{const c=(await db.execute(sql`SELECT c.*,j.facility_id FROM collections c JOIN job_occurrences j ON j.id=c.job_id ORDER BY c.created_at LIMIT 1`)).rows[0];const results=await Promise.allSettled([run(collector,'dispatch',{facilityId:c.facility_id,allocations:[{collectionId:c.id,grams:1}]}),run(collector,'dispatch',{facilityId:c.facility_id,allocations:[{collectionId:c.id,grams:1}]})]);expect(results.every(r=>r.status==='rejected'&&(r.reason.code==='OVER_ALLOCATION'))).toBe(true);});
 it('independent receiving cannot be replaced by a collector',async()=>{const m=(await db.execute(sql`SELECT * FROM manifests LIMIT 1`)).rows[0];await expect(run(collector,'receive',{manifestId:m.id,version:m.version,receivedGrams:1,acceptedGrams:1,rejectedGrams:0,method:'Forged method',proofReference:'Forged proof'})).rejects.toMatchObject({status:403});});
 it('receiver cannot review their own evidence',async()=>{const rc=(await db.execute(sql`SELECT * FROM reconciliation_cases LIMIT 1`)).rows[0];await expect(run(receiver,'reconcile',{id:rc.id,reason:'Attempted self review'})).rejects.toMatchObject({status:403});});
 it('payment screenshot/reference does not settle an invoice',async()=>{const p=(await db.execute(sql`SELECT * FROM payments WHERE status='PENDING_REVIEW' LIMIT 1`)).rows[0];const i=(await db.execute(sql`SELECT * FROM invoices WHERE id=${p.invoice_id}`)).rows[0];expect(Number(i.paid_minor)).toBe(0);});
 it('currencies cannot silently mix',async()=>{const i=(await db.execute(sql`SELECT * FROM invoices WHERE organization_id=${customer.organizationId} LIMIT 1`)).rows[0];await expect(run(customer,'submit-payment',{invoiceId:i.id,amountMinor:100,currency:'LRD',reference:'WRONG-CURRENCY-'+randomUUID()})).rejects.toMatchObject({code:'CURRENCY_MISMATCH'});});
 it('audit history cannot be deleted or silently rewritten',async()=>{await expect(db.execute(sql`UPDATE audit_events SET reason='erased' WHERE id=(SELECT id FROM audit_events LIMIT 1)`)).rejects.toThrow();});
 it('original evidence cannot be deleted',async()=>{await expect(db.execute(sql`DELETE FROM collections WHERE id=(SELECT id FROM collections LIMIT 1)`)).rejects.toThrow();});
 it('cookie commands require Origin even with an unrelated Authorization header',async()=>{
  const cookie=await sessionCookie('customer1');
  const response=await app.request('/api/v1/commands/open-complaint',{method:'POST',headers:{Cookie:cookie,Authorization:'Basic invalid','Content-Type':'application/json','X-Membership-Id':customer.membershipId,'Idempotency-Key':randomUUID()},body:'{}'});
  expect(response.status).toBe(403);expect((await response.json()).error.code).toBe('CSRF_ORIGIN');
 });
 it('native refresh rotates and reuse revokes the credential family',async()=>{
  const cookie=await sessionCookie('collector');
  const exchanged=await app.request('/api/v1/auth/native/exchange',{method:'POST',headers:{Cookie:cookie}});expect(exchanged.status).toBe(200);const first=await exchanged.json();expect(first.expiresIn).toBe(600);
  const rotate=()=>app.request('/api/v1/auth/native/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:first.refreshToken})});
  const rotated=await rotate();expect(rotated.status).toBe(200);const second=await rotated.json();expect(second.refreshToken).not.toBe(first.refreshToken);
  const session=await app.request('/api/v1/session',{headers:{Authorization:'Bearer '+second.accessToken}});expect(session.status).toBe(200);
  const reused=await rotate();expect(reused.status).toBe(401);
  const revoked=await app.request('/api/v1/session',{headers:{Authorization:'Bearer '+second.accessToken}});expect(revoked.status).toBe(401);
 });
  it('authenticated CSV uses the identical tenant scope as records',async()=>{
  const cookie=await sessionCookie('customer1');
  const response=await app.request('/api/v1/sites?format=csv',{headers:{Cookie:cookie,'X-Membership-Id':customer.membershipId}});expect(response.status).toBe(200);const text=await response.text();expect(text).toContain('Palm Kitchen');expect(text).not.toContain('Atlantic Table');expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
 it('schedule calendar history requires authorized parent access',async()=>{
  const cookie=await sessionCookie('customer1');
  const rows=(await db.execute(sql`SELECT sr.id,s.organization_id FROM schedule_rules sr JOIN sites s ON s.id=sr.site_id WHERE s.organization_id IN (${customer.organizationId},${otherCustomer.organizationId})`)).rows;
  const own=rows.find(r=>r.organization_id===customer.organizationId)!,other=rows.find(r=>r.organization_id===otherCustomer.organizationId)!;
  const headers={Cookie:cookie,'X-Membership-Id':customer.membershipId};
  const allowed=await app.request(`/api/v1/schedules/${own.id}/calendar`,{headers});expect(allowed.status).toBe(200);
  const data=await allowed.json();expect(data.calendar.versions).toHaveLength(1);expect(data.calendar.versions[0].timezone).toBe('Africa/Monrovia');
  expect((await app.request(`/api/v1/schedules/${other.id}/calendar`,{headers})).status).toBe(404);
 });
 it('scheduled generation rejects missing scheduler authentication',async()=>{
  expect((await app.request('/api/v1/internal/schedule')).status).toBe(401);
 });
 it('admin identity lists and keyed settings reads match the persisted schema',async()=>{
  const cookie=await sessionCookie('admin');
  const membership=(await db.execute(sql`SELECT m.id FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE u.email='admin@demo.ecogrowth.test' AND m.role='PLATFORM_ADMIN'`)).rows[0];
  const headers={Cookie:cookie,'X-Membership-Id':String(membership.id)};
  const users=await app.request('/api/v1/users?limit=5',{headers});expect(users.status).toBe(200);expect((await users.json()).data.length).toBeGreaterThan(0);
  const settings=await app.request('/api/v1/settings/pilot',{headers});expect(settings.status).toBe(200);
  const row=await settings.json();expect(row.key).toBe('pilot');expect(row.value.emissionsEnabled).toBe(false);
 });
});
