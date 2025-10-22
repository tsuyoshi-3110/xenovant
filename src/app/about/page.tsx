import type { Metadata } from "next";
import AboutClient from "@/components/AboutClient";

export const metadata: Metadata = {
  title: "当店の思い｜甘味処 よって屋",
  description:
    "甘味処 よって屋の想いをご紹介します。素材へのこだわりとお客様への気持ちを込めたメッセージ。",
  openGraph: {
    title: "当店の思い｜甘味処 よって屋",
    description:
      "ふんわり生地とこだわりクリームで皆様に笑顔を。大阪市東淀川区で営業中。",
    url: "https://www.xenovant.shop/about",
    siteName: "甘味処 よって屋",
    images: [
      {
        url: "/ogp-about.jpg",
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <main className="px-4 py-12 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mt-3 text-center text-white/80 text-outline">
        当店の思い
      </h1>
      <AboutClient />
    </main>
  );
}
