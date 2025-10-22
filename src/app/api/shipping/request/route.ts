// src/app/api/shipping/request/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/**
 * フォーム仕様（/owner/orders の PickupForm から POST）
 * - siteKey
 * - orderId
 * - orderTotal
 * - pickup_name / pickup_phone / pickup_postal / pickup_state / pickup_city / pickup_line1 / pickup_line2 / pickup_country
 * - pickup_date (YYYY-MM-DD)
 * - pickup_slot (AM | 12-14 | 14-16 | 16-18 | 18-20 | 19-21)
 * - package_size (60|80|100|120)
 * - package_count (>=1)
 * - note (任意)
 */

// ✅ ヤマトの集荷時間帯スロット → 送信用コード
const YAMATO_SLOT_MAP: Record<string, string> = {
  AM: "1", // 午前中
  "12-14": "2",
  "14-16": "3",
  "16-18": "4",
  "18-20": "5",
  "19-21": "6",
};

// 最低限の住所バリデーション（未入力だけ弾く）
function validatePickupAddress(addr: Record<string, string>) {
  const required = ["pickup_name", "pickup_phone", "pickup_postal", "pickup_state", "pickup_city", "pickup_line1"];
  const missing = required.filter((k) => !addr[k] || String(addr[k]).trim() === "");
  return { ok: missing.length === 0, missing };
}

// YYYY-MM-DD ざっくりチェック
function isYYYYMMDD(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  return !Number.isNaN(d.getTime());
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    // --- 基本パラメータ ---
    const siteKey = String(form.get("siteKey") ?? "").trim();
    const orderId = String(form.get("orderId") ?? "").trim();

    if (!siteKey || !orderId) {
      return NextResponse.json({ error: "missing_site_or_order" }, { status: 400 });
    }

    // --- 金額・荷姿 ---
    const orderTotal = Number(form.get("orderTotal") ?? 0);
    const size = String(form.get("package_size") ?? "80");
    const count = Math.max(1, Number(form.get("package_count") ?? 1));
    const note = String(form.get("note") ?? "");

    // --- 集荷日時（スロット式） ---
    const pickupDate = String(form.get("pickup_date") ?? "");
    const pickupSlot = String(form.get("pickup_slot") ?? "");
    const slotCode = YAMATO_SLOT_MAP[pickupSlot];

    if (!isYYYYMMDD(pickupDate)) {
      return NextResponse.json({ error: "invalid_pickup_date" }, { status: 400 });
    }
    if (!slotCode) {
      return NextResponse.json({ error: "invalid_pickup_slot" }, { status: 400 });
    }

    // --- 集荷元住所（hidden で渡ってくる） ---
    const pickupAddress = {
      pickup_name: String(form.get("pickup_name") ?? ""),
      pickup_phone: String(form.get("pickup_phone") ?? ""),
      pickup_postal: String(form.get("pickup_postal") ?? ""),
      pickup_state: String(form.get("pickup_state") ?? ""),
      pickup_city: String(form.get("pickup_city") ?? ""),
      pickup_line1: String(form.get("pickup_line1") ?? ""),
      pickup_line2: String(form.get("pickup_line2") ?? ""),
      pickup_country: String(form.get("pickup_country") ?? "JP"),
    };
    const addrCheck = validatePickupAddress(pickupAddress);
    if (!addrCheck.ok) {
      return NextResponse.json(
        { error: "pickup_address_incomplete", missing: addrCheck.missing },
        { status: 400 }
      );
    }

    // --- 注文の存在チェック（任意：存在だけ確認。なければ 404） ---
    const orderRef = adminDb.collection("siteOrders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "order_not_found" }, { status: 404 });
    }
    const orderData = orderSnap.data() ?? {};
    if ((orderData as any).siteKey !== siteKey) {
      // 念のためサイト不一致を弾く
      return NextResponse.json({ error: "order_site_mismatch" }, { status: 400 });
    }

    // --- ここで本来はヤマトの実 API を呼ぶ ---
    //     今回はスタブとして「成功した体」で Firestore に確定保存。
    //     後で createPickup(...) に差し替えるだけでOKな形にしておく。
    const now = Date.now();
    const requestId = `yamato_${orderId}_${now}`;

    const requestPayload = {
      provider: "yamato" as const,
      siteKey,
      orderId,
      orderTotal,
      package: { size, count },
      pickup: {
        date: pickupDate,        // YYYY-MM-DD
        slot: pickupSlot,        // 表示用（"14-16" 等）
        slotCode,                // ヤマトAPI用コード（"3" 等）
        address: {
          name: pickupAddress.pickup_name,
          phone: pickupAddress.pickup_phone,
          postal_code: pickupAddress.pickup_postal,
          state: pickupAddress.pickup_state,
          city: pickupAddress.pickup_city,
          line1: pickupAddress.pickup_line1,
          line2: pickupAddress.pickup_line2,
          country: pickupAddress.pickup_country || "JP",
        },
      },
      note,
      createdAt: now,
      status: "requested",       // requested | booked | failed など、後で更新
    };

    // ① 共有コレクションに保存（一覧用）
    const globalRef = adminDb.collection("shippingPickupRequests").doc(requestId);
    // ② 注文明細直下にも保存（関連づけ・トレース用）
    const orderSubRef = orderRef.collection("shippingRequests").doc(requestId);

    await Promise.all([
      globalRef.set(requestPayload, { merge: true }),
      orderSubRef.set(requestPayload, { merge: true }),
    ]);

    // --- 戻り先（成功） ---
    const redirectUrl = new URL(`/owner/orders?pickup=ok&order=${encodeURIComponent(orderId)}`, req.url);
    return NextResponse.redirect(redirectUrl, 303);
  } catch (err) {
    console.error("❌ shipping/request error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
