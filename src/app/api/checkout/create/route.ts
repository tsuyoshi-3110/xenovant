// app/api/checkout/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripeConnect } from "@/lib/stripe-connect";
import { adminDb } from "@/lib/firebase-admin";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** プラットフォーム取り分（例：7%） */
const PLATFORM_FEE_RATE = 0.07;

/* ---------- Checkout locale 正規化 ---------- */
type CheckoutLocale = Stripe.Checkout.SessionCreateParams.Locale;
function normalizeCheckoutLocale(uiLang?: string | null): CheckoutLocale {
  const ok: CheckoutLocale[] = [
    "auto","bg","cs","da","de","el","en","en-GB","es","es-419","et","fi","fil","fr","fr-CA",
    "hr","hu","id","it","ja","ko","lt","lv","ms","mt","nb","nl","pl","pt","pt-BR","ro","ru",
    "sk","sl","sv","th","tr","vi","zh","zh-HK","zh-TW",
  ];
  const s = (uiLang ?? "").trim();
  if (!s) return "auto";
  if (s.toLowerCase() === "en") return "en-GB";
  const hit = ok.find(v => v.toLowerCase() === s.toLowerCase());
  if (hit) return hit;
  const base = ok.find(v => v.toLowerCase() === s.split("-")[0].toLowerCase());
  return base ?? "auto";
}

/* ---------- Origin 制限（必要に応じて編集） ---------- */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  const allowed: RegExp[] = [
    /\.yourdomain\.com$/,
    /^https:\/\/.+\.pageit\.jp$/,
    /^https:\/\/.+\.vercel\.app$/,
  ];
  if (process.env.NODE_ENV !== "production") {
    allowed.push(/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/);
  }
  return allowed.some((re) => re.test(origin));
}

/* ---------- 多言語タイトル抽出（既存ロジック簡略化版） ---------- */
type NamesMap = Record<string, string>;
const CANON_MAP: Record<string, string> = {
  jp: "ja", kr: "ko", cn: "zh", tw: "zh-TW", hk: "zh-HK",
  "zh-hant": "zh-TW", "zh_hant": "zh-TW", "zh-hans": "zh", "zh_hans": "zh",
  ptbr: "pt-BR", "pt_br": "pt-BR",
};
function canonLang(code: string): string {
  const c = (code ?? "").replace(/_/g, "-").trim().toLowerCase();
  if (!c) return "";
  if (CANON_MAP[c]) return CANON_MAP[c];
  if (c === "zh-cn") return "zh";
  if (c.startsWith("zh-")) return "zh-" + c.split("-")[1].toUpperCase();
  if (c.length === 2) return c;
  const [b, r] = c.split("-");
  return r ? `${b}-${r.toUpperCase()}` : b;
}
function pickStr(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function collectLocalizedNames(data: any): NamesMap {
  const out: NamesMap = {};
  const baseJa = pickStr(data?.base?.title) || pickStr(data?.title);
  if (baseJa) out["ja"] = baseJa;

  if (Array.isArray(data?.t)) {
    for (const row of data.t as Array<{ lang?: string; title?: string; body?: string }>) {
      const code = row?.lang ? canonLang(row.lang) : "";
      const title = pickStr(row?.title) || pickStr(row?.body);
      if (code && title) out[code] = title;
    }
  }
  if (data?.i18n && typeof data.i18n === "object") {
    for (const [k, obj] of Object.entries<any>(data.i18n)) {
      if (!obj || typeof obj !== "object") continue;
      const t = pickStr((obj as any).title) || pickStr((obj as any).name);
      if (t) out[canonLang(k)] = t;
      for (const [kk, vv] of Object.entries<any>(obj)) {
        const m = /^title[_-]([a-zA-Z][\w-]+)$/.exec(kk);
        if (m && pickStr(vv)) out[canonLang(m[1])] = String(vv);
      }
    }
  }
  for (const [k, v] of Object.entries<any>(data)) {
    const m = /^(title|name)[_-]([a-zA-Z][\w-]+)$/.exec(k);
    if (m && pickStr(v)) out[canonLang(m[2])] = String(v);
  }
  return out;
}
function buildNamesMetaMinimal(selLang: string, names: Record<string, string>, display: string) {
  const sel = canonLang(selLang || "ja");
  const ja = names["ja"] || display;
  const baseSel = names[sel] || names[sel.split("-")[0]] || display;
  const meta: Record<string, string> = { name: ja, name_ja: ja, lang: sel };
  if (sel !== "ja") meta[`name_${sel}`] = baseSel;
  return meta;
}

/* ---------- Firestore utils ---------- */
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

/* ====================== メイン ====================== */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  // 共通CORSヘッダー
  const corsHeaders = origin
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" }
    : undefined;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders });
  }

  const { siteKey, items, lang, origin: bodyOrigin } = body || {};
  if (!siteKey || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: corsHeaders });
  }

  // Connect 口座
  const sellerSnap = await adminDb.collection("siteSellers").doc(siteKey).get();

  // EC 停止中なら決済をブロック
  if (sellerSnap.exists && sellerSnap.get("ecStop") === true) {
    return NextResponse.json(
      { error: "EC_STOPPED", message: "現在このショップのECは一時停止中です。" },
      { status: 403, headers: corsHeaders }
    );
  }

  const sellerConnectId: string | null = sellerSnap.get("stripe.connectAccountId") || null;
  if (!sellerConnectId || !sellerConnectId.startsWith("acct_")) {
    return NextResponse.json({ error: "Connect account missing" }, { status: 400, headers: corsHeaders });
  }

  // 言語→Checkout 表示ロケール（通貨ではない）
  const locale = normalizeCheckoutLocale(lang || "ja");

  // 商品取得
  const ids = items.map((x: any) => String(x.id));
  const qtyMap: Record<string, number> = Object.fromEntries(
    items.map((x: any) => {
      const raw = x?.qty ?? x?.quantity ?? x?.count ?? x?.q ?? 1;
      const n = Number(raw);
      const q = Number.isFinite(n) ? Math.floor(n) : 1;
      return [String(x.id), Math.max(1, Math.min(999, q))];
    })
  );
  const productDocs = await fetchProductDocsChunked(siteKey, ids);

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  const pendingItems: Array<{
    id: string;
    name: string;
    quantity: number;
    unitAmountJPY: number; // JPY (最小通貨単位＝major)
  }> = [];
  let subtotalMinorJPY = 0;

  for (const doc of productDocs) {
    const data = doc.data() as any;
    const qty = qtyMap[doc.id] ?? 1;

    // Firestore 価格は “税込 JPY major”。JPY はゼロ小数なので unit_amount=major
    const unitJPY = Math.max(
      0,
      Math.floor(
        Number(data.priceIncl ?? data.price ?? data.priceTaxIncl ?? data.price_incl) || 0
      )
    );
    if (unitJPY <= 0) continue;

    const names = collectLocalizedNames(data);
    const reqCanon = canonLang(lang || "ja");
    const baseCanon = canonLang((lang || "ja").split("-")[0]);

    const displayName =
      names[reqCanon] ||
      names[baseCanon] ||
      names["ja"] ||
      names["en"] ||
      pickStr(data?.title) ||
      pickStr(data?.base?.title) ||
      "Item";

    const namesMeta = buildNamesMetaMinimal(reqCanon, names, displayName);

    line_items.push({
      quantity: qty,
      price_data: {
        currency: "jpy",
        unit_amount: unitJPY,
        product_data: {
          name: displayName,
          metadata: {
            productId: doc.id,
            siteKey,
            baseAmountJPY: String(unitJPY),
            ...namesMeta,
          },
        },
      },
    });

    pendingItems.push({
      id: doc.id,
      name: displayName,
      quantity: qty,
      unitAmountJPY: unitJPY,
    });

    subtotalMinorJPY += unitJPY * qty; // JPY はゼロ小数
  }

  if (!line_items.length) {
    return NextResponse.json({ error: "No purchasable items" }, { status: 400, headers: corsHeaders });
  }

  // SCaT: 手数料は後の送金額で控除する
  const platformFeeJPY = Math.floor(subtotalMinorJPY * PLATFORM_FEE_RATE);

  const baseOrigin = bodyOrigin || origin || process.env.NEXT_PUBLIC_ORIGIN || "";
  const success_url = `${baseOrigin}/cart?session_id={CHECKOUT_SESSION_ID}&status=success`;
  const cancel_url = `${baseOrigin}/cart`;

  try {
    // Separate Charges & Transfers 用の transfer_group
    const transferGroup = `grp_${siteKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 1) Checkout セッション作成（destination charge は使わない）
    const session = await stripeConnect.checkout.sessions.create({
      mode: "payment",
      line_items,
      locale,
      allow_promotion_codes: true,
      customer_creation: "always",
      phone_number_collection: { enabled: true },
      billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: ["JP"] },
      payment_intent_data: {
        // on_behalf_of は付けない（接続先に card_payments が無いとエラーになるため）
        transfer_group: transferGroup,
      },
      metadata: {
        siteKey,
        uiLang: lang ?? "",
        lang: canonLang(lang || "ja"),
        currency: "JPY", // ← 課金通貨は JPY に固定
        platformFeePct: String(PLATFORM_FEE_RATE),
        transferGroup,
        sellerConnectId,
      },
      client_reference_id: siteKey,
      success_url,
      cancel_url,
    });

    // 2) 🔸 pendingOrders に保存（Webhookで在庫減算や送金準備に使用）
    await adminDb.collection("pendingOrders").doc(session.id).set({
      siteKey,
      status: "pending",
      items: pendingItems, // [{id, name, quantity, unitAmountJPY}]
      subtotalJPY: subtotalMinorJPY,
      applicationFeeJPY: platformFeeJPY,
      uiLang: lang ?? "ja",
      checkout: {
        sessionId: session.id,
        url: session.url,
        locale,
        sellerConnectId,
        transferGroup,
      },
      createdAt: new Date(),
    });

    return NextResponse.json({ url: session.url }, { headers: corsHeaders });
  } catch (e: any) {
    console.error("[/api/checkout/create] error:", e?.message || e, { code: e?.code, type: e?.type });
    return NextResponse.json({ error: e?.message ?? "internal error" }, { status: 500, headers: corsHeaders });
  }
}

/* ---------- OPTIONS（プリフライト） ---------- */
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "*";
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}





// // app/api/checkout/create/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { stripeConnect } from "@/lib/stripe-connect";
// import { adminDb } from "@/lib/firebase-admin";
// import type Stripe from "stripe";

// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

// /** プラットフォーム取り分（例：7%） */
// const PLATFORM_FEE_RATE = 0.07;

// /* ---------- Checkout locale 正規化 ---------- */
// type CheckoutLocale = Stripe.Checkout.SessionCreateParams.Locale;
// function normalizeCheckoutLocale(uiLang?: string | null): CheckoutLocale {
//   const ok: CheckoutLocale[] = [
//     "auto","bg","cs","da","de","el","en","en-GB","es","es-419","et","fi","fil","fr","fr-CA",
//     "hr","hu","id","it","ja","ko","lt","lv","ms","mt","nb","nl","pl","pt","pt-BR","ro","ru",
//     "sk","sl","sv","th","tr","vi","zh","zh-HK","zh-TW",
//   ];
//   const s = (uiLang ?? "").trim();
//   if (!s) return "auto";
//   if (s.toLowerCase() === "en") return "en-GB";
//   const hit = ok.find(v => v.toLowerCase() === s.toLowerCase());
//   if (hit) return hit;
//   const base = ok.find(v => v.toLowerCase() === s.split("-")[0].toLowerCase());
//   return base ?? "auto";
// }

// /* ---------- Origin 制限（必要に応じて編集） ---------- */
// function isAllowedOrigin(origin: string | null): boolean {
//   if (!origin) return true;
//   const allowed: RegExp[] = [
//     /\.yourdomain\.com$/,
//     /^https:\/\/.+\.pageit\.jp$/,
//     /^https:\/\/.+\.vercel\.app$/,
//   ];
//   if (process.env.NODE_ENV !== "production") {
//     allowed.push(/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/);
//   }
//   return allowed.some((re) => re.test(origin));
// }

// /* ---------- 多言語タイトル抽出（既存ロジック簡略化版） ---------- */
// type NamesMap = Record<string, string>;
// const CANON_MAP: Record<string, string> = {
//   jp: "ja", kr: "ko", cn: "zh", tw: "zh-TW", hk: "zh-HK",
//   "zh-hant": "zh-TW", "zh_hant": "zh-TW", "zh-hans": "zh", "zh_hans": "zh",
//   ptbr: "pt-BR", "pt_br": "pt-BR",
// };
// function canonLang(code: string): string {
//   const c = (code ?? "").replace(/_/g, "-").trim().toLowerCase();
//   if (!c) return "";
//   if (CANON_MAP[c]) return CANON_MAP[c];
//   if (c === "zh-cn") return "zh";
//   if (c.startsWith("zh-")) return "zh-" + c.split("-")[1].toUpperCase();
//   if (c.length === 2) return c;
//   const [b, r] = c.split("-");
//   return r ? `${b}-${r.toUpperCase()}` : b;
// }
// function pickStr(v: unknown) {
//   return typeof v === "string" && v.trim() ? v.trim() : undefined;
// }
// function collectLocalizedNames(data: any): NamesMap {
//   const out: NamesMap = {};
//   const baseJa = pickStr(data?.base?.title) || pickStr(data?.title);
//   if (baseJa) out["ja"] = baseJa;

//   if (Array.isArray(data?.t)) {
//     for (const row of data.t as Array<{ lang?: string; title?: string; body?: string }>) {
//       const code = row?.lang ? canonLang(row.lang) : "";
//       const title = pickStr(row?.title) || pickStr(row?.body);
//       if (code && title) out[code] = title;
//     }
//   }
//   if (data?.i18n && typeof data.i18n === "object") {
//     for (const [k, obj] of Object.entries<any>(data.i18n)) {
//       if (!obj || typeof obj !== "object") continue;
//       const t = pickStr((obj as any).title) || pickStr((obj as any).name);
//       if (t) out[canonLang(k)] = t;
//       for (const [kk, vv] of Object.entries<any>(obj)) {
//         const m = /^title[_-]([a-zA-Z][\w-]+)$/.exec(kk);
//         if (m && pickStr(vv)) out[canonLang(m[1])] = String(vv);
//       }
//     }
//   }
//   for (const [k, v] of Object.entries<any>(data)) {
//     const m = /^(title|name)[_-]([a-zA-Z][\w-]+)$/.exec(k);
//     if (m && pickStr(v)) out[canonLang(m[2])] = String(v);
//   }
//   return out;
// }
// function buildNamesMetaMinimal(selLang: string, names: Record<string, string>, display: string) {
//   const sel = canonLang(selLang || "ja");
//   const ja = names["ja"] || display;
//   const baseSel = names[sel] || names[sel.split("-")[0]] || display;
//   const meta: Record<string, string> = { name: ja, name_ja: ja, lang: sel };
//   if (sel !== "ja") meta[`name_${sel}`] = baseSel;
//   return meta;
// }

// /* ---------- Firestore utils ---------- */
// async function fetchProductDocsChunked(siteKey: string, ids: string[]) {
//   const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
//   for (let i = 0; i < ids.length; i += 10) {
//     const slice = ids.slice(i, i + 10);
//     const snap = await adminDb
//       .collection(`siteProducts/${siteKey}/items`)
//       .where("__name__", "in", slice)
//       .get();
//     docs.push(...snap.docs);
//   }
//   return docs;
// }

// /* ====================== メイン ====================== */
// export async function POST(req: NextRequest) {
//   const origin = req.headers.get("origin");
//   if (!isAllowedOrigin(origin)) {
//     return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
//   }

//   let body: any;
//   try {
//     body = await req.json();
//   } catch {
//     return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
//   }

//   const { siteKey, items, lang, origin: bodyOrigin } = body || {};
//   if (!siteKey || !Array.isArray(items) || items.length === 0) {
//     return NextResponse.json({ error: "Bad request" }, { status: 400 });
//   }

//   // Connect 口座
//   const sellerSnap = await adminDb.collection("siteSellers").doc(siteKey).get();
//   const sellerConnectId: string | null = sellerSnap.get("stripe.connectAccountId") || null;
//   if (!sellerConnectId || !sellerConnectId.startsWith("acct_")) {
//     return NextResponse.json({ error: "Connect account missing" }, { status: 400 });
//   }

//   // 言語→Checkout 表示ロケール（通貨ではない）
//   const locale = normalizeCheckoutLocale(lang || "ja");

//   // 商品取得
//   const ids = items.map((x: any) => String(x.id));
//   const qtyMap: Record<string, number> = Object.fromEntries(
//     items.map((x: any) => {
//       const raw = x?.qty ?? x?.quantity ?? x?.count ?? x?.q ?? 1;
//       const n = Number(raw);
//       const q = Number.isFinite(n) ? Math.floor(n) : 1;
//       return [String(x.id), Math.max(1, Math.min(999, q))];
//     })
//   );
//   const productDocs = await fetchProductDocsChunked(siteKey, ids);

//   const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
//   const pendingItems: Array<{
//     id: string;
//     name: string;
//     quantity: number;
//     unitAmountJPY: number; // JPY (最小通貨単位＝major)
//   }> = [];
//   let subtotalMinorJPY = 0;

//   for (const doc of productDocs) {
//     const data = doc.data() as any;
//     const qty = qtyMap[doc.id] ?? 1;

//     // Firestore 価格は “税込 JPY major”。JPY はゼロ小数なので unit_amount=major
//     const unitJPY = Math.max(
//       0,
//       Math.floor(
//         Number(data.priceIncl ?? data.price ?? data.priceTaxIncl ?? data.price_incl) || 0
//       )
//     );
//     if (unitJPY <= 0) continue;

//     const names = collectLocalizedNames(data);
//     const reqCanon = canonLang(lang || "ja");
//     const baseCanon = canonLang((lang || "ja").split("-")[0]);

//     const displayName =
//       names[reqCanon] ||
//       names[baseCanon] ||
//       names["ja"] ||
//       names["en"] ||
//       pickStr(data?.title) ||
//       pickStr(data?.base?.title) ||
//       "Item";

//     const namesMeta = buildNamesMetaMinimal(reqCanon, names, displayName);

//     line_items.push({
//       quantity: qty,
//       price_data: {
//         currency: "jpy",
//         unit_amount: unitJPY,
//         product_data: {
//           name: displayName,
//           metadata: {
//             productId: doc.id,
//             siteKey,
//             baseAmountJPY: String(unitJPY),
//             ...namesMeta,
//           },
//         },
//       },
//     });

//     pendingItems.push({
//       id: doc.id,
//       name: displayName,
//       quantity: qty,
//       unitAmountJPY: unitJPY,
//     });

//     subtotalMinorJPY += unitJPY * qty; // JPY はゼロ小数
//   }

//   if (!line_items.length) {
//     return NextResponse.json({ error: "No purchasable items" }, { status: 400 });
//   }

//   // SCaT: 手数料は後の送金額で控除する
//   const platformFeeJPY = Math.floor(subtotalMinorJPY * PLATFORM_FEE_RATE);

//   const baseOrigin = bodyOrigin || origin || process.env.NEXT_PUBLIC_ORIGIN || "";
//   const success_url = `${baseOrigin}/cart?session_id={CHECKOUT_SESSION_ID}&status=success`;
//   const cancel_url = `${baseOrigin}/cart`;

//   try {
//     // Separate Charges & Transfers 用の transfer_group
//     const transferGroup = `grp_${siteKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

//     // 1) Checkout セッション作成（destination charge は使わない）
//     const session = await stripeConnect.checkout.sessions.create({
//       mode: "payment",
//       line_items,
//       locale,
//       allow_promotion_codes: true,
//       customer_creation: "always",
//       phone_number_collection: { enabled: true },
//       billing_address_collection: "required",
//       shipping_address_collection: { allowed_countries: ["JP"] },
//       payment_intent_data: {
//         // on_behalf_of は付けない（接続先に card_payments が無いとエラーになるため）
//         transfer_group: transferGroup,
//       },
//       metadata: {
//         siteKey,
//         uiLang: lang ?? "",
//         lang: canonLang(lang || "ja"),
//         currency: "JPY", // ← 課金通貨は JPY に固定
//         platformFeePct: String(PLATFORM_FEE_RATE),
//         transferGroup,
//         sellerConnectId,
//       },
//       client_reference_id: siteKey,
//       success_url,
//       cancel_url,
//     });

//     // 2) 🔸 pendingOrders に保存（Webhookで在庫減算や送金準備に使用）
//     await adminDb.collection("pendingOrders").doc(session.id).set({
//       siteKey,
//       status: "pending",
//       items: pendingItems, // [{id, name, quantity, unitAmountJPY}]
//       subtotalJPY: subtotalMinorJPY,
//       applicationFeeJPY: platformFeeJPY,
//       uiLang: lang ?? "ja",
//       checkout: {
//         sessionId: session.id,
//         url: session.url,
//         locale,
//         sellerConnectId,
//         transferGroup,
//       },
//       createdAt: new Date(),
//     });

//     const corsHeaders = origin
//       ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" }
//       : undefined;

//     return NextResponse.json({ url: session.url }, { headers: corsHeaders });
//   } catch (e: any) {
//     console.error("[/api/checkout/create] error:", e?.message || e, { code: e?.code, type: e?.type });
//     return NextResponse.json({ error: e?.message ?? "internal error" }, { status: 500 });
//   }
// }

// /* ---------- OPTIONS（プリフライト） ---------- */
// export async function OPTIONS(req: NextRequest) {
//   const origin = req.headers.get("origin") || "*";
//   return new Response(null, {
//     headers: {
//       "Access-Control-Allow-Origin": origin,
//       "Access-Control-Allow-Methods": "POST,OPTIONS",
//       "Access-Control-Allow-Headers": "Content-Type",
//       "Access-Control-Allow-Credentials": "true",
//     },
//   });
// }
