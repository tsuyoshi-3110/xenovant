// src/app/api/stripe/checkout-session/route.ts
import { NextRequest } from "next/server";
import { stripeConnect } from "@/lib/stripe-connect"; // ✅ 変更

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (obj: any, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");
    if (!sessionId) return json({ error: "session_id is required" }, 400);

    console.log("=== Stripe checkout-session handler ===");
    console.log("session_id received:", sessionId);

    const s = await stripeConnect.checkout.sessions.retrieve(sessionId, {
      expand: ["customer_details"],
    });

    return json({
      id: s.id,
      payment_status: s.payment_status,
      amount_total: s.amount_total,
      currency: s.currency,
      customer_email: s.customer_details?.email ?? null,
    });
  } catch (e: any) {
    console.error("checkout-session retrieve error:", e);
    return json({ error: e?.message || "internal error" }, 500);
  }
}
