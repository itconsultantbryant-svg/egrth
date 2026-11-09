import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
export { pg, drizzle };
export type { Pool } from 'pg';
export { sql } from 'drizzle-orm';
export const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,allowExitOnIdle:true});
export const db = drizzle(pool);
export type Database = typeof db;
