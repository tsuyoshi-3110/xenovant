// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import Header from "@/components/common/Header";
import Footer from "@/components/common/Footer";
import Script from "next/script";
import ThemeBackground from "@/components/ThemeBackground";
import WallpaperBackground from "@/components/WallpaperBackground";
import AnalyticsLogger from "@/components/AnalyticsLogger";
import FontLoader from "@/components/FontLoader";
import SubscriptionOverlay from "@/components/SubscriptionOverlay";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

// ▼ カート全体提供（追加）
import { CartProvider } from "@/lib/cart/CartContext";

import {
  kosugiMaru,
  notoSansJP,
  shipporiMincho,
  reggaeOne,
  yomogi,
  hachiMaruPop,
} from "@/lib/font";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "甘味処 よって屋｜ふんわり生地のクレープ専門店",
  description:
    "大阪市東淀川区のクレープ専門店『甘味処 よって屋』。ふんわり生地とこだわりクリームが自慢です。",
  keywords: [
    "甘味処クレープよって屋",
    "よって屋",
    "甘味処",
    "飲食",
    "クレープ",
    "大阪",
    "東淀川区",
    "下新庄",
  ],
  openGraph: {
    title: "甘味処 よって屋｜ふんわり生地のクレープ専門店",
    description:
      "ふんわり生地とこだわりクリームが自慢のクレープ屋さん。大阪市東淀川区で営業中。",
    url: "https://www.xenovant.shop/",
    siteName: "甘味処 よって屋",
    images: [
      {
        url: "/ogp.jpg",
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className={`
        ${geistSans.variable} ${geistMono.variable}
        ${kosugiMaru.variable} ${notoSansJP.variable}
        ${yomogi.variable} ${hachiMaruPop.variable}
        ${reggaeOne.variable} ${shipporiMincho.variable}
        antialiased
      `}
    >
      <head>
        {/* Google Analytics（IDがあるときだけ読み込み） */}
        {GA_ID ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}', { page_path: window.location.pathname });
              `}
            </Script>
          </>
        ) : null}

        {/* 画像の先読み（壁紙） */}
        <link
          rel="preload"
          as="image"
          href="/images/wallpaper/kamon.jpg"
          type="image/webp"
        />
        <meta name="theme-color" content="#ffffff" />

        {/* サーチコンソール用（複数可） */}
        <meta
          name="google-site-verification"
          content="UcH7-5B4bwpJxxSjIpBskahFhBRTSLRJUZ8A3LAnnFE"
        />
        <meta
          name="google-site-verification"
          content="h2O77asgMDfUmHBb7dda53OOJdsxv9GKXd5rrRgIQ-k"
        />
      </head>

      <body className="relative min-h-[100dvh] flex flex-col">
        {/* 背景レイヤー（下層） */}
        <WallpaperBackground />
        <ThemeBackground />

        {/* 計測（ページ表示時のログなど） */}
        <AnalyticsLogger />

        {/* サイト全体をCartProviderでラップ */}
        <CartProvider>
          {/* 上位オーバーレイ（サブスク状態によるブロック等） */}
          <SubscriptionOverlay siteKey={SITE_KEY} />

          {/* UI本体 */}
          <Header />
          <FontLoader />
          <main className="flex-1">{children}</main>
          <Footer />
        </CartProvider>

        {/* 構造化データ（店舗情報） */}
        <Script
          id="ld-json"
          type="application/ld+json"
          strategy="afterInteractive"
        >
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Restaurant",
            name: "甘味処 よって屋",
            address: {
              "@type": "PostalAddress",
              addressLocality: "大阪市東淀川区",
              streetAddress: "淡路４丁目１８−１６",
            },
            telephone: "06-1234-5678",
            url: "https://example.com",
          })}
        </Script>
      </body>
    </html>
  );
}
