import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { pg } from '../packages/db/src/index.js';
// One-time reconciliation of the original schema-only preview clone. Never copies business data.
const prod=parse(await readFile('.local/deployment/production.env'));
const preview=parse(await readFile('.local/deployment/preview.env'));
if(!new URL(preview.MIGRATION_DATABASE_URL).hostname.startsWith('ep-dawn-recipe-b9gp3q2a.'))throw new Error('Unexpected preview endpoint.');
const a=new pg.Client({connectionString:prod.MIGRATION_DATABASE_URL});
const b=new pg.Client({connectionString:preview.MIGRATION_DATABASE_URL});
try{
 await a.connect();await b.connect();
 const existing=await b.query('SELECT name FROM schema_migrations');
 if(existing.rowCount)throw new Error('Preview already has a ledger; refusing implicit rebaseline.');
 const signature=`SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) default_value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`;
 if(JSON.stringify((await a.query(signature)).rows)!==JSON.stringify((await b.query(signature)).rows))throw new Error('Production and preview table definitions differ; manual baseline review required.');
 for(const query of [
  "SELECT conrelid::regclass::text relation,conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2",
  "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
  "SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY 1,2"
 ]){
  const normalize=(row:Record<string,unknown>)=>row.conname==='schedule_versions_weekdays_check'
   ?{...row,definition:String(row.definition).replace(/[()]/g,'')}:row;
  // Reviewed dump/restore normalization: identical three AND predicates in this CHECK
  // are grouped differently by pg_get_constraintdef. No other expression is normalized.
  const left=(await a.query(query)).rows.map(normalize),right=(await b.query(query)).rows.map(normalize);
  if(JSON.stringify(left)!==JSON.stringify(right)){
   console.log(JSON.stringify({productionOnly:left.filter(row=>!right.some(other=>JSON.stringify(other)===JSON.stringify(row))),previewOnly:right.filter(row=>!left.some(other=>JSON.stringify(other)===JSON.stringify(row)))},null,2));
   throw new Error('Constraint/index/trigger signature differs; manual review required.');
  }
 }
 const migrations=await a.query('SELECT name,hash FROM schema_migrations ORDER BY name');
 if(migrations.rowCount!==6)throw new Error('Expected original six-migration schema before public-form migration.');
 await b.query('BEGIN');
 for(const row of migrations.rows)await b.query('INSERT INTO schema_migrations(name,hash) VALUES($1,$2)',[row.name,row.hash]);
 await b.query('COMMIT');
 console.log('Schema-only preview verified against production: columns, constraints, indexes and triggers. Six checksummed migration metadata rows baselined; no business data copied.');
}finally{await a.end();await b.end();}
