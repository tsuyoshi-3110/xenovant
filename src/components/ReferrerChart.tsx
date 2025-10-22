"use client";

import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function ReferrerChart({
  data,
}: {
  data: {
    sns: number;
    search: number;
    direct: number;
  };
}) {
  const chartData = {
    labels: ["SNS", "検索", "直接"],
    datasets: [
      {
        label: "アクセス元の割合",
        data: [data.sns, data.search, data.direct],
        backgroundColor: [
          "rgba(59, 130, 246, 0.6)",   // SNS
          "rgba(16, 185, 129, 0.6)",   // 検索
          "rgba(255, 159, 64, 0.6)",   // 直接
        ],
      },
    ],
  };

  return (
    <div className="bg-white/50 rounded p-4 shadow mt-6">
      <h3 className="font-semibold text-sm mb-2">アクセス元の割合</h3>
      <Bar
        data={chartData}
        options={{
          responsive: true,
          plugins: {
            tooltip: { enabled: true },
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: "アクセス数" },
            },
          },
        }}
      />
    </div>
  );
}
