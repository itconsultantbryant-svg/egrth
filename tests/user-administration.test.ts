import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { disposablePostgres } from './helpers/disposable-postgres';
import { testServer } from './helpers/test-server';

const origin='http://localhost:5173',url='http://127.0.0.1:3120/api/v1';
const temporary='Temporary-test-only-2026!',privatePassword='Private-test-only-2026!';
let fixture:Awaited<ReturnType<typeof disposablePostgres>>,server:ReturnType<typeof testServer>;
let admin:Record<string,string>,customer:Record<string,string>,customerOrg:string;
const post=(path:string,data:unknown,headers:Record<string,string>={},key=randomUUID())=>fetch(url+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key,...headers},body:JSON.stringify(data)});
async function login(identifier:string,password=process.env.DEMO_SEED_PASSWORD!){
 for(let i=0;i<4;i++){
  const response=await post('/auth/sign-in/identifier',{identifier,password});
  if(response.status===429){await delay((Math.min(60,Math.max(1,Number(response.headers.get('retry-after'))||10))+1)*1000);continue;}
  expect(response.status).toBe(200);
  const cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  const session=await fetch(url+'/session',{headers:{Cookie:cookie}});expect(session.status).toBe(200);
  const value=await session.json();return {headers:{Cookie:cookie,'X-Membership-Id':value.memberships.find((m:any)=>m.role==='PLATFORM_ADMIN')?.id||value.memberships[0]?.id||''},session:value};
 }
 throw new Error('Login rate limit did not clear within bounded retries.');
}
const createInput=(suffix=crypto.randomUUID().slice(0,8))=>({name:'Isolated user '+suffix,email:`${suffix}@admin-test.example`,username:'test-'+suffix,password:temporary,role:'CUSTOMER_STAFF',organizationId:customerOrg,deniedPermissions:[],reason:'Isolated administrator provisioning test.'});
async function create(data=createInput()){
 const response=await post('/admin/users',data,admin);expect(response.status).toBe(201);return {input:data,value:await response.json()};
}
async function activate(username:string){
 const first=await login(username,temporary);
 const changed=await post('/auth/credentials/change',{currentPassword:temporary,newPassword:privatePassword},first.headers);expect(changed.status).toBe(200);
 expect((await fetch(url+'/session',{headers:first.headers})).status).toBe(401);
 return login(username,privatePassword);
}
describe('administrator identity, role and permission lifecycle in isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  fixture=await disposablePostgres();server=testServer(['--import','tsx','apps/api/src/dev.ts'],{DATABASE_URL:fixture.url,PORT:'3120',ALLOWED_ORIGINS:origin,BETTER_AUTH_URL:'http://localhost:3120'});await server.ready(url+'/health');
  admin=(await login('admin@demo.ecogrowth.test')).headers;customer=(await login('customer1@demo.ecogrowth.test')).headers;
  customerOrg=(await fixture.pool.query('SELECT organization_id FROM memberships WHERE id=$1',[customer['X-Membership-Id']])).rows[0].organization_id;
 },120000);
 afterAll(async()=>{await server?.stop();await fixture?.cleanup();});

 it('denies non-admin creation and cookie mutations from an untrusted Origin',async()=>{
  expect((await post('/admin/users',createInput(),customer)).status).toBe(403);
  expect((await post('/admin/users',createInput(),{...admin,Origin:'https://untrusted.example'})).status).toBe(403);
  expect((await fetch(url+'/admin/users')).status).toBe(401);
 });
 it('creates atomic username/password accounts without storing plaintext credentials in audit or replay data',async()=>{
  const data=createInput(),key=randomUUID();const response=await post('/admin/users',data,admin,key);expect(response.status).toBe(201);const created=await response.json();
  expect(created).not.toHaveProperty('password');expect(created.passwordChangeRequired).toBe(true);
  const retry=await post('/admin/users',data,admin,key);expect((await retry.json()).id).toBe(created.id);
  expect((await post('/admin/users',{...data,name:'Changed request'},admin,key)).status).toBe(409);
  const account=(await fixture.pool.query('SELECT password FROM account WHERE "userId"=$1',[created.id])).rows[0];expect(account.password).not.toBe(temporary);
  const audit=(await fixture.pool.query('SELECT changes FROM audit_events WHERE target_id=$1',[created.id])).rows;
  const replay=(await fixture.pool.query('SELECT response FROM idempotency_records WHERE key=$1',[key])).rows;
  expect(JSON.stringify({audit,replay})).not.toContain(temporary);
  expect((await post('/admin/users',{...createInput(),username:data.username},admin)).status).toBe(409);
 },60000);
 it('requires a private first-login password, revokes the temporary session and permits only own customer functions',async()=>{
  const created=await create();const first=await login(created.input.username.toUpperCase(),temporary);
  expect(first.session.passwordChangeRequired).toBe(true);
  expect((await fetch(url+'/sites',{headers:first.headers})).status).toBe(403);
  expect((await post('/auth/credentials/change',{currentPassword:'Wrong-current-password!',newPassword:privatePassword},first.headers)).status).toBe(403);
  expect((await post('/auth/credentials/change',{currentPassword:temporary,newPassword:privatePassword},first.headers)).status).toBe(200);
  expect((await fetch(url+'/session',{headers:first.headers})).status).toBe(401);
  const active=await login(created.input.email,privatePassword);expect(active.session.passwordChangeRequired).toBe(false);
  const sites=await fetch(url+'/sites',{headers:active.headers});expect(sites.status).toBe(200);const rows=(await sites.json()).data;expect(rows.length).toBeGreaterThan(0);expect(rows.every((r:any)=>r.organization_id===customerOrg)).toBe(true);
  const complaint=await post('/commands/open-complaint',{siteId:rows[0].id,subject:'Isolated authorized staff request',message:'Test of the assigned staff operational function.'},active.headers);expect(complaint.status).toBe(200);
  expect((await fetch(url+'/invoices',{headers:active.headers})).status).toBe(403);
 },90000);
 it('applies individual read/write restrictions to an already signed-in session and to idempotent command replay',async()=>{
  const created=await create(),active=await activate(created.input.username);
  const own=(await fixture.pool.query('SELECT id FROM sites WHERE organization_id=$1 LIMIT 1',[customerOrg])).rows[0];
  const key=randomUUID(),payload={siteId:own.id,subject:'Idempotent permission fixture',message:'A replay must respect subsequently revoked permissions.'};
  expect((await post('/commands/open-complaint',payload,active.headers,key)).status).toBe(200);
  const changed=await post(`/admin/memberships/${created.value.membershipId}`,{version:1,role:'CUSTOMER_STAFF',active:true,deniedPermissions:['sites:read','complaints:write'],reason:'Limit this staff account for the test.'},admin);expect(changed.status).toBe(200);
  expect((await fetch(url+'/sites',{headers:active.headers})).status).toBe(403);
  expect((await post('/commands/open-complaint',payload,active.headers,key)).status).toBe(403);
  const session=await fetch(url+'/session',{headers:active.headers});expect((await session.json()).memberships[0].deniedPermissions).toContain('sites:read');
  const dashboard=await fetch(url+'/dashboard',{headers:active.headers});expect((await dashboard.json()).metrics).not.toHaveProperty('sites');
  expect((await post(`/admin/memberships/${created.value.membershipId}`,{version:1,role:'CUSTOMER_STAFF',active:false,deniedPermissions:[],reason:'Stale concurrent test edit.'},admin)).status).toBe(409);
 },90000);
 it('rejects cross-kind roles, permissions outside the role and self lockout',async()=>{
  expect((await post('/admin/users',{...createInput(),role:'FINANCE_OFFICER'},admin)).status).toBe(422);
  expect((await post('/admin/users',{...createInput(),deniedPermissions:['payments:write']},admin)).status).toBe(422);
  const actor=(await fixture.pool.query('SELECT user_id FROM memberships WHERE id=$1',[admin['X-Membership-Id']])).rows[0];
  expect((await post(`/admin/users/${actor.user_id}/state`,{version:1,disabled:true,reason:'Attempt self lockout fixture.'},admin)).status).toBe(409);
  expect((await post(`/admin/memberships/${admin['X-Membership-Id']}`,{version:1,role:'OPERATIONS_MANAGER',active:false,deniedPermissions:[],reason:'Attempt self demotion fixture.'},admin)).status).toBe(409);
 });
 it('resets passwords and disables accounts with immediate web/native session revocation',async()=>{
  const created=await create(),active=await activate(created.input.username);
  const exchange=await post('/auth/native/exchange',{},active.headers);expect(exchange.status).toBe(200);const tokens=await exchange.json();
  const reset=await post(`/admin/users/${created.value.id}/password`,{version:2,password:'Replacement-test-only-2026!',reason:'Administrator reset test fixture.'},admin);expect(reset.status).toBe(200);
  expect((await fetch(url+'/session',{headers:active.headers})).status).toBe(401);
  expect((await fetch(url+'/session',{headers:{Authorization:'Bearer '+tokens.accessToken}})).status).toBe(401);
  const temporarySession=await login(created.input.username,'Replacement-test-only-2026!');expect(temporarySession.session.passwordChangeRequired).toBe(true);
  expect((await post(`/admin/users/${created.value.id}/state`,{version:3,disabled:true,reason:'Disable test account after reset.'},admin)).status).toBe(200);
  expect((await fetch(url+'/session',{headers:temporarySession.headers})).status).toBe(401);
  expect((await post('/auth/native/refresh',{refreshToken:tokens.refreshToken})).status).toBe(401);
  expect((await fixture.pool.query('SELECT disabled FROM "user" WHERE id=$1',[created.value.id])).rows[0].disabled).toBe(true);
 },90000);
 it('creates the correct new organization and assigns an additional role without implicit global powers',async()=>{
  const input={...createInput(),role:'COLLECTOR',organizationId:undefined,organizationName:'Isolated collection organization'};
  const response=await post('/admin/users',input,admin);expect(response.status).toBe(201);const created=await response.json();
  const org=(await fixture.pool.query('SELECT o.kind,o.name FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.id=$1',[created.membershipId])).rows[0];expect(org.kind).toBe('PARTNER');
  const add=await post(`/admin/users/${created.id}/memberships`,{organizationId:customerOrg,role:'CUSTOMER_STAFF',deniedPermissions:['complaints:write'],reason:'Additional explicit customer membership.'},admin);expect(add.status).toBe(201);
  expect((await fixture.pool.query('SELECT count(*)::integer n FROM memberships WHERE user_id=$1',[created.id])).rows[0].n).toBe(2);
 },60000);
});
