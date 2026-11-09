import { db, sql } from '@ecogrowth/db';
import type { Resource, Role } from '@ecogrowth/contracts';
import { can } from '@ecogrowth/domain';
export class ApiError extends Error{constructor(public status:number,public code:string,message:string){super(message);}}
export type Actor={userId:string;organizationId:string;membershipId:string;role:Role;global:boolean};
export async function actorFor(userId:string,membershipId:string|null):Promise<Actor>{
 if(!membershipId)throw new ApiError(400,'MEMBERSHIP_REQUIRED','Choose an organization membership.');
 const r=await db.execute(sql`SELECT m.*,o.kind FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.id::text=${membershipId} AND m.user_id=${userId} AND m.active AND o.active`);
 const m=r.rows[0];if(!m)throw new ApiError(403,'FORBIDDEN','Membership is not active or does not belong to you.');
 const global=m.kind==='PLATFORM'&&['PLATFORM_ADMIN','OPERATIONS_MANAGER','FINANCE_OFFICER','READ_ONLY_REVIEWER'].includes(m.role as string);
 return {userId,organizationId:m.organization_id as string,membershipId,role:m.role as Role,global};
}
export function permit(a:Actor,r:Resource,action:'read'|'write'){if(!can(a.role,r,action))throw new ApiError(403,'FORBIDDEN',`Your role cannot ${action} ${r}.`);}
// Every list, report, export and object lookup uses the same scope builder.
export function source(resource:Resource,a:Actor){
 const org=a.organizationId,user=a.userId;
 const jobScope=a.role==='COLLECTOR'?sql`j.collector_id=${user}`:sql`(j.organization_id=${org} OR j.partner_organization_id=${org})`;
 const facilityScope=sql`f.organization_id=${org}`;
  const definitions:Record<Resource,{from:ReturnType<typeof sql>;scope:ReturnType<typeof sql>}>= {
   enquiries:{from:sql`enquiries r`,scope:sql`false`},
   newsletter:{from:sql`(SELECT id,email,status,consent_version,created_at,updated_at FROM newsletter_subscriptions) r`,scope:sql`false`},
  sites:{from:sql`sites r`,scope:sql`r.organization_id=${org}`},
  assessments:{from:sql`assessments r JOIN sites s ON s.id=r.site_id`,scope:sql`s.organization_id=${org}`},
  quotations:{from:sql`quotations r JOIN sites s ON s.id=r.site_id`,scope:sql`s.organization_id=${org}`},
  subscriptions:{from:sql`subscriptions r JOIN sites s ON s.id=r.site_id`,scope:sql`s.organization_id=${org}`},
  schedules:{from:sql`schedule_rules r JOIN sites s ON s.id=r.site_id`,scope:sql`s.organization_id=${org}`},
  jobs:{from:sql`job_occurrences r JOIN job_occurrences j ON j.id=r.id`,scope:jobScope},
  routes:{from:sql`routes r`,scope:a.role==='COLLECTOR'?sql`EXISTS(SELECT 1 FROM job_occurrences j WHERE j.route_id=r.id AND j.collector_id=${user})`:sql`r.partner_organization_id=${org}`},
  collections:{from:sql`collections r JOIN job_occurrences j ON j.id=r.job_id`,scope:jobScope},
  manifests:{from:sql`manifests r JOIN facilities f ON f.id=r.facility_id`,scope:a.role==='COLLECTOR'?sql`r.dispatched_by=${user}`:sql`(r.partner_organization_id=${org} OR ${facilityScope})`},
  receiving:{from:sql`receiving_records r JOIN manifests m ON m.id=r.manifest_id JOIN facilities f ON f.id=m.facility_id`,scope:facilityScope},
  reconciliation:{from:sql`reconciliation_cases r JOIN manifests m ON m.id=r.manifest_id JOIN facilities f ON f.id=m.facility_id`,scope:facilityScope},
  residuals:{from:sql`residuals r`,scope:sql`r.organization_id=${org}`},
  invoices:{from:sql`invoices r`,scope:sql`r.organization_id=${org}`},
  payments:{from:sql`payments r`,scope:sql`r.organization_id=${org}`},
  complaints:{from:sql`complaints r`,scope:sql`r.organization_id=${org}`},
  audit:{from:sql`audit_events r`,scope:sql`r.organization_id=${org}`},
  notifications:{from:sql`notifications r`,scope:sql`r.organization_id=${org} AND (r.user_id IS NULL OR r.user_id=${user})`},
  batches:{from:sql`batches r JOIN facilities f ON f.id=r.facility_id`,scope:facilityScope},
  payables:{from:sql`payables r`,scope:sql`r.organization_id=${org}`},
  containers:{from:sql`containers r`,scope:sql`r.organization_id=${org}`},
  settings:{from:sql`settings r`,scope:sql`false`},
  users:{from:sql`memberships r`,scope:sql`r.organization_id=${org}`},
  reports:{from:sql`sites r`,scope:sql`r.organization_id=${org}`}
 };
 const d=definitions[resource];return {...d,scope:a.global&&resource!=='notifications'?sql`true`:d.scope};
}
export async function object(tx:any,a:Actor,resource:Resource,id:string,action:'read'|'write'='write'){
 permit(a,resource,action);const d=source(resource,a);
 const identity=resource==='settings'?sql`r.key`:sql`r.id::text`;
 const q=await tx.execute(sql`SELECT r.* FROM ${d.from} WHERE ${identity}=${id} AND (${d.scope}) FOR UPDATE OF r`);
 if(!q.rows[0])throw new ApiError(404,'NOT_FOUND','Record not found in your authorized scope.');return q.rows[0] as Record<string,any>;
}
export async function event(tx:any,a:Actor,type:string,id:string,version=1,reason='Workflow action',changes:unknown={}){
 await tx.execute(sql`INSERT INTO audit_events(actor_id,organization_id,role,action,target_id,reason,changes) VALUES(${a.userId},${a.organizationId},${a.role},${type},${id},${reason},${JSON.stringify(changes)}::jsonb)`);
 // Payload is intentionally only an invalidation; no PII or financial amounts.
 await tx.execute(sql`INSERT INTO outbox_events(organization_id,entity_id,entity_version,type) VALUES(${a.organizationId},${id},${version},${type})`);
}
