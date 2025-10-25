// src/app/owner/reports/InsightsPanel.tsx
"use client";

import { useEffect, useState } from "react";

type DayPoint = { date: string; value: number };

type Props = {
  payload: {
    siteKey: string;
    range: { from: string; to: string };
    kpis: { revenue: number; count: number; aov: number };
    days: DayPoint[];
    topByQty: [string, number][];
    topByRev: [string, number][];
    currency?: string;
  };
};

export default function InsightsPanel({ payload }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiText, setAiText] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [tips, setTips] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      setSummary(json?.heuristic?.summary ?? null);
      setTips(json?.heuristic?.tips ?? []);
      setActions(json?.heuristic?.actions ?? []);

      if (json?.ai?.raw) setAiText(json.ai.raw as string);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(payload)]);

  return (
    <section className="bg-white/95 backdrop-blur rounded-2xl p-5 shadow-lg border border-gray-200">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold">AI 改善提案</h2>
        <button
          className="px-3 py-1.5 rounded-full border bg-gray-800 text-gray-100 border-gray-700 hover:bg-gray-700 text-sm"
          onClick={run}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? "解析中…" : "再解析"}
        </button>
      </div>

      {error && (
        <div className="text-red-600 text-sm mb-3">解析に失敗しました：{error}</div>
      )}

      {summary && <p className="text-gray-700 text-sm mb-3">{summary}</p>}

      {tips.length > 0 && (
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
          {tips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}

      {actions.length > 0 && (
        <div className="mt-4">
          <div className="text-gray-500 text-xs mb-1">すぐやる3手順</div>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-800">
            {actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </div>
      )}

      {aiText && (
        <div className="mt-5 border-t pt-4">
          <div className="text-gray-500 text-xs mb-1">AI 追加コメント</div>
          <pre className="whitespace-pre-wrap text-sm text-gray-800">{aiText}</pre>
        </div>
      )}

      {!summary && !loading && (
        <p className="text-gray-500 text-sm">データが少ないため、提案を生成できませんでした。</p>
      )}
    </section>
  );
}
