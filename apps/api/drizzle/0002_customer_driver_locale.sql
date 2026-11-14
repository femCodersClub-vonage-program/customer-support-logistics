CREATE TYPE "public"."locale" AS ENUM('es', 'en');--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "locale" "locale" DEFAULT 'es' NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "locale" "locale" DEFAULT 'es' NOT NULL;