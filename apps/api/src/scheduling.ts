import { sql } from '@ecogrowth/db';
import type { SQL } from 'drizzle-orm';
import { ApiError, event, object, permit, type Actor } from './access.js';

type Tx = { execute: (query: SQL) => Promise<any> };
type RecordRow = Record<string, any>;

export async function schedulingLock(tx: Tx) {
  // A deliberately coarse pilot lock serializes calendar edits, generation and rescheduling.
  // Collection evidence uses its job row lock and is never rewritten by calendar edits.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ecogrowth-scheduling'))`);
}

function operations(actor: Actor) {
  permit(actor, 'schedules', 'write');
  if (!actor.global || !['PLATFORM_ADMIN', 'OPERATIONS_MANAGER'].includes(actor.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'Platform operations must approve calendar changes.');
  }
}

function currentVersion(row: RecordRow, version: number) {
  if (Number(row.version) !== version) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'The record changed. Refresh before trying again.');
  }
}

async function localToday(tx: Tx, timezone: string): Promise<string> {
  const row = (await tx.execute(sql`SELECT to_char(now() AT TIME ZONE ${timezone},'YYYY-MM-DD') AS today`)).rows[0];
  return row.today;
}

async function notInPast(tx: Tx, date: string, timezone: string) {
  if (date < await localToday(tx, timezone)) {
    throw new ApiError(422, 'PAST_SERVICE_DATE', 'Changes must not retroactively rewrite a past local service date.');
  }
}

async function bumpSchedule(tx: Tx, id: string) {
  return (await tx.execute(sql`UPDATE schedule_rules SET version=version+1 WHERE id=${id} RETURNING *`)).rows[0];
}

async function cancelPending(tx: Tx, actor: Actor, condition: SQL, reason: string) {
  // Lock pending AND in-flight rows before deciding. Checking only in-flight rows leaves a race
  // where a collector starts an unlocked pending job between the check and cancellation.
  const affected = (await tx.execute(sql`SELECT j.id,j.state FROM job_occurrences j WHERE (${condition}) AND j.state IN ('SCHEDULED','ASSIGNED','EN_ROUTE','ARRIVED') ORDER BY j.id FOR UPDATE`)).rows;
  if (affected.some((job: RecordRow) => ['EN_ROUTE', 'ARRIVED'].includes(job.state))) {
    throw new ApiError(409, 'IN_FLIGHT_JOBS', 'An affected job is already en route or arrived. Resolve the operational handover before changing its calendar.');
  }
  const cancelled = (await tx.execute(sql`UPDATE job_occurrences j SET state='CANCELLED',reason=${reason},version=version+1,updated_at=now() WHERE (${condition}) AND j.state IN ('SCHEDULED','ASSIGNED') RETURNING j.id,j.version`)).rows;
  for (const job of cancelled) {
    await event(tx, actor, 'job-calendar-cancelled', job.id, job.version, reason, { state: 'CANCELLED' });
  }
  return cancelled.length;
}

export async function windowFor(tx: Tx, definition: RecordRow, date: string) {
  if (!definition.window_start_local || !definition.window_end_local) {
    throw new ApiError(409, 'SERVICE_WINDOW_UNCONFIGURED', 'The accepted terms need an explicit local service window before jobs can be generated.');
  }
  const row = (await tx.execute(sql`
    WITH wall AS (
      SELECT ${date}::date+${definition.window_start_local}::time AS start_wall,
        ${date}::date+(CASE WHEN ${definition.window_end_local}::time<${definition.window_start_local}::time THEN 1 ELSE 0 END)+${definition.window_end_local}::time AS end_wall
    ) SELECT start_wall AT TIME ZONE ${definition.timezone} AS start_at,
      end_wall AT TIME ZONE ${definition.timezone} AS end_at,
      ((start_wall AT TIME ZONE ${definition.timezone}) AT TIME ZONE ${definition.timezone})=start_wall
        AND ((end_wall AT TIME ZONE ${definition.timezone}) AT TIME ZONE ${definition.timezone})=end_wall AS valid_wall_time
    FROM wall`)).rows[0];
  if (!row.valid_wall_time || new Date(row.end_at) <= new Date(row.start_at)) {
    throw new ApiError(409, 'DST_WINDOW_REVIEW', 'This local service window does not exist or is invalid on the selected date. Review the service time instead of silently shifting it.');
  }
  return row;
}

export async function generateJobs(tx: Tx, actor: Actor, from: string, to: string, timezone?: string) {
  operations(actor);
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days < 0 || days > 31) throw new ApiError(422, 'DATE_RANGE', 'Generate at most 32 local service dates.');
  await schedulingLock(tx);
  const candidates = (await tx.execute(sql`
    SELECT sr.id AS schedule_id,sv.*,s.id AS site_id,s.organization_id,s.expected_grams,
      to_char(d.local_date,'YYYY-MM-DD') AS local_date
    FROM schedule_rules sr JOIN schedule_versions sv ON sv.schedule_id=sr.id
    JOIN subscriptions sub ON sub.id=sr.subscription_id JOIN sites s ON s.id=sr.site_id
    CROSS JOIN generate_series(0,${days}::integer) n
    CROSS JOIN LATERAL (SELECT ${from}::date+n AS local_date) d
    WHERE NOT sr.paused AND sub.status='ACTIVE' AND s.status='ACTIVE'
      AND (${timezone || null}::text IS NULL OR sv.timezone=${timezone || null})
      AND d.local_date>=sub.starts_on AND (sub.ends_on IS NULL OR d.local_date<=sub.ends_on)
      AND d.local_date>=sv.effective_from AND (sv.effective_until IS NULL OR d.local_date<=sv.effective_until)
      AND extract(dow FROM d.local_date)::integer=ANY(sv.weekdays)
      AND NOT EXISTS(SELECT 1 FROM schedule_pauses p WHERE p.schedule_id=sr.id AND p.status='ACTIVE' AND d.local_date BETWEEN p.starts_on AND p.ends_on)
      AND NOT EXISTS(SELECT 1 FROM service_area_holidays h WHERE h.service_area_id=s.service_area_id AND h.active AND h.local_date=d.local_date)
      AND NOT EXISTS(SELECT 1 FROM job_occurrences j WHERE j.schedule_id=sr.id AND j.occurrence_date=d.local_date)
    ORDER BY sr.id,d.local_date`)).rows;
  let generated = 0;
  for (const candidate of candidates) {
    const window = await windowFor(tx, candidate, candidate.local_date);
    const job = (await tx.execute(sql`
      INSERT INTO job_occurrences(schedule_id,schedule_version,occurrence_date,site_id,organization_id,expected_grams,scheduled_start_at,scheduled_end_at,schedule_timezone)
      VALUES(${candidate.schedule_id},${candidate.version},${candidate.local_date},${candidate.site_id},${candidate.organization_id},${candidate.expected_grams},${window.start_at},${window.end_at},${candidate.timezone})
      ON CONFLICT(schedule_id,occurrence_date) DO NOTHING RETURNING id,version`)).rows[0];
    if (job) {
      generated++;
      await event(tx, actor, 'job-generated', job.id, job.version, 'Approved recurring local-date occurrence', { date: candidate.local_date, scheduleVersion: candidate.version, timezone: candidate.timezone });
    }
  }
  return { generated };
}

export async function generateRollingJobs(tx: Tx, actor: Actor, horizonDays = 14, now = new Date()) {
  operations(actor);
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 31) {
    throw new ApiError(422, 'DATE_RANGE', 'Scheduler horizon must be 1–31 days.');
  }
  await schedulingLock(tx);
  const expired = (await tx.execute(sql`
    UPDATE subscriptions sub SET status='ENDED',version=sub.version+1
    FROM sites s WHERE s.id=sub.site_id AND sub.status='ACTIVE' AND sub.ends_on IS NOT NULL
      AND sub.ends_on<(${now.toISOString()}::timestamptz AT TIME ZONE s.timezone)::date
    RETURNING sub.id,sub.site_id,sub.version`)).rows;
  for (const subscription of expired) {
    await tx.execute(sql`UPDATE sites SET status='PAUSED',version=version+1,updated_at=now() WHERE id=${subscription.site_id} AND status='ACTIVE'`);
    await event(tx, actor, 'subscription-ended', subscription.id, subscription.version, 'Inclusive local subscription end date elapsed', { siteId: subscription.site_id });
  }
  const zones = (await tx.execute(sql`
    SELECT DISTINCT sv.timezone,
      to_char(${now.toISOString()}::timestamptz AT TIME ZONE sv.timezone,'YYYY-MM-DD') AS first_date,
      to_char((${now.toISOString()}::timestamptz AT TIME ZONE sv.timezone)::date+${horizonDays}::integer,'YYYY-MM-DD') AS last_date
    FROM schedule_versions sv JOIN schedule_rules sr ON sr.id=sv.schedule_id
    JOIN subscriptions sub ON sub.id=sr.subscription_id
    WHERE sub.status='ACTIVE' AND NOT sr.paused ORDER BY sv.timezone`)).rows;
  let generated = 0;
  for (const zone of zones) {
    generated += (await generateJobs(tx, actor, zone.first_date, zone.last_date, zone.timezone)).generated;
  }
  return { generated, expiredSubscriptions: expired.length, timezones: zones.length, horizonDays, asOf: now.toISOString() };
}

// Used again at assignment and offline capture: cancelled or stale calendar work cannot sneak through.
export async function serviceEligibility(tx: Tx, job: RecordRow) {
  const row = (await tx.execute(sql`
    SELECT sr.*,s.status AS site_status,s.service_area_id,sub.status AS subscription_status,sub.starts_on,sub.ends_on
    FROM schedule_rules sr JOIN sites s ON s.id=sr.site_id JOIN subscriptions sub ON sub.id=sr.subscription_id
    WHERE sr.id=${job.schedule_id}`)).rows[0];
  if (!row || row.site_status !== 'ACTIVE' || row.subscription_status !== 'ACTIVE' || row.paused ||
      String(job.occurrence_date) < String(row.starts_on) || row.ends_on && String(job.occurrence_date) > String(row.ends_on)) {
    throw new ApiError(409, 'SERVICE_NOT_ACTIVE', 'This occurrence is outside active subscription dates or the service is paused. Retain drafts for operational review.');
  }
  const blocked = (await tx.execute(sql`
    SELECT 1 FROM schedule_pauses p WHERE p.schedule_id=${job.schedule_id} AND p.status='ACTIVE' AND ${job.occurrence_date}::date BETWEEN p.starts_on AND p.ends_on
    UNION ALL SELECT 1 FROM service_area_holidays h WHERE h.service_area_id=${row.service_area_id} AND h.active AND h.local_date=${job.occurrence_date}::date LIMIT 1`)).rows[0];
  if (blocked) throw new ApiError(409, 'SERVICE_CALENDAR_BLOCKED', 'A pause or approved service-area closure blocks this date.');
  return row;
}

export async function schedulingCommand(tx: Tx, actor: Actor, name: string, data: any): Promise<any> {
  if (name === 'generate-jobs') return generateJobs(tx, actor, data.from, data.to);
  await schedulingLock(tx);

  if (name === 'reschedule-job' || name === 'restore-cancelled-job') {
    if (!['PLATFORM_ADMIN', 'OPERATIONS_MANAGER', 'PARTNER_DISPATCHER'].includes(actor.role)) {
      throw new ApiError(403, 'FORBIDDEN', 'Dispatch or operations must approve changes to job dates.');
    }
    const job = await object(tx, actor, 'jobs', data.id);
    currentVersion(job, data.version);
    const date = name === 'reschedule-job' ? data.date : job.occurrence_date;
    const schedule = (await tx.execute(sql`SELECT * FROM schedule_rules WHERE id=${job.schedule_id}`)).rows[0];
    await notInPast(tx, date, schedule.timezone);
    await serviceEligibility(tx, { ...job, occurrence_date: date });
    if (name === 'restore-cancelled-job') {
      if (job.state !== 'CANCELLED') throw new ApiError(409, 'INVALID_STATE', 'Only a cancelled job can be explicitly restored.');
      const child = (await tx.execute(sql`SELECT id FROM job_occurrences WHERE rescheduled_from_id=${job.id}`)).rows[0];
      if (child) throw new ApiError(409, 'REPLACEMENT_EXISTS', 'Use the existing replacement; do not resurrect a second billable occurrence.');
      return (await tx.execute(sql`UPDATE job_occurrences SET state='SCHEDULED',route_id=NULL,collector_id=NULL,facility_id=NULL,reason=${data.reason},version=version+1,updated_at=now() WHERE id=${job.id} RETURNING *`)).rows[0];
    }
    if (!['SCHEDULED', 'ASSIGNED', 'MISSED', 'FAILED', 'CANCELLED'].includes(job.state)) {
      throw new ApiError(409, 'INVALID_STATE', 'In-flight, collected or already replaced work cannot be rescheduled.');
    }
    if (date === job.occurrence_date) throw new ApiError(422, 'SAME_SERVICE_DATE', 'Choose a different local date.');
    const occupied = (await tx.execute(sql`SELECT id FROM job_occurrences WHERE schedule_id=${job.schedule_id} AND occurrence_date=${date}::date`)).rows[0];
    if (occupied) throw new ApiError(409, 'OCCURRENCE_EXISTS', 'This schedule already has a record on that date. Restore it explicitly if appropriate, or choose a different date.');
    const child = (await tx.execute(sql`SELECT id FROM job_occurrences WHERE rescheduled_from_id=${job.id}`)).rows[0];
    if (child) throw new ApiError(409, 'REPLACEMENT_EXISTS', 'This job already has a replacement.');
    const definition = (await tx.execute(sql`SELECT * FROM schedule_versions WHERE schedule_id=${job.schedule_id} AND effective_from<=${date}::date AND (effective_until IS NULL OR effective_until>=${date}::date) ORDER BY version DESC LIMIT 1`)).rows[0];
    if (!definition) throw new ApiError(409, 'NO_SCHEDULE_VERSION', 'No agreed schedule definition covers the target date.');
    const window = await windowFor(tx, definition, date);
    const replacement = (await tx.execute(sql`
      INSERT INTO job_occurrences(schedule_id,schedule_version,occurrence_date,site_id,organization_id,partner_organization_id,expected_grams,scheduled_start_at,scheduled_end_at,schedule_timezone,billing_occurrence_key,rescheduled_from_id,reason)
      VALUES(${job.schedule_id},${definition.version},${date},${job.site_id},${job.organization_id},${job.partner_organization_id},${job.expected_grams},${window.start_at},${window.end_at},${definition.timezone},${job.billing_occurrence_key},${job.id},${data.reason}) RETURNING *`)).rows[0];
    const previousState = job.state;
    await tx.execute(sql`UPDATE job_occurrences SET state=${['MISSED','FAILED'].includes(job.state)?job.state:'RESCHEDULED'},reason=${['MISSED','FAILED'].includes(job.state)?job.reason:data.reason},version=version+1,updated_at=now() WHERE id=${job.id}`);
    await event(tx, actor, 'job-replaced', job.id, job.version + 1, data.reason, { previousState, replacementId: replacement.id, billingOccurrenceKey: job.billing_occurrence_key });
    return replacement;
  }

  operations(actor);
  if (name === 'end-subscription') {
    const subscription = await object(tx, actor, 'subscriptions', data.id);
    currentVersion(subscription, data.version);
    if (subscription.status !== 'ACTIVE') throw new ApiError(409, 'INVALID_STATE', 'Subscription is not active.');
    const site = (await tx.execute(sql`SELECT * FROM sites WHERE id=${subscription.site_id}`)).rows[0];
    await notInPast(tx, data.endsOn, site.timezone);
    if (data.endsOn < subscription.starts_on || subscription.ends_on && data.endsOn > subscription.ends_on) {
      throw new ApiError(422, 'SUBSCRIPTION_DATE_RANGE', 'The end date must be on/after the start and cannot extend a previous termination.');
    }
    const evidence = (await tx.execute(sql`SELECT c.id FROM collections c JOIN job_occurrences j ON j.id=c.job_id JOIN schedule_rules sr ON sr.id=j.schedule_id WHERE sr.subscription_id=${subscription.id} AND j.occurrence_date>${data.endsOn}::date LIMIT 1`)).rows[0];
    if (evidence) throw new ApiError(409, 'PHYSICAL_EVIDENCE_CONFLICT', 'Recorded collections exist after this proposed end date. Review the service period instead of excluding physical history.');
    const cancelledJobs = await cancelPending(tx, actor, sql`j.schedule_id IN (SELECT id FROM schedule_rules WHERE subscription_id=${subscription.id}) AND j.occurrence_date>${data.endsOn}::date`, data.reason);
    const result = (await tx.execute(sql`UPDATE subscriptions SET ends_on=${data.endsOn},version=version+1 WHERE id=${subscription.id} RETURNING *`)).rows[0];
    return { ...result, cancelledJobs };
  }

  const schedule = await object(tx, actor, 'schedules', data.id);
  currentVersion(schedule, data.version);
  const site = (await tx.execute(sql`SELECT * FROM sites WHERE id=${schedule.site_id}`)).rows[0];
  if (name === 'revise-schedule') {
    await notInPast(tx, data.effectiveFrom, schedule.timezone);
    const subscription=(await tx.execute(sql`SELECT * FROM subscriptions WHERE id=${schedule.subscription_id}`)).rows[0];
    if(subscription.status!=='ACTIVE'||subscription.ends_on&&data.effectiveFrom>subscription.ends_on)throw new ApiError(409,'SUBSCRIPTION_DATE_RANGE','The revised rule must start within an active subscription.');
    const last = (await tx.execute(sql`SELECT * FROM schedule_versions WHERE schedule_id=${schedule.id} ORDER BY version DESC LIMIT 1`)).rows[0];
    if (data.effectiveFrom <= last.effective_from) throw new ApiError(422, 'VERSION_DATE_ORDER', 'A new schedule version must begin after the previous version began.');
    const existing = (await tx.execute(sql`SELECT id FROM job_occurrences WHERE schedule_id=${schedule.id} AND occurrence_date>=${data.effectiveFrom}::date LIMIT 1`)).rows[0];
    if (existing) throw new ApiError(409, 'GENERATED_JOBS_EXIST', 'Choose an effective date after the generated horizon. Existing job dates require explicit cancellation or rescheduling; a rule edit cannot rewrite them.');
    const agreement = (await tx.execute(sql`SELECT a.snapshot FROM agreements a JOIN subscriptions sub ON sub.agreement_id=a.id WHERE sub.id=${schedule.subscription_id}`)).rows[0];
    if (data.weekdays.length !== Number(agreement.snapshot.frequency_per_week) || data.weekdays.some((day: number) => !site.operating_days.includes(day))) {
      throw new ApiError(422, 'AGREED_FREQUENCY', 'Weekdays must match site operating days and accepted frequency. A price/frequency change needs newly accepted terms.');
    }
    await tx.execute(sql`UPDATE schedule_versions SET effective_until=${data.effectiveFrom}::date-1 WHERE schedule_id=${schedule.id} AND version=${last.version}`);
    const next = await bumpSchedule(tx, schedule.id);
    await tx.execute(sql`INSERT INTO schedule_versions(schedule_id,version,weekdays,timezone,window_start_local,window_end_local,effective_from,created_by,reason) VALUES(${schedule.id},${next.version},${sql.param(data.weekdays)}::integer[],${last.timezone},${last.window_start_local},${last.window_end_local},${data.effectiveFrom},${actor.userId},${data.reason})`);
    // Rules show the newest planned weekdays; dated generation uses the correct version's effective range.
    await tx.execute(sql`UPDATE schedule_rules SET weekdays=${sql.param(data.weekdays)}::integer[] WHERE id=${schedule.id}`);
    await event(tx, actor, 'schedule-definition-appended', schedule.id, next.version, data.reason, { previousVersion: last.version, previousWeekdays: last.weekdays, weekdays: data.weekdays, effectiveFrom: data.effectiveFrom, timezone: last.timezone });
    return { ...next, weekdays: data.weekdays, effectiveFrom: data.effectiveFrom };
  }
  if (name === 'pause-schedule') {
    await notInPast(tx, data.from, schedule.timezone);
    const cancelledJobs = await cancelPending(tx, actor, sql`j.schedule_id=${schedule.id} AND j.occurrence_date BETWEEN ${data.from}::date AND ${data.to}::date`, data.reason);
    const pause = (await tx.execute(sql`INSERT INTO schedule_pauses(schedule_id,starts_on,ends_on,reason,created_by) VALUES(${schedule.id},${data.from},${data.to},${data.reason},${actor.userId}) RETURNING *`)).rows[0];
    const next = await bumpSchedule(tx, schedule.id);
    return { ...next, pause, cancelledJobs };
  }
  if (name === 'resume-schedule') {
    await notInPast(tx, data.resumeOn, schedule.timezone);
    const pause = (await tx.execute(sql`SELECT * FROM schedule_pauses WHERE id=${data.pauseId} AND schedule_id=${schedule.id} FOR UPDATE`)).rows[0];
    if (!pause) throw new ApiError(404, 'NOT_FOUND', 'Pause not found for this schedule.');
    if (pause.status !== 'ACTIVE' || data.resumeOn > pause.ends_on) throw new ApiError(409, 'INVALID_PAUSE', 'Choose an active pause and a resumption date within or before its range.');
    await tx.execute(sql`UPDATE schedule_pauses SET status=${data.resumeOn<=pause.starts_on?'CANCELLED':'ACTIVE'},ends_on=${data.resumeOn<=pause.starts_on?pause.ends_on:sql`${data.resumeOn}::date-1`},updated_by=${actor.userId},update_reason=${data.reason} WHERE id=${pause.id}`);
    await event(tx, actor, 'schedule-pause-adjusted', pause.id, schedule.version + 1, data.reason, { scheduleId: schedule.id, previousStart: pause.starts_on, previousEnd: pause.ends_on, previousStatus: pause.status, resumeOn: data.resumeOn });
    return { ...await bumpSchedule(tx, schedule.id), pauseId: pause.id, note: 'Previously cancelled jobs remain cancelled. Restore or reschedule each explicitly after review.' };
  }
  if (name === 'add-service-holiday' || name === 'remove-service-holiday') {
    if (name === 'add-service-holiday') {
      await notInPast(tx, data.date, schedule.timezone);
      const cancelledJobs = await cancelPending(tx, actor, sql`j.site_id IN (SELECT id FROM sites WHERE service_area_id=${site.service_area_id}) AND j.occurrence_date=${data.date}::date`, data.reason);
      const prior = (await tx.execute(sql`SELECT * FROM service_area_holidays WHERE service_area_id=${site.service_area_id} AND local_date=${data.date}::date FOR UPDATE`)).rows[0];
      if (prior?.active) throw new ApiError(409, 'HOLIDAY_EXISTS', 'An active closure already exists on this local date.');
      const holiday = prior
        ? (await tx.execute(sql`UPDATE service_area_holidays SET active=true,reason=${data.reason},updated_by=${actor.userId},update_reason=${data.reason} WHERE id=${prior.id} RETURNING *`)).rows[0]
        : (await tx.execute(sql`INSERT INTO service_area_holidays(service_area_id,local_date,reason,created_by) VALUES(${site.service_area_id},${data.date},${data.reason},${actor.userId}) RETURNING *`)).rows[0];
      return { ...await bumpSchedule(tx, schedule.id), holiday, cancelledJobs };
    }
    const holiday = (await tx.execute(sql`SELECT * FROM service_area_holidays WHERE id=${data.holidayId} AND service_area_id=${site.service_area_id} FOR UPDATE`)).rows[0];
    if (!holiday) throw new ApiError(404, 'NOT_FOUND', 'Closure not found in this service area.');
    if (!holiday.active) throw new ApiError(409, 'INVALID_STATE', 'Closure is already inactive.');
    await notInPast(tx, holiday.local_date, schedule.timezone);
    await tx.execute(sql`UPDATE service_area_holidays SET active=false,updated_by=${actor.userId},update_reason=${data.reason} WHERE id=${holiday.id}`);
    return { ...await bumpSchedule(tx, schedule.id), holidayId: holiday.id, note: 'Cancelled occurrences are not automatically restored.' };
  }
  throw new ApiError(404, 'NOT_FOUND', 'Unknown scheduling command.');
}
