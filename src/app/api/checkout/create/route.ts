// app/api/checkout/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripeConnect } from "@/lib/stripe-connect";
import { adminDb } from "@/lib/firebase-admin";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** プラットフォーム取り分（例：7%） */
const PLATFORM_FEE_RATE = 0.07;

/* ---------- Lang 正規化 & 補助 ---------- */
const CANON_MAP: Record<string, string> = {
  jp: "ja", kr: "ko", cn: "zh", tw: "zh-TW", hk: "zh-HK",
  "zh-hant": "zh-TW", zh_hant: "zh-TW", "zh-hans": "zh", zh_hans: "zh",
  ptbr: "pt-BR", pt_br: "pt-BR",
};
function canonLang(code?: string | null) {
  const c = (code ?? "").replace(/_/g, "-").trim().toLowerCase();
  if (!c) return "ja";
  if (CANON_MAP[c]) return CANON_MAP[c];
  if (c === "zh-cn") return "zh";
  if (c.startsWith("zh-")) return "zh-" + c.split("-")[1].toUpperCase();
  if (c.length === 2) return c;
  const [b, r] = c.split("-");
  return r ? `${b}-${r.toUpperCase()}` : b;
}


/* ---------- Checkout locale ---------- */
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
  const hit = ok.find((v) => v.toLowerCase() === s.toLowerCase());
  if (hit) return hit;
  const base = ok.find((v) => v.toLowerCase() === s.split("-")[0].toLowerCase());
  return base ?? "auto";
}

/* ---------- Origin 制限 ---------- */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  const allowed: RegExp[] = [/\.yourdomain\.com$/, /^https:\/\/.+\.pageit\.jp$/, /^https:\/\/.+\.vercel\.app$/];
  if (process.env.NODE_ENV !== "production") {
    allowed.push(/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/);
  }
  return allowed.some((re) => re.test(origin));
}

/* ---------- 文字列ヘルパ ---------- */
const pickStr = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/* ---------- ★商品名選択ロジック（日本語は base.title を必ず使用） ---------- */
function pickProductNameFor(data: any, uiLang?: string | null): string {
  const baseJa = pickStr(data?.base?.title) || pickStr(data?.title); // ← 日本語の実体名
  const L = canonLang(uiLang);

  // 日本語 UI のときは無条件で base を使用（t[] に ja が無くても英語に落ちない）
  if (L.startsWith("ja")) {
    return baseJa || "商品";
  }

  // 非日本語：選択言語 → en → base の順
  const rows: Array<{ lang?: string; title?: string; body?: string }> =
    Array.isArray(data?.t) ? data.t : [];
  const findInT = (key: string) => {
    const r = rows.find((x) => canonLang(x?.lang) === key);
    return r ? pickStr(r.title) || pickStr(r.body) : undefined;
  };

  const direct =
    findInT(L) ||
    pickStr(data?.titles?.[L]) ||
    findInT(L.split("-")[0]) ||
    pickStr(data?.titles?.[L.split("-")[0]]);
  if (direct) return direct;

  const en =
    findInT("en") ||
    pickStr(data?.titles?.en);
  if (en) return en;

  return baseJa || "Item";
}

/* ---------- メタ用（任意）：ローカライズ名収集。base を ja として登録 ---------- */
function collectLocalizedNames(data: any) {
  const out: Record<string, string> = {};
  const baseJa = pickStr(data?.base?.title) || pickStr(data?.title);
  if (baseJa) {
    out["ja"] = baseJa;   // ← base は日本語として扱う
    out["base"] = baseJa;
  }
  const rows: Array<{ lang?: string; title?: string; body?: string }> =
    Array.isArray(data?.t) ? data.t : [];
  for (const r of rows) {
    const code = r?.lang ? canonLang(r.lang) : "";
    const title = pickStr(r?.title) || pickStr(r?.body);
    if (code && title) out[code] = title;
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

/* ---------- 送料/しきい値 取得（存在しない時だけ default にフォールバック） ---------- */
async function getSiteDoc<T = any>(col: string, id: string) {
  const ref = adminDb.collection(col).doc(id);
  const snap = await ref.get();
  return { exists: snap.exists, data: snap.exists ? (snap.data() as T) : undefined };
}

async function resolveShippingJPY(siteKey: string, uiLang?: string | null) {
  const site = await getSiteDoc<Record<string, any>>("siteShippingPrices", siteKey);
  let table: Record<string, any> | undefined;

  if (site.exists) {
    table = site.data; // 存在する → 中身が空でも default へは行かない
  } else {
    const def = await getSiteDoc<Record<string, any>>("siteShippingPrices", "default");
    table = def.data || {};
  }

  if (!table || Object.keys(table).length === 0) {
    return { amountJPY: 0, langKeyUsed: canonLang(uiLang) };
  }

  for (const k of [canonLang(uiLang), canonLang(uiLang).split("-")[0], "ja", "en"]) {
    if (!(k in table)) continue; // キーが無い時のみ次へ
    const n = Number(table[k]);
    if (Number.isFinite(n) && n >= 0) return { amountJPY: Math.floor(n), langKeyUsed: k };
  }
  return { amountJPY: 0, langKeyUsed: canonLang(uiLang) };
}

async function resolveThresholdPolicy(siteKey: string, uiLang?: string | null) {
  const site = await getSiteDoc<any>("siteShippingPolicy", siteKey);
  let pol: any | undefined;

  if (site.exists) {
    pol = site.data;
  } else {
    const def = await getSiteDoc<any>("siteShippingPolicy", "default");
    pol = def.data || {};
  }

  const enabled = pol?.enabled !== false;
  const byLang: Record<string, any> = pol?.thresholdByLang || {};
  const defVal = Number(pol?.thresholdDefaultJPY ?? pol?.thresholdJPY) || 0; // 旧フィールド互換
  for (const k of [canonLang(uiLang), canonLang(uiLang).split("-")[0], "ja", "en"]) {
    const n = Number(byLang?.[k]);
    if (Number.isFinite(n) && n >= 0) return { enabled, thresholdJPY: Math.floor(n) };
  }
  return { enabled, thresholdJPY: Math.max(0, Math.floor(defVal)) };
}

function shippingLabelFor(lang?: string | null) {
  const l = (lang || "").toLowerCase();
  if (l.startsWith("ja")) return "送料";
  if (l.startsWith("zh-tw") || l.startsWith("zh-hant") || l.startsWith("zh-hk")) return "運費";
  if (l.startsWith("zh")) return "运费";
  if (l.startsWith("ko")) return "배송비";
  if (l.startsWith("fr")) return "Frais de port";
  if (l.startsWith("de")) return "Versand";
  if (l.startsWith("es")) return "Envío";
  if (l.startsWith("it")) return "Spedizione";
  if (l.startsWith("pt")) return "Frete";
  if (l.startsWith("vi")) return "Phí vận chuyển";
  if (l.startsWith("id")) return "Ongkos kirim";
  if (l.startsWith("th")) return "ค่าจัดส่ง";
  return "Shipping";
}

/* ====================== メイン ====================== */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }
  const corsHeaders = origin
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" }
    : undefined;

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders }); }

  const { siteKey, items, lang, origin: bodyOrigin } = body || {};
  if (!siteKey || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: corsHeaders });
  }

  // Connect 口座
  const sellerSnap = await adminDb.collection("siteSellers").doc(siteKey).get();
  if (sellerSnap.exists && sellerSnap.get("ecStop") === true) {
    return NextResponse.json({ error: "EC_STOPPED", message: "現在このショップのECは一時停止中です。" }, { status: 403, headers: corsHeaders });
  }
  const sellerConnectId: string | null = sellerSnap.get("stripe.connectAccountId") || null;
  if (!sellerConnectId?.startsWith("acct_")) {
    return NextResponse.json({ error: "Connect account missing" }, { status: 400, headers: corsHeaders });
  }

  const locale = normalizeCheckoutLocale(lang || "ja");

  // 商品
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
  const pendingItems: Array<{ id: string; name: string; quantity: number; unitAmountJPY: number }> = [];
  let subtotalMinorJPY = 0;

  for (const docSnap of productDocs) {
    const data = docSnap.data() as any;
    const qty = qtyMap[docSnap.id] ?? 1;
    const unitJPY = Math.max(0, Math.floor(Number(
      data.priceIncl ?? data.price ?? data.priceTaxIncl ?? data.price_incl
    ) || 0));
    if (unitJPY <= 0) continue;

    // ★ ここが肝：日本語 UI のときは base.title を必ず使う
    const displayName = pickProductNameFor(data, lang);

    const names = collectLocalizedNames(data);
    const namesMeta = buildNamesMetaMinimal(canonLang(lang || "ja"), names, displayName);

    line_items.push({
      quantity: qty,
      price_data: {
        currency: "jpy",
        unit_amount: unitJPY,
        product_data: {
          name: displayName,
          metadata: { productId: docSnap.id, siteKey, baseAmountJPY: String(unitJPY), ...namesMeta },
        },
      },
    });

    pendingItems.push({ id: docSnap.id, name: displayName, quantity: qty, unitAmountJPY: unitJPY });
    subtotalMinorJPY += unitJPY * qty;
  }

  if (!line_items.length) {
    return NextResponse.json({ error: "No purchasable items" }, { status: 400, headers: corsHeaders });
  }

  // 送料 & しきい値
  const { amountJPY: shipJPY } = await resolveShippingJPY(siteKey, lang);
  const { enabled: freeEnabled, thresholdJPY } = await resolveThresholdPolicy(siteKey, lang);

  const isFree = freeEnabled && thresholdJPY > 0 && subtotalMinorJPY >= thresholdJPY;
  const shippingMinorJPY = isFree ? 0 : shipJPY;

  if (shippingMinorJPY > 0) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: "jpy",
        unit_amount: shippingMinorJPY,
        product_data: {
          name: shippingLabelFor(lang),
          metadata: { type: "shipping", siteKey, baseAmountJPY: String(shippingMinorJPY) },
        },
      },
    });
  }

  const grandTotalMinorJPY = subtotalMinorJPY + shippingMinorJPY;
  const platformFeeJPY = Math.floor(subtotalMinorJPY * PLATFORM_FEE_RATE);

  const baseOrigin = bodyOrigin || origin || process.env.NEXT_PUBLIC_ORIGIN || "";
  const success_url = `${baseOrigin}/cart?session_id={CHECKOUT_SESSION_ID}&status=success`;
  const cancel_url = `${baseOrigin}/cart`;

  try {
    const transferGroup = `grp_${siteKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const session = await stripeConnect.checkout.sessions.create({
      mode: "payment",
      line_items,
      locale,
      allow_promotion_codes: true,
      customer_creation: "always",
      phone_number_collection: { enabled: true },
      billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: ["JP"] },
      payment_intent_data: { transfer_group: transferGroup },
      metadata: {
        siteKey,
        uiLang: lang ?? "",
        lang: canonLang(lang || "ja"),
        currency: "JPY",
        platformFeePct: String(PLATFORM_FEE_RATE),
        transferGroup,
        sellerConnectId,
        shippingJPY: String(shippingMinorJPY),
        grandTotalJPY: String(grandTotalMinorJPY),
        freeShippingEnabled: String(freeEnabled),
        freeShippingThresholdJPY: String(thresholdJPY),
      },
      client_reference_id: siteKey,
      success_url,
      cancel_url,
    });

    await adminDb.collection("pendingOrders").doc(session.id).set({
      siteKey,
      status: "pending",
      items: pendingItems,
      subtotalJPY: subtotalMinorJPY,
      shippingJPY: shippingMinorJPY,
      grandTotalJPY: grandTotalMinorJPY,
      applicationFeeJPY: platformFeeJPY,
      freeShipping: { enabled: freeEnabled, thresholdJPY, isFree },
      uiLang: lang ?? "ja",
      checkout: { sessionId: session.id, url: session.url, locale, sellerConnectId, transferGroup },
      createdAt: new Date(),
    });

    return NextResponse.json({ url: session.url }, { headers: corsHeaders });
  } catch (e: any) {
    console.error("[/api/checkout/create] error:", e?.message || e, { code: e?.type });
    return NextResponse.json({ error: e?.message ?? "internal error" }, { status: 500, headers: corsHeaders });
  }
}

/* ---------- OPTIONS ---------- */
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
