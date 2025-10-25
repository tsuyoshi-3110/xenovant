"use client";

import clsx from "clsx";
import { type UILang } from "@/lib/atoms/uiLangAtom";

const MSG: Record<UILang, string> = {
  ja: "{price}以上で送料無料",
  en: "Free shipping over {price}",
  zh: "{price}以上包邮",
  "zh-TW": "{price}以上免運",
  ko: "{price} 이상 무료배송",
  fr: "Livraison gratuite dès {price}",
  es: "Envío gratis a partir de {price}",
  de: "Kostenloser Versand ab {price}",
  pt: "Frete grátis a partir de {price}",
  it: "Spedizione gratuita oltre {price}",
  ru: "Бесплатная доставка от {price}",
  th: "ส่งฟรีเมื่อซื้อเกิน {price}",
  vi: "Miễn phí vận chuyển từ {price}",
  id: "Gratis ongkir mulai {price}",
  hi: "{price} से अधिक पर निःशुल्क शिपिंग",
  ar: "شحن مجاني للطلبات فوق {price}",
};

export default function FreeShippingBanner({
  show,
  lang,
  priceText,
  sticky = true,
}: {
  show: boolean;
  lang: UILang;
  priceText: string;
  sticky?: boolean;
}) {
  if (!show) return null;
  const tpl = MSG[lang] ?? MSG.ja;
  const text = tpl.replace("{price}", priceText);

  return (
    <div
      role="note"
      aria-live="polite"
      className={clsx(
        "w-full rounded-xl border shadow-sm",
        "bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60",
        "border-gray-200 px-4 py-3 mb-4",
        sticky && "sticky top-2 z-30"
      )}
    >
      <p className="text-center font-semibold">{text}</p>
    </div>
  );
}
