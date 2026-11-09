import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql, pool as defaultPool } from '@ecogrowth/db';
import { schedulingSchemas } from '@ecogrowth/contracts';
import { command } from '../apps/api/src/commands';
import { generateRollingJobs } from '../apps/api/src/scheduling';
import type { Actor } from '../apps/api/src/access';
import { disposablePostgres } from './helpers/disposable-postgres';

let fixture: Awaited<ReturnType<typeof disposablePostgres>>;
let operations: Actor, collector: Actor, customer: Actor, receiver: Actor, facilityManager: Actor;
const run = (executor: any, name: string, data: unknown, actor = operations, key = randomUUID()) =>
  command(actor, name, data, key, executor) as Promise<any>;

async function rolledBack(test: (tx: any) => Promise<void>) {
  const rollback = new Error('TEST_ROLLBACK');
  try {
    await fixture.db.transaction(async tx => { await test(tx); throw rollback; });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function scheduleFixture(tx: any, options: { timezone?: string; days?: number[]; start?: string; end?: string } = {}) {
  const row = (await tx.execute(sql`
    SELECT sr.*,sub.id AS subscription_id,s.service_area_id
    FROM schedule_rules sr JOIN sites s ON s.id=sr.site_id JOIN subscriptions sub ON sub.id=sr.subscription_id
    WHERE s.organization_id=${customer.organizationId} LIMIT 1`)).rows[0];
  const timezone = options.timezone || 'Africa/Monrovia';
  const days = options.days || [1, 4];
  await tx.execute(sql`UPDATE schedule_rules SET paused=true`);
  await tx.execute(sql`UPDATE sites SET timezone=${timezone},operating_days=ARRAY[0,1,2,3,4,5,6] WHERE id=${row.site_id}`);
  await tx.execute(sql`UPDATE subscriptions SET starts_on='2030-01-01',ends_on=NULL,version=1 WHERE id=${row.subscription_id}`);
  const schedule=(await tx.execute(sql`INSERT INTO schedule_rules(subscription_id,site_id,weekdays,timezone,service_window) VALUES(${row.subscription_id},${row.site_id},${sql.param(days)}::integer[],${timezone},'Isolated calendar test window') RETURNING *`)).rows[0];
  await tx.execute(sql`INSERT INTO schedule_versions(schedule_id,version,timezone,weekdays,window_start_local,window_end_local,effective_from,reason) VALUES(${schedule.id},1,${timezone},${sql.param(days)}::integer[],${options.start || '08:00'},${options.end || '12:00'},'2030-01-01','Isolated test definition')`);
  return { ...row, ...schedule, timezone, weekdays: days, version: 1 };
}

describe('versioned calendars and physical scheduling in disposable PostgreSQL', () => {
  beforeAll(async () => {
    fixture = await disposablePostgres();
    async function actor(email: string): Promise<Actor> {
      const m = (await fixture.db.execute(sql`SELECT m.*,o.kind FROM memberships m JOIN organizations o ON o.id=m.organization_id JOIN "user" u ON u.id=m.user_id WHERE u.email=${email} LIMIT 1`)).rows[0] as any;
      return { userId: m.user_id, organizationId: m.organization_id, membershipId: m.id, role: m.role, global: m.kind === 'PLATFORM' };
    }
    operations = await actor('operations@demo.ecogrowth.test');
    collector = await actor('collector@demo.ecogrowth.test');
    customer = await actor('customer1@demo.ecogrowth.test');
    receiver = await actor('receiver@demo.ecogrowth.test');
    facilityManager = await actor('facility@demo.ecogrowth.test');
  }, 120000);
  afterAll(async () => { await fixture?.cleanup(); await defaultPool.end(); });

  it('rejects duplicate weekdays and reversed pause dates at the shared contract', () => {
    expect(schedulingSchemas['revise-schedule'].safeParse({ id: randomUUID(), version: 1, effectiveFrom: '2030-01-07', weekdays: [1, 1], reason: 'Approved change' }).success).toBe(false);
    expect(schedulingSchemas['pause-schedule'].safeParse({ id: randomUUID(), version: 1, from: '2030-02-01', to: '2030-01-01', reason: 'Temporary closure' }).success).toBe(false);
  });

  it('snapshots UTC windows from the site timezone, independently of the database session timezone', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx, { timezone: 'Pacific/Auckland' });
    await tx.execute(sql`SET LOCAL TIME ZONE 'America/Los_Angeles'`);
    expect((await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-07' })).generated).toBe(1);
    const job = (await tx.execute(sql`SELECT * FROM job_occurrences WHERE schedule_id=${schedule.id} AND occurrence_date='2030-01-07'`)).rows[0];
    expect(new Date(job.scheduled_start_at).toISOString()).toBe('2030-01-06T19:00:00.000Z');
    expect(new Date(job.scheduled_end_at).toISOString()).toBe('2030-01-06T23:00:00.000Z');
    expect(job.schedule_timezone).toBe('Pacific/Auckland');
    expect((await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-07' })).generated).toBe(0);
  }));

  it('supports overnight windows without interpreting the next local date as UTC midnight', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx, { timezone: 'Asia/Kolkata', start: '22:00', end: '02:00' });
    await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-07' });
    const job = (await tx.execute(sql`SELECT * FROM job_occurrences WHERE schedule_id=${schedule.id} AND occurrence_date='2030-01-07'`)).rows[0];
    expect(new Date(job.scheduled_start_at).toISOString()).toBe('2030-01-07T16:30:00.000Z');
    expect(new Date(job.scheduled_end_at).toISOString()).toBe('2030-01-07T20:30:00.000Z');
  }));

  it('requires review for a nonexistent DST window instead of silently shifting it', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx, { timezone: 'America/New_York', days: [0, 4], start: '02:30', end: '04:00' });
    await expect(run(tx, 'generate-jobs', { from: '2030-03-10', to: '2030-03-10' })).rejects.toMatchObject({ code: 'DST_WINDOW_REVIEW' });
    expect((await tx.execute(sql`SELECT id FROM job_occurrences WHERE schedule_id=${schedule.id} AND occurrence_date='2030-03-10'`)).rows).toHaveLength(0);
  }));

  it('uses the documented standard-time offset for an overlapping DST wall time', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx, { timezone: 'America/New_York', days: [0, 4], start: '01:30', end: '03:00' });
    await run(tx, 'generate-jobs', { from: '2030-11-03', to: '2030-11-03' });
    const job = (await tx.execute(sql`SELECT * FROM job_occurrences WHERE schedule_id=${schedule.id} AND occurrence_date='2030-11-03'`)).rows[0];
    expect(new Date(job.scheduled_start_at).toISOString()).toBe('2030-11-03T06:30:00.000Z');
  }));

  it('pauses generated dates, does not regenerate cancelled work on retry, and requires explicit restoration', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx);
    await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-10' });
    let job = (await tx.execute(sql`SELECT * FROM job_occurrences WHERE schedule_id=${schedule.id} AND occurrence_date='2030-01-07'`)).rows[0];
    const paused = await run(tx, 'pause-schedule', { id: schedule.id, version: 1, from: '2030-01-07', to: '2030-01-10', reason: 'Site closed for maintenance.' });
    expect(paused.cancelledJobs).toBe(2);
    await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-10' });
    job = (await tx.execute(sql`SELECT * FROM job_occurrences WHERE id=${job.id}`)).rows[0];
    expect(job.state).toBe('CANCELLED');
    await expect(run(tx, 'restore-cancelled-job', { id: job.id, version: job.version, reason: 'Attempt while paused' })).rejects.toMatchObject({ code: 'SERVICE_CALENDAR_BLOCKED' });
    await run(tx, 'resume-schedule', { id: schedule.id, version: 2, pauseId: paused.pause.id, resumeOn: '2030-01-07', reason: 'Site reopens after approved review.' });
    expect((await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-10' })).generated).toBe(0);
    const restored = await run(tx, 'restore-cancelled-job', { id: job.id, version: job.version, reason: 'Explicit operational restoration approved.' });
    expect(restored.state).toBe('SCHEDULED');
    expect(restored.collector_id).toBeNull();
    expect(restored.billing_occurrence_key).toBe(job.billing_occurrence_key);
  }));

  it('blocks an area closure while a collector is in flight and rolls the entire change back', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx);
    await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-07' });
    await tx.execute(sql`UPDATE job_occurrences SET state='EN_ROUTE',collector_id=${collector.userId} WHERE schedule_id=${schedule.id} AND occurrence_date='2030-01-07'`);
    await expect(run(tx, 'add-service-holiday', { id: schedule.id, version: 1, date: '2030-01-07', reason: 'Approved area closure requested.' })).rejects.toMatchObject({ code: 'IN_FLIGHT_JOBS' });
    expect((await tx.execute(sql`SELECT id FROM service_area_holidays WHERE service_area_id=${schedule.service_area_id} AND local_date='2030-01-07'`)).rows).toHaveLength(0);
  }));

  it('applies area closures to future generation and removes them only explicitly', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx);
    const holiday = await run(tx, 'add-service-holiday', { id: schedule.id, version: 1, date: '2030-01-07', reason: 'Approved local service closure.' });
    expect((await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-07' })).generated).toBe(0);
    await run(tx, 'remove-service-holiday', { id: schedule.id, version: 2, holidayId: holiday.holiday.id, reason: 'Operations approved reopening.' });
    expect((await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-07' })).generated).toBe(1);
  }));

  it('honours inclusive subscription end dates and preserves all prior physical/financial evidence', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx);
    await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-10' });
    const result = await run(tx, 'end-subscription', { id: schedule.subscription_id, version: 1, endsOn: '2030-01-07', reason: 'Customer termination approved.' });
    expect(result.cancelledJobs).toBe(1);
    expect((await run(tx, 'generate-jobs', { from: '2030-01-10', to: '2030-01-14' })).generated).toBe(0);
    const jobs = (await tx.execute(sql`SELECT occurrence_date,state FROM job_occurrences WHERE schedule_id=${schedule.id} AND occurrence_date>='2030-01-01' ORDER BY occurrence_date`)).rows;
    expect(jobs.map((j: any) => j.state)).toEqual(['SCHEDULED', 'CANCELLED']);
    expect((await tx.execute(sql`SELECT count(*)::integer n FROM invoices`)).rows[0].n).toBe(5);
    expect((await tx.execute(sql`SELECT count(*)::integer n FROM collections`)).rows[0].n).toBe(4);
  }));

  it('versions weekday changes without duplicating an already generated service date', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx);
    const changed = await run(tx, 'revise-schedule', { id: schedule.id, version: 1, effectiveFrom: '2030-01-08', weekdays: [2, 5], reason: 'Approved weekday adjustment; price unchanged.' });
    expect(changed.version).toBe(2);
    await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-11' });
    const jobs = (await tx.execute(sql`SELECT occurrence_date,schedule_version FROM job_occurrences WHERE schedule_id=${schedule.id} AND occurrence_date>='2030-01-01' ORDER BY occurrence_date`)).rows;
    expect(jobs.map((j: any) => [j.occurrence_date, j.schedule_version])).toEqual([['2030-01-07', 1], ['2030-01-08', 2], ['2030-01-11', 2]]);
    expect((await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-11' })).generated).toBe(0);
    await expect(run(tx, 'revise-schedule', { id: schedule.id, version: 2, effectiveFrom: '2030-01-09', weekdays: [1, 4], reason: 'Cannot rewrite generated dates.' })).rejects.toMatchObject({ code: 'GENERATED_JOBS_EXIST' });
  }));

  it('rejects changed agreed frequency and customer calendar mutation', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx);
    await expect(run(tx, 'revise-schedule', { id: schedule.id, version: 1, effectiveFrom: '2030-01-07', weekdays: [1], reason: 'Unapproved frequency reduction.' })).rejects.toMatchObject({ code: 'AGREED_FREQUENCY' });
    await expect(run(tx, 'pause-schedule', { id: schedule.id, version: 1, from: '2030-01-07', to: '2030-01-10', reason: 'Customer attempting direct override.' }, customer)).rejects.toMatchObject({ status: 403 });
  }));

  it('database refuses to rewrite a versioned schedule definition', () => rolledBack(async tx => {
    const schedule=await scheduleFixture(tx);
    await expect(tx.transaction(async (nested: any)=>{
      await nested.execute(sql`UPDATE schedule_versions SET weekdays=ARRAY[2,5] WHERE schedule_id=${schedule.id} AND version=1`);
    })).rejects.toThrow();
    expect((await tx.execute(sql`SELECT weekdays FROM schedule_versions WHERE schedule_id=${schedule.id} AND version=1`)).rows[0].weekdays).toEqual([1,4]);
  }));

  it('creates one auditable replacement with the same billing key, preserving missed history', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx);
    await run(tx, 'generate-jobs', { from: '2030-01-07', to: '2030-01-07' });
    let job = (await tx.execute(sql`UPDATE job_occurrences SET state='MISSED',reason='Original missed-service explanation' WHERE schedule_id=${schedule.id} AND occurrence_date='2030-01-07' RETURNING *`)).rows[0];
    const key = randomUUID(), body = { id: job.id, version: job.version, date: '2030-01-08', reason: 'Approved recovery of missed service.' };
    const replacement = await run(tx, 'reschedule-job', body, operations, key);
    const duplicate = await run(tx, 'reschedule-job', body, operations, key);
    expect(duplicate.id).toBe(replacement.id);
    expect(replacement.billing_occurrence_key).toBe(job.billing_occurrence_key);
    expect(replacement.rescheduled_from_id).toBe(job.id);
    expect(replacement.collector_id).toBeNull();
    job = (await tx.execute(sql`SELECT * FROM job_occurrences WHERE id=${job.id}`)).rows[0];
    expect(job.state).toBe('MISSED');
    expect(job.reason).toBe('Original missed-service explanation');
    await expect(run(tx, 'reschedule-job', { ...body, version: job.version, date: '2030-01-09' })).rejects.toMatchObject({ code: 'REPLACEMENT_EXISTS' });
    expect((await tx.execute(sql`SELECT id FROM audit_events WHERE target_id=${job.id} AND action='job-replaced'`)).rows).toHaveLength(1);
  }));

  it('does not permit the generic state endpoint to bypass linked rescheduling', () => rolledBack(async tx => {
    const job = (await tx.execute(sql`SELECT * FROM job_occurrences WHERE state='MISSED' LIMIT 1`)).rows[0];
    await expect(run(tx, 'transition-job', { id: job.id, version: job.version, state: 'RESCHEDULED', reason: 'Attempted unlinked date change.' })).rejects.toMatchObject({ code: 'COMMAND_REQUIRED' });
  }));

  it('scheduled rolling generation uses each timezone’s local today and is safe to retry', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx, { timezone: 'Pacific/Auckland', days: [1, 4] });
    // Sunday UTC is already Monday in Auckland. A UTC-only scheduler would miss this date.
    const now = new Date('2030-01-06T19:30:00.000Z');
    const first = await generateRollingJobs(tx, operations, 1, now);
    const second = await generateRollingJobs(tx, operations, 1, now);
    expect(first.generated).toBe(1);
    expect(second.generated).toBe(0);
    expect((await tx.execute(sql`SELECT occurrence_date FROM job_occurrences WHERE schedule_id=${schedule.id} AND occurrence_date>='2030-01-01'`)).rows.map((j: any) => j.occurrence_date)).toEqual(['2030-01-07']);
  }));

  it('scheduled expiry changes service status once without erasing physical or invoice history', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx);
    await tx.execute(sql`UPDATE subscriptions SET ends_on='2030-01-07' WHERE id=${schedule.subscription_id}`);
    expect((await generateRollingJobs(tx, operations, 1, new Date('2030-01-08T12:00:00Z'))).expiredSubscriptions).toBe(1);
    expect((await generateRollingJobs(tx, operations, 1, new Date('2030-01-08T12:00:00Z'))).expiredSubscriptions).toBe(0);
    expect((await tx.execute(sql`SELECT status FROM subscriptions WHERE id=${schedule.subscription_id}`)).rows[0].status).toBe('ENDED');
    expect((await tx.execute(sql`SELECT status FROM sites WHERE id=${schedule.site_id}`)).rows[0].status).toBe('PAUSED');
    expect((await tx.execute(sql`SELECT id FROM audit_events WHERE target_id=${schedule.subscription_id} AND action='subscription-ended'`)).rows).toHaveLength(1);
    expect((await tx.execute(sql`SELECT count(*)::integer n FROM collections`)).rows[0].n).toBe(4);
    expect((await tx.execute(sql`SELECT count(*)::integer n FROM invoices`)).rows[0].n).toBe(5);
  }));

  it('rejects a weekday revision onto a day the site does not operate', () => rolledBack(async tx => {
    const schedule = await scheduleFixture(tx);
    await tx.execute(sql`UPDATE sites SET operating_days=ARRAY[1,4] WHERE id=${schedule.site_id}`);
    await expect(run(tx, 'revise-schedule', { id: schedule.id, version: 1, effectiveFrom: '2030-01-07', weekdays: [2,5], reason: 'Invalid non-operating days.' })).rejects.toMatchObject({ code: 'AGREED_FREQUENCY' });
  }));

  it('serializes simultaneous generation and positive concurrent source splits in separate connections', async () => {
    // This is committed only in the disposable database and removed with that entire owned DB.
    let schedule: any;
    await fixture.db.transaction(async tx => { schedule = await scheduleFixture(tx); });
    const generated = await Promise.all([run(fixture.db, 'generate-jobs', { from: '2030-01-07', to: '2030-01-07' }), run(fixture.db, 'generate-jobs', { from: '2030-01-07', to: '2030-01-07' })]);
    expect(generated.map(r => r.generated).sort()).toEqual([0, 1]);
    const source = (await fixture.db.execute(sql`SELECT j.*,r.id AS assignment_route,r.partner_organization_id AS partner,r.facility_id AS facility FROM job_occurrences j CROSS JOIN routes r WHERE j.schedule_id=${schedule.id} AND j.occurrence_date='2030-01-07' LIMIT 1`)).rows[0] as any;
    await fixture.db.execute(sql`UPDATE job_occurrences SET state='COLLECTED',collector_id=${collector.userId},partner_organization_id=${source.partner},facility_id=${source.facility},route_id=${source.assignment_route} WHERE id=${source.id}`);
    const collection = (await fixture.db.execute(sql`INSERT INTO collections(job_id,collector_id,gross_grams,tare_grams,net_grams,measurement,method,material,contamination,occurred_at) VALUES(${source.id},${collector.userId},12000,2000,10000,'MEASURED','Isolated automated test fixture','FOOD_SCRAPS','Test fixture',now()) RETURNING *`)).rows[0];
    const split = (grams: number) => run(fixture.db, 'dispatch', { facilityId: source.facility, allocations: [{ collectionId: collection.id, grams }] }, collector);
    const accepted = await Promise.all([split(6000), split(4000)]);
    expect(new Set(accepted.map(m => m.id)).size).toBe(2);
    expect(Number((await fixture.db.execute(sql`SELECT sum(grams) total FROM delivery_allocations WHERE collection_id=${collection.id}`)).rows[0].total)).toBe(10000);
    await expect(split(1)).rejects.toMatchObject({ code: 'OVER_ALLOCATION' });
  });

  it('two independent facility users cannot record or allocate receiving twice', async () => {
    let schedule: any;
    await fixture.db.transaction(async tx => { schedule = await scheduleFixture(tx); });
    await run(fixture.db, 'generate-jobs', { from: '2030-01-14', to: '2030-01-14' });
    const route=(await fixture.db.execute(sql`SELECT * FROM routes LIMIT 1`)).rows[0] as any;
    const job=(await fixture.db.execute(sql`UPDATE job_occurrences SET state='COLLECTED',collector_id=${collector.userId},route_id=${route.id},partner_organization_id=${route.partner_organization_id},facility_id=${route.facility_id} WHERE schedule_id=${schedule.id} AND occurrence_date='2030-01-14' RETURNING *`)).rows[0];
    const collection=(await fixture.db.execute(sql`INSERT INTO collections(job_id,collector_id,gross_grams,tare_grams,net_grams,measurement,method,material,contamination,occurred_at) VALUES(${job.id},${collector.userId},8000,2000,6000,'MEASURED','Independent concurrency test fixture','FOOD_SCRAPS','Test fixture',now()) RETURNING *`)).rows[0];
    const manifest=await run(fixture.db,'dispatch',{facilityId:route.facility_id,allocations:[{collectionId:collection.id,grams:6000}]},collector);
    const delivered=await run(fixture.db,'deliver',{id:manifest.id,version:manifest.version},collector);
    const body={manifestId:delivered.id,version:delivered.version,receivedGrams:5500,acceptedGrams:5000,rejectedGrams:500,method:'Independent fixture receiving scale',proofReference:'ISOLATED-CONCURRENT-RECEIVING-FIXTURE'};
    const results=await Promise.allSettled([run(fixture.db,'receive',body,receiver),run(fixture.db,'receive',body,facilityManager)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected'&&r.reason.code==='VERSION_CONFLICT')).toHaveLength(1);
    const records=(await fixture.db.execute(sql`SELECT * FROM receiving_records WHERE manifest_id=${manifest.id}`)).rows;
    expect(records).toHaveLength(1);
    const totals=(await fixture.db.execute(sql`SELECT sum(accepted_grams) accepted,sum(rejected_grams) rejected FROM receiving_allocations WHERE receiving_id=${records[0].id}`)).rows[0];
    expect(Number(totals.accepted)).toBe(5000);expect(Number(totals.rejected)).toBe(500);
    expect(Number((await fixture.db.execute(sql`SELECT net_grams FROM collections WHERE id=${collection.id}`)).rows[0].net_grams)).toBe(6000);
  });
});
