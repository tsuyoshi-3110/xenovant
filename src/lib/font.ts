import {
  Kosugi_Maru,
  Noto_Sans_JP,
  Shippori_Mincho,
  Reggae_One,
  Hachi_Maru_Pop,
  Yomogi,
} from "next/font/google";

// サイト向けベーシック日本語フォント
export const kosugiMaru = Kosugi_Maru({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-kosugi",
});

export const notoSansJP = Noto_Sans_JP({
  weight: "400", // ✅ Noto Sans JP は variable font ではないため配列不可
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto",
});

export const shipporiMincho = Shippori_Mincho({
  weight: ["400", "700"], // 通常と太字
  subsets: ["latin"],
  display: "swap",
  variable: "--font-shippori",
});

export const reggaeOne = Reggae_One({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-reggae",
});

// 【追加】やさしい手書き調フォント
export const yomogi = Yomogi({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-yomogi",
});

// 【追加】丸文字系かわいいフォント
export const hachiMaruPop = Hachi_Maru_Pop({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hachimaru",
});
