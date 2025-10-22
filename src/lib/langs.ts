// src/lib/langs.ts
export const LANGS = [
  { key: "ja", label: "日本語", emoji: "🇯🇵" },
  { key: "en", label: "English", emoji: "🇺🇸" },
  { key: "zh", label: "简体中文", emoji: "🇨🇳" },
  { key: "zh-TW", label: "繁體中文", emoji: "🇹🇼" },
  { key: "ko", label: "한국어", emoji: "🇰🇷" },
  { key: "fr", label: "Français", emoji: "🇫🇷" },
  { key: "es", label: "Español", emoji: "🇪🇸" },
  { key: "de", label: "Deutsch", emoji: "🇩🇪" },
  { key: "pt", label: "Português", emoji: "🇵🇹" },
  { key: "it", label: "Italiano", emoji: "🇮🇹" },
  { key: "ru", label: "Русский", emoji: "🇷🇺" },
  { key: "th", label: "ไทย", emoji: "🇹🇭" },
  { key: "vi", label: "Tiếng Việt", emoji: "🇻🇳" },
  { key: "id", label: "Bahasa Indonesia", emoji: "🇮🇩" },
  { key: "hi", label: "हिन्दी", emoji: "🇮🇳" },
  { key: "ar", label: "العربية", emoji: "🇸🇦" },
] as const;

export type LangKey = (typeof LANGS)[number]["key"];
