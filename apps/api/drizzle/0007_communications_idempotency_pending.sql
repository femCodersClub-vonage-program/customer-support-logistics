ALTER TYPE "public"."communication_status" ADD VALUE 'pending' BEFORE 'queued';--> statement-breakpoint
ALTER TABLE "communications" ALTER COLUMN "vonage_uuid" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "communications_idempotency_key_unique" ON "communications" USING btree ("idempotency_key");