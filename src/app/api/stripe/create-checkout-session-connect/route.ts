// src/app/api/stripe/create-checkout-session-connect/route.ts
import { stripeConnect } from "@/lib/stripe-connect";
import { NextRequest } from "next/server";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

// 取り分：運営5% + 環境1% = 合計6%
const PLATFORM_CUT_RATE = 0.06;

type ReqItem = {
  name: string;
  unitAmount: number; // 最小通貨単位（JPY=1円）
  qty: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = (body?.items ?? []) as ReqItem[];

    if (!Array.isArray(items) || items.length === 0) {
      return json({ error: "カートが空です" }, 400);
    }

    // 出店者（接続アカウント）情報を取得
    const sellerDoc = await adminDb.collection("siteSellers").doc(SITE_KEY).get();
    if (!sellerDoc.exists) {
      return json({ error: "出店者が見つかりません" }, 404);
    }
    const seller = sellerDoc.data() as
      | { stripe?: { connectAccountId?: string; onboardingCompleted?: boolean } }
      | undefined;

    if (!seller?.stripe?.connectAccountId || !seller?.stripe?.onboardingCompleted) {
      return json({ error: "この出店者は Stripe 連携が未完了です" }, 400);
    }

    const connectAccountId = String(seller.stripe.connectAccountId).trim();
    const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // line_items 整形 & 金額検証
    const lineItems = items.map((it) => {
      const unit = Math.max(0, Math.floor(Number(it.unitAmount) || 0));
      const qty = Math.max(1, Math.floor(Number(it.qty) || 0));
      if (!it.name || unit <= 0 || qty <= 0) {
        throw new Error("商品情報が不正です");
      }
      return {
        price_data: {
          currency: "jpy",
          product_data: { name: String(it.name) },
          unit_amount: unit,
        },
        quantity: qty,
      };
    });

    const subtotal = items.reduce((sum, it) => {
      const unit = Math.max(0, Math.floor(Number(it.unitAmount) || 0));
      const qty = Math.max(1, Math.floor(Number(it.qty) || 0));
      return sum + unit * qty;
    }, 0);

    if (subtotal <= 0) {
      return json({ error: "合計金額が無効です" }, 400);
    }

    // 当社取り分（6%）
    const application_fee_amount = Math.max(0, Math.round(subtotal * PLATFORM_CUT_RATE));

    const session = await stripeConnect.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      currency: "jpy",
      line_items: lineItems,

      // ✅ Connect (destination charge) & プラットフォーム手数料
      payment_intent_data: {
        application_fee_amount,
        transfer_data: { destination: connectAccountId },
      },

      // ✅ 住所＆電話番号の収集
      // - billing_address_collection: 請求先住所を必須に
      // - phone_number_collection.enabled: 電話番号入力を有効化
      // - customer_creation: "always" にして Customer にも保存（後続で再利用や参照が楽）
      billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: ["JP"] },
      phone_number_collection: { enabled: true },
      customer_creation: "always",

      // 参考: ローカライズ（必要に応じて）
      locale: "ja",

      // 任意メタデータ（Webhookや受注保存で利用）
      metadata: {
        siteKey: SITE_KEY,
        items: JSON.stringify(items),
      },

      success_url: `${origin}/result?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/result?status=cancel`,
      // allow_promotion_codes: true, // クーポンを使う場合は有効化
    });

    return json({ url: session.url });
  } catch (e: any) {
    console.error("Checkout Session Error:", e);
    return json({ error: e?.message || "internal error" }, 500);
  }
}
