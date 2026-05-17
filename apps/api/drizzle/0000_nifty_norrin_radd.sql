CREATE TYPE "public"."brief_status" AS ENUM('draft', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."concern_severity" AS ENUM('mild', 'moderate', 'severe');--> statement-breakpoint
CREATE TYPE "public"."dog_sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."dog_size" AS ENUM('small', 'medium', 'large', 'giant');--> statement-breakpoint
CREATE TYPE "public"."dog_source" AS ENUM('breeder', 'rescue', 'shelter', 'other');--> statement-breakpoint
CREATE TYPE "public"."vaccine_stage" AS ENUM('in_progress', 'complete', 'unknown');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "behavior_concerns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"concern" text NOT NULL,
	"severity" "concern_severity" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "brief_status" DEFAULT 'draft' NOT NULL,
	"summary" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"breed" text,
	"date_of_birth" date,
	"size" "dog_size" NOT NULL,
	"weight_lbs" numeric,
	"sex" "dog_sex" NOT NULL,
	"spayed_neutered" boolean DEFAULT false NOT NULL,
	"source" "dog_source" NOT NULL,
	"adopted_at" date,
	"vaccine_stage" "vaccine_stage" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"antecedent" text NOT NULL,
	"behavior" text NOT NULL,
	"consequence" text NOT NULL,
	"intensity" integer NOT NULL,
	"duration_seconds" integer,
	"recovery_seconds" integer,
	"location" text,
	"people_present" text,
	"owner_response" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intensity_range" CHECK ("journal_entries"."intensity" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "trainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"business_name" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"methodology_tags" text[] DEFAULT '{}' NOT NULL,
	"certifications" text[] DEFAULT '{}' NOT NULL,
	"specialties" text[] DEFAULT '{}' NOT NULL,
	"website" text,
	"email" text,
	"phone" text,
	"notes_internal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"goal" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavior_concerns" ADD CONSTRAINT "behavior_concerns_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_goals" ADD CONSTRAINT "training_goals_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;