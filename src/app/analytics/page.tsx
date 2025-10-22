// app/analytics/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import CardSpinner from "@/components/CardSpinner";
import { Bar } from "react-chartjs-2";
import {
  Chart,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";

import DailyAccessChart from "@/components/DailyAccessChart";
import ReferrerChart from "@/components/ReferrerChart";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// 期間指定取得関数（JST 0:00 統一）
import {
  fetchPagesByPeriod,
  fetchEventsByPeriod,
  fetchReferrersByPeriod,
  fetchVisitorsByPeriod,
  fetchBounceByPeriod,
  fetchGeoByPeriod,
  fetchHourlyByPeriod,
  fetchDailyByPeriod,
  fetchWeekdayByPeriod,
} from "@/lib/logAnalytics";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import Link from "next/link";

Chart.register(CategoryScale, LinearScale, BarElement, Tooltip);

/* ───────── 期間計算 ───────── */
const calcStart = (daysAgo: number) =>
  format(subDays(new Date(), daysAgo), "yyyy-MM-dd");
const TODAY = format(new Date(), "yyyy-MM-dd");
const DEFAULT_START = calcStart(30);

/* ───────── ラベル定義（＝表示ホワイトリスト） ───────── */
const PAGE_LABELS: Record<string, string> = {
  home: "ホーム",
  about: "当店の思い",
  products: "商品一覧ページ",
  stores: "店舗一覧ページ",
  "uber-eats": "デリバリーページ",
  news: "お知らせページ",
  email: "メールアクセス",
  map_click: "マップアクセス",
  staffs: "スタッフ紹介ぺージ",
  jobApp: "応募ページ",
  apply: "応募ページ",
  blog: "ブログページ",
  menu: "料金ページ",
  company: "会社概要ページ",
};

const EVENT_LABELS: Record<string, string> = {
  home_stay_seconds_home: "ホーム滞在",
  home_stay_seconds_about: "当店の思い滞在",
  home_stay_seconds_products: "商品一覧滞在",
  home_stay_seconds_stores: "店舗一覧滞在",
  home_stay_seconds_staffs: "スタッフ紹介滞在",
  home_stay_seconds_jobApp: "応募滞在",
  home_stay_seconds_news: "お知らせ滞在",
  home_stay_seconds_email: "メールアクセス滞在",
  home_stay_seconds_map_click: "マップアクセス滞在",
  home_stay_seconds_apply: "応募滞在",
  home_stay_seconds_menu: "料金滞在",
  home_stay_seconds_blog: "ブログ滞在",
  home_stay_seconds_company: "会社概要滞在",
};

/** 解析画面など集計から外す固定ID */
const EXCLUDED_PAGE_IDS = ["login", "analytics", "community", "postList"];

/** 表示可ページ：除外IDではなく、かつ PAGE_LABELS に載っているものだけ */
const showPage = (id: string) =>
  !EXCLUDED_PAGE_IDS.includes(id) && Boolean(PAGE_LABELS[id]);

/** 表示可イベント：EVENT_LABELS に載っているものだけ */
const showEvent = (id: string) => Boolean(EVENT_LABELS[id]);

/* ───────── 補助 ───────── */
function getHourlyChartData(counts: number[]) {
  return {
    labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    datasets: [
      {
        label: "アクセス数",
        data: counts,
        backgroundColor: "rgba(255, 159, 64, 0.6)",
      },
    ],
  };
}

/** ymd("YYYY-MM-DD") -> ローカル(JST)の 0:00 Date */
function ymdToLocalMidnight(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export default function AnalyticsPage() {
  const [pageData, setPageData] = useState<{ id: string; count: number }[]>([]);
  const [eventData, setEventData] = useState<
    { id: string; total: number; count: number; average: number }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(TODAY);
  const [advice, setAdvice] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [hourlyData, setHourlyData] = useState<any | null>(null);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [hourlyRawCounts, setHourlyRawCounts] = useState<number[]>([]);
  const [dailyData, setDailyData] = useState<any | null>(null);
  const [referrerData, setReferrerData] = useState({
    sns: 0,
    search: 0,
    direct: 0,
  });
  const [weekdayData, setWeekdayData] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [visitorStats, setVisitorStats] = useState<{
    new: number;
    returning: number;
  } | null>(null);
  const [bounceRates, setBounceRates] = useState<
    { page: string; rate: number }[]
  >([]);
  const [geoData, setGeoData] = useState<{ region: string; count: number }[]>(
    []
  );

  // 期間が変わるたびAI提案をリセット
  useEffect(() => {
    setAdvice("");
  }, [startDate, endDate]);

  /* ───────── 期間指定で一括取得 ───────── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setHourlyLoading(true);

    // 入力の範囲を安全に補正
    const startLocal = ymdToLocalMidnight(startDate);
    const endLocal = ymdToLocalMidnight(endDate);
    const start = endLocal < startLocal ? endLocal : startLocal;
    const end = endLocal < startLocal ? startLocal : endLocal;

    try {
      const [
        pagesTotals,
        eventsTotals,
        refTotals,
        visitors,
        bouncePerPage,
        geoTotals,
        hourlyCounts,
        dailyRows,
        weekdayCounts,
      ] = await Promise.all([
        fetchPagesByPeriod(SITE_KEY, start, end),
        fetchEventsByPeriod(SITE_KEY, start, end),
        fetchReferrersByPeriod(SITE_KEY, start, end), // { byHost, buckets }
        fetchVisitorsByPeriod(SITE_KEY, start, end),
        fetchBounceByPeriod(SITE_KEY, start, end), // { pageId: { bounces, views, rate } }
        fetchGeoByPeriod(SITE_KEY, start, end),
        fetchHourlyByPeriod(SITE_KEY, start, end), // number[24]
        fetchDailyByPeriod(SITE_KEY, start, end), // [{ id:'YYYY-MM-DD', count, day }]
        fetchWeekdayByPeriod(SITE_KEY, start, end), // number[7]
      ]);

      // ページ別アクセス（期間合算）— ラベルのあるものだけ表示
      const pageArr = Object.entries(pagesTotals)
        .map(([id, count]) => ({ id, count }))
        .filter((r) => showPage(r.id))
        .sort((a, b) => b.count - a.count);
      setPageData(pageArr);

      // イベント（滞在時間）— ラベルのあるものだけ表示
      const evtArr = Object.entries(eventsTotals)
        .map(([id, v]) => {
          const total = v.totalSeconds ?? 0;
          const cnt = v.count ?? 0;
          const average = cnt ? Math.round(total / cnt) : 0;
          return { id, total, count: cnt, average };
        })
        .filter((row) => showEvent(row.id))
        .sort((a, b) => b.total - a.total);
      setEventData(evtArr);

      // リファラー：SNS/検索/直接
      setReferrerData(refTotals.buckets);

      // 新規/リピーター
      setVisitorStats(visitors);

      // 直帰率 — ページ側もラベルがあるものだけ
      const bounceArr = Object.entries(bouncePerPage)
        .map(([page, v]) => ({ page, rate: v.rate }))
        .filter((r) => showPage(r.page));
      setBounceRates(bounceArr);

      // 地域
      const geoArr = Object.entries(geoTotals).map(([region, count]) => ({
        region,
        count,
      }));
      setGeoData(geoArr);

      // 時間帯
      setHourlyRawCounts(hourlyCounts);
      setHourlyData(getHourlyChartData(hourlyCounts));

      // 日別アクセス（ライン）
      const labels = dailyRows.map((r) => r.id);
      const counts = dailyRows.map((r) => r.count);
      setDailyData({
        labels,
        datasets: [
          {
            label: "日別アクセス数",
            data: counts,
            fill: false,
            borderColor: "rgba(75,192,192,1)",
            tension: 0.3,
          },
        ],
      });

      // 曜日別
      setWeekdayData({
        labels: ["日", "月", "火", "水", "木", "金", "土"],
        datasets: [
          {
            label: "曜日別アクセス数",
            data: weekdayCounts,
            backgroundColor: "rgba(139, 92, 246, 0.6)",
          },
        ],
      });
    } catch (e) {
      console.error("期間データ取得エラー:", e);
    } finally {
      setHourlyLoading(false);
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* ───────── AI 提案ボタン ───────── */
  const handleAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: startDate && endDate ? `${startDate}〜${endDate}` : "全期間",
          pageData,
          eventData,
          hourlyData: hourlyRawCounts,
          dailyData,
          referrerData,
          weekdayData,
          visitorStats,
          bounceRates,
          geoData,
        }),
      });
      const data = await res.json();
      setAdvice(data.advice);
    } catch (err) {
      console.error("分析エラー:", err);
      setAdvice("AIによる提案の取得に失敗しました。");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h2 className="text-xl font-bold text-white text-outline">
        アクセス解析
      </h2>

      {/* 期間プリセット */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: "過去 1 週間", days: 7 },
          { label: "過去 1 か月", days: 30 },
          { label: "過去 3 か月", days: 90 },
        ].map((p) => {
          const isActive = startDate === calcStart(p.days) && endDate === TODAY;
          return (
            <Button
              key={p.days}
              onClick={() => {
                setStartDate(calcStart(p.days));
                setEndDate(TODAY);
                setAdvice("");
              }}
              variant={isActive ? "default" : "secondary"}
              className={`text-xs ${isActive ? "pointer-events-none" : ""}`}
            >
              {p.label}
            </Button>
          );
        })}

        <Button
          asChild
          className="fixed top-15 right-5 z-50 w-10 h-10 rounded-full bg-blue-600 text-white text-2xl leading-none flex items-center justify-center shadow-lg hover:bg-blue-700 active:scale-95"
        >
          <Link href="/analytics-guide" className="text-md">
            ?
          </Link>
        </Button>
      </div>

      {/* AI改善提案 */}
      <div className="flex gap-3">
        {!advice && (
          <button
            onClick={handleAnalysis}
            disabled={analyzing}
            className={`px-3 py-1 rounded text-sm text-white w-52 ${
              analyzing ? "bg-purple-300 cursor-not-allowed" : "bg-purple-600"
            }`}
          >
            {analyzing ? "分析中..." : "AI による改善提案"}
          </button>
        )}

        {advice && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>AIの改善提案を見る</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>AIによる改善提案</DialogTitle>
                <DialogDescription>
                  この期間のアクセスデータをもとに、ホームページの改善案を表示しています。
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2 text-sm whitespace-pre-wrap leading-relaxed">
                {advice}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <CardSpinner />
      ) : (
        <>
          {/* ページ別アクセス数 */}
          <div className="bg-white/50 rounded p-4 shadow mt-6">
            <h3 className="font-semibold text-lg mb-4">ページ別アクセス数</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="w-full h-64">
                <Bar
                  data={{
                    labels: pageData.map((d) => PAGE_LABELS[d.id] || d.id),
                    datasets: [
                      {
                        label: "アクセス数",
                        data: pageData.map((d) => d.count),
                        backgroundColor: "rgba(59, 130, 246, 0.6)",
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: { tooltip: { enabled: true } },
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: { display: true, text: "件数" },
                      },
                    },
                  }}
                />
              </div>
              <div className="overflow-auto">
                <table className="w-full bg-gray-100/50 border text-sm table-fixed">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="p-2 border">ページ名</th>
                      <th className="p-2 border text-right">アクセス数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((row) => (
                      <tr key={row.id}>
                        <td className="p-2 border">
                          {PAGE_LABELS[row.id] || row.id}
                        </td>
                        <td className="p-2 border text-right">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ページ別平均滞在時間 */}
          <div className="bg-white/50 rounded p-4 shadow mt-6">
            <h3 className="font-semibold text-lg mb-4">ページ別平均滞在時間</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="w-full h-64">
                <Bar
                  data={{
                    labels: eventData.map((d) => EVENT_LABELS[d.id] || d.id),
                    datasets: [
                      {
                        label: "平均滞在秒数",
                        data: eventData.map((d) => d.average),
                        backgroundColor: "rgba(16, 185, 129, 0.6)",
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: { tooltip: { enabled: true } },
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: { display: true, text: "秒" },
                      },
                    },
                  }}
                />
              </div>
              <div className="overflow-auto">
                <table className="w-full bg-gray-100/50 border text-sm table-fixed">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="p-2 border w-2/5">イベント名</th>
                      <th className="p-2 border text-right text-xs w-1/5">
                        合計秒数
                      </th>
                      <th className="p-2 border text-right text-xs w-1/5">
                        回数
                      </th>
                      <th className="p-2 border text-right text-xs w-1/5">
                        平均秒数
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventData.map((row) => (
                      <tr key={row.id}>
                        <td className="p-2 border">
                          {EVENT_LABELS[row.id] || row.id}
                        </td>
                        <td className="p-2 border text-right">{row.total}</td>
                        <td className="p-2 border text-right">{row.count}</td>
                        <td className="p-2 border text-right">{row.average}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 時間帯別アクセス */}
          {hourlyLoading ? (
            <CardSpinner />
          ) : hourlyData ? (
            <div className="bg-white/50 rounded p-4 shadow mt-6">
              <h3 className="font-semibold text-sm mb-2">時間帯別アクセス数</h3>
              <Bar
                data={hourlyData}
                options={{
                  responsive: true,
                  plugins: { tooltip: { enabled: true } },
                  scales: {
                    y: {
                      beginAtZero: true,
                      title: { display: true, text: "アクセス数" },
                    },
                  },
                }}
              />
            </div>
          ) : null}

          {/* 曜日別アクセス */}
          {weekdayData && (
            <div className="bg-white/50 rounded p-4 shadow mt-6">
              <h3 className="font-semibold text-sm mb-2">曜日別アクセス数</h3>
              <Bar
                data={weekdayData}
                options={{
                  responsive: true,
                  plugins: { tooltip: { enabled: true } },
                  scales: {
                    y: {
                      beginAtZero: true,
                      title: { display: true, text: "アクセス数" },
                    },
                  },
                }}
              />
            </div>
          )}

          {/* 日別アクセス（ライン） */}
          {dailyData && (
            <div className="mt-8 bg-white/50">
              <DailyAccessChart data={dailyData} />
            </div>
          )}

          {/* リファラー（SNS/検索/直接） */}
          {referrerData && (
            <div className="p-6">
              <h2 className="text-lg font-bold mb-4">アクセス分析</h2>
              <ReferrerChart data={referrerData} />
            </div>
          )}
        </>
      )}

      {/* 新規 vs. リピーター */}
      {visitorStats && (
        <div className="bg-white/50 rounded p-4 shadow mt-6">
          <h3 className="font-semibold text-sm mb-2">新規 vs. リピーター</h3>
          <Bar
            data={{
              labels: ["新規", "リピーター"],
              datasets: [
                {
                  label: "訪問者数",
                  data: [visitorStats.new, visitorStats.returning],
                  backgroundColor: [
                    "rgba(96, 165, 250, 0.6)",
                    "rgba(34, 197, 94, 0.6)",
                  ],
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: { tooltip: { enabled: true } },
            }}
          />
        </div>
      )}

      {/* 直帰率（%） */}
      {bounceRates.length > 0 && (
        <div className="bg-white/50 rounded p-4 shadow mt-6">
          <h3 className="font-semibold text-sm mb-2">直帰率（%）</h3>
          <Bar
            data={{
              labels: bounceRates.map((d) => PAGE_LABELS[d.page] || d.page),
              datasets: [
                {
                  label: "直帰率 (%)",
                  data: bounceRates.map((d) => Number(d.rate.toFixed(1))),
                  backgroundColor: "rgba(239, 68, 68, 0.6)",
                },
              ],
            }}
            options={{
              responsive: true,
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  title: { display: true, text: "直帰率 (%)" },
                },
              },
              plugins: {
                tooltip: {
                  callbacks: { label: (ctx) => `${ctx.parsed.y}%` },
                },
              },
            }}
          />
        </div>
      )}

      {/* 地域別アクセス */}
      {geoData.length > 0 && (
        <div className="bg-white/50 rounded p-4 shadow mt-6">
          <h3 className="font-semibold text-sm mb-2">地域別アクセス分布</h3>
          <Bar
            data={{
              labels: geoData.map((d) => d.region),
              datasets: [
                {
                  label: "アクセス数",
                  data: geoData.map((d) => d.count),
                  backgroundColor: "rgba(37, 99, 235, 0.6)",
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: { tooltip: { enabled: true } },
              scales: {
                y: {
                  beginAtZero: true,
                  title: { display: true, text: "アクセス数" },
                },
              },
            }}
          />
        </div>
      )}
    </div>
  );
}
