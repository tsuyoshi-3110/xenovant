// app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Firestore の "in" は最大10件。分割取得ユーティリティ
async function fetchProductDocsChunked(siteKey: string, ids: string[]) {
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const slice = ids.slice(i, i + 10);
    const snap = await adminDb
      .collection(`siteProducts/${siteKey}/items`)
      .where("__name__", "in", slice)
      .get();
    docs.push(...snap.docs);
  }
  return docs;
}

function isAllowedOrigin(origin: string | null): boolean {
  // 同一オリジンの fetch だと Origin ヘッダが無いことがある → 許可
  if (!origin) return true;

  const allowed = [
    /\.yourdomain\.com$/,
    /^https:\/\/.+\.pageit\.jp$/,
    /^https:\/\/.+\.vercel\.app$/,
  ];

  // dev は localhost / 127.0.0.1 を許可
  if (process.env.NODE_ENV !== "production") {
    allowed.push(/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/);
  }

  return allowed.some((re) => re.test(origin));
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin"); // 同一オリジンだと null のことがある

  // クロスオリジンはホワイトリストで絞る（同一オリジン＝origin無しは許可）
  if (!isAllowedOrigin(origin)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const { items, siteKey, origin: bodyOrigin } = payload || {};
  if (!siteKey || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    // ---- 価格検証（siteKey配下の商品だけを許可）----
    const ids: string[] = items.map((x: any) => String(x.id));
    const qtyMap: Record<string, number> = Object.fromEntries(
      items.map((x: any) => [String(x.id), Math.max(1, Math.min(999, Number(x.qty) || 1))])
    );

    const productDocs = await fetchProductDocsChunked(siteKey, ids);

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    for (const doc of productDocs) {
      const data = doc.data() as any;
      const qty = qtyMap[doc.id] ?? 1;

      // 単価は整数（最小1円、異常値は0→弾く）
      const unit = Math.max(0, Math.floor(Number(data.price) || 0));
      if (unit <= 0) continue;

      line_items.push({
        quantity: qty,
        price_data: {
          currency: "jpy",
          unit_amount: unit,
          product_data: { name: String(data.title || "item") },
        },
      });
    }

    if (!line_items.length) {
      return NextResponse.json({ error: "no purchasable items" }, { status: 400 });
    }

    // 呼び出し元のURL（戻り先）— body が優先、無ければヘッダ由来（nullの可能性あり）
    const siteOrigin = String(bodyOrigin || origin || "");
    const success_url = siteOrigin ? `${siteOrigin}/thanks?sid={CHECKOUT_SESSION_ID}` : `/thanks?sid={CHECKOUT_SESSION_ID}`;
    const cancel_url = siteOrigin ? `${siteOrigin}/cart` : `/cart`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url,
      cancel_url,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: ["JP"] },
      metadata: { siteKey }, // Webhookで判別に使用
    });

    // CORS レスポンスヘッダは、クロスオリジン時のみ付与
    const corsHeaders =
      origin
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
          }
        : undefined;

    return NextResponse.json({ url: session.url }, { headers: corsHeaders });
  } catch (e) {
    console.error("[/api/checkout] error:", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "*";
  // 必要最低限のプリフライト応答
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}
