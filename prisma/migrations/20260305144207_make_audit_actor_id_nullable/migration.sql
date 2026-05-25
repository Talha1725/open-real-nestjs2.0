-- DropForeignKey
ALTER TABLE "audit_log_events" DROP CONSTRAINT "audit_log_events_actor_id_fkey";

-- AlterTable
ALTER TABLE "audit_log_events" ALTER COLUMN "actor_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "audit_log_events" ADD CONSTRAINT "audit_log_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
