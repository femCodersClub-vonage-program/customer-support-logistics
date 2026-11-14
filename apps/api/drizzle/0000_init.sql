CREATE TYPE "public"."actor" AS ENUM('customer', 'agent', 'driver', 'system');--> statement-breakpoint
CREATE TYPE "public"."communication_channel" AS ENUM('sms', 'voice');--> statement-breakpoint
CREATE TYPE "public"."communication_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."communication_status" AS ENUM('queued', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'notified', 'in_mediation', 'resolved', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."incident_type" AS ENUM('not_delivered', 'delayed', 'damaged', 'wrong_item', 'other');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'in_transit', 'delivered', 'failed');--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"channel" "communication_channel" NOT NULL,
	"direction" "communication_direction" NOT NULL,
	"vonage_uuid" text NOT NULL,
	"status" "communication_status" NOT NULL,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communications_vonage_uuid_unique" UNIQUE("vonage_uuid"),
	CONSTRAINT "communications_duration_seconds_non_negative" CHECK ("communications"."duration_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone"),
	CONSTRAINT "customers_phone_e164" CHECK ("customers"."phone" ~ '^\+[1-9][0-9]{1,14}$')
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_phone_unique" UNIQUE("phone"),
	CONSTRAINT "drivers_phone_e164" CHECK ("drivers"."phone" ~ '^\+[1-9][0-9]{1,14}$')
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "evidence_size_bytes_non_negative" CHECK ("evidence"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "incident_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"from_status" "incident_status",
	"to_status" "incident_status" NOT NULL,
	"actor" "actor" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" "incident_type" NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"agent_id" uuid,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"route_id" uuid,
	"address" text NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"driver_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communications_incident_id_index" ON "communications" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "evidence_incident_id_index" ON "evidence" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_events_incident_id_index" ON "incident_events" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incidents_status_index" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "incidents_order_id_index" ON "incidents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_customer_id_index" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_route_id_index" ON "orders" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "routes_driver_id_index" ON "routes" USING btree ("driver_id");