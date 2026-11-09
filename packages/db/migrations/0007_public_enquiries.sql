CREATE TABLE enquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reference text NOT NULL UNIQUE DEFAULT ('EG-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 kind text NOT NULL CHECK(kind IN ('ASSESSMENT','CONTACT')),
 name text NOT NULL, email text NOT NULL, phone text NOT NULL DEFAULT '',
 business_name text NOT NULL DEFAULT '', sector text NOT NULL DEFAULT '',
 location text NOT NULL DEFAULT '', service text NOT NULL DEFAULT '',
 message text NOT NULL, preferred_contact text NOT NULL DEFAULT 'EMAIL',
 consent_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','CONTACTED','CLOSED')),
 notes text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
 request_key uuid NOT NULL UNIQUE, request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enquiry_status_date_idx ON enquiries(status,created_at DESC);
CREATE TABLE newsletter_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'SUBSCRIBED' CHECK(status IN ('SUBSCRIBED','UNSUBSCRIBED')),
 consent_version text NOT NULL DEFAULT 'public-newsletter-v1',
 unsubscribe_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public_form_limits (
 key text NOT NULL, window_start timestamptz NOT NULL, count integer NOT NULL DEFAULT 1,
 PRIMARY KEY(key,window_start)
);
