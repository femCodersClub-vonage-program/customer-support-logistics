ALTER TYPE "public"."communication_status" ADD VALUE 'pending' BEFORE 'queued';--> statement-breakpoint
DROP INDEX "communications_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "communications" ALTER COLUMN "vonage_uuid" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_idempotency_key_unique" UNIQUE("idempotency_key");