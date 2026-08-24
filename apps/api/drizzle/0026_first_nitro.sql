ALTER TABLE "brief_sends" ADD COLUMN "delivery_claim_id" text;--> statement-breakpoint
ALTER TABLE "brief_sends" ADD COLUMN "delivery_claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE FUNCTION "prevent_active_brief_delivery_delete"() RETURNS trigger AS $$
BEGIN
	IF OLD."delivery_claim_id" IS NOT NULL THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			CONSTRAINT = 'brief_sends_delivery_in_progress',
			MESSAGE = 'cannot delete a Brief send while delivery is in progress';
	END IF;
	RETURN OLD;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "brief_sends_delivery_in_progress"
	BEFORE DELETE ON "brief_sends"
	FOR EACH ROW EXECUTE FUNCTION "prevent_active_brief_delivery_delete"();
