import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { request, RequestError } from './client';
type Scope={userId:string;membershipId:string};
let connection:Promise<SQLite.SQLiteDatabase>|undefined;
async function database(){
 if(!connection)connection=(async()=>{
  let key=await SecureStore.getItemAsync('ecogrowth.database-key');if(!key){const bytes=await Crypto.getRandomBytesAsync(32);key=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');await SecureStore.setItemAsync('ecogrowth.database-key',key);}
  if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid local database key.');
  const db=await SQLite.openDatabaseAsync('ecogrowth-offline.db');await db.execAsync(`PRAGMA key = "x'${key}'"; PRAGMA journal_mode = WAL;`);
  await db.execAsync('CREATE TABLE IF NOT EXISTS job_cache (scope TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(scope,id)); CREATE TABLE IF NOT EXISTS mutation_queue (id TEXT PRIMARY KEY, scope TEXT NOT NULL, command TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL);');
  await db.runAsync('DELETE FROM job_cache WHERE expires_at < ?',Date.now());
  await db.runAsync("UPDATE mutation_queue SET state='Queued',message='Interrupted sync; safe to retry with original key.' WHERE state='Syncing'");return db;
 })();return connection;
}
const scopeKey=(s:Scope)=>s.userId+':'+s.membershipId;
export type Queued={id:string;command:string;payload:string;state:'Draft'|'Queued'|'Syncing'|'Confirmed'|'Needs Review';message:string;created_at:number};
export async function cacheJobs(scope:Scope,jobs:any[]){const db=await database();await db.withExclusiveTransactionAsync(async tx=>{await tx.runAsync('DELETE FROM job_cache WHERE scope=?',scopeKey(scope));for(const job of jobs.slice(0,50))await tx.runAsync('INSERT INTO job_cache(scope,id,payload,expires_at) VALUES(?,?,?,?)',scopeKey(scope),job.id,JSON.stringify(job),Date.now()+24*3600000);});}
export async function cachedJobs(scope:Scope){const db=await database();const rows=await db.getAllAsync<{payload:string}>('SELECT payload FROM job_cache WHERE scope=? AND expires_at>? LIMIT 50',scopeKey(scope),Date.now());return rows.map(r=>({...JSON.parse(r.payload),_offline:true}));}
export async function enqueue(scope:Scope,command:string,payload:unknown,draft=false,id=Crypto.randomUUID()){if(command!=='collect')throw new Error('Only collection drafts are supported offline.');const db=await database();await db.runAsync('INSERT INTO mutation_queue(id,scope,command,payload,state,message,created_at) VALUES(?,?,?,?,?,?,?)',id,scopeKey(scope),command,JSON.stringify(payload),draft?'Draft':'Queued','Not server-confirmed.',Date.now());return id;}
export async function queue(scope:Scope){const db=await database();return db.getAllAsync<Queued>('SELECT * FROM mutation_queue WHERE scope=? ORDER BY created_at DESC LIMIT 100',scopeKey(scope));}
let syncRunning=false;
export async function sync(scope:Scope){if(syncRunning)return;syncRunning=true;try{const db=await database();const rows=await queue(scope);for(const row of rows.filter(r=>r.state==='Queued')){await db.runAsync("UPDATE mutation_queue SET state='Syncing' WHERE id=? AND scope=?",row.id,scopeKey(scope));try{await request('/commands/'+row.command,scope.membershipId,JSON.parse(row.payload),row.id);await db.runAsync("UPDATE mutation_queue SET state='Confirmed',message='Accepted by server. Refresh authoritative records.' WHERE id=? AND scope=?",row.id,scopeKey(scope));}catch(error){const review=error instanceof RequestError&&[401,403,404,409,422].includes(error.status);await db.runAsync('UPDATE mutation_queue SET state=?,message=? WHERE id=? AND scope=?',review?'Needs Review':'Queued',(error as Error).message,row.id,scopeKey(scope));if(!review)break;}}}finally{syncRunning=false;}}
export async function releaseDraft(scope:Scope,id:string){const db=await database();await db.runAsync("UPDATE mutation_queue SET state='Queued' WHERE scope=? AND id=? AND state='Draft'",scopeKey(scope),id);}
export async function clearLocalUser(userId:string){const db=await database();await db.withExclusiveTransactionAsync(async tx=>{await tx.runAsync('DELETE FROM job_cache WHERE scope LIKE ?',userId+':%');await tx.runAsync('DELETE FROM mutation_queue WHERE scope LIKE ?',userId+':%');});}
