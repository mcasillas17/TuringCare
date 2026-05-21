import { and, eq } from "drizzle-orm";
import { db } from ".";
import { dogs } from "./schema";

export async function findOwnedDog(userId: string, dogId: string) {
  const [dog] = await db
    .select()
    .from(dogs)
    .where(and(eq(dogs.id, dogId), eq(dogs.ownerId, userId)));
  return dog ?? null;
}
