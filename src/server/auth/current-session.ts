import { cookies } from "next/headers";

import { sessionCookieName, verifySessionToken } from "./session";

export async function getCurrentSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(sessionCookieName)?.value);
}
