// src/app/(routes)/news/page.tsx
import type { Metadata } from "next";
import NewsClient from "@/components/NewsClient";

export const metadata: Metadata = {
  title: "お知らせ｜甘味処 よって屋",
  description:
    "甘味処 よって屋のお知らせページ。最新情報やイベント情報をお届けします。",
  openGraph: {
    title: "お知らせ｜甘味処 よって屋",
    description:
      "甘味処 よって屋のお知らせ。新メニューや営業時間変更など最新情報を掲載。",
    url: "https://xenovant.shop/news",
    siteName: "甘味処 よって屋",
    images: [{ url: "/ogp-news.jpg", width: 1200, height: 630 }],
    locale: "ja_JP",
    type: "website",
  },
  alternates: { canonical: "https://xenovant.shop/news" },
};

export default function NewsPage() {
  return (
    <main className="px-4 py-12 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mt-6 mb-6 text-center text-white/80">
        お知らせ
      </h1>
      <NewsClient />
    </main>
  );
}
