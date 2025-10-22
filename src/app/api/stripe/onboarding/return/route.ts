// src/app/api/stripe/onboarding/return/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { stripeConnect } from "@/lib/stripe-connect";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sellerId = searchParams.get("sellerId");
    if (!sellerId) {
      // sellerId が無ければトップへ（任意で変更）
      return NextResponse.redirect(new URL("/", req.url));
    }

    // Firestore: siteSellers/{sellerId}
    const sellerRef = adminDb.collection("siteSellers").doc(sellerId);
    const snap = await sellerRef.get();
    const connectId: string | undefined =
      snap.exists ? snap.data()?.stripe?.connectAccountId : undefined;

    if (!connectId) {
      // Connect アカウント未作成
      return NextResponse.redirect(new URL("/login?err=noacct", req.url));
    }

    // Stripe 側のアカウント状態を取得
    const acct = await stripeConnect.accounts.retrieve(connectId);

    // 提出状況・可否
    const detailsSubmitted = !!acct.details_submitted;
    const chargesEnabled = !!acct.charges_enabled;
    const payoutsEnabled = !!acct.payouts_enabled;
    const transfersActive = acct.capabilities?.transfers === "active";

    // いま未提出の必須項目が残っているか
    const hasDue =
      Array.isArray(acct.requirements?.currently_due) &&
      acct.requirements!.currently_due!.length > 0;

    // 完了条件：
    //  1) details_submitted 済み
    //  2) 決済 or 振込 or transfers capability が有効
    //  3) currently_due が空
    const onboardingCompleted =
      detailsSubmitted &&
      (chargesEnabled || payoutsEnabled || transfersActive) &&
      !hasDue;

    await sellerRef.set(
      {
        stripe: {
          connectAccountId: connectId,
          onboardingCompleted,
        },
        updatedAt: new Date(),
      },
      { merge: true }
    );

    // 完了/未完了どちらでも管理画面へ戻す
    return NextResponse.redirect(new URL("/login", req.url));
  } catch (e: any) {
    console.error("onboarding/return error:", e?.message || e);
    return NextResponse.redirect(new URL("/login?err=return", req.url));
  }
}
