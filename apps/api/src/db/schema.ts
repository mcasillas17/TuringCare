import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* ---------- Auth enums ---------- */

// Declared before the `user` table because `const` bindings must precede any
// table that references the enum (userRoleEnum is used in user.role below).
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

/* ---------- Better Auth core tables (adapter defaults) ---------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Domain enums ---------- */

export const dogSizeEnum = pgEnum("dog_size", ["small", "medium", "large", "giant"]);
export const dogSexEnum = pgEnum("dog_sex", ["male", "female"]);
export const dogSourceEnum = pgEnum("dog_source", ["breeder", "rescue", "shelter", "other"]);
export const vaccineStageEnum = pgEnum("vaccine_stage", ["in_progress", "complete", "unknown"]);
export const concernSeverityEnum = pgEnum("concern_severity", ["mild", "moderate", "severe"]);
export const briefStatusEnum = pgEnum("brief_status", ["draft", "finalized"]);
export const journalEntryKindEnum = pgEnum("journal_entry_kind", ["moment", "daily_checkin"]);
export const journalTrendEnum = pgEnum("journal_trend", ["better", "same", "harder"]);

/* ---------- Domain tables ---------- */

export const dogs = pgTable("dogs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  breed: text("breed"),
  dateOfBirth: date("date_of_birth"),
  size: dogSizeEnum("size").notNull(),
  weightLbs: numeric("weight_lbs"),
  sex: dogSexEnum("sex").notNull(),
  spayedNeutered: boolean("spayed_neutered").notNull().default(false),
  source: dogSourceEnum("source").notNull(),
  adoptedAt: date("adopted_at"),
  vaccineStage: vaccineStageEnum("vaccine_stage").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const behaviorConcerns = pgTable("behavior_concerns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dogId: uuid("dog_id")
    .notNull()
    .references(() => dogs.id, { onDelete: "cascade" }),
  concern: text("concern").notNull(),
  severity: concernSeverityEnum("severity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainingGoals = pgTable("training_goals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dogId: uuid("dog_id")
    .notNull()
    .references(() => dogs.id, { onDelete: "cascade" }),
  goal: text("goal").notNull(),
  catalogGoalKey: text("catalog_goal_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainingSkills = pgTable(
  "training_skills",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => trainingGoals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    confidence: integer("confidence").notNull().default(1),
    position: integer("position").notNull().default(0),
    catalogSkillKey: text("catalog_skill_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("confidence_range", sql`${t.confidence} BETWEEN 1 AND 5`)],
);

export const practiceOutcomeEnum = pgEnum("practice_outcome", ["went_well", "mixed", "too_hard"]);
export const practiceCueSupportEnum = pgEnum("practice_cue_support", [
  "food_lure",
  "hand_signal",
  "verbal_cue",
  "no_extra_help",
]);
export const practiceEnvironmentEnum = pgEnum("practice_environment", [
  "home_quiet",
  "home_busy",
  "yard",
  "quiet_outdoor",
  "busy_outdoor",
]);
export const practiceDistanceEnum = pgEnum("practice_distance", [
  "at_side",
  "few_steps",
  "across_room",
  "across_yard",
  "far_away",
]);
export const practiceDurationBandEnum = pgEnum("practice_duration_band", [
  "under_5_seconds",
  "about_15_seconds",
  "about_30_seconds",
  "one_to_two_minutes",
  "five_to_fifteen_minutes",
  "about_30_minutes",
  "one_to_two_hours",
  "half_day_or_more",
]);
export const practiceVariantEnum = pgEnum("practice_variant", ["primary", "fallback"]);
export const practiceDistractionEnum = pgEnum("practice_distraction", [
  "none",
  "mild",
  "moderate",
  "strong",
]);
export const practiceDimensionEnum = pgEnum("practice_dimension", [
  "cue_support",
  "environment",
  "distance",
  "duration",
  "distraction",
]);
export const safetySignalTypeEnum = pgEnum("safety_signal_type", [
  "aggression_or_bite_risk",
  "injury_or_pain",
  "severe_fear_or_panic",
  // Internal structured rule derived from severity, never shown as an owner option.
  "severe_behavior_concern",
]);
export const safetySignalSourceEnum = pgEnum("safety_signal_source", [
  "practice_session",
  "behavior_concern",
]);

export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => trainingSkills.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes"),
    notes: text("notes"),
    // Structured evidence. All nullable: capture is always optional and must
    // never block a practice save.
    outcome: practiceOutcomeEnum("outcome"),
    cueSupport: practiceCueSupportEnum("cue_support"),
    environment: practiceEnvironmentEnum("environment"),
    distance: practiceDistanceEnum("distance"),
    durationBand: practiceDurationBandEnum("duration_band"),
    distraction: practiceDistractionEnum("distraction"),
    // The curriculum level the dog was practising at when this was logged, so
    // advancement evidence is level-anchored and resets after a level change.
    curriculumLevel: integer("curriculum_level"),
    curriculumVersion: text("curriculum_version"),
    practiceVariant: practiceVariantEnum("practice_variant"),
    // Exact audited suggestion the owner said they practised. The API validates
    // ownership/currentness before storing this UUID; Task 10 cannot add an FK
    // because the suggestion table is created by the following migration.
    suggestionId: uuid("suggestion_id"),
    // Owner-local calendar date derived once from occurredAt + the offset sent
    // for that specific session. This remains correct across DST boundaries.
    practiceDay: date("practice_day"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("practice_sessions_skill_occurred_idx").on(t.skillId, t.occurredAt),
    check(
      "practice_curriculum_level_range",
      sql`${t.curriculumLevel} IS NULL OR ${t.curriculumLevel} BETWEEN 1 AND 5`,
    ),
  ],
);

/**
 * Explicit, owner-answered safety reports. Written only from structured inputs
 * (never from free text) and deliberately not deletable through the API: the
 * suppression they cause must not be dismissible by the owner. Injury/pain is
 * time-bounded; aggression/bite risk, severe fear/panic, and the internal
 * severe-concern signal persist until a future reviewed
 * professional-resolution workflow exists.
 */
export const dogSafetySignals = pgTable(
  "dog_safety_signals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dogId: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    type: safetySignalTypeEnum("type").notNull(),
    source: safetySignalSourceEnum("source").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dog_safety_signals_dog_reported_idx").on(t.dogId, t.reportedAt)],
);

export const skillMilestones = pgTable(
  "skill_milestones",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => trainingSkills.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    reachedAt: timestamp("reached_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("skill_milestone_skill_level").on(t.skillId, t.level),
    check("milestone_level_range", sql`${t.level} BETWEEN 2 AND 5`),
  ],
);

export const weeklyFocus = pgTable(
  "weekly_focus",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dogId: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => trainingSkills.id, { onDelete: "cascade" }),
    // Local Monday of the focus week. Focus is versioned per week so past weeks
    // keep the selection that was actually active then.
    // Nullable only for preserved pre-migration rows whose owner-local week is
    // unknowable. Every Gate 1 write supplies a non-null Monday.
    weekStart: date("week_start"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("weekly_focus_dog_week").on(t.dogId, t.weekStart),
    check(
      "weekly_focus_week_start_monday",
      sql`${t.weekStart} is null or extract(isodow from ${t.weekStart}) = 1`,
    ),
  ],
);

/** Short-lived owner-local context scoped to one authenticated legacy client. */
export const focusCompatibilityWeeks = pgTable(
  "focus_compatibility_weeks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dogId: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    weekStart: date("week_start").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [unique("focus_compatibility_dog_session").on(t.dogId, t.sessionId)],
);

/** Durable marker ensuring preserved undated focus seeds at most one week. */
export const legacyFocusClaims = pgTable("legacy_focus_claims", {
  dogId: uuid("dog_id")
    .primaryKey()
    .references(() => dogs.id, { onDelete: "cascade" }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull(),
});

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dogId: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    kind: journalEntryKindEnum("kind").notNull().default("moment"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    note: text("note").notNull(),
    trend: journalTrendEnum("trend"),
    antecedent: text("antecedent"),
    behavior: text("behavior"),
    consequence: text("consequence"),
    intensity: integer("intensity"),
    durationSeconds: integer("duration_seconds"),
    recoverySeconds: integer("recovery_seconds"),
    location: text("location"),
    peoplePresent: text("people_present"),
    ownerResponse: text("owner_response"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("journal_intensity_range", sql`${t.intensity} IS NULL OR ${t.intensity} BETWEEN 1 AND 5`),
    check(
      "journal_daily_checkin_trend",
      sql`${t.kind} <> 'daily_checkin' OR ${t.trend} IS NOT NULL`,
    ),
    check("journal_moment_trend_null", sql`${t.kind} <> 'moment' OR ${t.trend} IS NULL`),
  ],
);

export const briefs = pgTable("briefs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dogId: uuid("dog_id")
    .notNull()
    .references(() => dogs.id, { onDelete: "cascade" }),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  status: briefStatusEnum("status").notNull().default("draft"),
  summary: text("summary").notNull(),
  version: integer("version").notNull().default(1),
  shareToken: text("share_token").unique(),
});

export const briefSends = pgTable("brief_sends", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  briefId: uuid("brief_id")
    .notNull()
    .references(() => briefs.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(),
  message: text("message"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  sentByUserId: text("sent_by_user_id").references(() => user.id, { onDelete: "set null" }),
});

export const trainers = pgTable("trainers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  businessName: text("business_name"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  methodologyTags: text("methodology_tags").array().notNull().default(sql`'{}'`),
  certifications: text("certifications").array().notNull().default(sql`'{}'`),
  specialties: text("specialties").array().notNull().default(sql`'{}'`),
  website: text("website"),
  email: text("email"),
  phone: text("phone"),
  notesInternal: text("notes_internal"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationName: text("organization_name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  format: text("format").notNull(),
  ageGroup: text("age_group").notNull(),
  ageRange: text("age_range"),
  durationWeeks: integer("duration_weeks"),
  sessionMinutes: integer("session_minutes"),
  prerequisites: text("prerequisites"),
  skillsTaught: text("skills_taught").array().notNull().default(sql`'{}'`),
  isOnline: boolean("is_online").notNull().default(false),
  coursePageUrl: text("course_page_url"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Rate limiting ---------- */

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ---------- Telemetry ---------- */

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    props: jsonb("props").notNull().default(sql`'{}'::jsonb`),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_name_created_at_idx").on(t.name, t.createdAt),
    index("events_created_at_idx").on(t.createdAt),
  ],
);

/* ---------- Relations ---------- */

export const userRelations = relations(user, ({ many }) => ({
  dogs: many(dogs),
}));

export const dogsRelations = relations(dogs, ({ one, many }) => ({
  owner: one(user, { fields: [dogs.ownerId], references: [user.id] }),
  behaviorConcerns: many(behaviorConcerns),
  trainingGoals: many(trainingGoals),
  journalEntries: many(journalEntries),
  briefs: many(briefs),
}));

export const behaviorConcernsRelations = relations(behaviorConcerns, ({ one }) => ({
  dog: one(dogs, { fields: [behaviorConcerns.dogId], references: [dogs.id] }),
}));

export const trainingGoalsRelations = relations(trainingGoals, ({ one, many }) => ({
  dog: one(dogs, { fields: [trainingGoals.dogId], references: [dogs.id] }),
  trainingSkills: many(trainingSkills),
}));

export const trainingSkillsRelations = relations(trainingSkills, ({ one, many }) => ({
  goal: one(trainingGoals, { fields: [trainingSkills.goalId], references: [trainingGoals.id] }),
  practiceSessions: many(practiceSessions),
  skillMilestones: many(skillMilestones),
}));

export const practiceSessionsRelations = relations(practiceSessions, ({ one }) => ({
  skill: one(trainingSkills, {
    fields: [practiceSessions.skillId],
    references: [trainingSkills.id],
  }),
}));

export const skillMilestonesRelations = relations(skillMilestones, ({ one }) => ({
  skill: one(trainingSkills, {
    fields: [skillMilestones.skillId],
    references: [trainingSkills.id],
  }),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one }) => ({
  dog: one(dogs, { fields: [journalEntries.dogId], references: [dogs.id] }),
}));

export const briefsRelations = relations(briefs, ({ one }) => ({
  dog: one(dogs, { fields: [briefs.dogId], references: [dogs.id] }),
}));
