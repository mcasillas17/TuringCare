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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("confidence_range", sql`${t.confidence} BETWEEN 1 AND 5`)],
);

export const practiceSessions = pgTable("practice_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => trainingSkills.id, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
    check("journal_daily_checkin_trend", sql`${t.kind} <> 'daily_checkin' OR ${t.trend} IS NOT NULL`),
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
});

export const briefSends = pgTable("brief_sends", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  briefId: uuid("brief_id")
    .notNull()
    .references(() => briefs.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(),
  message: text("message"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  sentByUserId: text("sent_by_user_id").notNull(),
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
}));

export const practiceSessionsRelations = relations(practiceSessions, ({ one }) => ({
  skill: one(trainingSkills, {
    fields: [practiceSessions.skillId],
    references: [trainingSkills.id],
  }),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one }) => ({
  dog: one(dogs, { fields: [journalEntries.dogId], references: [dogs.id] }),
}));

export const briefsRelations = relations(briefs, ({ one }) => ({
  dog: one(dogs, { fields: [briefs.dogId], references: [dogs.id] }),
}));
