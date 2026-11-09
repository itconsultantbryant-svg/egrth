import { db, sql } from '@ecogrowth/db';
import * as Ably from 'ably';
export async function processOutbox(){
 if(!process.env.ABLY_API_KEY)return {mode:'polling',published:0,reason:'Provider unconfigured; events retained.'};
 const client=new Ably.Rest(process.env.ABLY_API_KEY);let published=0;
 // Bounded batch, awaited, row locks and SKIP LOCKED prevent overlapping workers.
 await db.transaction(async tx=>{
  const rows=(await tx.execute(sql`SELECT * FROM outbox_events WHERE published_at IS NULL AND NOT dead_letter AND next_attempt_at<=now() ORDER BY created_at LIMIT 25 FOR UPDATE SKIP LOCKED`)).rows;
  for(const e of rows){try{
   await client.channels.get(`org:${e.organization_id}`).publish({id:String(e.id),name:String(e.type),data:{id:e.id,entityId:e.entity_id,version:e.entity_version,type:e.type}});
   await tx.execute(sql`UPDATE outbox_events SET published_at=now(),attempts=attempts+1 WHERE id=${e.id}`);published++;
  }catch{const attempts=Number(e.attempts)+1;await tx.execute(sql`UPDATE outbox_events SET attempts=${attempts},dead_letter=${attempts>=8},next_attempt_at=now()+${Math.min(3600,2**attempts*10)}*interval '1 second' WHERE id=${e.id}`);}}
 });return {published};
}
