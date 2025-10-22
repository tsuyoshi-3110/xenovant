// src/app/owner/reports/ChartSparkline.tsx
"use client";

type Pt = { date: string; value: number };

export default function ChartSparkline({
  data,
  height = 200,
}: {
  data: Pt[];
  height?: number;
}) {
  const padding = 24;
  const width = Math.max(360, data.length * 18 + padding * 2);
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = Math.max(6, (width - padding * 2) / Math.max(1, data.length));
  const scaleY = (v: number) => {
    const h = height - padding * 2;
    return height - padding - (v / max) * h;
  };

  // 軸目盛り（最大値/2/4）
  const ticks = [max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0];

  return (
    <div className="w-full overflow-x-auto">
      <svg width={width} height={height}>
        {/* 背景 */}
        <rect x={0} y={0} width={width} height={height} fill="#ffffff" rx={12} />
        {/* 横グリッド */}
        {ticks.map((t, i) => {
          const y = scaleY(t);
          return (
            <g key={i}>
              <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="#eee" />
              <text x={8} y={y + 4} fontSize="10" fill="#888">{t.toLocaleString("ja-JP")}</text>
            </g>
          );
        })}

        {/* 棒グラフ */}
        {data.map((d, i) => {
          const x = padding + i * barW;
          const y = scaleY(d.value);
          const h = height - padding - y;
          return (
            <g key={d.date}>
              <rect
                x={x + 2}
                y={y}
                width={barW - 4}
                height={Math.max(0, h)}
                fill="#3b82f6"
                rx={4}
              />
            </g>
          );
        })}

        {/* X軸ラベル（等間引き） */}
        {data.map((d, i) => {
          const every = Math.ceil(data.length / 12); // 約12ラベルに抑制
          if (i % every !== 0 && i !== data.length - 1) return null;
          const x = padding + i * barW + barW / 2;
          return (
            <text key={d.date} x={x} y={height - 6} fontSize="10" fill="#666" textAnchor="middle">
              {d.date.slice(5)} {/* MM-DD */}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
