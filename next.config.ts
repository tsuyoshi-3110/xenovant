// next.config.ts
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const stripe = [
  "https://js.stripe.com",
  "https://api.stripe.com",
  "https://checkout.stripe.com",
  "https://hooks.stripe.com",
  "https://m.stripe.network",
  "https://r.stripe.com",
] as const;

const firebase = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firestore.googleapis.com",
  "https://firebasestorage.googleapis.com",
  "https://www.googleapis.com",
  "https://www.gstatic.com",
  // 画像アバター等を使う場合はコメント解除
  // "https://lh3.googleusercontent.com",
] as const;

// --- 重要ポイント ---
// ・img-src に Firebase Storage を追加
// ・media-src を明示して動画/音声の外部読み込みを許可
// ・frame-src に 'self' を追加（自己ページの <iframe> も許可）
// ・オプションで 'upgrade-insecure-requests' と 'object-src none' を追加
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${stripe.join(" ")}`,
  `style-src 'self' 'unsafe-inline'`,
  // 画像：Stripe 既存 + Firebase Storage （両系統）
  `img-src 'self' data: blob: ${[
    ...stripe,
    "https://firebasestorage.googleapis.com",
    "https://*.firebasestorage.app",
    // "https://lh3.googleusercontent.com", // 使う場合は開放
  ].join(" ")}`,
  // 動画/音声：Firebase Storage を許可
  `media-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.firebasestorage.app`,
  // フレーム：自サイト + Stripe
  `frame-src 'self' ${stripe.join(" ")}`,
  // XHR / fetch：Stripe + Firebase
  `connect-src 'self' ${[...stripe, ...firebase].join(" ")}`,
  `font-src 'self' data:`,
  `worker-src 'self' blob:`,
  `form-action 'self' https://checkout.stripe.com https://hooks.stripe.com`,
  `base-uri 'self'`,
  `frame-ancestors 'self'`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

const nextConfig: NextConfig = {
  images: {
    // Next/Image のリモート許可（CSPとは別物）
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com", pathname: "/v0/b/**" },
      { protocol: "https", hostname: "**.firebasestorage.app", pathname: "/**" },
      // { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" }, // 必要なら開放
    ],
  },
  async headers() {
    if (!isProd) return []; // dev は CSP 無効（今回の方針）
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "SAMEORIGIN" }, // 互換用
        ],
      },
    ];
  },
};

export default nextConfig;
