CREATE TABLE "weekly_focus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_focus_dog_skill" UNIQUE("dog_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "weekly_focus" ADD CONSTRAINT "weekly_focus_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_focus" ADD CONSTRAINT "weekly_focus_skill_id_training_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."training_skills"("id") ON DELETE cascade ON UPDATE no action;