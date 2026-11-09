import { z } from 'zod';

const id = z.string().uuid();
const version = z.number().int().positive();
const explanation = z.string().trim().min(5).max(2000);
export const localDate = z.string().date();
export const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour HH:mm time.');
export const weekdays = z.array(z.number().int().min(0).max(6)).min(1).max(7)
  .refine(days => new Set(days).size === days.length, 'Choose each weekday only once.');

export const schedulingSchemas = {
  'generate-jobs': z.object({ from: localDate, to: localDate }),
  'revise-schedule': z.object({ id, version, effectiveFrom: localDate, weekdays, reason: explanation }),
  'pause-schedule': z.object({ id, version, from: localDate, to: localDate, reason: explanation })
    .refine(value => value.to >= value.from, { message: 'Pause end precedes its start.', path: ['to'] }),
  'resume-schedule': z.object({ id, version, pauseId: id, resumeOn: localDate, reason: explanation }),
  'add-service-holiday': z.object({ id, version, date: localDate, reason: explanation }),
  'remove-service-holiday': z.object({ id, version, holidayId: id, reason: explanation }),
  'end-subscription': z.object({ id, version, endsOn: localDate, reason: explanation }),
  'reschedule-job': z.object({ id, version, date: localDate, reason: explanation }),
  'restore-cancelled-job': z.object({ id, version, reason: explanation })
};
export type SchedulingCommand = keyof typeof schedulingSchemas;
