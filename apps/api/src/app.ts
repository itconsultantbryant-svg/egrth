import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { z, ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, sql } from '@ecogrowth/db';
import { resources, type Resource } from '@ecogrowth/contracts';
import { can, csvCell } from '@ecogrowth/domain';
import { auth, origins, resolveIdentity, issueNative, digest } from './auth.js';
import { actorFor, ApiError, object, permit, source, type Actor } from './access.js';
import { command, commandSchemas } from './commands.js';
import { attachmentRoutes } from './files.js';
import { processOutbox } from './outbox.js';
import { generateRollingJobs } from './scheduling.js';
import { submitEnquiry, subscribeNewsletter, unsubscribeNewsletter } from './public-forms.js';
import { userAdminRoutes, identifierSignIn, changeOwnPassword } from './user-administration.js';
export const app=new Hono<{Variables:{actor:Actor;correlationId:string}}>();
app.use('*',secureHeaders());
app.use('*',cors({origin:origin=>origins.includes(origin)?origin:undefined,credentials:true,allowHeaders:['Content-Type','Authorization','X-Membership-Id','Idempotency-Key'],allowMethods:['GET','POST','OPTIONS']}));
app.use('*',bodyLimit({maxSize:100_000,onError:c=>c.json({error:{code:'TOO_LARGE',message:'Request exceeds 100 KB.'}},413)}));
app.use('*',async(c,next)=>{c.set('correlationId',randomUUID());c.header('X-Correlation-Id',c.get('correlationId'));c.header('Cache-Control','no-store');await next();});
app.onError((err,c)=>{
 const correlationId=c.get('correlationId');
 if(err instanceof ZodError)return c.json({error:{code:'VALIDATION_ERROR',message:'Check the highlighted fields.',details:err.flatten(),correlationId}},422);
 if(err instanceof SyntaxError)return c.json({error:{code:'INVALID_JSON',message:'Send a valid JSON request body.',correlationId}},400);
 if(err instanceof ApiError)return c.json({error:{code:err.code,message:err.message,correlationId}},err.status as any);
 const databaseCode=(err as any).code||(err as any).cause?.code;
 if(databaseCode==='23505')return c.json({error:{code:'DUPLICATE_RECORD',message:'This operation already has a record. Refresh before retrying.',correlationId}},409);
 if(['40001','40P01'].includes(databaseCode))return c.json({error:{code:'TRANSACTION_RETRY',message:'Concurrent work interrupted this transaction. Retry the identical request with its original idempotency key.',safeRetry:true,correlationId}},409);
 console.error(JSON.stringify({correlationId,error:'INTERNAL_ERROR',name:err.name}));
 return c.json({error:{code:'INTERNAL_ERROR',message:'The operation could not be completed. Contact support with the correlation ID.',correlationId}},500);
});
app.get('/api/v1/health',async c=>{await db.execute(sql`SELECT 1`);return c.json({status:'ok',database:'postgresql',demo:process.env.DEMO_MODE==='true',realtime:'polling',emissions:'disabled'});});
app.get('/api/v1/openapi.json',c=>c.json({openapi:'3.1.0',info:{title:'EcoGrowth pilot API',version:'0.1.0',description:'Incomplete release candidate. All domain actions require server-verified membership scope; cookie mutations require allowed Origin. Integer grams and minor monetary units.'},servers:[{url:'/api/v1'}],components:{securitySchemes:{session:{type:'apiKey',in:'cookie',name:'better-auth.session_token'},native:{type:'http',scheme:'bearer'},membership:{type:'apiKey',in:'header',name:'X-Membership-Id'}}},paths:Object.fromEntries([
 ...Object.entries(commandSchemas).map(([name,schema])=>['/commands/'+name,{post:{operationId:name,security:[{session:[],membership:[]},{native:[],membership:[]}],parameters:[{name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',minLength:8,maxLength:150}}],requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(schema,{unrepresentable:'any'})}}},responses:{200:{description:'Persisted result, audit and outbox committed atomically'},403:{description:'Role or object scope denied'},409:{description:'State, version, balance or idempotency conflict'},422:{description:'Validation failed'}}}}]),
  ...resources.map(r=>['/'+r,{get:{security:[{session:[],membership:[]},{native:[],membership:[]}],description:'Bounded scoped list. See docs/PERMISSIONS.md.',parameters:[{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100}},{name:'offset',in:'query',schema:{type:'integer',minimum:0}},{name:'from',in:'query',schema:{type:'string',format:'date'}},{name:'to',in:'query',schema:{type:'string',format:'date'}}],responses:{200:{description:'data, pagination and scope'},403:{description:'Denied'}}}}]),
  ['/schedules/{id}/calendar',{get:{description:'Authorized parent schedule with up to 100 definitions, pauses and service-area closures each. Requires schedules:read in parent scope.',security:[{session:[],membership:[]},{native:[],membership:[]}],parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{200:{description:'Schedule and bounded calendar history'},404:{description:'Not found in authorized scope'}}}}]
 ])}));
app.post('/api/v1/auth/native/refresh',async c=>{
 const {refreshToken}=z.object({refreshToken:z.string().min(40).max(150)}).parse(await c.req.json());
 const result=await db.transaction(async tx=>{
  const row=(await tx.execute(sql`SELECT n.*,s."expiresAt" session_expires FROM native_credentials n JOIN session s ON s.id=n.session_id WHERE refresh_hash=${digest(refreshToken)} FOR UPDATE OF n`)).rows[0] as any;
  if(!row)throw new ApiError(401,'UNAUTHENTICATED','Refresh is invalid. Sign in again.');
  if(row.revoked){await tx.execute(sql`UPDATE native_credentials SET revoked=true WHERE family_id=${row.family_id}`);return null;}
  if(new Date(row.refresh_expires_at)<new Date()||new Date(row.session_expires)<new Date())return null;
  await tx.execute(sql`UPDATE native_credentials SET revoked=true WHERE id=${row.id}`);return issueNative(row.user_id,row.session_id,row.family_id,tx);
 });
 if(!result)throw new ApiError(401,'REFRESH_REVOKED','Refresh revoked or expired. Sign in again.');return c.json(result);
});
app.post('/api/v1/auth/native/exchange',async c=>{const user=await resolveIdentity(c.req.raw.headers);if(!user)throw new ApiError(401,'UNAUTHENTICATED','Sign in first.');return c.json(await issueNative(user.id,user.session_id));});
app.post('/api/v1/auth/sign-in/identifier',c=>identifierSignIn(c.req.raw));
app.post('/api/v1/auth/credentials/change',async c=>c.json(await changeOwnPassword(c.req.raw)));
app.on(['GET','POST'],'/api/v1/auth/*',c=>auth.handler(c.req.raw));
app.get('/api/v1/session',async c=>{
 const user=await resolveIdentity(c.req.raw.headers);if(!user)throw new ApiError(401,'UNAUTHENTICATED','Please sign in.');
  const memberships=await db.execute(sql`SELECT m.id,m.organization_id AS "organizationId",m.role,m.denied_permissions AS "deniedPermissions",o.name AS "organizationName" FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=${user.id} AND m.active AND o.active ORDER BY o.name,m.role`);
  return c.json({user:{id:user.id,name:user.name,email:user.email,username:user.login_username},memberships:memberships.rows,passwordChangeRequired:user.must_change_password,demo:process.env.DEMO_MODE==='true'});
});
app.get('/api/v1/internal/outbox',async c=>{if(!process.env.CRON_SECRET||c.req.header('authorization')!==`Bearer ${process.env.CRON_SECRET}`)throw new ApiError(401,'UNAUTHENTICATED','Scheduler authorization required.');return c.json(await processOutbox());});
app.get('/api/v1/internal/schedule',async c=>{
 if(!process.env.CRON_SECRET||c.req.header('authorization')!==`Bearer ${process.env.CRON_SECRET}`)throw new ApiError(401,'UNAUTHENTICATED','Scheduler authorization required.');
 if(!process.env.SCHEDULER_USER_ID||!process.env.SCHEDULER_MEMBERSHIP_ID)throw new ApiError(503,'SCHEDULER_UNCONFIGURED','Configure a dedicated active operations identity before enabling scheduled generation.');
 const actor=await actorFor(process.env.SCHEDULER_USER_ID,process.env.SCHEDULER_MEMBERSHIP_ID);
 return c.json(await db.transaction(tx=>generateRollingJobs(tx,actor)));
});
app.post('/api/v1/public/enquiries',submitEnquiry);
app.post('/api/v1/public/newsletter',subscribeNewsletter);
app.post('/api/v1/public/newsletter/unsubscribe',unsubscribeNewsletter);
app.use('/api/v1/*',async(c,next)=>{
  const user=await resolveIdentity(c.req.raw.headers);if(!user)throw new ApiError(401,'UNAUTHENTICATED','Please sign in.');
  if(user.must_change_password&&c.req.path!=='/api/v1/logout')throw new ApiError(403,'PASSWORD_CHANGE_REQUIRED','Change your temporary password before using the workspace.');
 if(c.req.method==='POST'&&!c.req.header('authorization')?.startsWith('Bearer ')&&!origins.includes(c.req.header('origin')||''))throw new ApiError(403,'CSRF_ORIGIN','Cookie mutations require an allowed Origin.');
 c.set('actor',await actorFor(user.id,c.req.header('x-membership-id')||null));
 if(c.req.method==='POST'||c.req.query('format')==='csv'){
  const bucket=c.req.path.includes('/attachments')?'uploads':c.req.path.includes('payment')?'payments':c.req.query('format')==='csv'?'exports':'mutations';
  const cap=bucket==='uploads'?10:bucket==='exports'?10:bucket==='payments'?20:120;
  const rate=(await db.execute(sql`INSERT INTO api_rate_limits(key,window_start,count) VALUES(${user.id+':'+bucket},date_trunc('minute',now()),1) ON CONFLICT(key,window_start) DO UPDATE SET count=api_rate_limits.count+1 RETURNING count`)).rows[0];
  if(Number(rate.count)>cap){c.header('Retry-After','60');throw new ApiError(429,'RATE_LIMITED','Too many actions. Wait one minute before retrying.');}
 }
 await next();
});
app.post('/api/v1/logout',async c=>{const user=await resolveIdentity(c.req.raw.headers);await db.transaction(async tx=>{await tx.execute(sql`UPDATE native_credentials SET revoked=true WHERE user_id=${user!.id}`);await tx.execute(sql`DELETE FROM session WHERE "userId"=${user!.id} AND id NOT IN (SELECT session_id FROM native_credentials)`);await tx.execute(sql`UPDATE session SET "expiresAt"=now() WHERE "userId"=${user!.id}`);});return c.json({ok:true});});
app.route('/api/v1/admin',userAdminRoutes);
app.post('/api/v1/enquiries/:id/review',async c=>{
 const a=c.get('actor');permit(a,'enquiries','write');
 if(!a.global)throw new ApiError(403,'FORBIDDEN','Platform operations access required.');
 const data=z.object({version:z.number().int().positive(),status:z.enum(['NEW','CONTACTED','CLOSED']),notes:z.string().trim().min(5).max(4000)}).parse(await c.req.json());
 return c.json(await db.transaction(async tx=>{
  const row=await object(tx,a,'enquiries',c.req.param('id'));
  if(row.version!==data.version)throw new ApiError(409,'VERSION_CONFLICT','This enquiry changed. Refresh before saving.');
  const result=(await tx.execute(sql`UPDATE enquiries SET status=${data.status},notes=${data.notes},version=version+1,updated_at=now() WHERE id=${row.id} RETURNING *`)).rows[0];
  await tx.execute(sql`INSERT INTO audit_events(actor_id,organization_id,role,action,target_id,reason,changes) VALUES(${a.userId},${a.organizationId},${a.role},'enquiry-reviewed',${row.id},'Administrator recorded enquiry follow-up',${JSON.stringify({previousStatus:row.status,status:data.status,previousNotes:row.notes,notes:data.notes})}::jsonb)`);
  return result;
 }));
});
app.get('/api/v1/dashboard',async c=>{
 const a=c.get('actor');const metrics:Record<string,any>={};
 for(const r of ['sites','jobs','collections','manifests','receiving','invoices','payments','complaints'] as Resource[]){
   if(!can(a.role,r,'read',a.deniedPermissions))continue;const d=source(r,a);const rows=(await db.execute(sql`SELECT r.* FROM ${d.from} WHERE ${d.scope} ORDER BY r.created_at DESC LIMIT 1000`)).rows as any[];
  if(r==='sites')metrics.sites={value:rows.filter(x=>x.status==='ACTIVE').length,unit:'sites',definition:'Active service sites; not necessarily paid',basis:'Current status'};
  if(r==='jobs'){for(const [k,states]of Object.entries({scheduled:['SCHEDULED','ASSIGNED','EN_ROUTE','ARRIVED'],completed:['COLLECTED','PARTIALLY_COLLECTED'],missed:['MISSED','FAILED']}))metrics[k]={value:rows.filter(x=>states.includes(x.state)).length,unit:'jobs',definition:states.join(', '),basis:'Occurrence records, all dates'};}
  if(r==='collections')metrics.collected={value:rows.reduce((n,x)=>n+Number(x.net_grams),0)/1000,unit:'kg',definition:'Pickup net mass, measured and estimated; not treatment',basis:'Collection occurrence; all available dates'};
  if(r==='receiving'){metrics.accepted={value:rows.reduce((n,x)=>n+Number(x.accepted_grams),0)/1000,unit:'kg',definition:'Facility accepted mass, submitted evidence; not compost output',basis:'Receiving records'};metrics.rejected={value:rows.reduce((n,x)=>n+Number(x.rejected_grams),0)/1000,unit:'kg',definition:'Facility rejected mass',basis:'Receiving records'};}
  if(r==='manifests')metrics.unreconciled={value:rows.filter(x=>!['RECONCILED','CLOSED'].includes(x.state)).length,unit:'deliveries',definition:'Delivery manifests not reconciled or closed',basis:'Current status'};
  if(r==='invoices')metrics.balances=['USD','LRD'].map(currency=>({currency,outstandingMinor:rows.filter(x=>x.currency===currency).reduce((n,x)=>n+Number(x.total_minor)-Number(x.paid_minor),0),invoicedMinor:rows.filter(x=>x.currency===currency).reduce((n,x)=>n+Number(x.total_minor),0)}));
  if(r==='payments')metrics.confirmedPayments=rows.filter(x=>x.status==='CONFIRMED').length;
  if(r==='complaints')metrics.complaints={value:rows.filter(x=>x.status!=='RESOLVED').length,unit:'cases',definition:'Unresolved customer complaints',basis:'Current status'};
 }
 return c.json({metrics,scope:{organizationId:a.organizationId,platform:a.global},generatedAt:new Date().toISOString(),timezone:'Africa/Monrovia',limitNotice:'Metrics currently bounded to 1,000 recent records per resource; not a full-ledger report.',realtime:{mode:'polling',intervalMs:5000,reason:'Authorized managed live adapter not activated'},emissionsEnabled:false});
});
app.post('/api/v1/commands/:name',async c=>c.json(await command(c.get('actor'),c.req.param('name'),await c.req.json(),c.req.header('idempotency-key')||null)));
app.post('/api/v1/realtime/token',c=>{throw new ApiError(503,'PROVIDER_UNCONFIGURED','Live channel authorization is not activated. Clients use scoped five-second polling.');});
app.route('/api/v1/attachments',attachmentRoutes);
app.get('/api/v1/schedules/:id/calendar',async c=>{
 const a=c.get('actor');return c.json(await db.transaction(async tx=>{
  const schedule=await object(tx,a,'schedules',c.req.param('id'),'read');
  const versions=(await tx.execute(sql`SELECT * FROM schedule_versions WHERE schedule_id=${schedule.id} ORDER BY version DESC LIMIT 100`)).rows;
  const pauses=(await tx.execute(sql`SELECT * FROM schedule_pauses WHERE schedule_id=${schedule.id} ORDER BY starts_on DESC LIMIT 100`)).rows;
  const holidays=(await tx.execute(sql`SELECT h.* FROM service_area_holidays h JOIN sites s ON s.service_area_id=h.service_area_id WHERE s.id=${schedule.site_id} ORDER BY h.local_date DESC LIMIT 100`)).rows;
  return {...schedule,calendar:{versions,pauses,holidays,limitPerList:100,timePolicy:'Local calendar dates; overnight windows cross local midnight. PostgreSQL standard-time offset on overlaps; nonexistent DST windows require review. Cancelled occurrences require explicit restoration.'}};
 }));
});
app.get('/api/v1/:resource',async c=>{
 const r=c.req.param('resource') as Resource;if(!resources.includes(r))throw new ApiError(404,'NOT_FOUND','Resource unavailable.');const a=c.get('actor');permit(a,r,'read');
 const {limit,offset,from,to,search}=z.object({limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(100000).default(0),from:z.string().date().optional(),to:z.string().date().optional(),search:z.string().max(100).default('')}).parse(c.req.query());
 const d=source(r,a);const date=r==='settings'?sql`true`:sql`(${from||null}::date IS NULL OR r.created_at>=${from||null}::date) AND (${to||null}::date IS NULL OR r.created_at<${to||null}::date+interval '1 day')`;
 const where=sql`(${d.scope}) AND (${date}) AND (${search===''||false} OR to_jsonb(r)::text ILIKE ${'%'+search+'%'})`;
 const rows=await db.execute(sql`SELECT r.* FROM ${d.from} WHERE ${where} ORDER BY ${r==='settings'?sql`r.key`:sql`r.created_at`} DESC LIMIT ${limit} OFFSET ${offset}`);
 if(c.req.query('format')==='csv'){
  if(!['PLATFORM_ADMIN','READ_ONLY_REVIEWER','FINANCE_OFFICER','OPERATIONS_MANAGER','CUSTOMER_OWNER','FACILITY_MANAGER'].includes(a.role))throw new ApiError(403,'EXPORT_FORBIDDEN','This role has no export permission.');
  const columns=Object.keys(rows.rows[0]||{});const csv=[columns.map(csvCell).join(','),...rows.rows.map(row=>columns.map(k=>csvCell(row[k])).join(','))].join('\r\n');c.header('Content-Disposition',`attachment; filename="ecogrowth-${r}.csv"`);c.header('Content-Type','text/csv; charset=utf-8');return c.body(csv);
 }
 return c.json({data:rows.rows,pagination:{limit,offset,nextOffset:rows.rows.length===limit?offset+limit:null},scope:{organizationId:a.organizationId},generatedAt:new Date().toISOString()});
});
app.get('/api/v1/:resource/:id',async c=>{const r=c.req.param('resource') as Resource;if(!resources.includes(r))throw new ApiError(404,'NOT_FOUND','Unknown resource.');return c.json(await db.transaction(tx=>object(tx,c.get('actor'),r,c.req.param('id'),'read')));});
app.notFound(c=>c.json({error:{code:'NOT_FOUND',message:'Endpoint not found.'}},404));
