"use client";

import { useEffect, useState } from "react";
import CheckoutButton from "./CheckoutButton";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function SubscriptionOverlay({ siteKey }: { siteKey: string }) {
  const [status, setStatus] = useState<
    "loading" | "paid" | "unpaid" | "pending" | "canceled" | "setup"
  >("loading");
  const [isFreePlan, setIsFreePlan] = useState<boolean | null>(null);
  const [setupMode, setSetupMode] = useState<boolean | null>(null); // ✅ ← setupMode追加

  useEffect(() => {
    const checkPayment = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get("session_id");

      const apiUrl = sessionId
        ? `/api/stripe/verify-subscription?session_id=${sessionId}`
        : `/api/stripe/check-subscription?siteKey=${siteKey}`;

      console.log("🔍 checkPayment called:", apiUrl);

      const res = await fetch(apiUrl);
      const json = await res.json();

      console.log("✅ サブスクステータス:", json.status);

      if (json.status === "active") setStatus("paid");
      else if (json.status === "pending_cancel") setStatus("pending");
      else if (json.status === "canceled") setStatus("canceled");
      else if (json.status === "setup_mode" || json.status === "setup")
        setStatus("setup");
      else setStatus("unpaid");

      if (sessionId) {
        const url = new URL(window.location.href);
        url.searchParams.delete("session_id");
        window.history.replaceState({}, "", url.toString());
      }
    };

    const fetchPlanFlags = async () => {
      const ref = doc(db, "sitePublicProfile", siteKey);
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() : {};

      setIsFreePlan(data.isFreePlan === true);
      setSetupMode(data.setupMode === true); // ✅ setupMode読み込み
    };

    checkPayment();
    fetchPlanFlags();
  }, [siteKey]);

  // ✅ データ未取得中は表示しない
  if (isFreePlan === null || setupMode === null || status === "loading")
    return null;

  // ✅ 無料プラン or セットアップモード時はブロックを表示しない
  if (isFreePlan || setupMode) return null;

  // ✅ ステータスが未払い系のときだけブロック表示
  if (!["setup", "paid", "pending"].includes(status)) {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center z-50">
        <p className="text-lg mb-4">
          このページを表示するにはサブスクリプション登録が必要です。
        </p>
        <CheckoutButton siteKey={siteKey} />
      </div>
    );
  }

  return null;
}
