import type { DogProfile } from "@turingcare/shared";
import { db } from "../db";
import { dogs } from "../db/schema";
import type { TransactionType } from "./safety-lock";

export type DbExecutor = typeof db | TransactionType;

export async function createDog(executor: DbExecutor, userId: string, input: DogProfile) {
  const { weightLbs, ...body } = input;
  const [dog] = await executor
    .insert(dogs)
    .values({
      ...body,
      ownerId: userId,
      weightLbs: weightLbs == null ? weightLbs : String(weightLbs),
    })
    .returning();
  if (!dog) throw new Error("failed to create dog");
  return dog;
}
