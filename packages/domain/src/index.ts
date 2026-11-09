import type { Resource, Role } from '@ecogrowth/contracts';
type Grant = {read:Resource[];write:Resource[]};
const operations:Resource[]=['enquiries','sites','assessments','quotations','subscriptions','schedules','jobs','routes','collections','manifests','receiving','reconciliation','residuals','complaints','reports','notifications'];
const finance:Resource[]=['invoices','payments','payables','reports','audit','notifications'];
export const grants:Record<Role,Grant>={
 PLATFORM_ADMIN:{read:[...operations,...finance,'newsletter','batches','containers','settings','users'],write:[...operations,...finance,'batches','containers','settings','users']},
 OPERATIONS_MANAGER:{read:operations,write:operations.filter(x=>!['collections','receiving'].includes(x))},
 FINANCE_OFFICER:{read:[...finance,'sites','subscriptions'],write:['invoices','payments','payables']},
 READ_ONLY_REVIEWER:{read:[...operations.filter(r=>r!=='enquiries'),...finance,'batches'],write:[]},
 CUSTOMER_OWNER:{read:['sites','quotations','subscriptions','schedules','jobs','collections','invoices','payments','complaints','reports','notifications','containers'],write:['sites','quotations','payments','complaints']},
 CUSTOMER_STAFF:{read:['sites','schedules','jobs','collections','complaints','notifications'],write:['complaints']},
 PARTNER_DISPATCHER:{read:['jobs','routes','collections','manifests','complaints','payables','notifications'],write:['jobs','routes','manifests','complaints']},
 COLLECTOR:{read:['jobs','routes','collections','manifests','notifications'],write:['jobs','collections','manifests']},
 FACILITY_MANAGER:{read:['manifests','receiving','reconciliation','batches','residuals','reports','notifications'],write:['receiving','reconciliation','batches','residuals']},
 RECEIVING_OFFICER:{read:['manifests','receiving','reconciliation','notifications'],write:['receiving']}
};
export const can=(role:Role,resource:Resource,action:'read'|'write')=>grants[role][action].includes(resource);
export const pickupEdges:Record<string,string[]>={REQUESTED:['UNDER_REVIEW','CANCELLED'],UNDER_REVIEW:['APPROVED','CANCELLED'],APPROVED:['SCHEDULED','CANCELLED'],SCHEDULED:['ASSIGNED','CANCELLED','RESCHEDULED'],ASSIGNED:['EN_ROUTE','MISSED','FAILED','RESCHEDULED'],EN_ROUTE:['ARRIVED','FAILED'],ARRIVED:['COLLECTED','PARTIALLY_COLLECTED','FAILED'],RESCHEDULED:['SCHEDULED']};
export function assertTransition(from:string,to:string){if(!pickupEdges[from]?.includes(to))throw new Error(`Illegal pickup transition: ${from} → ${to}`);}
export function economics(sites:number){if(!Number.isSafeInteger(sites)||sites<0)throw new Error('Invalid site count');const revenue=sites*4000;const directCost=Math.ceil(sites/30)*30000+sites*700;return {revenue,directCost,contribution:revenue-directCost,operatingResult:revenue-directCost-60000,currency:'USD',basis:'Illustrative monthly assumptions, subject to weight/frequency'};}
export const kg=(grams:number)=>new Intl.NumberFormat('en',{maximumFractionDigits:3}).format(grams/1000);
export const money=(minor:number,currency:string)=>new Intl.NumberFormat('en',{style:'currency',currency}).format(minor/100);
export type StatusTone='positive'|'attention'|'danger'|'neutral';
// Explicit states, not substring matching: NOT_REVIEWED/UNPAID must never look confirmed.
export function statusTone(value:unknown):StatusTone{
 const state=String(value??'').trim().toUpperCase().replaceAll(/\s+/g,'_');
 if(['ACTIVE','PAID','CONFIRMED','REVIEWED','RECONCILED','COLLECTED','RESOLVED','COMPLETED','CLOSED'].includes(state))return 'positive';
 if(['FAILED','REJECTED','MISSED','UNPAID'].includes(state))return 'danger';
 if(['OPEN','OVERDUE','PENDING','PENDING_REVIEW','SUBMITTED_NOT_REVIEWED','RECEIVING_RECORDED','RECONCILIATION_REQUIRED','DESTINATION_PENDING','PARTIALLY_COLLECTED','PARTIALLY_PAID','NEEDS_REVIEW','UNCONFIRMED','NOT_CONFIRMED','ESTIMATED','HOLD','PAUSED'].includes(state))return 'attention';
 return 'neutral';
}
export function csvCell(value:unknown){let s=String(value??'');if(/^[\s]*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
