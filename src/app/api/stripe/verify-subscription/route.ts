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
 * - siteSettings/{siteKey} から stripeCustomerId を取得して照会
 * - もしくは session_id（Checkout Session）から判定
 * - "active" / "canceled" / "none" を返す（原則 200）
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const siteKey = searchParams.get("siteKey");
  const sessionId = searchParams.get("session_id") || searchParams.get("sessionId");

  console.log("📡 [verify-subscription] START", { siteKey, sessionId });

  try {
    /* ---------------- A) session_id が来たケース（サブスク以外は静かに none） ---------------- */
    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["subscription", "customer"],
        });

        // サブスク以外（通常決済など）は 200 で none を返して終了
        if (session.mode !== "subscription") {
          return NextResponse.json({
            status: "none",
            reason: "not-subscription",
            mode: session.mode,
            payment_status: session.payment_status,
          });
        }

        // サブスクの状態判定
        // 1) セッションにぶら下がる subscription の状態が取れるならそれを使う
        const subObj = typeof session.subscription === "string" ? null : session.subscription;
        if (subObj?.status) {
          const s = subObj.status;
          const mapped =
            s === "active" || s === "trialing" ? "active" :
            s === "canceled" ? "canceled" : "none";
          return NextResponse.json({ status: mapped, subscriptionId: subObj.id ?? null });
        }

        // 2) 取れない場合は customer から一覧で判定
        const customerId =
          (typeof session.customer === "string" ? session.customer : session.customer?.id) ?? undefined;

        if (!customerId) {
          return NextResponse.json({ status: "none", reason: "no-customer" });
        }

        const subs = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 5,
        });
        const hasActive = subs.data.some((s) => ["active", "trialing"].includes(s.status));
        const hasCanceled = subs.data.some((s) => s.status === "canceled");
        const status = hasActive ? "active" : hasCanceled ? "canceled" : "none";
        return NextResponse.json({ status });
      } catch (e: any) {
        console.error("❌ verify via session_id error:", e?.message || e);
        // ここも 200 で none を返してコンソールを汚さない
        return NextResponse.json({ status: "none", error: "session-lookup-failed" });
      }
    }

    /* ---------------- B) 既存フロー：siteKey から照会 ---------------- */
    if (!siteKey) {
      // 以前は 400 を返していたが、コンソールノイズを避け 200 で none
      return NextResponse.json({ status: "none", error: "missing-params" });
    }

    const db = getAdminDb();
    const snap = await db.collection("siteSettings").doc(siteKey).get();
    if (!snap.exists) {
      console.warn("⚠️ siteSettings not found:", siteKey);
      return NextResponse.json({ status: "none", error: "not-found" });
    }

    const data = snap.data() ?? {};
    const customerId = data.stripeCustomerId as string | undefined;
    const isFreePlan = data.isFreePlan !== false;

    if (isFreePlan || !customerId) {
      console.log("✅ 無料プラン or stripeCustomerId 未設定");
      return NextResponse.json({ status: "none" });
    }

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
    console.error("❌ verify-subscription error:", err?.message || err);
    // 最後も 200 で none（エラーを UI に波及させない）
    return NextResponse.json({ status: "none", error: "server-error" });
  }
}
