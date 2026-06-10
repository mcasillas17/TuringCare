-- Enable Row Level Security on every application table.
--
-- This app uses Better Auth (NOT Supabase Auth) and reaches Postgres only via a
-- direct connection as the table-owner role, which BYPASSES non-FORCE RLS. So
-- enabling RLS with no policies is a no-op for the app, while it denies all row
-- access to any other role (notably Supabase PostgREST's `anon`/`authenticated`).
-- This closes the "table exposed via the Data API without RLS enabled" lint.
--
-- Deliberately: NO policies (deny-all to non-owner roles is exactly what we want)
-- and NO `FORCE ROW LEVEL SECURITY` (that would subject the owner role — i.e. the
-- app itself — to RLS and break every query).
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "behavior_concerns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brief_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "briefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dogs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "practice_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trainers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_skills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weekly_focus" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Belt-and-suspenders: also strip any PostgREST grants. Supabase's `anon` /
-- `authenticated` roles do not exist on vanilla Postgres (local Docker / CI), so
-- guard each REVOKE behind a role-existence check to keep this migration portable.
DO $$
DECLARE
  tbl text;
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      FOREACH tbl IN ARRAY ARRAY[
        'account', 'behavior_concerns', 'brief_sends', 'briefs', 'courses',
        'dogs', 'events', 'journal_entries', 'practice_sessions', 'rate_limit',
        'session', 'trainers', 'training_goals', 'training_skills', 'user',
        'verification', 'weekly_focus'
      ] LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM %I', tbl, rol);
      END LOOP;
    END IF;
  END LOOP;
END $$;
