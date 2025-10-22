"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function CheckoutButton({ siteKey }: { siteKey: string }) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("支払い画面への遷移に失敗しました");
      }
    } catch (e) {
      alert("エラーが発生しました");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleCheckout} disabled={loading}>
      {loading ? "遷移中…" : "サブスク支払いへ進む"}
    </Button>
  );
}
