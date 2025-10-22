import type { LangKey } from "./langs";

/** 言語や国コードから通貨を決定 */
// lib/currency.ts

export function pickCurrency(opts: {
  lang?: LangKey | string | null;
  acceptLanguage?: string;
  countryHint?: string;
  policy?: {
    defaultCurrency?: string;
    allowedCurrencies?: string[];
  };
}): string {
  const {
    lang,
    acceptLanguage,
    countryHint,
    policy = { defaultCurrency: "JPY", allowedCurrencies: ["JPY","USD","EUR","KRW","TWD","CNY","HKD","GBP","SGD","AUD","CAD"] },
  } = opts;

  const allow = new Set((policy.allowedCurrencies ?? []).map(c => c.toUpperCase()));

  const norm = (s?: string | null) =>
    (s ?? "")
      .toString()
      .trim()
      .replace(/_/g, "-")
      .toLowerCase();

  const byLang: Record<string, string> = {
    // primary
    "ja": "JPY",
    "en": "USD",
    "fr": "EUR",
    "de": "EUR",
    "es": "EUR",
    "it": "EUR",
    "ko": "KRW",
    "zh": "CNY",
    "pt": "EUR",
    // region/variant
    "en-gb": "GBP",
    "zh-cn": "CNY",
    "zh-hans": "CNY",
    "zh-hk": "HKD",
    "zh-tw": "TWD",
  };

  const tryLang = (raw: string) => {
    const v = norm(raw);
    if (!v) return undefined;
    // まずそのまま（例: zh-CN）
    if (byLang[v]) return byLang[v];
    // primary（例: zh）
    const primary = v.split("-")[0];
    if (byLang[primary]) return byLang[primary];
    return undefined;
  };

  // 1) lang
  let cur = tryLang(lang ?? "");
  if (cur && (allow.size === 0 || allow.has(cur))) return cur.toUpperCase();

  // 2) accept-language
  if (acceptLanguage) {
    const first = norm(acceptLanguage).split(",")[0]?.trim() ?? "";
    cur = tryLang(first);
    if (cur && (allow.size === 0 || allow.has(cur))) return cur.toUpperCase();
  }

  // 3) country hint
  const byCountry: Record<string, string> = {
    JP: "JPY", US: "USD", GB: "GBP", SG: "SGD", AU: "AUD", CA: "CAD",
    KR: "KRW", TW: "TWD", CN: "CNY", HK: "HKD",
    FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR",
  };
  const fromCountry = (countryHint ?? "").toUpperCase();
  if (byCountry[fromCountry] && (allow.size === 0 || allow.has(byCountry[fromCountry]!))) {
    return byCountry[fromCountry]!.toUpperCase();
  }

  // 4) fallback
  const def = (policy.defaultCurrency ?? "JPY").toUpperCase();
  if (allow.size === 0 || allow.has(def)) return def;
  // allowed があるが default が含まれない場合は先頭
  return Array.from(allow)[0] ?? "JPY";
}

/** Stripeのゼロ小数通貨（重複宣言はやめてここ1か所から import） */
export const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND"]);

