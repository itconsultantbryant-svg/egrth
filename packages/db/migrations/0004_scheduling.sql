-- Local dates are service dates, not midnight UTC instants. Window snapshots are UTC instants.
ALTER TABLE subscriptions ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE subscriptions ADD CONSTRAINT subscription_date_order CHECK (ends_on IS NULL OR ends_on >= starts_on);
ALTER TABLE quotations ADD COLUMN window_start_local time;
ALTER TABLE quotations ADD COLUMN window_end_local time;
ALTER TABLE quotations ADD COLUMN schedule_timezone text;

-- Only recognize an explicit existing HH:mm–HH:mm window; never invent an unknown quote window.
UPDATE quotations q SET
  window_start_local = substring(q.service_window FROM '^([0-2][0-9]:[0-5][0-9])')::time,
  window_end_local = substring(q.service_window FROM '^[0-2][0-9]:[0-5][0-9][–-]([0-2][0-9]:[0-5][0-9])')::time,
  schedule_timezone = s.timezone
FROM sites s WHERE q.site_id = s.id
  AND q.service_window ~ '^([01][0-9]|2[0-3]):[0-5][0-9][–-]([01][0-9]|2[0-3]):[0-5][0-9]';

CREATE TABLE schedule_versions (
  schedule_id uuid NOT NULL REFERENCES schedule_rules(id),
  version integer NOT NULL CHECK (version > 0),
  weekdays integer[] NOT NULL CHECK (cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[0,1,2,3,4,5,6]),
  timezone text NOT NULL,
  window_start_local time,
  window_end_local time,
  effective_from date NOT NULL,
  effective_until date,
  created_by text REFERENCES "user"(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, version),
  CHECK (effective_until IS NULL OR effective_until >= effective_from),
  CHECK ((window_start_local IS NULL) = (window_end_local IS NULL)),
  CHECK (window_start_local IS NULL OR window_start_local <> window_end_local)
);
INSERT INTO schedule_versions(schedule_id,version,weekdays,timezone,window_start_local,window_end_local,effective_from,reason)
SELECT sr.id,sr.version,sr.weekdays,sr.timezone,q.window_start_local,q.window_end_local,sub.starts_on,
  'Migration snapshot of existing rule; unrecognized service windows remain unconfigured.'
FROM schedule_rules sr JOIN subscriptions sub ON sub.id=sr.subscription_id
JOIN agreements a ON a.id=sub.agreement_id JOIN quotations q ON q.id=a.quotation_id;

CREATE TABLE schedule_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES schedule_rules(id),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
  reason text NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id),
  updated_by text REFERENCES "user"(id),
  update_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_on >= starts_on)
);
CREATE INDEX schedule_pause_date_idx ON schedule_pauses(schedule_id,starts_on,ends_on) WHERE status='ACTIVE';
CREATE TABLE service_area_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_area_id uuid NOT NULL REFERENCES service_areas(id),
  local_date date NOT NULL,
  reason text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL REFERENCES "user"(id),
  updated_by text REFERENCES "user"(id),
  update_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(service_area_id,local_date)
);
CREATE INDEX schedule_subscription_idx ON schedule_rules(subscription_id);
CREATE INDEX schedule_version_date_idx ON schedule_versions(schedule_id,effective_from,effective_until);
ALTER TABLE job_occurrences ADD COLUMN scheduled_start_at timestamptz;
ALTER TABLE job_occurrences ADD COLUMN scheduled_end_at timestamptz;
ALTER TABLE job_occurrences ADD COLUMN schedule_timezone text;
ALTER TABLE job_occurrences ADD COLUMN billing_occurrence_key uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE job_occurrences ADD COLUMN rescheduled_from_id uuid UNIQUE REFERENCES job_occurrences(id);
ALTER TABLE job_occurrences ADD CONSTRAINT one_service_occurrence_per_date UNIQUE(schedule_id,occurrence_date);
ALTER TABLE job_occurrences ADD CONSTRAINT job_window_order CHECK(scheduled_end_at IS NULL OR scheduled_end_at>scheduled_start_at);
ALTER TABLE job_occurrences ADD CONSTRAINT job_state_check CHECK(state IN ('REQUESTED','UNDER_REVIEW','APPROVED','SCHEDULED','ASSIGNED','EN_ROUTE','ARRIVED','COLLECTED','CANCELLED','MISSED','FAILED','PARTIALLY_COLLECTED','RESCHEDULED'));
UPDATE job_occurrences j SET schedule_timezone=sv.timezone,
  scheduled_start_at=(j.occurrence_date+sv.window_start_local) AT TIME ZONE sv.timezone,
  scheduled_end_at=(j.occurrence_date+(CASE WHEN sv.window_end_local<sv.window_start_local THEN 1 ELSE 0 END)+sv.window_end_local) AT TIME ZONE sv.timezone
FROM schedule_versions sv WHERE sv.schedule_id=j.schedule_id AND sv.version=j.schedule_version
AND sv.window_start_local IS NOT NULL;
CREATE INDEX job_billing_key_idx ON job_occurrences(billing_occurrence_key);
CREATE TRIGGER schedule_versions_no_delete BEFORE DELETE ON schedule_versions FOR EACH ROW EXECUTE FUNCTION forbid_evidence_delete();
