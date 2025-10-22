"use client";

import { useEffect } from "react";
import { atomWithStorage } from "jotai/utils";
import { useAtom } from "jotai";
import { LANGS, type LangKey } from "@/lib/langs";

export type UILang = "ja" | LangKey;

const LS_KEY = "ui-lang";
const CK_KEY = "ui_lang";

/** サポート言語キーへ正規化（en-US→en, zh-Hant→zh-TW など） */
export function normalizeUILang(raw: string | undefined | null): UILang {
  if (!raw) return "ja";
  const map = new Set<UILang>(["ja", ...(LANGS.map(l => l.key) as UILang[])]);
  const lower = String(raw).toLowerCase();

  // 既に完全一致
  if (map.has(lower as UILang)) return lower as UILang;

  // 中国語特例
  if (lower.startsWith("zh")) {
    if (lower.includes("tw") || lower.includes("hk") || lower.includes("hant")) return "zh-TW";
    return "zh";
  }

  // ベース言語へ切り詰め
  const base = lower.split("-")[0] as UILang;
  if (map.has(base)) return base;

  return "ja";
}

/** 初回のみブラウザ言語から推定 */
function detectDefault(): UILang {
  if (typeof window === "undefined") return "ja";
  const prefs = [navigator.language, ...(navigator.languages ?? [])]
    .filter(Boolean)
    .map(x => x.toLowerCase());
  for (const raw of prefs) {
    const n = normalizeUILang(raw);
    if (n) return n;
  }
  return "ja";
}

/** localStorage に永続される UI 言語（既定 ja） */
export const uiLangAtom = atomWithStorage<UILang>(LS_KEY, "ja");

/** アプリで使うフック。保存・<html lang>・Cookie を同期。 */
export function useUILang() {
  const [uiLang, setUiLang] = useAtom(uiLangAtom);

  // 初回：未保存なら自動検出
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (!stored) setUiLang(detectDefault());
    } catch {/* noop */}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 変更時：正規化して保存・<html lang> と Cookie 同期
  useEffect(() => {
    const n = normalizeUILang(uiLang);
    try {
      if (uiLang !== n) {
        // 誤ったキーが入っていたら正規化して再保存
        setUiLang(n);
        return;
      }
      document.documentElement.lang = n;
      document.documentElement.setAttribute("data-ui-lang", n);
      document.cookie = `${CK_KEY}=${encodeURIComponent(n)}; path=/; max-age=31536000`;
    } catch {/* noop */}
  }, [uiLang, setUiLang]);

  /** 強制的に正規化してセットする setter（推奨） */
  const setUILangSafe = (value: UILang | string) => setUiLang(normalizeUILang(value));

  return { uiLang, setUiLang: setUILangSafe };
}
