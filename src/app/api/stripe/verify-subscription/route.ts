// app/api/stripe/verify-subscription/route.ts
import { NextResponse } from "next/server";

import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { stripe } from "@/lib/stripe";

/* ---------------- Firebase Admin 初期化 ---------------- */
function getAdminDb() {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";

    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Firebase Admin 環境変数が不足しています");
    }

    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}


/**
 * ✅ サブスクリプション状態を確認するAPI
 * - siteSettings/{siteKey} から stripeCustomerId を取得
 * - Stripe上でサブスクリプションを照会
 * - "active" / "canceled" / "none" を返す
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const siteKey = searchParams.get("siteKey");

  console.log("📡 [verify-subscription] START", siteKey);

  if (!siteKey) {
    return NextResponse.json({ status: "none", error: "siteKey missing" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection("siteSettings").doc(siteKey).get();

    if (!snap.exists) {
      console.warn("⚠️ siteSettings not found:", siteKey);
      return NextResponse.json({ status: "none", error: "not found" }, { status: 404 });
    }

    const data = snap.data() ?? {};
    const customerId = data.stripeCustomerId as string | undefined;
    const isFreePlan = data.isFreePlan !== false;

    if (isFreePlan || !customerId) {
      console.log("✅ 無料プラン or stripeCustomerId 未設定");
      return NextResponse.json({ status: "none" });
    }

    // Stripe上でサブスクリプションを確認
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 5,
    });

    const hasActive = subs.data.some((s) => ["active", "trialing"].includes(s.status));
    const hasCanceled = subs.data.some((s) => s.status === "canceled");

    const status = hasActive ? "active" : hasCanceled ? "canceled" : "none";

    console.log("✅ 判定結果:", { siteKey, status });

    return NextResponse.json({ status });
  } catch (err: any) {
    console.error("❌ verify-subscription error:", err.message || err);
    return NextResponse.json(
      { status: "none", error: err?.message ?? "Server Error" },
      { status: 500 }
    );
  }
}
