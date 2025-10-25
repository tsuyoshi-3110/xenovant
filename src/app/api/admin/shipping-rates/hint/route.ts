import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHIPPING_ESTIMATES = [
  { lang: "ja", country: "日本", city: "東京", average_price_jpy: 900, details: [{ carrier: "日本郵便", price: 900, delivery_days: "1〜2日" }] },
  { lang: "en", country: "アメリカ", city: "ニューヨーク", average_price_jpy: 4000, details: [{ carrier: "EMS", price: 3800, delivery_days: "3〜5日" }, { carrier: "DHL", price: 4200, delivery_days: "2〜4日" }] },
  { lang: "fr", country: "フランス", city: "パリ", average_price_jpy: 4200, details: [{ carrier: "EMS", price: 4000, delivery_days: "4〜6日" }] },
  { lang: "zh", country: "中国", city: "北京", average_price_jpy: 3200, details: [{ carrier: "EMS", price: 3100, delivery_days: "3〜5日" }] },
  { lang: "zh-TW", country: "台湾", city: "台北", average_price_jpy: 2800, details: [{ carrier: "EMS", price: 2700, delivery_days: "2〜4日" }] },
  { lang: "ko", country: "韓国", city: "ソウル", average_price_jpy: 2600, details: [{ carrier: "EMS", price: 2500, delivery_days: "2〜3日" }] },
  { lang: "es", country: "スペイン", city: "マドリード", average_price_jpy: 4300, details: [{ carrier: "EMS", price: 4200, delivery_days: "4〜6日" }] },
  { lang: "de", country: "ドイツ", city: "ベルリン", average_price_jpy: 4100, details: [{ carrier: "EMS", price: 4000, delivery_days: "4〜5日" }] },
  { lang: "pt", country: "ポルトガル", city: "リスボン", average_price_jpy: 4400, details: [{ carrier: "EMS", price: 4300, delivery_days: "4〜6日" }] },
  { lang: "it", country: "イタリア", city: "ローマ", average_price_jpy: 4200, details: [{ carrier: "EMS", price: 4100, delivery_days: "4〜6日" }] },
  { lang: "ru", country: "ロシア", city: "モスクワ", average_price_jpy: 4600, details: [{ carrier: "EMS", price: 4500, delivery_days: "6〜10日" }] },
  { lang: "th", country: "タイ", city: "バンコク", average_price_jpy: 3000, details: [{ carrier: "EMS", price: 2900, delivery_days: "3〜5日" }] },
  { lang: "vi", country: "ベトナム", city: "ホーチミン", average_price_jpy: 2900, details: [{ carrier: "EMS", price: 2800, delivery_days: "3〜4日" }] },
  { lang: "id", country: "インドネシア", city: "ジャカルタ", average_price_jpy: 3100, details: [{ carrier: "EMS", price: 3000, delivery_days: "3〜5日" }] },
  { lang: "hi", country: "インド", city: "ニューデリー", average_price_jpy: 3500, details: [{ carrier: "EMS", price: 3400, delivery_days: "5〜7日" }] },
  { lang: "ar", country: "サウジアラビア", city: "リヤド", average_price_jpy: 4600, details: [{ carrier: "EMS", price: 4500, delivery_days: "6〜9日" }] },
];

export async function GET() {
  return NextResponse.json(SHIPPING_ESTIMATES);
}
