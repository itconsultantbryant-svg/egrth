import 'dotenv/config';
import { pg, drizzle, type Pool } from '@ecogrowth/db';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

// Never reset the developer's pilot. Migrations/seeds run in an owned, disposable PostgreSQL database.
export async function disposablePostgres() {
  const source = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
  if (process.env.DEMO_MODE !== 'true' || process.env.NODE_ENV === 'production' ||
      source.hostname !== '127.0.0.1' || source.port !== '55432') {
    throw new Error('Disposable tests require the explicitly isolated local PostgreSQL demo on 127.0.0.1:55432.');
  }
  const name = `ecogrowth_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: source.toString(), max: 1 });
  let created = false;
  let pool: Pool | undefined;
  async function cleanup() {
    await pool?.end();
    if (created) {
      // Identifier is generated locally, not a user input; deletion is limited to this test's own database.
      if (!/^ecogrowth_test_[a-f0-9]{32}$/.test(name)) throw new Error('Unsafe disposable database identifier.');
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
    await admin.end();
  }
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const url = new URL(source);
    url.pathname = '/' + name;
    pool = new pg.Pool({ connectionString: url.toString(), max: 5, connectionTimeoutMillis: 10000 });
    for (const migration of ['0001_pilot.sql', '0002_hardening.sql', '0003_auth_compatibility.sql', '0004_scheduling.sql', '0005_schedule_evidence.sql', '0006_membership_metadata.sql']) {
      await pool.query(await readFile(new URL('../../packages/db/migrations/' + migration, import.meta.url), 'utf8'));
    }
    await promisify(execFile)(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'packages/db/src/seed.ts'], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      env: { ...process.env, DATABASE_URL: url.toString(), MIGRATION_DATABASE_URL: url.toString(), DEMO_MODE: 'true' },
      timeout: 90000,
      maxBuffer: 1_000_000
    });
    return { db: drizzle(pool), pool, url: url.toString(), cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
