// app/(shop)/cart/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ShoppingCart, Trash2, Plus, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart/CartContext";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import { useUILang } from "@/lib/atoms/uiLangAtom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { msgs } from "@/lib/messages/cart";
import { pickCurrency, ZERO_DECIMAL } from "@/lib/currency";
import { useFxRates } from "@/lib/fx/client";

/* ---------- locale resolver ---------- */
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

/* ---------- FX convert (JPY -> target major) ---------- */
function convertJPYto(
  amountJPY: number,
  ccy: string,
  rates?: Record<string, number> | null
) {
  const C = (ccy || "JPY").toUpperCase();
  const rate = rates?.[C];
  if (C === "JPY" || rate == null) return amountJPY;

  const major = amountJPY * rate;
  return ZERO_DECIMAL.has(C)
    ? Math.round(major)
    : Math.round(major * 100) / 100;
}

/* ---------- Currency formatter (with a few readable overrides) ---------- */
function fmt(amountMajor: number, ccy: string, locale: string) {
  const C = (ccy || "JPY").toUpperCase();
  const L = (locale || "en-US").toLowerCase();
  const fraction = ZERO_DECIMAL.has(C) ? 0 : 2;

  // Helpful symbol overrides
  const symbolOverride: Record<string, string> = {
    HKD: "HK$",
    SGD: "S$",
    TWD: "NT$",
  };

  // Unify “￥” look for JPY/CNY when appropriate
  if (C === "CNY" || C === "JPY") {
    const num = new Intl.NumberFormat(L, {
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(amountMajor);
    const symbol =
      C === "CNY"
        ? L.startsWith("zh")
          ? "￥"
          : "CN¥"
        : L.startsWith("ja")
        ? "￥"
        : "JP¥";
    return `${symbol}${num}`;
  }

  if (symbolOverride[C]) {
    const num = new Intl.NumberFormat(L, {
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(amountMajor);
    return `${symbolOverride[C]}${num}`;
  }

  return new Intl.NumberFormat(L, {
    style: "currency",
    currency: C,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(amountMajor);
}

/* ---------- 多言語: 決済通貨/為替・返金の注意書き ---------- */
const FX_NOTICE: Record<string, string> = {
  ja: "決済は日本円（JPY）で行われます。表示の他通貨は参考換算です。為替レートや海外事務手数料はご利用のカード会社に依存します。",
  en: "Payment is charged in Japanese Yen (JPY). Amounts in other currencies are estimates. Your card issuer’s FX rate and any foreign transaction fees apply.",
  "zh-CN":
    "付款将以日元（JPY）结算。所示本地货币金额仅供参考。最终金额由发卡行按其汇率结算，并可能产生境外交易手续费。",
  "zh-TW":
    "付款以日圓（JPY）結算。顯示之本地幣金額僅供參考。最終金額由發卡行依其匯率結算，可能收取海外交易手續費。",
  ko: "결제는 일본 엔화(JPY)로 청구됩니다. 표시된 현지 통화 금액은 참고용입니다. 최종 금액은 카드사 환율이 적용되며 해외 이용 수수료가 부과될 수 있습니다.",
  fr: "Le paiement est débité en yens japonais (JPY). Les montants dans d’autres devises sont des estimations. Votre banque appliquera son taux de change et d’éventuels frais.",
  de: "Die Zahlung wird in Japanischen Yen (JPY) abgerechnet. Beträge in anderen Währungen sind Schätzwerte. Ihre Bank wendet ihren Wechselkurs an und kann Auslandsgebühren berechnen.",
  es: "El cargo se realiza en yenes japoneses (JPY). Los importes en otras divisas son estimaciones. Su banco aplicará su tipo de cambio y posibles comisiones internacionales.",
  it: "L’addebito avviene in yen giapponesi (JPY). Gli importi in altre valute sono stime. La tua banca applicherà il proprio tasso di cambio ed eventuali commissioni estere.",
  pt: "A cobrança é feita em ienes japoneses (JPY). Os valores em outras moedas são estimativas. Seu banco aplicará sua taxa de câmbio e eventuais tarifas internacionais.",
  ru: "Списание производится в японских иенах (JPY). Суммы в другой валюте являются ориентировочными. Банк применит свой курс и может взимать комиссию за зарубежную операцию.",
  th: "การชำระเงินจะถูกเรียกเก็บเป็นเงินเยนญี่ปุ่น (JPY) จำนวนเงินสกุลอื่นเป็นเพียงการประมาณ ธนาคารของคุณจะใช้อัตราแลกเปลี่ยนและอาจมีค่าธรรมเนียมต่างประเทศ",
  vi: "Thanh toán được tính bằng yên Nhật (JPY). Số tiền hiển thị bằng các loại tiền khác chỉ là ước tính. Ngân hàng của bạn sẽ áp dụng tỷ giá riêng và có thể thu phí quốc tế.",
  id: "Pembayaran ditagihkan dalam Yen Jepang (JPY). Nilai dalam mata uang lain hanyalah perkiraan. Bank Anda akan memakai kursnya dan mungkin mengenakan biaya transaksi luar negeri.",
  hi: "भुगतान जापानी येन (JPY) में लिया जाएगा। अन्य मुद्रा में दिखी राशि केवल अनुमान है। आपका बैंक अपना विनिमय दर और विदेशी लेनदेन शुल्क लागू कर सकता है।",
  ar: "سيتم خصم الدفعة بالين الياباني (JPY). المبالغ الظاهرة بعملات أخرى تقديرية فقط. يطبّق البنك المُصدِر سعر صرفه وقد يفرض رسوم معاملات دولية.",
};

const REFUND_NOTICE: Record<string, string> = {
  ja: "返金も日本円（JPY）で行います。為替差により受取額が前後する場合があります。",
  en: "Refunds are issued in JPY; exchange differences may occur.",
  "zh-CN": "退款也将以日元（JPY）进行。因汇率波动，实际入账金额可能有所差异。",
  "zh-TW": "退款同樣以日圓（JPY）處理。因匯率波動，實際入帳金額可能有差異。",
  ko: "환불도 JPY로 처리됩니다. 환율 변동에 따라 수령 금액이 달라질 수 있습니다.",
  fr: "Les remboursements sont effectués en JPY ; des écarts de change peuvent survenir.",
  de: "Erstattungen erfolgen in JPY; Wechselkursdifferenzen sind möglich.",
  es: "Los reembolsos se emiten en JPY; pueden producirse diferencias por el tipo de cambio.",
  it: "I rimborsi sono emessi in JPY; possono verificarsi differenze di cambio.",
  pt: "Os reembolsos são emitidos em JPY; podem ocorrer diferenças cambiais.",
  ru: "Возвраты производятся в JPY; возможны курсовые разницы.",
  th: "การคืนเงินจะทำเป็นสกุล JPY อาจมีความต่างจากอัตราแลกเปลี่ยน",
  vi: "Hoàn tiền được thực hiện bằng JPY; có thể phát sinh chênh lệch tỷ giá.",
  id: "Pengembalian dana dilakukan dalam JPY; selisih kurs dapat terjadi.",
  hi: "रिफंड JPY में किया जाता है; विनिमय दर के कारण अंतर संभव है।",
  ar: "يتم إصدار المبالغ المُستردّة بالين الياباني (JPY) وقد تحدث فروقات سعر الصرف.",
};

export default function CartPage() {
  const {
    items,
    inc,
    dec,
    setQty,
    remove,
    clear,
    revalidate,
    isHydrated,
    setItemName,
  } = useCart();
  const [validated, setValidated] = useState(false);
  const [loading, setLoading] = useState(false);

  const { uiLang } = useUILang();
  const t = msgs[uiLang] ?? msgs["en"];

  // Display currency is decided from UI language
  const displayCcy = pickCurrency({ lang: uiLang }); // e.g. "CNY", "USD", ...
  const { rates } = useFxRates();

  // Guard: if the rate for display currency isn't ready, keep showing JPY to avoid misleading numbers.
  const hasRate = !!rates && rates[displayCcy] != null;
  const showCcy = hasRate ? displayCcy : "JPY";
  const locale = localeFor(uiLang, showCcy);

  // 商品名の翻訳反映
  useEffect(() => {
    if (!isHydrated) return;
    (async () => {
      await revalidate();
      for (const item of items) {
        try {
          const snap = await getDoc(
            doc(db, `siteProducts/${SITE_KEY}/items/${item.productId}`)
          );
          const data = snap.data() as any;

          const baseTitle = (
            data?.base?.title ??
            data?.title ??
            item.name ??
            ""
          ).toString();
          const t: Array<any> = Array.isArray(data?.t) ? data.t : [];

          // ja は必ず base を使う（t には ja を入れない前提）
          let resolved = baseTitle;
          if (uiLang !== "ja") {
            const pref =
              t.find((r) => r?.lang === uiLang && r?.title?.trim()) ||
              t.find((r) => r?.lang === "en" && r?.title?.trim());
            resolved = (pref?.title ?? baseTitle).toString();
          }

          if (resolved) setItemName(item.productId, resolved);
        } catch {
          /* noop */
        }
      }
      setValidated(true);
    })();
  }, [isHydrated, revalidate, items, uiLang, setItemName]);

  // Stripe Checkout（常にJPY決済。通貨は送らない）
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
            amountJPY: x.unitAmount, // JPY税込の元価格
            quantity: x.qty,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url)
        throw new Error(data?.error || "Checkout failed");
      window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message ?? "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  const totalJPY = useMemo(
    () => items.reduce((s, it) => s + it.unitAmount * it.qty, 0),
    [items]
  );

  if (!isHydrated || !validated) {
    return (
      <main className="mx-auto max-w-4xl px-4 pt-28 pb-10">
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg p-6">
          <p className="text-center text-gray-500">{t.loading}</p>
        </div>
      </main>
    );
  }

  // 多言語の注意文（無ければ英語にフォールバック）
  const fxLine = FX_NOTICE[uiLang] ?? FX_NOTICE.en;
  const refundLine = REFUND_NOTICE[uiLang] ?? REFUND_NOTICE.en;

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
            <ShoppingCart className="w-6 h-6" />
            {t.cartTitle}
          </h1>
          {items.length > 0 && (
            <button
              onClick={clear}
              className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 className="w-4 h-4" /> {t.clear}
            </button>
          )}
        </div>

        {/* Body */}
        {items.length === 0 ? (
          <p className="text-center text-gray-500 py-10">{t.empty}</p>
        ) : (
          <>
            <ul className="divide-y divide-gray-200">
              {items.map((it) => {
                const lineJPY = it.unitAmount * it.qty;
                const unitDisp = fmt(
                  convertJPYto(it.unitAmount, showCcy, rates),
                  showCcy,
                  locale
                );
                const lineDisp = fmt(
                  convertJPYto(lineJPY, showCcy, rates),
                  showCcy,
                  locale
                );

                return (
                  <li key={it.productId} className="py-4">
                    <div className="grid grid-cols-[80px_1fr_auto] gap-3 items-center">
                      <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                        <Image
                          src={it.imageUrl || "/images/placeholder.jpg"}
                          alt={it.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{it.name}</p>
                        <p className="text-sm text-gray-500">
                          {t.unitPriceTaxIncl}：{unitDisp}
                        </p>
                        <div className="mt-1 flex items-center border rounded-lg overflow-hidden">
                          <button
                            onClick={() => dec(it.productId, 1)}
                            className="px-3 h-8 hover:bg-gray-50"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            className="w-12 text-center outline-none"
                            value={it.qty}
                            onChange={(e) => {
                              const q = Math.max(
                                1,
                                Math.min(
                                  999,
                                  Number(e.target.value.replace(/\D/g, "")) || 1
                                )
                              );
                              setQty(it.productId, q);
                            }}
                          />
                          <button
                            onClick={() => inc(it.productId, 1)}
                            className="px-3 h-8 hover:bg-gray-50"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="text-right font-semibold">{lineDisp}</div>
                    </div>
                    <button
                      onClick={() => remove(it.productId)}
                      className="mt-1 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> {t.remove}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Total */}
            <div className="mt-4 border-t pt-4 flex justify-between items-center">
              <span className="text-lg font-bold">{t.totalTaxIncl}</span>
              <span className="text-2xl font-bold text-blue-600">
                {fmt(convertJPYto(totalJPY, showCcy, rates), showCcy, locale)}
              </span>
            </div>

            {/* 既存の注記 */}
            <p className="text-xs text-gray-500 mt-1">{t.priceNote}</p>

            {/* 多言語の決済/返金注記（2行） */}
            <div className="mt-2 space-y-1">
              <p className="text-xs text-gray-500">{fxLine}</p>
              <p className="text-[11px] text-gray-400">{refundLine}</p>
            </div>

            {/* CTA */}
            <Button
              className="mt-4 w-full h-12 text-lg font-semibold shadow-lg"
              onClick={checkout}
              disabled={loading || items.length === 0}
            >
              {loading ? t.processing : t.proceed}
            </Button>
          </>
        )}
      </motion.div>
    </main>
  );
}
