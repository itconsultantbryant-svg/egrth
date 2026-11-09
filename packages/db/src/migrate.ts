import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const pool = new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL});
const client=await pool.connect();
try {
 await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock(hashtext('ecogrowth-migrations'))");
 await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
 for(const name of ['0001_pilot.sql','0002_hardening.sql','0003_auth_compatibility.sql','0004_scheduling.sql','0005_schedule_evidence.sql','0006_membership_metadata.sql','0007_public_enquiries.sql','0008_user_administration.sql']){
  const content=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8');const hash=createHash('sha256').update(content).digest('hex');
  const existing=await client.query('SELECT hash FROM schema_migrations WHERE name=$1',[name]);
  if(existing.rowCount){if(existing.rows[0].hash!==hash)throw new Error('Applied migration changed: '+name);continue;}
  await client.query(content);await client.query('INSERT INTO schema_migrations(name,hash) VALUES($1,$2)',[name,hash]);console.log('Applied',name);
 }
 await client.query('COMMIT');
} catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
