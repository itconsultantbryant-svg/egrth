import 'dotenv/config';
import { pg } from '../packages/db/src/index.js';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const file=process.env.DOTENV_CONFIG_PATH;
if(!file||!file.startsWith('.local/deployment/'))throw new Error('Explicit private deployment env required.');
const pool=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
try{
 const password=randomBytes(36).toString('hex');
 const existing=await pool.query("SELECT 1 FROM pg_roles WHERE rolname='ecogrowth_app'");
 if(existing.rowCount)throw new Error('Runtime role already exists; refusing implicit credential rotation.');
 await pool.query(`CREATE ROLE ecogrowth_app LOGIN PASSWORD '${password}'`);
 await pool.query('GRANT CONNECT ON DATABASE ecogrowth TO ecogrowth_app');
 await pool.query('GRANT USAGE ON SCHEMA public TO ecogrowth_app');
 await pool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ecogrowth_app');
 await pool.query('REVOKE ALL ON schema_migrations FROM ecogrowth_app');
 await pool.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ecogrowth_app');
 await pool.query('ALTER DEFAULT PRIVILEGES FOR ROLE ecogrowth_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ecogrowth_app');
 await pool.query('ALTER DEFAULT PRIVILEGES FOR ROLE ecogrowth_owner IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ecogrowth_app');
 const url=new URL(process.env.DATABASE_URL!);url.username='ecogrowth_app';url.password=password;url.searchParams.set('sslmode','verify-full');
 const content=await readFile(file,'utf8');
 await writeFile(file,content.replace(/^DATABASE_URL=.*$/m,'DATABASE_URL='+url),{mode:0o600});
 console.log('Runtime role provisioned without DDL privileges; private env updated.');
}finally{await pool.end();}
