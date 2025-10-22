// app/api/owners/stripe-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const siteKey = searchParams.get("siteKey");
    if (!siteKey) {
      return NextResponse.json({ error: "Missing siteKey" }, { status: 400 });
    }

    // 例：sites/{siteKey} に Stripe Connect の accountId を保持
    const siteSnap = await adminDb.collection("sites").doc(siteKey).get();
    if (!siteSnap.exists) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const site = siteSnap.data() || {};
    const accountId = site?.stripe?.accountId as string | undefined;
    if (!accountId) {
      return NextResponse.json({ connected: false, reason: "no_account_id" });
    }

    const account = await stripe.accounts.retrieve(accountId);
    const chargesEnabled = !!account.charges_enabled;
    const payoutsEnabled = !!account.payouts_enabled;
    const due = (account.requirements?.currently_due ?? []).length;
    const pastDue = (account.requirements?.past_due ?? []).length;

    const connected =
      chargesEnabled && payoutsEnabled && due === 0 && pastDue === 0;

    return NextResponse.json({
      connected,
      accountId,
      chargesEnabled,
      payoutsEnabled,
      due,
      pastDue,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
