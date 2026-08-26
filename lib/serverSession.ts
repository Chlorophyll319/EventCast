import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySession } from "./session";

export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  const session = await verifySession(token);
  return session?.userId ?? null;
}
