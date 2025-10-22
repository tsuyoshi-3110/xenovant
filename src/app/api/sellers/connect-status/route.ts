// src/app/api/sellers/connect-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { stripeConnect } from "@/lib/stripe-connect";
import Stripe from "stripe";

/**
 * GET /api/sellers/connect-status?siteKey=...（= sellerId）
 * 返り値:
 *  { status: "notStarted" | "inProgress" | "completed" | "mismatch" | "error", connectAccountId?: string }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const siteKey = searchParams.get("siteKey") || searchParams.get("sellerId");
    const debug = searchParams.get("debug") === "true";

    if (!siteKey) {
      return NextResponse.json(
        { error: "siteKey (or sellerId) is required" },
        { status: 400 }
      );
    }

    // Firestore: siteSellers/{siteKey}
    const sellerRef = adminDb.collection("siteSellers").doc(siteKey);
    const snap = await sellerRef.get();

    if (!snap.exists) {
      // まだ seller ドキュメント自体ない
      return NextResponse.json({ status: "notStarted" as const });
    }

    const data = snap.data() as any;
    const connectId: string | null = data?.stripe?.connectAccountId ?? null;

    if (!connectId) {
      // まだ Connect アカウントが作られていない
      return NextResponse.json({ status: "notStarted" as const });
    }

    // Stripe アカウント取得（Stripe.Response<Account> → .data に本体）
    let account: Stripe.Account;
    try {
      const res = await stripeConnect.accounts.retrieve(connectId);
      account = (res as any).data ?? (res as unknown as Stripe.Account);
    } catch (e: any) {
      // テスト鍵で本番IDを叩いた等の不一致時
      if (e?.code === "resource_missing") {
        return NextResponse.json({
          status: "mismatch" as const,
          connectAccountId: connectId,
          error: "Account not found in current Stripe mode",
        });
      }
      throw e;
    }

    // 各種フラグ
    const detailsSubmitted = !!account.details_submitted;
    const chargesEnabled = !!account.charges_enabled;
    const payoutsEnabled = !!account.payouts_enabled;
    const transfersActive = account.capabilities?.transfers === "active";
    const cardPaymentsActive = account.capabilities?.card_payments === "active";
    const due =
      Array.isArray(account.requirements?.currently_due) &&
      account.requirements!.currently_due!.length > 0;

    // 「販売可能」判定
    const completed =
      detailsSubmitted &&
      (chargesEnabled || payoutsEnabled || transfersActive || cardPaymentsActive) &&
      !due;

    const status: "completed" | "inProgress" = completed ? "completed" : "inProgress";

    // Firestore 同期（completedになったら保存）
    if (completed && !data?.stripe?.onboardingCompleted) {
      await sellerRef.set(
        {
          stripe: {
            onboardingCompleted: true,
            connectAccountId: connectId,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      status,
      connectAccountId: connectId,
      ...(debug
        ? {
            debug: {
              detailsSubmitted,
              chargesEnabled,
              payoutsEnabled,
              transfersActive,
              cardPaymentsActive,
              due,
              // livemode は Account 型に無いので返さない
            },
          }
        : {}),
    });
  } catch (err: any) {
    console.error("[connect-status] failed:", err?.message || err);
    return NextResponse.json(
      { status: "error", error: err?.message || "failed to get status" },
      { status: 500 }
    );
  }
}
