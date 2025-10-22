"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function ReturnClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const sellerId = sp.get("sellerId") || "default"; // 必要に応じて siteKey 等に変更

  const [msg, setMsg] = useState("確認中…");

  useEffect(() => {
    let retryCount = 0;
    let isActive = true; // アンマウント後の setState 防止

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/stripe/sync-onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sellerId }),
          cache: "no-store",
        });

        const data = await res.json();

        if (!isActive) return;

        if (data.onboardingCompleted) {
          setMsg("連携が完了しました！");
          clearInterval(interval);
        } else if (retryCount >= 5) {
          setMsg("まだ未完了です。入力を最後までお願いします。");
          clearInterval(interval);
        }

        retryCount++;
      } catch {
        if (!isActive) return;
        setMsg("確認に失敗しました");
        clearInterval(interval);
      }
    }, 3000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [sellerId]);

  return (
    <main className="max-w-md mx-auto p-6 text-center">
      <h1 className="text-xl font-bold mb-3">Stripe 連携</h1>
      <p className="mb-6">{msg}</p>
      <button
        className="px-4 py-2 rounded bg-black text-white"
        onClick={() => router.push("/login")}
      >
        管理画面へ戻る
      </button>
    </main>
  );
}
