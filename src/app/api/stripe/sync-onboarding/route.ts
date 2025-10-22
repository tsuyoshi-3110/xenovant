// app/api/stripe/sync-onboarding/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { stripeConnect } from "@/lib/stripe-connect";

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

export async function POST(req: Request) {
  const t0 = Date.now();
  let step = "[sync-onboarding]";

  try {
    step = "[request] parse";
    const { sellerId } = await req.json();
    if (!sellerId) {
      return NextResponse.json(
        { error: "sellerId required", step },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const sellerRef = db.collection("siteSellers").doc(sellerId);
    const snap = await sellerRef.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "seller not found", step },
        { status: 404 }
      );
    }

    const stripeInfo = snap.get("stripe");
    const accountId = stripeInfo?.connectAccountId;
    if (!accountId) {
      return NextResponse.json(
        { error: "connectAccountId missing", step },
        { status: 400 }
      );
    }

    step = "[stripe] retrieve account";
    const account = await stripeConnect.accounts.retrieve(accountId);

    const detailsSubmitted = account.details_submitted === true;
    const chargesEnabled = account.charges_enabled === true;
    const payoutsEnabled = account.payouts_enabled === true;

    const completed = detailsSubmitted && chargesEnabled;

    step = "[firestore] update";
    await sellerRef.set(
      {
        stripe: {
          ...stripeInfo,
          onboardingCompleted: completed,
          chargesEnabled,
          payoutsEnabled,
          lastSyncAt: Timestamp.now(),
        },
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      sellerId,
      accountId,
      completed,
      detailsSubmitted,
      chargesEnabled,
      payoutsEnabled,
      step,
      elapsedMs: Date.now() - t0,
    });
  } catch (e: any) {
    console.error(step, "failed:", e?.message || e);
    return NextResponse.json(
      { error: e?.message || "sync failed", step },
      { status: 500 }
    );
  }
}
