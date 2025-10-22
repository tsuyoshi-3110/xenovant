import { stripe } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase-admin";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import Stripe from "stripe";

export const config = {
  api: {
    bodyParser: false, // Webhook では必須
  },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.arrayBuffer();
  const sig = (await headers()).get("stripe-signature");

  if (!sig) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      Buffer.from(rawBody),
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    try {
      const {
        id,
        amount_total,
        currency,
        payment_status,
        customer_details,
        metadata,
      } = session;

      const items = metadata?.items ? JSON.parse(metadata.items) : [];

      await adminDb.collection("siteOrders").add({
        siteKey: metadata?.siteKey || null,
        createdAt: new Date(),
        stripeCheckoutSessionId: id,
        amount: amount_total,
        currency,
        payment_status,
        customer: {
          email: customer_details?.email ?? null,
          name: customer_details?.name ?? null,
          address: customer_details?.address ?? null,
        },
        items,
      });

      return new Response("Order stored successfully", { status: 200 });
    } catch (err) {
      console.error("Failed to save order to Firestore:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  return new Response("Unhandled event type", { status: 200 });
}
