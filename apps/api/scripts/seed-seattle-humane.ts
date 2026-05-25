// Demo/seed data — Seattle Humane Dog Training Center course catalog.
// Source: https://www.seattlehumane.org/services/dog-training-center/  (sourced 2026-05-24)
// Public info; safe to commit. Remove once a real provider-onboarding flow exists.
import { type CourseInput, courseInputSchema } from "@turingcare/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { courses } from "../src/db/schema";

const ORG = "Seattle Humane Dog Training Center";
const base = { organizationName: ORG, city: "Bellevue", state: "WA" } as const;

export const seattleHumaneCourses: CourseInput[] = [
  {
    ...base,
    name: "Dog Training Basics",
    format: "seminar",
    ageGroup: "any",
    ageRange: "All dogs",
    sessionMinutes: 90,
    description:
      "Required orientation seminar: how dogs learn and positive-reinforcement marker training.",
    skillsTaught: ["how dogs learn", "positive reinforcement", "marker training"],
    isOnline: true,
    coursePageUrl: "https://www.seattlehumane.org/dog-training-center/behavior-basics-seminar",
  },
  {
    ...base,
    name: "Welcome Home",
    format: "seminar",
    ageGroup: "any",
    ageRange: "New dogs & puppies",
    sessionMinutes: 120,
    description: "Guidance for helping a new or newly adopted dog settle in.",
    skillsTaught: ["settling in", "early good behavior"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Welcome_Home",
  },
  {
    ...base,
    name: "Pet First Aid Basics",
    format: "seminar",
    ageGroup: "any",
    ageRange: "All pets",
    sessionMinutes: 120,
    description: "Prevention and handling of common pet emergencies.",
    skillsTaught: ["bleeding control", "CPR", "choking response"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Pet_First_Aid_Basics",
  },
  {
    ...base,
    name: "Loose Leash Walking Workshop",
    format: "workshop",
    ageGroup: "any",
    durationWeeks: 3,
    sessionMinutes: 45,
    prerequisites: "Dog Training Basics",
    description: "Build calm, focused leash manners with real-life practice.",
    skillsTaught: ["calm walking", "focus around distractions", "real-life walking"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Loose_Leash_Walking_Workshop",
  },
  {
    ...base,
    name: "Recall Workshop",
    format: "workshop",
    ageGroup: "any",
    durationWeeks: 3,
    sessionMinutes: 60,
    prerequisites: "Dog Training Basics",
    description: "Turn unreliable responses into consistent check-ins; ends with a field trip.",
    skillsTaught: ["reliable recall", "recall around distractions"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Recall_Workshop",
  },
  {
    ...base,
    name: "Puppy Play Skills",
    format: "drop_in",
    ageGroup: "puppy",
    ageRange: "8-24 weeks",
    sessionMinutes: 45,
    description: "Supervised off-leash play, grouped by age and size.",
    skillsTaught: ["off-leash play", "social skills"],
    coursePageUrl: "https://www.seattlehumane.org/dog-training-center/puppy-play-skills/",
  },
  {
    ...base,
    name: "Puppy Head Start",
    format: "group",
    ageGroup: "puppy",
    ageRange: "8-14 weeks",
    durationWeeks: 6,
    sessionMinutes: 60,
    prerequisites: "Dog Training Basics",
    description: "Early socialization and the foundations of manners.",
    skillsTaught: ["polite greetings", "leash foundations", "recall foundations", "socialization"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Puppy_Head_Start",
  },
  {
    ...base,
    name: "Puppy Manners 1",
    format: "group",
    ageGroup: "puppy",
    ageRange: "15-20 weeks",
    durationWeeks: 6,
    sessionMinutes: 60,
    prerequisites: "Dog Training Basics",
    description: "Real-life skills, confidence and socialization for young puppies.",
    skillsTaught: ["polite greetings", "basic skills", "socialization", "off-leash play"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Puppy_Manners_1",
  },
  {
    ...base,
    name: "Puppy Manners 2",
    format: "group",
    ageGroup: "puppy",
    ageRange: "Up to 12 months",
    durationWeeks: 6,
    sessionMinutes: 60,
    prerequisites: "Puppy Manners 1",
    description: "Progress recall and leash work; add stay, leave-it, targeting and wait.",
    skillsTaught: ["recall", "leash walking", "stay", "leave-it", "hand targeting", "wait"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Puppy_Manners_2",
  },
  {
    ...base,
    name: "Teen Play Skills",
    format: "drop_in",
    ageGroup: "adolescent",
    ageRange: "6-12 months",
    sessionMinutes: 45,
    description: "Structured play to burn energy and build social skills.",
    skillsTaught: ["structured play", "regulating excitement"],
    coursePageUrl:
      "https://www.seattlehumane.org/services/dog-training-center/teen-play-skills-sessions/",
  },
  {
    ...base,
    name: "Teen Dog Manners",
    format: "group",
    ageGroup: "adolescent",
    ageRange: "5-12 months",
    durationWeeks: 6,
    sessionMinutes: 60,
    prerequisites: "Dog Training Basics",
    description: "Manners support through the tricky adolescent stage.",
    skillsTaught: ["loose leash walking", "hand targeting", "polite greetings"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Teen_Dog_Manners",
  },
  {
    ...base,
    name: "Dog Manners 1",
    format: "group",
    ageGroup: "adult",
    ageRange: "12 months & older",
    durationWeeks: 6,
    sessionMinutes: 60,
    prerequisites: "Dog Training Basics",
    description: "Build the dog/handler relationship through training and communication.",
    skillsTaught: ["polite greetings", "basic skills", "prevention of unwanted behavior"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Dog_Manners_1",
  },
  {
    ...base,
    name: "Dog Manners 2",
    format: "group",
    ageGroup: "adult",
    ageRange: "7 months & older",
    durationWeeks: 6,
    sessionMinutes: 60,
    prerequisites:
      "Puppy Manners 2 / Teen Dog Manners / Shy Dog Manners / Dog Manners 1, or instructor permission",
    description: "Reliability around distractions, at distance and for longer durations.",
    skillsTaught: ["distraction reliability", "distance responsiveness", "duration"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Dog_Manners_2",
  },
  {
    ...base,
    name: "Dog Manners 3: Manners About Town",
    format: "drop_in",
    ageGroup: "adult",
    prerequisites: "Dog Manners 2 or instructor permission",
    description: "Drop-in practice in rotating real-world locations.",
    skillsTaught: [
      "real-world focus",
      "loose-leash walking",
      "polite greetings",
      "long line handling",
    ],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Dog_Manners_3",
  },
  {
    ...base,
    name: "Shy Dog Manners",
    format: "group",
    ageGroup: "any",
    ageRange: "5.5 months & older",
    durationWeeks: 6,
    sessionMinutes: 60,
    prerequisites: "Dog Training Basics",
    description: "Basic manners for fearful dogs, at their own pace.",
    skillsTaught: ["confidence for fearful dogs", "basic manners"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Shy_Dog_Manners",
  },
  {
    ...base,
    name: "Reactive Rover",
    format: "group",
    ageGroup: "any",
    ageRange: "Leash-reactive dogs",
    description: "Progressive program for dogs who bark, lunge or growl on leash.",
    skillsTaught: ["manage reactivity", "build confidence", "handling skills"],
    coursePageUrl: "https://www.seattlehumane.org/services/dog-training/reactive-rover",
  },
  {
    ...base,
    name: "It's Tricky: Trick Training",
    format: "group",
    ageGroup: "any",
    ageRange: "5 months & older",
    durationWeeks: 6,
    sessionMinutes: 60,
    prerequisites: "Dog Training Basics",
    description: "Clear-communication trick training; optional AKC Trick Dog title.",
    skillsTaught: ["tricks", "AKC Trick Dog title prep"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Its_Tricky_Trick_Training",
  },
  {
    ...base,
    name: "Canine Good Citizen",
    format: "group",
    ageGroup: "any",
    ageRange: "8 months & older",
    durationWeeks: 6,
    sessionMinutes: 60,
    prerequisites: "Dog Manners 2 or instructor permission",
    description: "Prep + test for the AKC Canine Good Citizen certification.",
    skillsTaught: ["AKC Canine Good Citizen test prep"],
    coursePageUrl:
      "https://www.supersaas.com/schedule/Dog_Training/Canine_Good_Citizen_Prep_&_Test",
  },
  {
    ...base,
    name: "Nose Work for Fun",
    format: "group",
    ageGroup: "any",
    ageRange: "15 weeks & older",
    durationWeeks: 3,
    sessionMinutes: 60,
    prerequisites: "Dog Training Basics (Reactive Rover 1 if leash-reactive)",
    description: "Confidence and enrichment through scent games.",
    skillsTaught: ["scent games", "confidence", "enrichment"],
    coursePageUrl: "https://www.supersaas.com/schedule/Dog_Training/Nose_Work_For_Fun",
  },
];

export async function main() {
  let inserted = 0;
  for (let i = 0; i < seattleHumaneCourses.length; i++) {
    const data = courseInputSchema.parse(seattleHumaneCourses[i]);
    const existing = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.organizationName, data.organizationName), eq(courses.name, data.name)));
    if (existing.length > 0) continue;
    await db.insert(courses).values({ ...data, position: i });
    inserted++;
  }
  console.log(
    `Seeded ${inserted} new course(s); ${seattleHumaneCourses.length - inserted} already present.`,
  );
}

// Run when invoked directly (tsx scripts/seed-seattle-humane.ts)
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
