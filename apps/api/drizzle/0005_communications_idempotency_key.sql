ALTER TABLE "communications"
ADD COLUMN "idempotency_key" text;

--> statement-breakpoint

CREATE UNIQUE INDEX "communications_idempotency_key_unique"
ON "communications" USING btree ("idempotency_key");