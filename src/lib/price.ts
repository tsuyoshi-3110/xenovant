import { FxSnapshot, ZERO_DECIMAL } from "./fx/fx";
import type { LangKey } from "./langs";

/** LANGS に無いが外部から来うる "pt-BR" も許容 */
type ExtendedLangKey = LangKey | "pt-BR";

const LOCALE_BY_LANG: Record<ExtendedLangKey, string> = {
  ja: "ja-JP",
  en: "en-GB",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  ko: "ko-KR",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
  pt: "pt-PT",
  it: "it-IT",
  ru: "ru-RU",
  th: "th-TH",
  vi: "vi-VN",
  id: "id-ID",
  hi: "hi-IN",
  ar: "ar-AE",
  // 追加対応
  "pt-BR": "pt-BR",
};

/** UI 言語からローカル通貨をざっくり推定 */
function pickCcy(lang: LangKey): string {
  const l = (lang || "ja").toLowerCase();
  if (l.includes("ja")) return "JPY";
  if (l.includes("en-gb")) return "GBP";
  if (l.includes("en")) return "USD";
  if (l.includes("fr") || l.includes("de") || l.includes("es")) return "EUR";
  if (l.includes("ko")) return "KRW";
  if (l.includes("zh-tw") || l.includes("zh-hk")) return "TWD";
  if (l.includes("zh")) return "TWD";
  if (l.includes("th")) return "THB";
  if (l.includes("vi")) return "VND";
  if (l.includes("id")) return "IDR";
  if (l.includes("hi")) return "INR";
  if (l.includes("ar")) return "AED";
  return "JPY";
}

/**
 * amountJPY を JPY とローカル通貨のデュアル表示へ。
 * fx があればリアルタイム換算（fx.rates は 1 JPY あたりの相手通貨レート想定）。
 */
export function formatDualCurrency(amountJPY: number, lang: LangKey, fx?: FxSnapshot): string {
  const locale = LOCALE_BY_LANG[lang] || "en-GB";
  const localCcy = pickCcy(lang);

  const jpyFmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amountJPY);

  if (!fx || localCcy === "JPY") return jpyFmt;

  const rate = fx.rates?.[localCcy];
  if (!rate) return jpyFmt;

  const localMajor = amountJPY * rate;
  const fraction = ZERO_DECIMAL.has(localCcy) ? 0 : 2;

  const localFmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: localCcy,
    maximumFractionDigits: fraction,
    minimumFractionDigits: fraction,
  }).format(localMajor);

  return `${jpyFmt}（${localFmt}）`;
}
