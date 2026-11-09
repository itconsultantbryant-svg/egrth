import { z } from 'zod';
export * from './scheduling';
export const roles = ['PLATFORM_ADMIN','OPERATIONS_MANAGER','FINANCE_OFFICER','READ_ONLY_REVIEWER','CUSTOMER_OWNER','CUSTOMER_STAFF','PARTNER_DISPATCHER','COLLECTOR','FACILITY_MANAGER','RECEIVING_OFFICER'] as const;
export type Role = typeof roles[number];
export const pickupStates = ['REQUESTED','UNDER_REVIEW','APPROVED','SCHEDULED','ASSIGNED','EN_ROUTE','ARRIVED','COLLECTED','CANCELLED','MISSED','FAILED','PARTIALLY_COLLECTED','RESCHEDULED'] as const;
export const uuid = z.string().uuid();
export const reason = z.string().trim().min(5).max(2000);
export const mass = z.number().int().min(0).max(100_000_000); // integer grams; API labels kg conversions explicitly
export const collectionInput = z.object({jobId:uuid,version:z.number().int().positive(),grossGrams:mass,tareGrams:mass,netGrams:mass,measurement:z.enum(['MEASURED','ESTIMATED']),method:z.string().min(3).max(200),material:z.enum(['FOOD_SCRAPS','FRUIT_VEGETABLES','COFFEE_TEA']),contamination:z.string().max(1000),occurredAt:z.string().datetime(),partial:z.boolean().default(false),residualGrams:mass.default(0),reason:z.string().max(2000).default('')}).refine(v=>v.grossGrams-v.tareGrams===v.netGrams,{message:'Net must equal gross minus tare.',path:['netGrams']}).refine(v=>!v.partial||(v.residualGrams>0&&v.reason.length>=5),{message:'Partial collection requires residual mass and reason.',path:['reason']});
export const receivingInput = z.object({manifestId:uuid,version:z.number().int().positive(),receivedGrams:mass,acceptedGrams:mass,rejectedGrams:mass,method:z.string().min(3).max(500),proofReference:z.string().min(5).max(500)}).refine(v=>v.acceptedGrams+v.rejectedGrams===v.receivedGrams,{message:'Accepted plus rejected must equal received.',path:['acceptedGrams']});
export const paymentInput = z.object({invoiceId:uuid,amountMinor:z.number().int().positive().max(1_000_000_000),currency:z.enum(['USD','LRD']),reference:z.string().trim().min(4).max(120)});
export const siteInput = z.object({name:z.string().trim().min(3).max(150),category:z.enum(['RESTAURANT','CAFE','HOTEL','MARKET','OTHER']),landmark:z.string().min(3).max(500),contact:z.string().min(3).max(200),operatingDays:z.array(z.number().int().min(0).max(6)).min(1),storage:z.string().min(3).max(500),baseline:z.string().min(5).max(2000),expectedGrams:mass,insideCoverage:z.boolean()});
export const complaintInput = z.object({siteId:uuid,subject:z.string().min(5).max(200),message:z.string().min(10).max(4000)});
export type CollectionInput = z.infer<typeof collectionInput>;
export type Membership = {id:string;organizationId:string;organizationName:string;role:Role;deniedPermissions?:string[]};
export type Session = {user:{id:string;name:string;email:string;username?:string};memberships:Membership[];demo:boolean;passwordChangeRequired?:boolean};
export type Row = Record<string, any>;
export type Resource = 'enquiries'|'newsletter'|'sites'|'assessments'|'quotations'|'subscriptions'|'schedules'|'jobs'|'routes'|'collections'|'manifests'|'receiving'|'reconciliation'|'residuals'|'invoices'|'payments'|'complaints'|'audit'|'notifications'|'batches'|'payables'|'containers'|'settings'|'users'|'reports';
export const resources:Resource[]=['enquiries','newsletter','sites','assessments','quotations','subscriptions','schedules','jobs','routes','collections','manifests','receiving','reconciliation','residuals','invoices','payments','complaints','audit','notifications','batches','payables','containers','settings','users','reports'];
