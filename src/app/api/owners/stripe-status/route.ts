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

    // ★ 参照先を sites → siteSellers に変更
    const sellerSnap = await adminDb.collection("siteSellers").doc(siteKey).get();
    if (!sellerSnap.exists) {
      return NextResponse.json({ connected: false, reason: "seller_doc_not_found" });
    }

    const seller = sellerSnap.data() || {};
    const connectAccountId: string | undefined = seller?.stripe?.connectAccountId;
    const onboardingCompleted: boolean = !!seller?.stripe?.onboardingCompleted;

    if (!connectAccountId) {
      return NextResponse.json({
        connected: false,
        reason: "no_connect_account_id",
        onboardingCompleted,
      });
    }

    // Stripeの口座状態も取得（charges/payouts/要件）
    let chargesEnabled = false;
    let payoutsEnabled = false;
    let due = 0;
    let pastDue = 0;

    try {
      const account = await stripe.accounts.retrieve(connectAccountId);
      chargesEnabled = !!account.charges_enabled;
      payoutsEnabled = !!account.payouts_enabled;
      due = (account.requirements?.currently_due ?? []).length;
      pastDue = (account.requirements?.past_due ?? []).length;
    } catch  {
      // アカウント取得失敗時は、オンボ完了フラグだけで返す
    }

    // 連携OKの判定基準（必要に応じて調整可）
    // - 最低ライン：オンボ完了（画面遷移できる状態） or chargesEnabled が true
    const connected = onboardingCompleted || chargesEnabled;

    return NextResponse.json({
      connected,
      accountId: connectAccountId,
      onboardingCompleted,
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
