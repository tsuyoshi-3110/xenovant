"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

export default function CheckoutTestPage() {
  const [loading, setLoading] = useState(false);

  // まずは SITE_KEY を送る（API 側で docId / siteKey の両方に対応）
  const sellerId = SITE_KEY;

  // /productsEC/checkout-test/page.tsx の start()
  const start = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout-session-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId, // 既存
          items: [
            {
              // ★追加
              name: "Connect テスト支払い",
              unitAmount: 100, // ¥100
              qty: 1,
            },
          ],
          platformFee: 10, // 例: 10円
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) throw new Error(data?.error || "failed");
      window.location.href = data.url;
    } catch (e: any) {
      alert(`セッション作成に失敗: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-xl mx-auto p-6 pt-24 space-y-4">
      <h1 className="text-xl font-bold">Connect 決済テスト</h1>
      <p className="text-sm opacity-80">
        テスト用に ¥100
        の支払いを作成し、売上を接続アカウントへ送ります（プラットフォーム手数料
        10 円）。
      </p>
      <Button onClick={start} disabled={loading} className="w-full">
        {loading ? "作成中…" : "テスト決済へ進む"}
      </Button>
    </main>
  );
}
