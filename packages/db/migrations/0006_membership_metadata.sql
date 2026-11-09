-- Legacy membership creation times were not recorded. Keep those unknown rather than
-- fabricating a historical timestamp; new memberships receive real server timestamps.
ALTER TABLE memberships ADD COLUMN created_at timestamptz;
ALTER TABLE memberships ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE memberships ADD COLUMN updated_at timestamptz;
ALTER TABLE memberships ALTER COLUMN updated_at SET DEFAULT now();
CREATE INDEX membership_created_idx ON memberships(organization_id,created_at);
