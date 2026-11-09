import { z } from 'zod';
import { db, sql } from '@ecogrowth/db';
import { collectionInput, receivingInput, siteInput, paymentInput, complaintInput, uuid, reason, localTime, weekdays, schedulingSchemas } from '@ecogrowth/contracts';
import { assertTransition } from '@ecogrowth/domain';
import { ApiError, type Actor, object, permit, event } from './access.js';
import { digest } from './auth.js';
import { schedulingCommand, serviceEligibility, windowFor } from './scheduling.js';
const idInput=z.object({id:uuid});
const asNum=(v:any)=>Number(v);
export const commandSchemas={
 'request-site':siteInput,
 'assess-site':z.object({id:uuid,notes:reason,qualified:z.boolean()}),
 'create-quote':z.object({id:uuid,currency:z.enum(['USD','LRD']),amountMinor:z.number().int().positive().max(100000000),frequency:z.number().int().min(1).max(7),allowanceGrams:z.number().int().positive(),assumptions:reason,responsibilities:reason,serviceWindow:z.string().min(3),windowStartLocal:localTime,windowEndLocal:localTime,termsVersion:z.string().min(2),validUntil:z.string().datetime()}).refine(v=>v.windowStartLocal!==v.windowEndLocal,{message:'Window start and end must differ.',path:['windowEndLocal']}),
 'accept-quote':idInput,
 'activate-site':z.object({id:uuid,trainedName:z.string().min(3),guidanceVersion:z.string().min(2),weekdays,startsOn:z.string().date()}),
 ...schedulingSchemas,
 'assign-job':z.object({id:uuid,routeId:uuid,collectorId:z.string().min(1),version:z.number().int().positive()}),
 'transition-job':z.object({id:uuid,state:z.string(),version:z.number().int().positive(),reason:reason}),
 'collect':collectionInput,
 'dispatch':z.object({facilityId:uuid,allocations:z.array(z.object({collectionId:uuid,grams:z.number().int().positive()})).min(1).max(100)}),
 'deliver':z.object({id:uuid,version:z.number().int().positive()}),
 'receive':receivingInput,
 'reconcile':z.object({id:uuid,reason:reason}),
 'complete-residual':z.object({id:uuid,destination:reason,evidenceReference:reason,responsibleProvider:reason}),
 'issue-invoice':z.object({id:uuid,periodStart:z.string().date(),periodEnd:z.string().date(),dueDate:z.string().date()}),
 'submit-payment':paymentInput,
 'review-payment':z.object({id:uuid,confirm:z.boolean(),reason:reason}),
 'open-complaint':complaintInput,
 'resolve-complaint':z.object({id:uuid,reason:reason}),
 'read-notification':idInput
};
export type Command=keyof typeof commandSchemas;
export async function command(a:Actor,name:string,raw:unknown,key:string|null,executor:Pick<typeof db,'transaction'>=db){
 if(!Object.hasOwn(commandSchemas,name))throw new ApiError(404,'NOT_FOUND','Unknown command.');
 if(!key||key.length<8||key.length>150)throw new ApiError(400,'IDEMPOTENCY_REQUIRED','Supply an 8–150 character Idempotency-Key.');
 const data=(commandSchemas[name as Command] as z.ZodType).parse(raw) as any;
 const hash=digest(JSON.stringify({name,data}));
 return executor.transaction(async tx=>{
  // Transaction-scoped lock serializes identical keys, including concurrent first requests.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${a.userId+':'+a.organizationId+':'+key},0))`);
  const prior=(await tx.execute(sql`SELECT * FROM idempotency_records WHERE user_id=${a.userId} AND organization_id=${a.organizationId} AND key=${key}`)).rows[0];
  if(prior){if(prior.payload_hash!==hash)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','This key was already used with different content.');return prior.response;}
  let result:any;
  switch(name){
   case 'request-site':{
    permit(a,'sites','write');if(!['CUSTOMER_OWNER','PLATFORM_ADMIN','OPERATIONS_MANAGER'].includes(a.role))throw new ApiError(403,'FORBIDDEN','Site creation not permitted.');
    const kind=(await tx.execute(sql`SELECT kind FROM organizations WHERE id=${a.organizationId}`)).rows[0];
    if(kind?.kind!=='CUSTOMER')throw new ApiError(409,'CUSTOMER_ORG_REQUIRED','Switch to a customer organization to request a site.');
    const area=(await tx.execute(sql`SELECT id FROM service_areas WHERE approved ORDER BY name LIMIT 1`)).rows[0];
    const rows=await tx.execute(sql`INSERT INTO sites(organization_id,service_area_id,name,category,landmark,contact,operating_days,storage,expected_grams,status) VALUES(${a.organizationId},${data.insideCoverage?area?.id:null},${data.name},${data.category},${data.landmark},${data.contact},${sql.param(data.operatingDays)}::integer[],${data.storage},${data.expectedGrams},${data.insideCoverage?'REQUESTED':'WAITLIST'}) RETURNING *`);result=rows.rows[0];
    await tx.execute(sql`INSERT INTO baseline_records(site_id,description,uncertainty) VALUES(${result.id},${data.baseline},'Customer-reported; unverified')`);break;
   }
   case 'assess-site':{
    if(!a.global)throw new ApiError(403,'FORBIDDEN','Operations assessment required.');const site=await object(tx,a,'sites',data.id);permit(a,'assessments','write');
    if(!['REQUESTED','ASSESSED'].includes(site.status))throw new ApiError(409,'INVALID_STATE','Site must be requested or assessed.');
    result=(await tx.execute(sql`INSERT INTO assessments(site_id,assessor_id,notes,qualified) VALUES(${site.id},${a.userId},${data.notes},${data.qualified}) RETURNING *`)).rows[0];
    await tx.execute(sql`UPDATE sites SET status=${data.qualified?'ASSESSED':'WAITLIST'},version=version+1,updated_at=now() WHERE id=${site.id}`);break;
   }
   case 'create-quote':{
    if(!a.global)throw new ApiError(403,'FORBIDDEN','Operations approval required.');permit(a,'quotations','write');const site=await object(tx,a,'sites',data.id);
    if(site.status!=='ASSESSED')throw new ApiError(409,'INVALID_STATE','Complete a qualified assessment first.');
    if(new Date(data.validUntil)<=new Date())throw new ApiError(422,'QUOTE_EXPIRY','Quotation validity must end in the future.');
    result=(await tx.execute(sql`INSERT INTO quotations(site_id,status,currency,amount_minor,frequency_per_week,allowance_grams,assumptions,responsibilities,service_window,window_start_local,window_end_local,schedule_timezone,terms_version,valid_until) VALUES(${site.id},'ISSUED',${data.currency},${data.amountMinor},${data.frequency},${data.allowanceGrams},${data.assumptions},${data.responsibilities},${data.serviceWindow},${data.windowStartLocal},${data.windowEndLocal},${site.timezone},${data.termsVersion},${data.validUntil}) RETURNING *`)).rows[0];
    await tx.execute(sql`UPDATE sites SET status='QUOTED',version=version+1 WHERE id=${site.id}`);break;
   }
   case 'accept-quote':{
    if(a.role!=='CUSTOMER_OWNER')throw new ApiError(403,'FORBIDDEN','Only the customer owner can accept terms.');const quote=await object(tx,a,'quotations',data.id);
    if(quote.status!=='ISSUED'||new Date(quote.valid_until)<new Date())throw new ApiError(409,'INVALID_STATE','Quote is not valid for acceptance.');
    const snapshot=JSON.stringify(quote);result=(await tx.execute(sql`INSERT INTO agreements(quotation_id,snapshot,accepted_by) VALUES(${quote.id},${snapshot}::jsonb,${a.userId}) RETURNING *`)).rows[0];
    await tx.execute(sql`UPDATE quotations SET status='ACCEPTED',snapshot=${snapshot}::jsonb,accepted_by=${a.userId},accepted_at=now(),version=version+1 WHERE id=${quote.id}`);
    await tx.execute(sql`UPDATE sites SET status='SUBSCRIBED',version=version+1 WHERE id=${quote.site_id}`);break;
   }
   case 'activate-site':{
    if(!a.global)throw new ApiError(403,'FORBIDDEN','Operations activation required.');permit(a,'subscriptions','write');const site=await object(tx,a,'sites',data.id);
    if(site.status!=='SUBSCRIBED')throw new ApiError(409,'INVALID_STATE','Accepted terms required.');
    const route=(await tx.execute(sql`SELECT r.id FROM routes r JOIN facilities f ON f.id=r.facility_id JOIN service_areas sa ON sa.id=r.service_area_id JOIN organizations p ON p.id=r.partner_organization_id WHERE r.service_area_id=${site.service_area_id} AND r.active AND f.active AND p.active AND sa.approved AND EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=p.id AND m.role='COLLECTOR' AND m.active) LIMIT 1`)).rows[0];
    if(!route)throw new ApiError(409,'ACTIVATION_BLOCKED','Approved area, active collector and accepting facility route required.');
    const agreement=(await tx.execute(sql`SELECT g.*,q.service_window,q.window_start_local,q.window_end_local,q.schedule_timezone,q.frequency_per_week FROM agreements g JOIN quotations q ON q.id=g.quotation_id WHERE q.site_id=${site.id} ORDER BY g.created_at DESC LIMIT 1`)).rows[0];
    if(data.weekdays.length!==Number(agreement.frequency_per_week)||data.weekdays.some((day:number)=>!(site.operating_days as number[]).includes(day)))throw new ApiError(422,'AGREED_FREQUENCY','Weekdays must match the accepted frequency and site operating days.');
    if(agreement.schedule_timezone!==site.timezone)throw new ApiError(409,'TIMEZONE_REVIEW','Accepted quotation timezone differs from the site. Review terms before activation.');
    await windowFor(tx,{timezone:site.timezone,window_start_local:agreement.window_start_local,window_end_local:agreement.window_end_local},data.startsOn);
    const sub=(await tx.execute(sql`INSERT INTO subscriptions(site_id,agreement_id,starts_on) VALUES(${site.id},${agreement.id},${data.startsOn}) RETURNING *`)).rows[0];
    await tx.execute(sql`INSERT INTO training_records(site_id,trained_name,guidance_version,trainer_id) VALUES(${site.id},${data.trainedName},${data.guidanceVersion},${a.userId})`);
    const schedule=(await tx.execute(sql`INSERT INTO schedule_rules(subscription_id,site_id,weekdays,timezone,service_window) VALUES(${sub.id},${site.id},${sql.param(data.weekdays)}::integer[],${site.timezone},${agreement.service_window}) RETURNING *`)).rows[0];
    await tx.execute(sql`INSERT INTO schedule_versions(schedule_id,version,weekdays,timezone,window_start_local,window_end_local,effective_from,created_by,reason) VALUES(${schedule.id},1,${sql.param(data.weekdays)}::integer[],${site.timezone},${agreement.window_start_local},${agreement.window_end_local},${data.startsOn},${a.userId},'Approved activation using accepted terms and recorded training')`);
    await tx.execute(sql`UPDATE sites SET status='ACTIVE',version=version+1 WHERE id=${site.id}`);result=sub;break;
   }
   case 'generate-jobs': case 'revise-schedule': case 'pause-schedule': case 'resume-schedule':
   case 'add-service-holiday': case 'remove-service-holiday': case 'end-subscription':
   case 'reschedule-job': case 'restore-cancelled-job':{
    result=await schedulingCommand(tx,a,name,data);break;
   }
   case 'assign-job':{
    if(!['PLATFORM_ADMIN','OPERATIONS_MANAGER','PARTNER_DISPATCHER'].includes(a.role))throw new ApiError(403,'FORBIDDEN','Dispatcher required.');const job=await object(tx,a,'jobs',data.id);const route=await object(tx,a,'routes',data.routeId);
    if(job.version!==data.version||job.state!=='SCHEDULED')throw new ApiError(409,'VERSION_CONFLICT','Refresh the scheduled job.');
    await serviceEligibility(tx,job);
    if(!job.scheduled_start_at||!job.scheduled_end_at)throw new ApiError(409,'SERVICE_WINDOW_UNCONFIGURED','An explicit service window is required before assignment.');
    // Locking route serializes capacity checks across concurrent assignments.
    const collector=(await tx.execute(sql`SELECT id FROM memberships WHERE user_id=${data.collectorId} AND organization_id=${route.partner_organization_id} AND role='COLLECTOR' AND active`)).rows[0];
    const site=(await tx.execute(sql`SELECT * FROM sites WHERE id=${job.site_id}`)).rows[0];
    const capacity=(await tx.execute(sql`SELECT coalesce(sum(expected_grams),0)::bigint used FROM job_occurrences WHERE route_id=${route.id} AND occurrence_date=${job.occurrence_date} AND state NOT IN ('CANCELLED','RESCHEDULED','FAILED','MISSED')`)).rows[0];
    if(!collector||!route.active||route.service_area_id!==site.service_area_id||asNum(capacity.used)+asNum(job.expected_grams)>asNum(route.capacity_grams))throw new ApiError(409,'ASSIGNMENT_BLOCKED','Collector, service area or route capacity invalid.');
    const otherRoute=(await tx.execute(sql`SELECT id FROM job_occurrences WHERE collector_id=${data.collectorId} AND occurrence_date=${job.occurrence_date} AND route_id<>${route.id} AND state NOT IN ('CANCELLED','FAILED','MISSED','RESCHEDULED') LIMIT 1`)).rows[0];if(otherRoute)throw new ApiError(409,'COLLECTOR_UNAVAILABLE','Collector is assigned to another route on this date.');
    result=(await tx.execute(sql`UPDATE job_occurrences SET state='ASSIGNED',route_id=${route.id},collector_id=${data.collectorId},partner_organization_id=${route.partner_organization_id},facility_id=${route.facility_id},version=version+1,updated_at=now() WHERE id=${job.id} RETURNING *`)).rows[0];break;
   }
   case 'transition-job':{
    const job=await object(tx,a,'jobs',data.id);if(job.version!==data.version)throw new ApiError(409,'VERSION_CONFLICT','Job changed. Refresh before retrying.');
    if(['COLLECTED','PARTIALLY_COLLECTED','ASSIGNED','RESCHEDULED','SCHEDULED'].includes(data.state))throw new ApiError(409,'COMMAND_REQUIRED','Use the validated capture, assignment, rescheduling or restoration command.');
    if(['EN_ROUTE','ARRIVED'].includes(data.state)&&job.collector_id!==a.userId)throw new ApiError(403,'FORBIDDEN','Only the assigned collector can record arrival.');
    if(['EN_ROUTE','ARRIVED'].includes(data.state))await serviceEligibility(tx,job);
    try{assertTransition(job.state,data.state);}catch{throw new ApiError(409,'INVALID_STATE','Transition is not allowed.');}
    result=(await tx.execute(sql`UPDATE job_occurrences SET state=${data.state},reason=${data.reason},version=version+1,updated_at=now() WHERE id=${job.id} RETURNING *`)).rows[0];break;
   }
   case 'collect':{
    permit(a,'collections','write');const job=await object(tx,a,'jobs',data.jobId,'read');
    if(a.role!=='COLLECTOR'||job.collector_id!==a.userId)throw new ApiError(403,'FORBIDDEN','Only the assigned collector can submit pickup evidence.');
    if(job.version!==data.version||job.state!=='ARRIVED')throw new ApiError(409,'VERSION_CONFLICT','Current assigned job must be ARRIVED. Retain your draft and review.');
    await serviceEligibility(tx,job);
    const site=(await tx.execute(sql`SELECT status FROM sites WHERE id=${job.site_id}`)).rows[0];if(site.status!=='ACTIVE')throw new ApiError(409,'SERVICE_PAUSED','Site is no longer active.');
    const f=(await tx.execute(sql`SELECT * FROM facilities WHERE id=${job.facility_id} AND active`)).rows[0];if(!f||(f.accepted_materials as string[]).indexOf(data.material)<0)throw new ApiError(409,'MATERIAL_NOT_ACCEPTED','Facility no longer accepts this material.');
    result=(await tx.execute(sql`INSERT INTO collections(job_id,collector_id,gross_grams,tare_grams,net_grams,measurement,method,material,contamination,residual_grams,reason,occurred_at) VALUES(${job.id},${a.userId},${data.grossGrams},${data.tareGrams},${data.netGrams},${data.measurement},${data.method},${data.material},${data.contamination},${data.residualGrams},${data.reason},${data.occurredAt}) RETURNING *`)).rows[0];
    await tx.execute(sql`UPDATE job_occurrences SET state=${data.partial?'PARTIALLY_COLLECTED':'COLLECTED'},version=version+1,updated_at=now() WHERE id=${job.id}`);
    if(data.residualGrams)await tx.execute(sql`INSERT INTO residuals(job_id,organization_id,grams,reason,responsible_provider) VALUES(${job.id},${job.organization_id},${data.residualGrams},${data.reason},'Unassigned; operations review required')`);break;
   }
   case 'dispatch':{
    permit(a,'manifests','write');const allocations=[...data.allocations].sort((x,y)=>x.collectionId.localeCompare(y.collectionId));
    if(new Set(allocations.map(x=>x.collectionId)).size!==allocations.length)throw new ApiError(422,'DUPLICATE_SOURCE','A source can occur only once per manifest.');
    let partner:string|undefined;let total=0;
    for(const line of allocations){const c=await object(tx,a,'collections',line.collectionId,'read');const j=(await tx.execute(sql`SELECT * FROM job_occurrences WHERE id=${c.job_id}`)).rows[0];
     if(j.facility_id!==data.facilityId||partner&&partner!==j.partner_organization_id)throw new ApiError(409,'ROUTE_MISMATCH','All sources must share the authorized facility and partner.');partner=j.partner_organization_id as string;
     const allocated=(await tx.execute(sql`SELECT coalesce(sum(grams),0) grams FROM delivery_allocations WHERE collection_id=${c.id}`)).rows[0];
     if(asNum(allocated.grams)+line.grams>asNum(c.net_grams))throw new ApiError(409,'OVER_ALLOCATION','Quantity exceeds source available mass.');total+=line.grams;
    }
    const f=(await tx.execute(sql`SELECT * FROM facilities WHERE id=${data.facilityId} FOR UPDATE`)).rows[0];if(!f?.active||total>asNum(f.capacity_grams))throw new ApiError(409,'FACILITY_UNAVAILABLE','Facility unavailable or delivery exceeds capacity.');
    result=(await tx.execute(sql`INSERT INTO manifests(partner_organization_id,facility_id,state,dispatched_by) VALUES(${partner},${data.facilityId},'DISPATCHED',${a.userId}) RETURNING *`)).rows[0];
    for(const line of allocations)await tx.execute(sql`INSERT INTO delivery_allocations(manifest_id,collection_id,grams) VALUES(${result.id},${line.collectionId},${line.grams})`);break;
   }
   case 'deliver':{
    const m=await object(tx,a,'manifests',data.id);if(m.state!=='DISPATCHED'||m.version!==data.version)throw new ApiError(409,'VERSION_CONFLICT','Manifest must be dispatched and current.');
    result=(await tx.execute(sql`UPDATE manifests SET state='DELIVERED',version=version+1 WHERE id=${m.id} RETURNING *`)).rows[0];break;
   }
   case 'receive':{
    permit(a,'receiving','write');const m=await object(tx,a,'manifests',data.manifestId,'read');
    const f=(await tx.execute(sql`SELECT * FROM facilities WHERE id=${m.facility_id}`)).rows[0];
    if(!['FACILITY_MANAGER','RECEIVING_OFFICER'].includes(a.role)||f.organization_id!==a.organizationId||m.dispatched_by===a.userId)throw new ApiError(403,'INDEPENDENT_RECEIVER_REQUIRED','Receiving must be independently recorded by the destination facility.');
    if(m.version!==data.version||m.state!=='DELIVERED')throw new ApiError(409,'VERSION_CONFLICT','Manifest changed or is not delivered.');
    const lines=(await tx.execute(sql`SELECT * FROM delivery_allocations WHERE manifest_id=${m.id} ORDER BY collection_id`)).rows as any[];
    const total=lines.reduce((n,l)=>n+asNum(l.grams),0);if(total<=0)throw new ApiError(409,'NO_SOURCE','Manifest has no source allocations.');
    result=(await tx.execute(sql`INSERT INTO receiving_records(manifest_id,receiver_id,received_grams,accepted_grams,rejected_grams,method,allocation_method,proof_reference) VALUES(${m.id},${a.userId},${data.receivedGrams},${data.acceptedGrams},${data.rejectedGrams},${data.method},'PRO_RATA_BY_COLLECTED_MASS; submitted for review',${data.proofReference}) RETURNING *`)).rows[0];
    // Integer apportionment via cumulative floors conserves exact receiving mass, including final remainder.
    let cumulative=0n,prevAccepted=0,prevRejected=0;
    for(const l of lines){cumulative+=BigInt(l.grams);const accepted=Number(BigInt(data.acceptedGrams)*cumulative/BigInt(total)),rejected=Number(BigInt(data.rejectedGrams)*cumulative/BigInt(total));await tx.execute(sql`INSERT INTO receiving_allocations(receiving_id,collection_id,accepted_grams,rejected_grams) VALUES(${result.id},${l.collection_id},${accepted-prevAccepted},${rejected-prevRejected})`);prevAccepted=accepted;prevRejected=rejected;}
    const discrepancy=data.receivedGrams-total;const cfg=(await tx.execute(sql`SELECT value FROM settings WHERE key='pilot'`)).rows[0].value as any;const review=Math.abs(discrepancy)>cfg.reconciliationToleranceGrams||data.rejectedGrams>0;
    await tx.execute(sql`UPDATE manifests SET state=${review?'RECONCILIATION_REQUIRED':'RECEIVING_RECORDED'},version=version+1 WHERE id=${m.id}`);
    await tx.execute(sql`INSERT INTO reconciliation_cases(manifest_id,discrepancy_grams) VALUES(${m.id},${discrepancy})`);
    if(data.rejectedGrams>0)await tx.execute(sql`INSERT INTO residuals(receiving_id,organization_id,grams,reason,responsible_provider) VALUES(${result.id},${a.organizationId},${data.rejectedGrams},'Facility rejection; destination evidence required',${f.name})`);break;
   }
   case 'reconcile':{
    if(!['PLATFORM_ADMIN','OPERATIONS_MANAGER','FACILITY_MANAGER'].includes(a.role))throw new ApiError(403,'FORBIDDEN','Reviewer required.');const c=await object(tx,a,'reconciliation',data.id);if(c.status!=='OPEN')throw new ApiError(409,'INVALID_STATE','Case is already reviewed.');
    const receiving=(await tx.execute(sql`SELECT * FROM receiving_records WHERE manifest_id=${c.manifest_id}`)).rows[0];if(receiving.receiver_id===a.userId)throw new ApiError(403,'SEPARATION_REQUIRED','Another authorized user must review receiving evidence.');
    result=(await tx.execute(sql`UPDATE reconciliation_cases SET status='REVIEWED',reason=${data.reason},reviewer_id=${a.userId} WHERE id=${c.id} RETURNING *`)).rows[0];
    await tx.execute(sql`UPDATE receiving_records SET evidence_status='REVIEWED' WHERE id=${receiving.id}`);await tx.execute(sql`UPDATE manifests SET state='RECONCILED',version=version+1 WHERE id=${c.manifest_id}`);break;
   }
   case 'complete-residual':{
    const r=await object(tx,a,'residuals',data.id);if(r.status==='COMPLETED')throw new ApiError(409,'INVALID_STATE','Destination already recorded.');result=(await tx.execute(sql`UPDATE residuals SET destination=${data.destination},evidence_reference=${data.evidenceReference},responsible_provider=${data.responsibleProvider},status='COMPLETED' WHERE id=${r.id} RETURNING *`)).rows[0];break;
   }
   case 'issue-invoice':{
    permit(a,'invoices','write');const sub=await object(tx,a,'subscriptions',data.id,'read');
    if(data.periodEnd<data.periodStart)throw new ApiError(422,'DATE_RANGE','Service period end precedes start.');const g=(await tx.execute(sql`SELECT * FROM agreements WHERE id=${sub.agreement_id}`)).rows[0];const snapshot=g.snapshot as any;const site=(await tx.execute(sql`SELECT * FROM sites WHERE id=${sub.site_id}`)).rows[0];
    result=(await tx.execute(sql`INSERT INTO invoices(organization_id,site_id,agreement_id,currency,total_minor,period_start,period_end,due_date,terms_snapshot) VALUES(${site.organization_id},${site.id},${g.id},${snapshot.currency},${snapshot.amount_minor},${data.periodStart},${data.periodEnd},${data.dueDate},${JSON.stringify(snapshot)}::jsonb) RETURNING *`)).rows[0];
    await tx.execute(sql`INSERT INTO invoice_items(invoice_id,description,quantity,unit_minor,total_minor) VALUES(${result.id},${'Organics service — '+data.periodStart+' to '+data.periodEnd},1,${result.total_minor},${result.total_minor})`);break;
   }
   case 'submit-payment':{
    permit(a,'payments','write');if(!['CUSTOMER_OWNER','PLATFORM_ADMIN','FINANCE_OFFICER'].includes(a.role))throw new ApiError(403,'FORBIDDEN','Payment evidence submission not permitted.');const i=await object(tx,a,'invoices',data.invoiceId,'read');
    if(data.currency!==i.currency)throw new ApiError(422,'CURRENCY_MISMATCH','Payment and invoice currencies must match.');
    const dup=(await tx.execute(sql`SELECT id FROM payments WHERE lower(reference)=lower(${data.reference}) AND currency=${data.currency} LIMIT 1`)).rows.length>0;
    result=(await tx.execute(sql`INSERT INTO payments(invoice_id,organization_id,amount_minor,currency,reference,duplicate_flag,submitted_by) VALUES(${i.id},${i.organization_id},${data.amountMinor},${data.currency},${data.reference},${dup},${a.userId}) RETURNING *`)).rows[0];break;
   }
   case 'review-payment':{
    if(!['PLATFORM_ADMIN','FINANCE_OFFICER'].includes(a.role)||!a.global)throw new ApiError(403,'FORBIDDEN','Platform finance review required.');const p=await object(tx,a,'payments',data.id);
    if(p.submitted_by===a.userId)throw new ApiError(403,'SEPARATION_REQUIRED','You cannot review your own evidence.');if(p.status!=='PENDING_REVIEW')throw new ApiError(409,'INVALID_STATE','Payment already reviewed.');
    const i=(await tx.execute(sql`SELECT * FROM invoices WHERE id=${p.invoice_id} FOR UPDATE`)).rows[0];
    if(data.confirm){
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${String(p.reference).toLowerCase()+p.currency},0))`);
     const duplicate=(await tx.execute(sql`SELECT id FROM payments WHERE lower(reference)=lower(${p.reference}) AND currency=${p.currency} AND status='CONFIRMED' AND id<>${p.id}`)).rows[0];if(duplicate)throw new ApiError(409,'DUPLICATE_PAYMENT','Reference already confirmed; resolve with evidence, do not count again.');
     if(p.currency!==i.currency||asNum(p.amount_minor)+asNum(i.paid_minor)>asNum(i.total_minor))throw new ApiError(409,'ALLOCATION_CONFLICT','Payment exceeds outstanding balance or currency differs.');
     await tx.execute(sql`INSERT INTO allocations(payment_id,invoice_id,amount_minor) VALUES(${p.id},${i.id},${p.amount_minor})`);
     const paid=asNum(i.paid_minor)+asNum(p.amount_minor);await tx.execute(sql`UPDATE invoices SET paid_minor=${paid},status=${paid===asNum(i.total_minor)?'PAID':'PARTIALLY_PAID'},version=version+1 WHERE id=${i.id}`);
    }
    result=(await tx.execute(sql`UPDATE payments SET status=${data.confirm?'CONFIRMED':'REJECTED'},reviewed_by=${a.userId},review_reason=${data.reason},confirmed_at=${data.confirm?new Date():null} WHERE id=${p.id} RETURNING *`)).rows[0];break;
   }
   case 'open-complaint':{
    permit(a,'complaints','write');const s=await object(tx,a,'sites',data.siteId,'read');result=(await tx.execute(sql`INSERT INTO complaints(site_id,organization_id,subject,message,created_by) VALUES(${s.id},${s.organization_id},${data.subject},${data.message},${a.userId}) RETURNING *`)).rows[0];break;
   }
   case 'resolve-complaint':{
    if(!a.global)throw new ApiError(403,'FORBIDDEN','Operations resolution required.');const c=await object(tx,a,'complaints',data.id);result=(await tx.execute(sql`UPDATE complaints SET status='RESOLVED',resolution_reason=${data.reason} WHERE id=${c.id} RETURNING *`)).rows[0];break;
   }
   case 'read-notification':{const n=await object(tx,a,'notifications',data.id,'read');result=(await tx.execute(sql`UPDATE notifications SET read_at=now() WHERE id=${n.id} RETURNING *`)).rows[0];break;}
  }
  await event(tx,a,name,String(result?.id||a.organizationId),Number(result?.version||1),data.reason||data.notes||'Validated workflow command',{version:result?.version,status:result?.status||result?.state,siteId:result?.site_id,jobId:result?.job_id});
  await tx.execute(sql`INSERT INTO idempotency_records(user_id,organization_id,key,payload_hash,response) VALUES(${a.userId},${a.organizationId},${key},${hash},${JSON.stringify(result)}::jsonb)`);
  return result;
 });
}
