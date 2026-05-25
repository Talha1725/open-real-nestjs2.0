-- Add missing MFA recovery codes column to users table.
-- Prisma schema expects `users.mfa_recovery_codes` but it may be absent
-- in some environments if the corresponding migration was not applied.

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "mfa_recovery_codes" TEXT;

