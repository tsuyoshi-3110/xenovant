// src/app/(routes)/home/page.tsx

import type { Metadata } from "next";
import BackgroundVideo from "@/components/BackgroundVideo";
import TopFixedText from "@/components/TopFixedText";
import TopVisibleSections from "@/components/TopVisibleSections";

export const metadata: Metadata = {
  title: "甘味処 よって屋｜大阪市のクレープ専門店",
  description:
    "大阪市東淀川区と北区に店舗を構えるクレープ専門店『甘味処 よって屋』。独自の生地とこだわりのクリームを使ったクレープをご提供しています。",
  openGraph: {
    title: "甘味処 よって屋｜大阪市のクレープ専門店",
    description:
      "大阪市東淀川区・北区に展開する『甘味処 よって屋』。サクサクとモチモチの食感を楽しめるクレープが人気です。",
    url: "https://xenovant.shop/",
    siteName: "甘味処 よって屋",
    images: [
      {
        url: "/ogp-home.jpg",
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  alternates: { canonical: "https://xenovant.shop/" },
};

export default function HomePage() {
  return (
    <main className="w-full overflow-x-hidden">
      {/* ① ファーストビュー：背景動画のみ */}
      <section className="relative h-screen overflow-hidden">
        <BackgroundVideo />
      </section>

      {/* ② スクロールして現れる本文 */}
      <section className="relative z-10 text-white px-4 py-20">
        {/* 編集可能な固定タイトル */}
        <TopFixedText />

        {/* SEO 用見出しとリード文 */}
        <h1 className="text-3xl lg:text-4xl font-extrabold text-center leading-tight mb-6 text-outline">
          甘味処 よって屋
          <br />
          大阪市のクレープ専門店
        </h1>

        <div className="max-w-3xl mx-auto space-y-6 text-center leading-relaxed text-outline">
          <p>
            『甘味処
            よって屋』は、大阪市東淀川区・北区に展開するクレープ専門店です。
            独自の配合で焼き上げた生地と、相性の良いクリームを組み合わせ、
            幅広い世代のお客様に楽しんでいただけるクレープをご提供しています。
          </p>

          <p>
            テイクアウトはもちろん、店舗によってはイートインもご利用いただけます。
            お買い物や学校帰りなど、さまざまなシーンで気軽に立ち寄れる場所として
            ご利用いただいています。
          </p>
        </div>

        <TopVisibleSections />
      </section>

      {/* ③ 構造化データ (JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "Restaurant",
              name: "甘味処 よって屋 東淀川店",
              address: {
                "@type": "PostalAddress",
                addressLocality: "大阪市東淀川区",
              },
              servesCuisine: "Crepe",
              url: "https://xenovant.shop/",
            },
            {
              "@context": "https://schema.org",
              "@type": "Restaurant",
              name: "甘味処 よって屋 北区店",
              address: {
                "@type": "PostalAddress",
                addressLocality: "大阪市北区",
              },
              servesCuisine: "Crepe",
              url: "https://xenovant.shop/",
            },
          ]),
        }}
      />
    </main>
  );
}
