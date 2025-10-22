import { type Product } from "@/types/Product";

export type LangKey =
| "ja" | "en" | "zh" | "zh-TW" | "ko" | "fr" | "es" | "de" | "pt" | "it" | "ru" | "th" | "vi" | "id" | "hi" | "ar";


export type MediaType = "image" | "video";


export type Base = { title: string; body: string };
export type Tr = { lang: LangKey; title?: string; body?: string };


export type Section = {
  id: string;
  base: { title: string };
  t: Array<{ lang: LangKey; title?: string }>;
  createdAt?: any;
  order?: number; // 並び順
};


export type ProdDoc = Product & {
  base?: Base;
  t?: Tr[];
  sectionId?: string | null;
  published?: boolean;

  // ▼ ここから追加
  priceIncl?: number; // 税込
  priceExcl?: number; // 税抜
  taxRate?: number; // 例: 0.1
  priceInputMode?: "incl" | "excl"; // 入力モード(保存時の参照)
  taxIncluded?: boolean; // 表示用ラベルは常に税込に固定でも型として保持
  mediaType?: MediaType; // 念のため（既に使っているので）
  mediaURL?: string; // 念のため
};

