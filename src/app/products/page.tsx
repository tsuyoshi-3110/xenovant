// app/products/page.tsx
import type { Metadata } from "next";
import ProductsClient from "@/components/products/ProductsClient";

const title = "メニュー一覧｜甘味処 よって屋";
const description =
  "甘味処 よって屋の人気クレープメニュー一覧ページ。季節限定商品やおすすめクレープを写真付きでご紹介。";
const ogImage = "/ogp-products.jpg"; // public 配下の画像

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: "https://www.xenovant.shop/products",
    siteName: "甘味処 よって屋",
    images: [
      {
        url: ogImage as string,
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website", // ← "product" は型に無いので "website"
  } satisfies Metadata["openGraph"],
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage],
  },
};

export default function ProductsPage() {
  return <ProductsClient />;
}
