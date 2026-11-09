import { describe,it,expect } from 'vitest';
import { can,economics,assertTransition,csvCell,statusTone } from '@ecogrowth/domain';
import { collectionInput,receivingInput,roles } from '@ecogrowth/contracts';
import { colors } from '../packages/design-tokens/src/index';
const uuid='21111111-1111-4111-8111-111111111111';
const pickup={jobId:uuid,version:1,grossGrams:12000,tareGrams:2000,netGrams:10000,measurement:'MEASURED',method:'Platform scale',material:'FOOD_SCRAPS',contamination:'None',occurredAt:new Date().toISOString(),partial:false,residualGrams:0,reason:''};
describe('shared domain invariants',()=>{
 it('unreviewed, unsettled and queued records never get a confirmed visual status',()=>{
  for(const value of ['SUBMITTED_NOT_REVIEWED','UNPAID','UNCONFIRMED','PARTIALLY_PAID','Needs Review','Queued','Draft','PAYMENT_NOT_CONFIRMED'])expect(statusTone(value)).not.toBe('positive');
  for(const value of ['REVIEWED','PAID','CONFIRMED'])expect(statusTone(value)).toBe('positive');
  expect(statusTone('UNKNOWN_FUTURE_STATE')).toBe('neutral');
  const luminance=(hex:string)=>{
   const channels=[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255).map(channel=>channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4);
   return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
  };
  for(const [foreground,background] of [[colors.primary,colors.pale],[colors.warning,'#FFFBEB'],[colors.danger,'#FEF2F2'],[colors.secondary,'#F1F5F9'],['#FFFFFF',colors.primary],['#FFFFFF',colors.hover]]){
   const values=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);
   expect((values[0]+0.05)/(values[1]+0.05)).toBeGreaterThanOrEqual(4.5);
  }
 });
 it.each([[5,20000,33500,-13500,-73500],[30,120000,51000,69000,9000],[40,160000,88000,72000,12000]])('route economics for %i sites',(sites,revenue,directCost,contribution,operatingResult)=>{expect(economics(sites)).toMatchObject({revenue,directCost,contribution,operatingResult});});
 it('weights must balance and cannot be negative',()=>{expect(collectionInput.safeParse(pickup).success).toBe(true);expect(collectionInput.safeParse({...pickup,netGrams:12000}).success).toBe(false);expect(collectionInput.safeParse({...pickup,tareGrams:-1}).success).toBe(false);});
 it('a partial final pickup needs residual mass and reason',()=>{expect(collectionInput.safeParse({...pickup,partial:true}).success).toBe(false);expect(collectionInput.safeParse({...pickup,partial:true,residualGrams:1000,reason:'Contaminated remainder retained for authorized residual collection.'}).success).toBe(true);});
 it('receiving is its own balanced measurement',()=>{const r={manifestId:uuid,version:1,receivedGrams:9000,acceptedGrams:8000,rejectedGrams:1000,method:'Independent scale',proofReference:'receiving-sheet-123'};expect(receivingInput.safeParse(r).success).toBe(true);expect(receivingInput.safeParse({...r,rejectedGrams:2000}).success).toBe(false);});
 it('rejects illegal physical state transitions',()=>{expect(()=>assertTransition('ASSIGNED','COLLECTED')).toThrow();expect(()=>assertTransition('ARRIVED','PARTIALLY_COLLECTED')).not.toThrow();expect(()=>assertTransition('COLLECTED','ARRIVED')).toThrow();});
 it('read-only review is never mutation authority',()=>{for(const r of ['collections','payments','jobs','sites'] as const)expect(can('READ_ONLY_REVIEWER',r,'write')).toBe(false);});
 it('operational staff have no financial access',()=>{for(const role of ['COLLECTOR','CUSTOMER_STAFF','RECEIVING_OFFICER'] as const)expect(can(role,'payments','read')).toBe(false);expect(roles).toHaveLength(10);});
 it.each(['=HYPERLINK("evil")',' +1','@SUM(A1)','\t-1'])('escapes CSV formula %s',value=>{expect(csvCell(value).startsWith('"\'')).toBe(true);});
});
