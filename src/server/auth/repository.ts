import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users, type NewUser } from "./schema";

export function findUserByUsername(username: string) {
  return db.select().from(users).where(eq(users.username, username)).get();
}

export function findUserById(id: string) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function createUser(user: NewUser) {
  return db.insert(users).values(user).returning().get();
}
