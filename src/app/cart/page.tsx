// app/(shop)/cart/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ShoppingCart, Trash2, Plus, Minus, X, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart/CartContext";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import { useUILang } from "@/lib/atoms/uiLangAtom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { msgs } from "@/lib/messages/cart";
import { pickCurrency, ZERO_DECIMAL } from "@/lib/currency";
import { useFxRates } from "@/lib/fx/client";

/* ---------- helpers ---------- */
const CANON_MAP: Record<string, string> = {
  jp: "ja",
  kr: "ko",
  cn: "zh",
  tw: "zh-TW",
  hk: "zh-HK",
  "zh-hant": "zh-TW",
  zh_hant: "zh-TW",
  "zh-hans": "zh",
  zh_hans: "zh",
  ptbr: "pt-BR",
  pt_br: "pt-BR",
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
function langCandidates(uiLang?: string | null) {
  const raw = canonLang(uiLang);
  return [raw, raw.split("-")[0], "en", "ja"];
}
/** 言語キーを正規化＆値を number 化 */
function normalizeLangNumberMap(obj: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = canonLang(String(k));
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[key] = Math.max(0, Math.floor(n));
  }
  return out;
}

function localeFor(lang?: string | null, ccy?: string) {
  const L = (lang || "").toLowerCase();
  if (L.startsWith("ja")) return "ja-JP";
  if (L.startsWith("zh-tw") || L.startsWith("zh-hant") || L.startsWith("zh-hk"))
    return "zh-TW";
  if (L.startsWith("zh")) return "zh-CN";
  if (L.startsWith("ko")) return "ko-KR";
  if (L.startsWith("fr")) return "fr-FR";
  if (L.startsWith("de")) return "de-DE";
  if (L.startsWith("es")) return "es-ES";
  if (L.startsWith("it")) return "it-IT";
  if (L.startsWith("en-gb")) return "en-GB";
  return (ccy || "").toUpperCase() === "GBP" ? "en-GB" : "en-US";
}
function convertJPYto(amountJPY: number, ccy: string, rates?: Record<string, number> | null) {
  const C = (ccy || "JPY").toUpperCase();
  const r = rates?.[C];
  if (C === "JPY" || r == null) return amountJPY;
  const major = amountJPY * r;
  return ZERO_DECIMAL.has(C) ? Math.round(major) : Math.round(major * 100) / 100;
}
function fmt(amountMajor: number, ccy: string, locale: string) {
  const C = (ccy || "JPY").toUpperCase();
  const L = (locale || "en-US").toLowerCase();
  const f = ZERO_DECIMAL.has(C) ? 0 : 2;
  const so: Record<string, string> = { HKD: "HK$", SGD: "S$", TWD: "NT$" };
  if (C === "CNY" || C === "JPY") {
    const num = new Intl.NumberFormat(L, { minimumFractionDigits: f, maximumFractionDigits: f }).format(amountMajor);
    const symbol = C === "CNY" ? (L.startsWith("zh") ? "￥" : "CN¥") : (L.startsWith("ja") ? "￥" : "JP¥");
    return `${symbol}${num}`;
  }
  if (so[C]) {
    const num = new Intl.NumberFormat(L, { minimumFractionDigits: f, maximumFractionDigits: f }).format(amountMajor);
    return `${so[C]}${num}`;
  }
  return new Intl.NumberFormat(L, {
    style: "currency",
    currency: C,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: f,
    maximumFractionDigits: f,
  }).format(amountMajor);
}

/* ---------- notices ---------- */
const FX_NOTICE: Record<string, string> = {
  ja: "決済は日本円（JPY）で行われます。表示の他通貨は参考換算です。",
  en: "Payment is charged in JPY. Other currencies are estimates.",
};
const REFUND_NOTICE: Record<string, string> = {
  ja: "返金もJPYで行います。為替差によって受取額が前後する場合があります。",
  en: "Refunds are issued in JPY; exchange differences may occur.",
};

/* ---------- labels ---------- */
const LBL = {
  ja: {
    shipping: "送料",
    subtotal: "小計",
    total: "合計（税込）",
    freeApplied: "送料無料が適用されています 🎉",
    toFree: (n: number) => `あと ${n.toLocaleString()} 円で送料無料`,
  },
  en: {
    shipping: "Shipping",
    subtotal: "Subtotal",
    total: "Total (Tax incl.)",
    freeApplied: "Free shipping applied 🎉",
    toFree: (n: number) => `Spend ${n.toLocaleString()} more for free shipping`,
  },
} as const;

export default function CartPage() {
  const { items, inc, dec, setQty, remove, clear, revalidate, isHydrated, setItemName } = useCart();

  // UI 言語・文言
  const { uiLang } = useUILang();
  const t = msgs[uiLang] ?? msgs["en"];
  const ui = LBL[(uiLang as "ja" | "en")] ?? LBL.en;

  // 通貨表示
  const displayCcy = pickCurrency({ lang: uiLang });
  const { rates } = useFxRates();
  const showCcy = rates?.[displayCcy] != null ? displayCcy : "JPY";
  const locale = localeFor(uiLang, showCcy);

  // 商品名翻訳の検証
  const [validated, setValidated] = useState(false);

  // 送料設定
  const [shippingPrices, setShippingPrices] = useState<Record<string, number>>({});
  const [shippingLoaded, setShippingLoaded] = useState(false);

  // 送料無料ポリシー
  const [thresholdByLang, setThresholdByLang] = useState<Record<string, number>>({});
  const [defaultThresholdJPY, setDefaultThresholdJPY] = useState<number>(0); // グローバル既定
  const [policyEnabled, setPolicyEnabled] = useState<boolean>(true);
  const [policyLoaded, setPolicyLoaded] = useState(false);

  // チェックアウト処理状態
  const [loading, setLoading] = useState(false);

  /* ---------- 商品名の翻訳反映 ---------- */
  useEffect(() => {
    if (!isHydrated) return;
    (async () => {
      await revalidate();
      for (const item of items) {
        try {
          const snap = await getDoc(doc(db, `siteProducts/${SITE_KEY}/items/${item.productId}`));
          const data = snap.data() as any;
          const baseTitle = (data?.base?.title ?? data?.title ?? item.name ?? "").toString();
          const tr: Array<any> = Array.isArray(data?.t) ? data.t : [];
          let resolved = baseTitle;
          if (uiLang !== "ja") {
            const pref = tr.find((r) => r?.lang === uiLang && r?.title?.trim()) || tr.find((r) => r?.lang === "en" && r?.title?.trim());
            resolved = (pref?.title ?? baseTitle).toString();
          }
          if (resolved) setItemName(item.productId, resolved);
        } catch {}
      }
      setValidated(true);
    })();
  }, [isHydrated, revalidate, items, uiLang, setItemName]);

  /* ---------- 送料テーブルの読込（site→無ければdefault） ---------- */
  useEffect(() => {
    (async () => {
      try {
        const siteSnap = await getDoc(doc(db, "siteShippingPrices", SITE_KEY));
        if (siteSnap.exists()) {
          setShippingPrices(normalizeLangNumberMap(siteSnap.data()));
        } else {
          const def = await getDoc(doc(db, "siteShippingPrices", "default"));
          setShippingPrices(normalizeLangNumberMap(def.exists() ? def.data() : {}));
        }
      } finally {
        setShippingLoaded(true);
      }
    })();
  }, []);

  /* ---------- 送料無料ポリシーの読込（site→無ければdefault）。default/legacy をフォールバック ---------- */
  useEffect(() => {
    (async () => {
      try {
        const siteSnap = await getDoc(doc(db, "siteShippingPolicy", SITE_KEY));
        if (siteSnap.exists()) {
          const raw = siteSnap.data() || {};
          setPolicyEnabled(raw?.enabled !== false);
          setThresholdByLang(normalizeLangNumberMap(raw?.thresholdByLang));
          const defThr = Number(raw?.thresholdDefaultJPY ?? raw?.thresholdJPY);
          setDefaultThresholdJPY(Number.isFinite(defThr) ? Math.max(0, Math.floor(defThr)) : 0);
        } else {
          const def = await getDoc(doc(db, "siteShippingPolicy", "default"));
          const raw = def.exists() ? (def.data() || {}) : {};
          setPolicyEnabled(raw?.enabled !== false);
          setThresholdByLang(normalizeLangNumberMap(raw?.thresholdByLang));
          const defThr = Number(raw?.thresholdDefaultJPY ?? raw?.thresholdJPY);
          setDefaultThresholdJPY(Number.isFinite(defThr) ? Math.max(0, Math.floor(defThr)) : 0);
        }
      } finally {
        setPolicyLoaded(true);
      }
    })();
  }, []);

  /* ---------- 計算 ---------- */
  const subtotalJPY = useMemo(
    () => items.reduce((s, it) => s + it.unitAmount * it.qty, 0),
    [items]
  );

  // 言語別が無ければグローバル既定を使う
  const currentThresholdJPY = useMemo(() => {
    for (const k of langCandidates(uiLang)) {
      const v = thresholdByLang[k];
      if (typeof v === "number" && v > 0) return v | 0;
      const vv = Number(v as any);
      if (Number.isFinite(vv) && vv > 0) return Math.floor(vv);
    }
    if (defaultThresholdJPY > 0) return defaultThresholdJPY;
    return 0;
  }, [thresholdByLang, defaultThresholdJPY, uiLang]);

  const isFreeShipping = useMemo(
    () => policyLoaded && policyEnabled && currentThresholdJPY > 0 && subtotalJPY >= currentThresholdJPY,
    [policyLoaded, policyEnabled, currentThresholdJPY, subtotalJPY]
  );

  /**
   * ★ 修正ポイント：
   * - 0円を「有効な設定」として採用（>= 0）
   * - フォールバックは「キーが無い時だけ」。0 が入っているのに他言語へ落ちない
   */
  const resolvedShippingBaseJPY = useMemo(() => {
    if (Object.keys(shippingPrices).length === 0) return null;
    for (const k of langCandidates(uiLang)) {
      if (!(k in shippingPrices)) continue; // キーが無いときのみ次へ
      const v = Number((shippingPrices as any)[k]);
      if (Number.isFinite(v) && v >= 0) return Math.floor(v); // 0 を有効値として採用
    }
    return null;
  }, [shippingPrices, uiLang]);

  const hasShippingConfig = resolvedShippingBaseJPY != null;
  const isZeroShippingBase = resolvedShippingBaseJPY === 0;

  const shippingJPY = useMemo(() => {
    if (!hasShippingConfig) return 0;
    if (isFreeShipping) return 0;
    if (isZeroShippingBase) return 0;
    return resolvedShippingBaseJPY as number;
  }, [hasShippingConfig, isFreeShipping, isZeroShippingBase, resolvedShippingBaseJPY]);

  const grandTotalJPY = useMemo(() => subtotalJPY + shippingJPY, [subtotalJPY, shippingJPY]);

  const ready = isHydrated && validated;

  const fxLine = FX_NOTICE[uiLang] ?? FX_NOTICE.en;
  const refundLine = REFUND_NOTICE[uiLang] ?? REFUND_NOTICE.en;

  const dispSubtotal = fmt(convertJPYto(subtotalJPY, showCcy, rates), showCcy, locale);
  const dispShipping = fmt(convertJPYto(shippingJPY, showCcy, rates), showCcy, locale);
  const dispGrand = fmt(convertJPYto(grandTotalJPY, showCcy, rates), showCcy, locale);

  /* ---------- チェックアウト ---------- */
  const checkout = async () => {
    if (items.length === 0) {
      alert(t.empty || "Your cart is empty.");
      return;
    }
    setLoading(true);
    try {
      await revalidate();
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteKey: SITE_KEY,
          lang: uiLang,
          items: items.map((x) => ({
            id: x.productId,
            name: x.name,
            amountJPY: x.unitAmount,
            quantity: x.qty,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) throw new Error(data?.error || "Checkout failed");
      window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message ?? "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- UI ---------- */
  return (
    <main className="mx-auto max-w-4xl px-4 pt-28 pb-10">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg p-5 sm:p-6 lg:p-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="w-6 h-6" /> {t.cartTitle}
          </h1>
          {ready && items.length > 0 && (
            <button onClick={clear} className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
              <Trash2 className="w-4 h-4" /> {t.clear}
            </button>
          )}
        </div>

        {!ready ? (
          <div className="p-6"><p className="text-center text-gray-500">{t.loading}</p></div>
        ) : items.length === 0 ? (
          <p className="text-center text-gray-500 py-10">{t.empty}</p>
        ) : (
          <>
            {/* items */}
            <ul className="divide-y divide-gray-200">
              {items.map((it) => {
                const lineJPY = it.unitAmount * it.qty;
                const unitDisp = fmt(convertJPYto(it.unitAmount, showCcy, rates), showCcy, locale);
                const lineDisp = fmt(convertJPYto(lineJPY, showCcy, rates), showCcy, locale);
                return (
                  <li key={it.productId} className="py-4">
                    <div className="grid grid-cols-[80px_1fr_auto] gap-3 items-center">
                      <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                        <Image src={it.imageUrl || "/images/placeholder.jpg"} alt={it.name} fill className="object-cover" unoptimized />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{it.name}</p>
                        <p className="text-sm text-gray-500">{t.unitPriceTaxIncl}：{unitDisp}</p>
                        <div className="mt-1 flex items-center border rounded-lg overflow-hidden">
                          <button onClick={() => dec(it.productId, 1)} className="px-3 h-8 hover:bg-gray-50"><Minus className="w-3 h-3" /></button>
                          <input
                            className="w-12 text-center outline-none"
                            value={it.qty}
                            onChange={(e) => {
                              const q = Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, "")) || 1));
                              setQty(it.productId, q);
                            }}
                          />
                          <button onClick={() => inc(it.productId, 1)} className="px-3 h-8 hover:bg-gray-50"><Plus className="w-3 h-3" /></button>
                        </div>
                      </div>
                      <div className="text-right font-semibold">{lineDisp}</div>
                    </div>
                    <button onClick={() => remove(it.productId)} className="mt-1 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                      <X className="w-3 h-3" /> {t.remove}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* shipping card（設定がある場合のみ表示） */}
            {shippingLoaded && policyLoaded && resolvedShippingBaseJPY != null && (
              <div className="mt-6 p-4 rounded-xl border bg-white/70">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="w-5 h-5 text-gray-700" />
                  <span className="font-semibold">{ui.shipping}</span>
                </div>

                {isFreeShipping || isZeroShippingBase ? (
                  <p className="text-sm text-green-700">{ui.freeApplied}</p>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">{ui.shipping}</span>
                    <span className="font-semibold">{dispShipping}</span>
                  </div>
                )}
              </div>
            )}

            {/* totals */}
            <div className="mt-4 border-t pt-4 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">{ui.subtotal}</span>
                <span className="font-medium">{dispSubtotal}</span>
              </div>

              {resolvedShippingBaseJPY != null && shippingJPY > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">{ui.shipping}</span>
                  <span className="font-medium">{dispShipping}</span>
                </div>
              )}

              <div className="mt-1 border-t pt-3 flex justify-between items-center">
                <span className="text-lg font-bold">{ui.total}</span>
                <span className="text-2xl font-bold text-blue-600">{dispGrand}</span>
              </div>
            </div>

            {/* notes */}
            <p className="text-xs text-gray-500 mt-1">{t.priceNote}</p>
            <div className="mt-2 space-y-1">
              <p className="text-xs text-gray-500">{fxLine}</p>
              <p className="text-[11px] text-gray-400">{refundLine}</p>
            </div>

            {/* CTA */}
            <Button className="mt-4 w-full h-12 text-lg font-semibold shadow-lg" onClick={checkout} disabled={loading || items.length === 0}>
              {loading ? t.processing : t.proceed}
            </Button>
          </>
        )}
      </motion.div>
    </main>
  );
}
