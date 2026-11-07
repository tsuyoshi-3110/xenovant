import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/** オーナーがログイン用メールを忘れたときに、登録した電話番号で確認します。 */
export async function POST(req: NextRequest) {
  const { siteKey, phone } = (await req.json().catch(() => ({}))) as {
    siteKey?: unknown;
    phone?: unknown;
  };
  if (typeof siteKey !== "string" || !siteKey || typeof phone !== "string" || !phone) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }
  if (siteKey.includes("/")) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  const snap = await adminDb.doc(`siteSettings/${siteKey}`).get();
  const ownerPhone = snap.data()?.ownerPhone;
  const normalize = (value: string) => value.replace(/\D/g, "");
  const entered = normalize(phone);
  if (!entered || typeof ownerPhone !== "string" || normalize(ownerPhone) !== entered) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const ownerEmail = snap.data()?.ownerEmail;
  return NextResponse.json({ email: typeof ownerEmail === "string" ? ownerEmail : undefined });
}
