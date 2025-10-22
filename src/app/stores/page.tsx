import type { Metadata } from "next";
import StoresClient from "@/components/StoresClient";
import { PhoneSection } from "@/components/PhoneSection";

export const metadata: Metadata = {
  title: "店舗一覧｜甘味処 よって屋",
  description:
    "甘味処 よって屋の店舗一覧ページ。大阪市東淀川区にある各店舗の所在地や紹介文を掲載しています。",
  openGraph: {
    title: "店舗一覧｜甘味処 よって屋",
    description:
      "甘味処 よって屋 各店舗の住所・紹介情報を掲載。大阪市東淀川区のクレープ店。",
    url: "https://www.xenovant.shop/stores",
    siteName: "甘味処 よって屋",
    images: [
      {
        url: "/ogp-stores.jpg",
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
};

export default function StoresPage() {
  return (
    <main className="px-4 py-16">
      {/* 電話注文セクション */}

      {/* 店舗情報紹介 */}
      <section className="max-w-4xl mx-auto text-center mb-12 text-outline">
        <h1 className="text-2xl lg:text-3xl font-extrabold mb-4 text-white/80">
          甘味処 よって 屋 ─ 店舗一覧
        </h1>
        <p className="leading-relaxed text-white">
          <strong>甘味処 よって 屋</strong> は
          <strong>大阪市北区と東淀川区</strong>
          に店舗を構えるクレープメインのお店。
          駅チカ店から住宅街の隠れ家店まで、
          <br className="hidden lg:block" />
          各店舗限定メニューや営業時間をチェックして、
          お近くのお店でサクサク生地のクレープをお楽しみください。
        </p>
      </section>
      <section className="max-w-4xl mx-auto text-center mb-12 ">
        <PhoneSection />
      </section>

      {/* クライアント側店舗一覧表示 */}
      <StoresClient />
    </main>
  );
}
