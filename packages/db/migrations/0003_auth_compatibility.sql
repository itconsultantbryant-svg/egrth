-- Better Auth 1.x installed two-factor plugin schema verified against package, not older docs examples.
ALTER TABLE "twoFactor" ADD COLUMN verified boolean DEFAULT true;
ALTER TABLE "twoFactor" ADD COLUMN "failedVerificationCount" integer DEFAULT 0;
ALTER TABLE "twoFactor" ADD COLUMN "lockedUntil" timestamptz;
CREATE INDEX two_factor_user_idx ON "twoFactor"("userId");
CREATE INDEX two_factor_secret_idx ON "twoFactor"(secret);
