// src/lib/owner-context.ts
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";

export async function getOwnerContext() {
  const cookieStore = await cookies();            // ★ await を付ける
  const session = cookieStore.get("__session")?.value;
  if (!session) throw new Error("Unauthenticated");

  const decoded = await adminAuth.verifySessionCookie(session, true);
  return { uid: decoded.uid };
}
