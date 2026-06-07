// Demo/seed data — independent Seattle-area positive-reinforcement dog trainers.
// Sourced from each trainer's own public business website + their Seattle Humane
// instructor bio, 2026-05-25. Public professional info; safe to commit. Missing
// contact fields are intentionally omitted (left empty). Remove once a real
// trainer-onboarding flow exists.
import { type TrainerInput, trainerInputSchema } from "@turingcare/shared";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { trainers } from "../src/db/schema";

export const seattleTrainers: TrainerInput[] = [
  {
    name: "Cathy Madson",
    businessName: "Cathy Madson Dog Training, LLC",
    city: "Seattle",
    state: "WA",
    methodologyTags: ["positive reinforcement", "fear free", "science based"],
    certifications: [
      "CPDT-KA",
      "CBCC-KA",
      "Fear Free Certified",
      "Aggression in Dogs Master Course",
      "APDT",
      "Pet Professional Guild",
    ],
    specialties: [
      "aggression",
      "leash reactivity",
      "resource guarding",
      "anxiety & phobias",
      "puppy training",
      "obedience",
    ],
    website: "https://www.cathymadson.com/",
    notesInternal:
      "Greater Seattle + Eastside; virtual worldwide. Books via Calendly. Sourced from cathymadson.com + Seattle Humane bio, 2026-05-25.",
  },
  {
    name: "Olivia Petersen",
    businessName: "Sound Connection Dog Training",
    city: "Seattle",
    state: "WA",
    methodologyTags: ["force free", "positive reinforcement", "science based"],
    certifications: ["NW School of Canine Studies", "CCS", "SAPro"],
    specialties: [
      "separation anxiety",
      "reactivity",
      "aggression",
      "puppy training",
      "obedience",
      "behavior modification",
    ],
    website: "https://soundconnectiondogtraining.com/",
    phone: "206-454-9418",
    notesInternal:
      "Force-free, science-based. Email present on site but not confirmed. Sourced 2026-05-25.",
  },
  {
    name: "Suzi McCaslin",
    businessName: "Laying Down the Paw, LLC",
    city: "Seattle",
    state: "WA",
    methodologyTags: ["positive reinforcement", "force free", "science based"],
    certifications: ["CPDT-KA", "NW School of Canine Studies", "CCS"],
    specialties: ["basic manners", "leash walking", "recall", "tricks", "polite greetings"],
    website: "https://www.layingdownthepaw.com/",
    phone: "206-910-6057",
    notesInternal:
      "15 yrs experience; humane methods. Email present on site but not confirmed. Sourced 2026-05-25.",
  },
  {
    name: "Laura Garzon",
    businessName: "Kinfolk Canine",
    city: "Seattle",
    state: "WA",
    methodologyTags: ["positive reinforcement", "force free", "science based"],
    specialties: [
      "puppy fundamentals",
      "basic manners",
      "potty training",
      "bite inhibition",
      "impulse control",
      "recall",
      "boarding",
    ],
    website: "https://www.ecodogrollcall.org/kinfolkcanine",
    email: "kinfolkcanine@gmail.com",
    phone: "510-301-4391",
    notesInternal:
      "MA anthropology; Seattle Humane instructor since 2018; canine-cognition based, no prong collars. Does NOT handle severe reactivity / separation anxiety / serious resource guarding. Offers boarding. Sourced 2026-05-25.",
  },
];

export async function main() {
  let inserted = 0;
  for (const data of seattleTrainers) {
    const valid = trainerInputSchema.parse(data);
    const existing = await db
      .select({ id: trainers.id })
      .from(trainers)
      .where(eq(trainers.name, valid.name));
    if (existing.length > 0) continue;
    await db.insert(trainers).values(valid);
    inserted++;
  }
  console.log(
    `Seeded ${inserted} new trainer(s); ${seattleTrainers.length - inserted} already present.`,
  );
}

// Run when invoked directly (tsx scripts/seed-seattle-trainers.ts)
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
