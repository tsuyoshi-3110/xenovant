
import type { Base, Tr, Section } from "@/types/productLocales";
import type { UILang } from "@/lib/atoms/uiLangAtom";
import { type Product } from "@/types/Product";


/** 表示テキスト多言語解決 */
export function displayOf(p: Product & { base?: Base; t?: Tr[] }, lang: UILang): Base {
  const fallback: Base = {
    title: (p as any)?.title ?? "",
    body: (p as any)?.body ?? "",
  };
  if (!p.base && !p.t) return fallback;
  if (lang === "ja") return p.base ?? fallback;
  const hit = p.t?.find((x) => x.lang === lang);
  return {
    title: (hit?.title ?? p.base?.title ?? fallback.title) || "",
    body: (hit?.body ?? p.base?.body ?? fallback.body) || "",
  };
}

export function sectionTitleLoc(s: Section, lang: UILang): string {
  if (lang === "ja") return s.base?.title ?? "";
  const hit = s.t?.find((x) => x.lang === lang);
  return hit?.title ?? s.base?.title ?? "";
}
