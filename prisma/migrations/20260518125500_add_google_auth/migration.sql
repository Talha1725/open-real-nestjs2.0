ALTER TABLE "users" ADD COLUMN "google_sub" TEXT;

CREATE UNIQUE INDEX "users_tenant_id_google_sub_key"
ON "users"("tenant_id", "google_sub");
