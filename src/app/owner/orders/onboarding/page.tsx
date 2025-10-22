// app/owner/onboarding/page.tsx
"use client";

import { useEffect, useState } from "react";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

export default function OwnerOnboardingToggle() {
  const [loading, setLoading] = useState(true);
  const [val, setVal] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/sellers/${SITE_KEY}/onboarding`);
        const json = await res.json();
        setVal(!!json.onboardingCompleted);
      } catch {
        setMsg("現在の状態を取得できませんでした");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/sellers/${SITE_KEY}/onboarding`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          // 認証方式に応じて。ADMIN_TOKENを使う場合のみ↓
          ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
            ? { "x-admin-token": process.env.NEXT_PUBLIC_ADMIN_TOKEN }
            : {}),
        },
        body: JSON.stringify({ onboardingCompleted: !val }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "failed");
      setVal(!!json.onboardingCompleted);
      setMsg(`更新しました（${json.onboardingCompleted ? "有効" : "無効"}）`);
    } catch (e: any) {
      setMsg(`更新に失敗しました: ${e?.message || "unknown"}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="p-6">読み込み中…</main>;

  return (
    <main className="max-w-lg mx-auto p-6 space-y-4">
      <h1 className="text-xl font-bold">Stripe オンボーディング状態</h1>

      <div className="flex items-center justify-between border rounded-lg p-4">
        <div>
          <div className="font-medium">
            onboardingCompleted:{" "}
            <span className={val ? "text-green-600" : "text-gray-500"}>
              {val ? "true（有効）" : "false（無効）"}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            ここを切り替えると、チェックアウト開始時の連携判定に反映されます。
          </p>
        </div>

        <button
          onClick={toggle}
          disabled={saving}
          className={`px-4 py-2 rounded text-white ${
            val ? "bg-red-600" : "bg-green-600"
          } disabled:opacity-50`}
        >
          {saving ? "更新中…" : val ? "無効にする" : "有効にする"}
        </button>
      </div>

      {msg && <p className="text-sm">{msg}</p>}
    </main>
  );
}
