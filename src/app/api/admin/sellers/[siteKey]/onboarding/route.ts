// app/api/admin/sellers/[siteKey]/onboarding/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function forbidden(msg = "forbidden") {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export async function GET(req: Request, ctx: any) {
  const siteKey: string | undefined = ctx?.params?.siteKey;
  if (!siteKey) {
    return NextResponse.json({ error: "siteKey missing" }, { status: 400 });
  }

  const doc = await adminDb.doc(`siteSellers/${siteKey}`).get();
  const stripe = (doc.data()?.stripe ?? {}) as { onboardingCompleted?: boolean };

  return NextResponse.json({
    siteKey,
    onboardingCompleted: !!stripe.onboardingCompleted,
  });
}

export async function PATCH(req: Request, ctx: any) {
  const siteKey: string | undefined = ctx?.params?.siteKey;
  if (!siteKey) {
    return NextResponse.json({ error: "siteKey missing" }, { status: 400 });
  }

  // すぐに既存の認証に置き換えてOK
  const token = req.headers.get("x-admin-token");
  if (process.env.ADMIN_TOKEN && token !== process.env.ADMIN_TOKEN) {
    return forbidden();
  }

  const body = await req.json().catch(() => ({}));
  const value = body?.onboardingCompleted;
  if (typeof value !== "boolean") {
    return NextResponse.json(
      { error: "onboardingCompleted(boolean) が必要です" },
      { status: 400 }
    );
  }

  await adminDb.doc(`siteSellers/${siteKey}`).set(
    { stripe: { onboardingCompleted: value } },
    { merge: true }
  );

  return NextResponse.json({ ok: true, onboardingCompleted: value });
}
