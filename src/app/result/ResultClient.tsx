"use client";

import { useEffect, useState } from "react";

export default function ResultClient({
  sessionId,
  statusParam,
}: {
  sessionId: string;
  statusParam: string;
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<null | {
    id: string;
    payment_status: string;
    amount_total: number | null;
    currency: string | null;
    customer_email: string | null;
  }>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/stripe/checkout-session?session_id=${encodeURIComponent(
            sessionId
          )}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "failed");
        setData(json);
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  if (loading) return <p className="text-center">読み込み中…</p>;
  if (err) return <p className="text-red-600 text-center">取得に失敗しました: {err}</p>;
  if (!data) return <p className="text-center">情報が見つかりませんでした。</p>;

  const paid =
    (data.payment_status ?? "").toLowerCase() === "paid" ||
    statusParam === "success";

  return (
    <div className="bg-white shadow-md rounded-2xl p-6 space-y-4 border border-gray-200 max-w-md mx-auto">
      <h2 className="text-xl font-semibold text-white text-outline">お支払い結果</h2>
      <div className="space-y-2 text-gray-700 text-base">
        <p>
          ステータス:{" "}
          <span className={`font-bold ${paid ? "text-green-600" : "text-yellow-600"}`}>
            {paid ? "決済成功" : "未完了"}
          </span>
        </p>
        {data.amount_total != null && data.currency && (
          <p>
            金額:{" "}
            <span className="font-bold">
              {new Intl.NumberFormat("ja-JP").format(data.amount_total)}{" "}
              {data.currency.toUpperCase()}
            </span>
          </p>
        )}
        {data.customer_email && <p>メール: {data.customer_email}</p>}
      </div>
    </div>
  );
}
