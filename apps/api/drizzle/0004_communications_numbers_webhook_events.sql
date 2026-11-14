CREATE TYPE "public"."webhook_event_source" AS ENUM('messages_inbound', 'messages_status', 'voice_event', 'voice_input');--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "webhook_event_source" NOT NULL,
	"event_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"communication_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_source_event_key_unique" UNIQUE("source","event_key")
);
--> statement-breakpoint
ALTER TABLE "communications" ALTER COLUMN "incident_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "from_number" text;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "to_number" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_events_communication_id_index" ON "webhook_events" USING btree ("communication_id");