import 'dotenv/config';
import { pg } from '../packages/db/src/index.js';

// One-time, operator-run first administrator setup. Credentials come from stdin only.
// Never promotes an existing unverified signup or resets an existing administrator.
if(process.env.DEMO_MODE!=='false'||process.env.BETTER_AUTH_URL!=='https://egrth.vercel.app'){
 throw new Error('Explicit production environment required.');
}
let input='';
for await(const chunk of process.stdin)input+=chunk;
const {name,email,password}=JSON.parse(input);
input='';
if(typeof name!=='string'||name.length<3||typeof email!=='string'||!email.includes('@')||typeof password!=='string'||password.length<12)throw new Error('Invalid administrator input.');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
const origin=process.env.BETTER_AUTH_URL;
try{
 await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock(hashtext('ecogrowth-first-admin'))");
 const admins=await client.query("SELECT id FROM memberships WHERE role='PLATFORM_ADMIN'");
 if(admins.rowCount)throw new Error('Administrator already exists. Use reviewed administration, not bootstrap.');
 const existing=await client.query('SELECT id FROM "user" WHERE email=$1',[email]);
 if(existing.rowCount)throw new Error('Email already exists. Review its ownership; bootstrap will not promote it.');
 const response=await fetch(origin+'/api/v1/auth/sign-up/email',{
  method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({name,email,password})
 });
 if(!response.ok)throw new Error('Hosted signup failed: HTTP '+response.status);
 const result=await response.json() as {user?:{id:string}};
 if(!result.user?.id)throw new Error('Hosted signup returned no user ID.');
 const user=await client.query('SELECT id FROM "user" WHERE id=$1 AND email=$2',[result.user.id,email]);
 if(user.rowCount!==1)throw new Error('Hosted user does not match the selected database.');
 const platform=await client.query("INSERT INTO organizations(name,kind,demo) VALUES('EcoGrowth','PLATFORM',false) RETURNING id");
 const orgId=platform.rows[0].id;
 const membership=await client.query("INSERT INTO memberships(user_id,organization_id,role) VALUES($1,$2,'PLATFORM_ADMIN') RETURNING id",[result.user.id,orgId]);
 await client.query("INSERT INTO audit_events(actor_id,organization_id,role,action,target_id,reason,changes) VALUES($1,$2,'PLATFORM_ADMIN','production-admin-bootstrapped',$3,'First administrator explicitly nominated by project owner',$4::jsonb)",[
  result.user.id,orgId,membership.rows[0].id,JSON.stringify({role:'PLATFORM_ADMIN',emailVerification:'not established by bootstrap'})
 ]);
 await client.query('COMMIT');
 console.log('Production administrator created with audited membership. Email ownership and MFA are not marked verified.');
 const login=await fetch(origin+'/api/v1/auth/sign-in/email',{
  method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({email,password})
 });
 if(!login.ok)throw new Error('Administrator exists but hosted login failed: HTTP '+login.status);
 const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 try{
  const session=await fetch(origin+'/api/v1/session',{headers:{Cookie:cookie}});
  const body=await session.json() as {memberships?:Array<{id:string;role:string}>};
  if(!session.ok||!body.memberships?.some(m=>m.id===membership.rows[0].id&&m.role==='PLATFORM_ADMIN'))throw new Error('Hosted administrator session scope verification failed.');
  const dashboard=await fetch(origin+'/api/v1/dashboard',{headers:{Cookie:cookie,'X-Membership-Id':membership.rows[0].id}});
  if(!dashboard.ok)throw new Error('Hosted administrator dashboard check failed: HTTP '+dashboard.status);
  console.log('Hosted password login, administrator session and authorized dashboard: PASS.');
 }finally{
  const logout=await fetch(origin+'/api/v1/auth/sign-out',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:'{}'});
  console.log('Verification session sign-out: HTTP '+logout.status);
 }
}catch(error){await client.query('ROLLBACK');throw error;}
finally{client.release();await pool.end();}
