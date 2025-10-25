// src/app/owner/reports/SalesLine.tsx
"use client";

import { useId, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
} from "recharts";

export type Pt = { ts: number; value: number };

export default function SalesLine({
  data = [],
  height = 420,
  accent = "#3b82f6",
}: {
  data?: Pt[];
  height?: number;
  accent?: string;
}) {
  // ✅ rowsをメモ化（依存にrowsを使っても参照が安定）
  const rows = useMemo<Pt[]>(
    () =>
      Array.isArray(data)
        ? data.map((d) => ({
            ts: Number(d?.ts) || 0,
            value: Math.max(0, Number(d?.value) || 0),
          }))
        : [],
    [data]
  );

  const gradId = useId().replace(/:/g, "_");

  // ✅ minは返さず、minIdxだけ算出して利用
  const { max, avg, maxIdx, minIdx } = useMemo(() => {
    if (rows.length === 0) return { max: 0, avg: 0, maxIdx: -1, minIdx: -1 };
    let sum = 0;
    let mx = -Infinity,
      mxI = 0;
    let mn = Infinity,
      mnI = 0;
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i].value;
      sum += v;
      if (v > mx) {
        mx = v;
        mxI = i;
      }
      if (v < mn) {
        mn = v;
        mnI = i;
      }
    }
    return { max: mx, avg: sum / rows.length, maxIdx: mxI, minIdx: mnI };
  }, [rows]); // ← rows参照がuseMemoで安定

  const targetXTicks = useMemo(
    () => Math.min(10, Math.max(4, Math.ceil(rows.length / 3))),
    [rows.length]
  );

  const fmtJPY = (n: number) => `¥${Math.round(+n).toLocaleString("ja-JP")}`;
  const fmtTick = (ts: number) => {
    const d = new Date(ts);
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${m}/${day}`;
  };
  const fmtLabel = (ts: number) => {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  if (rows.length === 0) {
    return (
      <div className="w-full rounded-xl border border-gray-200 p-4 text-sm text-gray-500">
        データがありません
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={rows}
          margin={{ top: 12, right: 24, bottom: 8, left: 12 }}
        >
          <defs>
            <linearGradient id={`fill_${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
              <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="ts"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={fmtTick}
            tickCount={targetXTicks}
            axisLine={{ stroke: "#e5e7eb" }}
            tick={{ fill: "#6b7280", fontSize: 12 }}
            tickMargin={8}
          />
          <YAxis
            tickFormatter={(v: any) => Math.round(+v).toLocaleString("ja-JP")}
            width={72}
            axisLine={{ stroke: "#e5e7eb" }}
            tick={{ fill: "#6b7280", fontSize: 12 }}
            tickMargin={6}
            allowDecimals={false}
            domain={[0, Math.max(max, 1)]}
          />
          <Tooltip
            cursor={{ stroke: accent, strokeOpacity: 0.2, strokeWidth: 2 }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            }}
            labelFormatter={(v) => fmtLabel(Number(v))}
            formatter={(v: any) => [fmtJPY(v), "売上"]}
          />

          {/* 平均値（点線） */}
          <ReferenceLine
            y={avg}
            stroke="#9ca3af"
            strokeDasharray="4 6"
            ifOverflow="extendDomain"
            label={{
              value: `平均 ${fmtJPY(avg)}`,
              position: "right",
              fill: "#6b7280",
              fontSize: 11,
            }}
          />

          {/* 面＋滑らかな線 */}
          <Area
            type="monotone"
            dataKey="value"
            stroke={accent}
            strokeWidth={2.5}
            fill={`url(#fill_${gradId})`}
            activeDot={{ r: 4 }}
          />

          {/* 最大・最小の日をドットでハイライト */}
          {maxIdx >= 0 && (
            <ReferenceDot
              x={rows[maxIdx].ts}
              y={rows[maxIdx].value}
              r={4}
              stroke={accent}
              fill="#fff"
            />
          )}
          {minIdx >= 0 && maxIdx !== minIdx && (
            <ReferenceDot
              x={rows[minIdx].ts}
              y={rows[minIdx].value}
              r={4}
              stroke="#a3a3a3"
              fill="#fff"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
