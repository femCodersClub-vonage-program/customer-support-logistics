CREATE TYPE "public"."evidence_status" AS ENUM('pending', 'ready');--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "status" "evidence_status" DEFAULT 'pending' NOT NULL;