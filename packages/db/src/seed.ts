import 'dotenv/config';
import { db, sql, pool } from './index.js';
import { auth } from '../../../apps/api/src/auth.js';
import { command } from '../../../apps/api/src/commands.js';
import { actorFor } from '../../../apps/api/src/access.js';
import { randomUUID } from 'node:crypto';
if(process.env.DEMO_MODE!=='true'||process.env.NODE_ENV==='production')throw new Error('Demo seed prohibited outside an explicitly isolated, non-production demo.');
if(!process.env.DEMO_SEED_PASSWORD||process.env.DEMO_SEED_PASSWORD.length<12)throw new Error('Set DEMO_SEED_PASSWORD (12+ chars).');
const existing=await db.execute(sql`SELECT value FROM settings WHERE key='demo_seed_complete'`);
if(existing.rows.length){console.log('Demo already initialized; no records overwritten.');await pool.end();process.exit(0);}
const partial=(await db.execute(sql`SELECT count(*)::integer n FROM sites s JOIN organizations o ON o.id=s.organization_id WHERE o.demo`)).rows[0];
if(Number(partial.n)>0)throw new Error('Incomplete demo with site evidence exists. Inspect audit/state and recover explicitly; seed will not overwrite legitimate records.');
async function user(email:string,name:string){const existing=(await db.execute(sql`SELECT id FROM "user" WHERE email=${email}`)).rows[0];if(existing)return existing.id as string;const value=await auth.api.signUpEmail({body:{email,name,password:process.env.DEMO_SEED_PASSWORD!}});return value.user.id;}
async function org(name:string,kind:string){const existing=(await db.execute(sql`SELECT id FROM organizations WHERE name=${name} AND kind=${kind} AND demo=true`)).rows[0];if(existing)return existing.id as string;return (await db.execute(sql`INSERT INTO organizations(name,kind,demo) VALUES(${name},${kind},true) RETURNING id`)).rows[0].id as string;}
async function membership(userId:string,orgId:string,role:string){const existing=(await db.execute(sql`SELECT id FROM memberships WHERE user_id=${userId} AND organization_id=${orgId} AND role=${role}`)).rows[0];if(existing)return existing.id as string;return (await db.execute(sql`INSERT INTO memberships(user_id,organization_id,role) VALUES(${userId},${orgId},${role}) RETURNING id`)).rows[0].id as string;}
const platform=await org('EcoGrowth · Demo operations','PLATFORM');
const partner=await org('Sinkor Circular Collection · Fictional','PARTNER');
const facilityOrg=await org('Green Loop Composting · Fictional','FACILITY');
const admin=await user('admin@demo.ecogrowth.test','Demo administrator');
const adminMembership=await membership(admin,platform,'PLATFORM_ADMIN');
for(const [email,name,role]of [['operations','Operations manager','OPERATIONS_MANAGER'],['finance','Finance officer','FINANCE_OFFICER'],['reviewer','Read-only reviewer','READ_ONLY_REVIEWER']]){const id=await user(`${email}@demo.ecogrowth.test`,name);await membership(id,platform,role);}
const collector=await user('collector@demo.ecogrowth.test','Demo collector');const collectorMembership=await membership(collector,partner,'COLLECTOR');
const dispatcher=await user('dispatcher@demo.ecogrowth.test','Demo dispatcher');await membership(dispatcher,partner,'PARTNER_DISPATCHER');
const receiver=await user('receiver@demo.ecogrowth.test','Demo receiving officer');const receiverMembership=await membership(receiver,facilityOrg,'RECEIVING_OFFICER');
const manager=await user('facility@demo.ecogrowth.test','Demo facility manager');await membership(manager,facilityOrg,'FACILITY_MANAGER');
const existingArea=(await db.execute(sql`SELECT id FROM service_areas WHERE name='Sinkor pilot cluster · Demo' LIMIT 1`)).rows[0];
const area=(existingArea||(await db.execute(sql`INSERT INTO service_areas(name,approved) VALUES('Sinkor pilot cluster · Demo',true) RETURNING id`)).rows[0]).id as string;
const existingFacility=(await db.execute(sql`SELECT id FROM facilities WHERE organization_id=${facilityOrg} AND name='Green Loop receiving · Fictional' LIMIT 1`)).rows[0];
const facility=(existingFacility||(await db.execute(sql`INSERT INTO facilities(organization_id,name,service_area_id,active,accepted_materials,capacity_grams) VALUES(${facilityOrg},'Green Loop receiving · Fictional',${area},true,ARRAY['FOOD_SCRAPS','FRUIT_VEGETABLES','COFFEE_TEA'],500000) RETURNING id`)).rows[0]).id as string;
const existingRoute=(await db.execute(sql`SELECT id FROM routes WHERE partner_organization_id=${partner} AND name='Sinkor / Route 01' LIMIT 1`)).rows[0];
const route=(existingRoute||(await db.execute(sql`INSERT INTO routes(name,partner_organization_id,facility_id,service_area_id,capacity_grams) VALUES('Sinkor / Route 01',${partner},${facility},${area},300000) RETURNING id`)).rows[0]).id as string;
const a=await actorFor(admin,adminMembership),c=await actorFor(collector,collectorMembership),r=await actorFor(receiver,receiverMembership);
const run=(actor:typeof a,name:string,data:unknown)=>command(actor,name,data,randomUUID()) as Promise<any>;
const date=new Date().toISOString().slice(0,10);const today=new Date().getUTCDay();const names=['Palm Kitchen','Atlantic Table','Mango & Millet Café','Sinkor Garden Hotel','Pepper Pot Eatery'];
const customerActors=[];const subscriptions=[];const sites=[];
for(let i=0;i<5;i++){
 const organization=await org(`${names[i]} · Fictional`,'CUSTOMER');const owner=await user(`customer${i+1}@demo.ecogrowth.test`,`${names[i]} owner`);const member=await membership(owner,organization,'CUSTOMER_OWNER');
 const customer=await actorFor(owner,member);customerActors.push(customer);
 // Admin has explicit memberships for organization switching, not inferred access.
 await membership(admin,organization,'CUSTOMER_OWNER');
 if(i===0){const staff=await user('staff@demo.ecogrowth.test','Customer staff');await membership(staff,organization,'CUSTOMER_STAFF');}
 const site=await run(customer,'request-site',{name:names[i]+' · Fictional',category:i===2?'CAFE':'RESTAURANT',landmark:`Demo landmark ${i+1}, Sinkor`,contact:'Fictional decision-maker; no external contact',operatingDays:[0,1,2,3,4,5,6],storage:'Covered, labelled organics container',baseline:'Demo self-report: residual collection; prior beneficial uses not verified',expectedGrams:20000+i*5000,insideCoverage:true});sites.push(site);
 await run(a,'assess-site',{id:site.id,notes:'Demo assessment: access and storage checked; not a real site visit.',qualified:true});
 const quote=await run(a,'create-quote',{id:site.id,currency:'USD',amountMinor:4000,frequency:2,allowanceGrams:100000,assumptions:'DEMO assumption only: $40/site/month; no production pricing.',responsibilities:'Separate approved materials; residual collection remains separate.',serviceWindow:'08:00–12:00 Africa/Monrovia',windowStartLocal:'08:00',windowEndLocal:'12:00',termsVersion:'demo-2026-11',validUntil:new Date(Date.now()+30*86400000).toISOString()});
 await run(customer,'accept-quote',{id:quote.id});const sub=await run(a,'activate-site',{id:site.id,trainedName:'Fictional site team',guidanceVersion:'demo-materials-v1',weekdays:[today,(today+3)%7],startsOn:date});subscriptions.push(sub);
}
await run(a,'generate-jobs',{from:date,to:date});
const jobs=(await db.execute(sql`SELECT * FROM job_occurrences ORDER BY created_at`)).rows as any[];
const collections=[];
for(let i=0;i<jobs.length;i++){
 let j=await run(a,'assign-job',{id:jobs[i].id,routeId:route,collectorId:collector,version:jobs[i].version});
 if(i===4){await run(c,'transition-job',{id:j.id,version:j.version,state:'MISSED',reason:'Demo scenario: site unavailable during collection window.'});continue;}
 j=await run(c,'transition-job',{id:j.id,version:j.version,state:'EN_ROUTE',reason:'Demo assigned route started.'});j=await run(c,'transition-job',{id:j.id,version:j.version,state:'ARRIVED',reason:'Demo collector recorded arrival.'});
 collections.push(await run(c,'collect',{jobId:j.id,version:j.version,grossGrams:22000+i*5000,tareGrams:2000,netGrams:20000+i*5000,measurement:i===3?'ESTIMATED':'MEASURED',method:i===3?'Demo visual estimate':'Demo platform scale',material:'FOOD_SCRAPS',contamination:i===1?'Demo plastic contamination observed':'None observed in demo',occurredAt:new Date().toISOString(),partial:false,residualGrams:0,reason:''}));
}
let m=await run(c,'dispatch',{facilityId:facility,allocations:collections.map(x=>({collectionId:x.id,grams:Number(x.net_grams)}))});m=await run(c,'deliver',{id:m.id,version:m.version});
const total=collections.reduce((n,x)=>n+Number(x.net_grams),0);
const receiving=await run(r,'receive',{manifestId:m.id,version:m.version,receivedGrams:total-2000,acceptedGrams:total-7000,rejectedGrams:5000,method:'Demo independent weighbridge measurement',proofReference:'DEMO receiving sheet; no physical event or verified upload'});
for(let i=0;i<5;i++){
 const invoice=await run(a,'issue-invoice',{id:subscriptions[i].id,periodStart:date,periodEnd:new Date(Date.now()+29*86400000).toISOString().slice(0,10),dueDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10)});
 if(i===0){const p=await run(customerActors[i],'submit-payment',{invoiceId:invoice.id,amountMinor:4000,currency:'USD',reference:'DEMO-CONFIRMED-001'});await run(a,'review-payment',{id:p.id,confirm:true,reason:'DEMO funds confirmation fixture only; no actual funds received.'});}
 if(i===1)await run(customerActors[i],'submit-payment',{invoiceId:invoice.id,amountMinor:4000,currency:'USD',reference:'DEMO-PENDING-002'});
}
await run(customerActors[4],'open-complaint',{siteId:sites[4].id,subject:'Demo missed collection',message:'The demo collection was missed. Please arrange an operational review.'});
await db.execute(sql`INSERT INTO batches(facility_id,name,state,allocation_method) VALUES(${facility},'Demo batch — input not yet allocated','CREATED','No treatment claims; pending allocation and review')`);
await db.execute(sql`INSERT INTO notifications(organization_id,title,message) VALUES(${platform},'Demo pilot ready for review','Five fictional sites. One receiving discrepancy, a residual destination exception and a missed job need attention.')`);
await db.execute(sql`INSERT INTO settings(key,value) VALUES('demo_seed_complete','{"version":1}'::jsonb)`);
console.log('Demo seeded through validated commands: 5 sites, 5 jobs, 4 collections, independent receiving, rejection/discrepancy, 5 invoices, confirmed/pending payments, complaint and unallocated batch.');
console.log('Demo identities: admin, operations, finance, reviewer, collector, dispatcher, receiver, facility, staff and customer1–customer5 @demo.ecogrowth.test. Password: local DEMO_SEED_PASSWORD (not printed).');
await pool.end();
