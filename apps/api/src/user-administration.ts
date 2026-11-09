import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID, createHmac } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { db, sql } from '@ecogrowth/db';
import { roles, resources, type Role } from '@ecogrowth/contracts';
import { grants } from '@ecogrowth/domain';
import { ApiError, permit, type Actor } from './access.js';
import { auth, origins, resolveIdentity } from './auth.js';

export const usernameSchema=z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,39}$/,'Use 3–40 lowercase letters, numbers, dots, underscores or hyphens.');
const passwordSchema=z.string().min(12).max(128);
const explanation=z.string().trim().min(5).max(500);
const roleKind:Record<Role,string>={PLATFORM_ADMIN:'PLATFORM',OPERATIONS_MANAGER:'PLATFORM',FINANCE_OFFICER:'PLATFORM',READ_ONLY_REVIEWER:'PLATFORM',CUSTOMER_OWNER:'CUSTOMER',CUSTOMER_STAFF:'CUSTOMER',PARTNER_DISPATCHER:'PARTNER',COLLECTOR:'PARTNER',FACILITY_MANAGER:'FACILITY',RECEIVING_OFFICER:'FACILITY'};
const permissions=z.array(z.string().max(80)).max(60).default([]);
const membershipSchema=z.object({organizationId:z.string().uuid(),role:z.enum(roles),deniedPermissions:permissions});
const createSchema=z.object({name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),username:usernameSchema,password:passwordSchema,role:z.enum(roles),deniedPermissions:permissions,organizationId:z.string().uuid().optional(),organizationName:z.string().trim().min(3).max(160).optional(),reason:explanation}).strict();

function normalizedRestrictions(role:Role,denied:string[]){
 const valid=new Set([...grants[role].read.map(r=>r+':read'),...grants[role].write.map(r=>r+':write')]);
 if(denied.some(p=>!valid.has(p)))throw new ApiError(422,'INVALID_PERMISSIONS','Permissions can only restrict functions within the selected role.');
 if(role==='PLATFORM_ADMIN'&&denied.some(p=>p==='users:read'||p==='users:write'))throw new ApiError(422,'ADMIN_ACCESS_REQUIRED','Platform administrators must retain user-administration access.');
 return [...new Set(denied)].sort();
}
async function audit(tx:any,a:Actor,action:string,target:string,reason:string,changes:unknown){
 await tx.execute(sql`INSERT INTO audit_events(actor_id,organization_id,role,action,target_id,reason,changes) VALUES(${a.userId},${a.organizationId},${a.role},${action},${target},${reason},${JSON.stringify(changes)}::jsonb)`);
}
async function revoke(tx:any,userId:string){
 await tx.execute(sql`UPDATE native_credentials SET revoked=true WHERE user_id=${userId}`);
 await tx.execute(sql`UPDATE session SET "expiresAt"=now() WHERE "userId"=${userId}`);
}
function administrator(a:Actor){
 permit(a,'users','write');
 if(!a.global||a.role!=='PLATFORM_ADMIN')throw new ApiError(403,'FORBIDDEN','Platform administrator required.');
}
async function lockedAdmin(tx:any,a:Actor){
 // Serializes user/membership changes and rechecks the initiating administrator after waiting.
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ecogrowth-access-control'))`);
 const row=(await tx.execute(sql`SELECT m.role,m.denied_permissions FROM memberships m JOIN organizations o ON o.id=m.organization_id JOIN "user" u ON u.id=m.user_id WHERE m.id=${a.membershipId} AND m.user_id=${a.userId} AND m.organization_id=${a.organizationId} AND m.active AND o.active AND o.kind='PLATFORM' AND NOT u.disabled AND NOT u.must_change_password`)).rows[0];
 if(!row)throw new ApiError(403,'FORBIDDEN','Administrator access changed. Sign in and refresh.');
 administrator({...a,role:row.role,deniedPermissions:row.denied_permissions});
}
async function organization(tx:any,id:string,role:Role){
 const org=(await tx.execute(sql`SELECT * FROM organizations WHERE id=${id} AND active`)).rows[0];
 if(!org)throw new ApiError(422,'ORGANIZATION_REQUIRED','Choose an active organization.');
 if(org.kind!==roleKind[role])throw new ApiError(422,'ROLE_ORGANIZATION_MISMATCH','The selected role is not valid for this organization type.');
 return org;
}
async function preventLastAdmin(tx:any){
 const row=(await tx.execute(sql`SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id JOIN "user" u ON u.id=m.user_id WHERE m.active AND o.active AND o.kind='PLATFORM' AND m.role='PLATFORM_ADMIN' AND NOT u.disabled AND NOT ('users:read'=ANY(m.denied_permissions)) AND NOT ('users:write'=ANY(m.denied_permissions)) LIMIT 1`)).rows[0];
 if(!row)throw new ApiError(409,'LAST_ADMIN','Keep at least one active platform administrator.');
}
const publicUser=(u:any)=>({id:u.id,name:u.name,email:u.email,username:u.login_username,disabled:u.disabled,passwordChangeRequired:u.must_change_password,version:u.access_version,createdAt:u.createdAt});

export const userAdminRoutes=new Hono<{Variables:{actor:Actor}}>();
userAdminRoutes.use('*',async(c,next)=>{administrator(c.get('actor'));await next();});
userAdminRoutes.get('/options',async c=>{
 const organizations=(await db.execute(sql`SELECT id,name,kind,active FROM organizations ORDER BY name LIMIT 500`)).rows;
 return c.json({organizations,roles:roles.map(role=>({role,organizationKind:roleKind[role],permissions:grants[role]})),resources,limit:500});
});
userAdminRoutes.get('/users',async c=>{
 const {search,offset}=z.object({search:z.string().max(100).default(''),offset:z.coerce.number().int().min(0).max(100000).default(0)}).parse(c.req.query());
 const rows=(await db.execute(sql`SELECT id,name,email,login_username,disabled,must_change_password,access_version,"createdAt" FROM "user" WHERE (${search===''} OR name ILIKE ${'%'+search+'%'} OR email ILIKE ${'%'+search+'%'} OR login_username ILIKE ${'%'+search+'%'}) ORDER BY "createdAt" DESC,id LIMIT 25 OFFSET ${offset}`)).rows;
 const ids=rows.map(u=>u.id as string);
 const memberships=ids.length?(await db.execute(sql`SELECT m.*,o.name AS organization_name,o.kind AS organization_kind FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=ANY(${sql.param(ids)}::text[]) ORDER BY o.name,m.role`)).rows:[];
 return c.json({data:rows.map(u=>({...publicUser(u),memberships:memberships.filter(m=>m.user_id===u.id)})),pagination:{offset,nextOffset:rows.length===25?offset+25:null},generatedAt:new Date().toISOString()});
});
userAdminRoutes.post('/users',async c=>{
 const a=c.get('actor'),data=createSchema.parse(await c.req.json());
 const denied=normalizedRestrictions(data.role,data.deniedPermissions);
 const key=c.req.header('idempotency-key');
 if(!key||key.length<8||key.length>150)throw new ApiError(400,'IDEMPOTENCY_REQUIRED','Supply a stable idempotency key.');
 // Keyed digest prevents a stored request fingerprint becoming a cheap password-guess oracle.
 const fingerprint=createHmac('sha256',process.env.BETTER_AUTH_SECRET!).update(JSON.stringify(data)).digest('hex');
 const passwordHash=await hashPassword(data.password);
 const result=await db.transaction(async tx=>{
  await lockedAdmin(tx,a);
  const prior=(await tx.execute(sql`SELECT payload_hash,response FROM idempotency_records WHERE user_id=${a.userId} AND organization_id=${a.organizationId} AND key=${key}`)).rows[0];
  if(prior){if(prior.payload_hash!==fingerprint)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','This creation key has different content. Refresh before creating another account.');return prior.response;}
  let orgId=data.organizationId;
  if(orgId)await organization(tx,orgId,data.role);
  else{
   if(!data.organizationName)throw new ApiError(422,'ORGANIZATION_REQUIRED','Select an organization or supply its new name.');
   const org=(await tx.execute(sql`INSERT INTO organizations(name,kind,demo) VALUES(${data.organizationName},${roleKind[data.role]},${process.env.DEMO_MODE==='true'}) RETURNING id`)).rows[0];orgId=org.id as string;
   await audit(tx,a,'organization-created',orgId,data.reason,{name:data.organizationName,kind:roleKind[data.role]});
  }
  const id=randomUUID();
  await tx.execute(sql`INSERT INTO "user"(id,name,email,login_username,must_change_password) VALUES(${id},${data.name},${data.email},${data.username},true)`);
  await tx.execute(sql`INSERT INTO account(id,"accountId","providerId","userId",password) VALUES(${randomUUID()},${id},'credential',${id},${passwordHash})`);
  const member=(await tx.execute(sql`INSERT INTO memberships(user_id,organization_id,role,denied_permissions) VALUES(${id},${orgId!},${data.role},${sql.param(denied)}::text[]) RETURNING id`)).rows[0];
  const response={id,username:data.username,email:data.email,membershipId:member.id,passwordChangeRequired:true};
  await audit(tx,a,'user-created',id,data.reason,{username:data.username,organizationId:orgId,role:data.role,deniedPermissions:denied,passwordChangeRequired:true});
  await tx.execute(sql`INSERT INTO idempotency_records(user_id,organization_id,key,payload_hash,response) VALUES(${a.userId},${a.organizationId},${key},${fingerprint},${JSON.stringify(response)}::jsonb)`);
  return response;
 });
 return c.json(result,201);
});
userAdminRoutes.post('/users/:id/memberships',async c=>{
 const a=c.get('actor'),data=membershipSchema.extend({reason:explanation}).strict().parse(await c.req.json()),userId=c.req.param('id');
 const denied=normalizedRestrictions(data.role,data.deniedPermissions);
 return c.json(await db.transaction(async tx=>{
  await lockedAdmin(tx,a);
  if(a.userId===userId)throw new ApiError(409,'SELF_ACCESS_CHANGE','Ask another administrator to change your own access.');
  if(!(await tx.execute(sql`SELECT id FROM "user" WHERE id=${userId} AND NOT disabled`)).rows[0])throw new ApiError(404,'NOT_FOUND','Active user not found.');
  await organization(tx,data.organizationId,data.role);
  const row=(await tx.execute(sql`INSERT INTO memberships(user_id,organization_id,role,denied_permissions) VALUES(${userId},${data.organizationId},${data.role},${sql.param(denied)}::text[]) RETURNING *`)).rows[0];
  await audit(tx,a,'membership-created',row.id as string,data.reason,{userId,organizationId:data.organizationId,role:data.role,deniedPermissions:denied});
  return row;
 }),201);
});
userAdminRoutes.post('/memberships/:id',async c=>{
 const a=c.get('actor'),data=z.object({version:z.number().int().positive(),role:z.enum(roles),active:z.boolean(),deniedPermissions:permissions,reason:explanation}).strict().parse(await c.req.json());
 const denied=normalizedRestrictions(data.role,data.deniedPermissions);
 return c.json(await db.transaction(async tx=>{
  await lockedAdmin(tx,a);
  const row=(await tx.execute(sql`SELECT * FROM memberships WHERE id::text=${c.req.param('id')} FOR UPDATE`)).rows[0];
  if(!row)throw new ApiError(404,'NOT_FOUND','Membership not found.');
  if(row.user_id===a.userId)throw new ApiError(409,'SELF_ACCESS_CHANGE','Ask another administrator to change your own access.');
  if(row.version!==data.version)throw new ApiError(409,'VERSION_CONFLICT','Membership changed. Refresh before editing.');
  await organization(tx,row.organization_id as string,data.role);
  const result=(await tx.execute(sql`UPDATE memberships SET role=${data.role},active=${data.active},denied_permissions=${sql.param(denied)}::text[],version=version+1,updated_at=now() WHERE id=${row.id} RETURNING *`)).rows[0];
  await preventLastAdmin(tx);
  await audit(tx,a,'membership-updated',row.id as string,data.reason,{userId:row.user_id,previous:{role:row.role,active:row.active,deniedPermissions:row.denied_permissions},current:{role:data.role,active:data.active,deniedPermissions:denied}});
  return result;
 }));
});
userAdminRoutes.post('/users/:id/state',async c=>{
 const a=c.get('actor'),data=z.object({version:z.number().int().positive(),disabled:z.boolean(),reason:explanation}).strict().parse(await c.req.json());
 return c.json(await db.transaction(async tx=>{
  await lockedAdmin(tx,a);
  const id=c.req.param('id');if(id===a.userId)throw new ApiError(409,'SELF_ACCESS_CHANGE','You cannot disable or re-enable your own account.');
  const row=(await tx.execute(sql`SELECT id,access_version,disabled FROM "user" WHERE id=${id} FOR UPDATE`)).rows[0];
  if(!row)throw new ApiError(404,'NOT_FOUND','User not found.');
  if(row.access_version!==data.version)throw new ApiError(409,'VERSION_CONFLICT','User changed. Refresh before editing.');
  await tx.execute(sql`UPDATE "user" SET disabled=${data.disabled},access_version=access_version+1,"updatedAt"=now() WHERE id=${id}`);
  if(data.disabled)await revoke(tx,id);
  await preventLastAdmin(tx);
  await audit(tx,a,'user-access-state-changed',id,data.reason,{previousDisabled:row.disabled,disabled:data.disabled});
  return {ok:true};
 }));
});
userAdminRoutes.post('/users/:id/password',async c=>{
 const a=c.get('actor'),data=z.object({version:z.number().int().positive(),password:passwordSchema,reason:explanation}).strict().parse(await c.req.json());
 const passwordHash=await hashPassword(data.password);
 return c.json(await db.transaction(async tx=>{
  await lockedAdmin(tx,a);
  const id=c.req.param('id');if(id===a.userId)throw new ApiError(409,'SELF_PASSWORD_CHANGE','Use your own Change password form instead.');
  const row=(await tx.execute(sql`SELECT id,access_version FROM "user" WHERE id=${id} FOR UPDATE`)).rows[0];
  if(!row)throw new ApiError(404,'NOT_FOUND','User not found.');
  if(row.access_version!==data.version)throw new ApiError(409,'VERSION_CONFLICT','User changed. Refresh before resetting.');
  const account=(await tx.execute(sql`UPDATE account SET password=${passwordHash},"updatedAt"=now() WHERE "userId"=${id} AND "providerId"='credential' RETURNING id`)).rows[0];
  if(!account)throw new ApiError(409,'NO_PASSWORD_ACCOUNT','This user has no password credential. Review their login method.');
  await tx.execute(sql`UPDATE "user" SET must_change_password=true,access_version=access_version+1,"updatedAt"=now() WHERE id=${id}`);
  await revoke(tx,id);
  await audit(tx,a,'user-password-reset',id,data.reason,{passwordChangeRequired:true,sessionsRevoked:true});
  return {ok:true,passwordChangeRequired:true};
 }));
});

export async function identifierSignIn(request:Request){
 const {identifier,password}=z.object({identifier:z.string().trim().min(1).max(254),password:z.string().min(1).max(128)}).parse(await request.clone().json());
 // Forward through Better Auth's maintained credential, MFA and login rate-limit path.
 // Invalid usernames use a nonexistent address and receive the same credential error.
 const row=(await db.execute(sql`SELECT email FROM "user" WHERE NOT disabled AND (${identifier.includes('@')} AND email=${identifier.toLowerCase()} OR ${!identifier.includes('@')} AND login_username=${identifier.toLowerCase()})`)).rows[0];
 const email=String(row?.email||'unknown-user@invalid.ecogrowth.test');
 const url=new URL(request.url);url.pathname='/api/v1/auth/sign-in/email';
 return auth.handler(new Request(url,{method:'POST',headers:request.headers,body:JSON.stringify({email,password})}));
}

export async function changeOwnPassword(request:Request){
 const user=await resolveIdentity(request.headers);
 if(!user)throw new ApiError(401,'UNAUTHENTICATED','Sign in before changing your password.');
 if(!request.headers.get('authorization')?.startsWith('Bearer ')&&!origins.includes(request.headers.get('origin')||''))throw new ApiError(403,'CSRF_ORIGIN','Allowed Origin required.');
 const rate=(await db.execute(sql`INSERT INTO api_rate_limits(key,window_start,count) VALUES(${user.id+':password-change'},date_trunc('minute',now()),1) ON CONFLICT(key,window_start) DO UPDATE SET count=api_rate_limits.count+1 RETURNING count`)).rows[0];
 if(Number(rate.count)>5)throw new ApiError(429,'RATE_LIMITED','Wait one minute before retrying.');
 const data=z.object({currentPassword:passwordSchema,newPassword:passwordSchema}).strict().parse(await request.json());
 if(data.currentPassword===data.newPassword)throw new ApiError(422,'NEW_PASSWORD_REQUIRED','Choose a different new password.');
 const account=(await db.execute(sql`SELECT id,password FROM account WHERE "userId"=${user.id} AND "providerId"='credential'`)).rows[0];
 if(!account?.password||!await verifyPassword({hash:account.password as string,password:data.currentPassword}))throw new ApiError(403,'INVALID_PASSWORD','Current password is incorrect.');
 const next=await hashPassword(data.newPassword);
 await db.transaction(async tx=>{
  const row=(await tx.execute(sql`SELECT disabled FROM "user" WHERE id=${user.id} FOR UPDATE`)).rows[0];
  if(!row||row.disabled)throw new ApiError(401,'UNAUTHENTICATED','Account unavailable.');
  const result=await tx.execute(sql`UPDATE account SET password=${next},"updatedAt"=now() WHERE id=${account.id} AND password=${account.password} RETURNING id`);
  if(!result.rows.length)throw new ApiError(409,'PASSWORD_CHANGED','Credentials changed. Sign in again.');
  await tx.execute(sql`UPDATE "user" SET must_change_password=false,access_version=access_version+1,"updatedAt"=now() WHERE id=${user.id}`);
  await revoke(tx,user.id);
  const org=(await tx.execute(sql`SELECT organization_id,role FROM memberships WHERE user_id=${user.id} AND active ORDER BY created_at LIMIT 1`)).rows[0];
  if(org)await audit(tx,{userId:user.id,organizationId:org.organization_id as string,membershipId:'',role:org.role as Role,global:false},'own-password-changed',user.id,'User changed their own password; all sessions revoked',{sessionsRevoked:true});
 });
 return {ok:true,signInRequired:true};
}
