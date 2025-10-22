// src/app/api/check-subscription/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const siteKey = req.nextUrl.searchParams.get("siteKey");
  if (!siteKey) return NextResponse.json({ status: "none" }, { status: 400 });

  const doc = await adminDb.doc(`siteSettings/${siteKey}`).get();
  const data = doc.data() ?? {};

  const customerId = data.stripeCustomerId as string | undefined;
  const isFreePlan = data.isFreePlan !== false;
  const setupMode = data.setupMode === true; // ✅ ← ここで取得

  // ✅ setupMode が true の場合、常に編集許可
  if (setupMode) {
    return NextResponse.json({ status: "setup_mode" });
  }

  if (isFreePlan || !customerId) {
    return NextResponse.json({ status: "none" });
  }

  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 5,
    expand: ["data.default_payment_method"],
  });

  const hasActive = subs.data.some(
    (s) => ["active", "trialing"].includes(s.status) && !s.cancel_at_period_end
  );
  const hasPending = subs.data.some(
    (s) => ["active", "trialing"].includes(s.status) && s.cancel_at_period_end
  );
  const hasCanceled = subs.data.some((s) => s.status === "canceled");

  const status = hasActive
    ? "active"
    : hasPending
    ? "pending_cancel"
    : hasCanceled
    ? "canceled"
    : "none";

  return NextResponse.json({ status });
}
