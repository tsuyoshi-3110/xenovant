// src/app/api/stripe/create-onboarding-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripeConnect } from "@/lib/stripe-connect";   // Stripe = new Stripe(..., apiVersion) したもの
import { adminDb } from "@/lib/firebase-admin";         // Firebase Admin SDK (server 専用)

export const runtime = "nodejs";         // ← Edge では動かさない
export const dynamic = "force-dynamic";  // ← dev 時のキャッシュ無効化

type Body = {
  siteKey?: string;              // ★ ドキュメントIDに使う（推奨）
  sellerId?: string;             // 互換用（来ていれば siteKey が無い時のフォールバック）
  returnUrl?: string;            // 例: https://xenovant.shop
  refreshUrl?: string;           // 省略可（returnUrl から自動生成）
  successReturnUrl?: string;     // 省略可（returnUrl から自動生成）
};

export async function POST(req: NextRequest) {
  let step = "start";
  try {
    const {
      siteKey,
      sellerId,
      returnUrl,
      refreshUrl,
      successReturnUrl,
    } = (await req.json()) as Body;

    // ★ ドキュメントIDは siteKey を優先。無ければ sellerId、どちらも無いなら 400
    const id = siteKey || sellerId;
    if (!id) {
      return NextResponse.json({ error: "siteKey (or sellerId) is required", step }, { status: 400 });
    }

    // ★ ベースURL：明示の returnUrl > リクエストの origin > .env
    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const ownerBase =
      (returnUrl && returnUrl.startsWith("http") ? returnUrl : origin).replace(/\/+$/, "");

    const refresh = refreshUrl ?? `${ownerBase}/onboarding/refresh?siteKey=${encodeURIComponent(id)}`;
    const success = successReturnUrl ?? `${ownerBase}/onboarding/return?siteKey=${encodeURIComponent(id)}`;

    // Firestore: siteSellers/{id} を作成/更新
    step = "firestore:get";
    const ref = adminDb.collection("siteSellers").doc(id);
    let snap = await ref.get();

    if (!snap.exists) {
      step = "firestore:init";
      await ref.set({
        name: "未設定",
        email: "",
        siteKey: siteKey ?? null,
        stripe: { connectAccountId: null, onboardingCompleted: false },
        fee: { platformPct: 0 },
        donationPct: 0.01,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      snap = await ref.get();
    }

    const data = snap.data() || {};
    let connectAccountId: string | null = data?.stripe?.connectAccountId ?? null;
    const sellerEmail =
      typeof data?.email === "string" && data.email ? (data.email as string) : undefined;

    // Stripe: 未連携なら Express アカウントを作る
    if (!connectAccountId) {
      step = "stripe:accounts.create";
      const acct = await stripeConnect.accounts.create({
        type: "express",
        country: "JP",
        email: sellerEmail,
        capabilities: {
          transfers: { requested: true },
          // card_payments: { requested: true }, // 必要なら有効化
        },
        metadata: { siteKey: id },
      });
      connectAccountId = acct.id;

      step = "firestore:updateAccountId";
      await ref.set(
        {
          stripe: { connectAccountId, onboardingCompleted: false },
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }

    // オンボーディングリンク発行
    step = "stripe:accountLinks.create";
    const link = await stripeConnect.accountLinks.create({
      account: connectAccountId!,
      type: "account_onboarding",
      refresh_url: refresh,
      return_url: success,
    });

    return NextResponse.json({
      url: link.url,
      accountId: connectAccountId,
      step,
    });
  } catch (e: any) {
    console.error("create-onboarding-link error at", step, ":", e?.message || e);
    return NextResponse.json(
      { error: e?.message || "failed to create onboarding link", step },
      { status: 500 }
    );
  }
}
