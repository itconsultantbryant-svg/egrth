ALTER TABLE "user" ADD COLUMN login_username text UNIQUE;
ALTER TABLE "user" ADD CONSTRAINT login_username_format CHECK(login_username IS NULL OR login_username ~ '^[a-z0-9][a-z0-9._-]{2,39}$');
ALTER TABLE "user" ADD COLUMN disabled boolean NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN access_version integer NOT NULL DEFAULT 1;
ALTER TABLE memberships ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE memberships ADD COLUMN denied_permissions text[] NOT NULL DEFAULT '{}';
CREATE INDEX active_admin_membership_idx ON memberships(user_id,organization_id) WHERE active AND role='PLATFORM_ADMIN';
