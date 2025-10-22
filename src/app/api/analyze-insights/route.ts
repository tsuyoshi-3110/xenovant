import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";

// ページとイベントのラベル
const PAGE_PATH_LABELS: Record<string, string> = {
  home: "ホームページ",
  about: "当店の思い",
  products: "商品一覧ページ",
  stores: "店舗一覧ページ",
  "uber-eats": "デリバリーページ",
  news: "お知らせページ",
  email: "メールアクセス",
  map_click: "Googleマップ",
};

const EVENT_LABELS: Record<string, string> = {
  home_stay_seconds_home: "ホームページ",
  home_stay_seconds_about: "当店の思い",
  home_stay_seconds_products: "商品一覧ページ",
  home_stay_seconds_stores: "店舗一覧ページ",
  home_stay_seconds_news: "お知らせページ",
  home_stay_seconds_email: "メールアクセス",
  home_stay_seconds_map_click: "Googleマップ",
};

const IGNORED_PAGE_IDS = ["postList", "community", "login", "analytics"];
const IGNORED_EVENT_IDS = [
  "home_stay_seconds_postList",
  "home_stay_seconds_community",
  "home_stay_seconds_login",
  "home_stay_seconds_analytics",
];

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const {
      period,
      pageData,
      eventData,
      hourlyData,
      dailyData,
      referrerData,
      weekdayData,
      visitorStats,
      bounceRates,
      geoData,
    } = await req.json();

    // ─── 新規／リピーターサマリー ───
    const visitorSummary = visitorStats
      ? `・新規：${visitorStats.new}人\n・リピーター：${visitorStats.returning}人`
      : "データがありません";

    // ─── 直帰率サマリー ───
    const bounceSummary =
      Array.isArray(bounceRates) && bounceRates.length > 0
        ? bounceRates
            .map(
              (b) =>
                `・${PAGE_PATH_LABELS[b.page] || b.page}：${b.rate.toFixed(1)}%`
            )
            .join("\n")
        : "データがありません";

    // ─── 地域別アクセスサマリー ───
    const geoSummary =
      Array.isArray(geoData) && geoData.length > 0
        ? geoData.map((g) => `・${g.region}：${g.count}回`).join("\n")
        : "データがありません";

    /* ------------ 既存の曜日・時間・日別・ページ・イベント・参照元サマリー作成コード … ------------ */

    /* ------------ ② 曜日別サマリーを作成 ------------ */
    const weekdayLabelsJP = ["日", "月", "火", "水", "木", "金", "土"];

    // weekdayData は 0(日)～6(土) のカウント配列 or オブジェクトを想定
    const counts =
      Array.isArray(weekdayData) && weekdayData.length === 7
        ? weekdayData
        : typeof weekdayData === "object"
        ? weekdayLabelsJP.map((_, idx) => Number(weekdayData[idx] ?? 0))
        : Array(7).fill(0);

    const weekdaySummaries = counts
      .map((cnt, idx) => `・${weekdayLabelsJP[idx]}：${cnt}回`)
      .join("\n");

    const hourlySummaries = (hourlyData || [])
      .sort((a: { hour: number }, b: { hour: number }) => a.hour - b.hour)
      .map(
        (h: { hour: number; count: number }) => `・${h.hour}時台：${h.count}回`
      )
      .join("\n");

    const dailyEntries =
      dailyData && typeof dailyData === "object" && !Array.isArray(dailyData)
        ? Object.entries(dailyData).map(([id, count]) => ({
            id,
            count: typeof count === "number" ? count : 0,
          }))
        : [];

    const dailySummaries = dailyEntries
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((d) => `・${d.id}：${d.count}回`)
      .join("\n");

    const filteredPages = pageData.filter(
      (p: { id: string; count: number }) =>
        !IGNORED_PAGE_IDS.includes(p.id) && PAGE_PATH_LABELS[p.id]
    );

    const filteredEvents = eventData.filter(
      (e: { id: string; value: number }) =>
        !IGNORED_EVENT_IDS.includes(e.id) && EVENT_LABELS[e.id]
    );

    const totalPageCount = filteredPages.reduce(
      (sum: number, p: { count: number }) => sum + p.count,
      0
    );
    const totalEventCount = filteredEvents.length;

    const referrer = referrerData ?? { sns: 0, search: 0, direct: 0 };

    // 合計がゼロなら空扱い
    const totalReferrerCount = referrer.sns + referrer.search + referrer.direct;

    const referrerSummaries =
      totalReferrerCount > 0
        ? [
            `・SNS：${referrer.sns}回`,
            `・検索：${referrer.search}回`,
            `・直接アクセス：${referrer.direct}回`,
          ].join("\n")
        : "データがありません";

    if (totalPageCount < 5 && totalEventCount < 3) {
      return NextResponse.json({
        advice:
          "まだデータが少ないため、現時点での分析は難しいです。もうしばらくしてからお試しください。",
      });
    }

    const pageSummaries = filteredPages
      .map(
        (p: { id: string; count: number }) =>
          `・${PAGE_PATH_LABELS[p.id]}：${p.count}回`
      )
      .join("\n");

    const eventSummaries = filteredEvents
      .map((e: { id: string; value: number }) => {
        const minutes = Math.floor(e.value / 60);
        const seconds = e.value % 60;
        return `・${EVENT_LABELS[e.id]}：${minutes}分${seconds}秒 滞在（合計）`;
      })
      .join("\n");

    const prompt = `
以下はホームページの分析データです（期間：${period}）。

【新規 vs リピーター】
${visitorSummary}

【直帰率】
${bounceSummary}

【地域別アクセス分布】
${geoSummary}

【アクセス元の割合】
${referrerSummaries}

【曜日別アクセス数】
${weekdaySummaries || "データがありません"}

【ページ別アクセス数】
${pageSummaries || "データがありません"}

【ページ別滞在時間】
${eventSummaries || "データがありません"}

【時間帯別アクセス数】
${hourlySummaries || "データがありません"}

【日別アクセス数の推移】
${dailySummaries || "データがありません"}

あなたは「小規模店舗向け CMS『ページット』」に組み込まれた
AI アシスタントです。オーナーが出来る操作は次の 4 つだけ。

1. 画像／動画の差し替え   （ファイルをアップロードして入れ替える）
2. 見出しテキストの変更   （h1～h3 程度の短い文字列）
3. 本文テキストの変更     （段落を編集・並べ替え・削除）
4. セクションの表示 / 非表示 切替

**これ以外の操作（コード編集・レイアウト変更・新機能追加等）は
絶対に提案しないこと。**

回答は下記フォーマットで、日本語・やさしい口調で 3 件だけ出す。

【必ず守るルール】
- HTMLやCSS、プログラミングの話は禁止です。
- 専門用語（例：SEO、インデックス、メタタグなど）も禁止です。
- 「コードを修正する」「システムを変更する」などの指示は絶対にしないでください。
- 「新しい機能を追加する」「デザインの構造を変える」といったことも禁止です。
- 「◯◯ページに○○を追加する」などの提案も、オーナー自身が管理画面からできない内容は避けてください。
- 「写真を変える」「文章の順番を変える」など、**ページットの管理画面上で完結できる作業**だけに限定してください。
- アクセス数や滞在時間などのデータが明らかに少ない場合は、「まだデータが少ないため、現時点で分析は難しい」と**正直に伝えてください**。
- 無理に提案をひねり出さないでください。
- 文章はやさしく、誰でも「自分でもできそう！」と思えるように書いてください。
- 技術的・専門的な表現は一切使わないでください。
- ホームページは動画と画像を設定できるようになってますが、基本は動画で映えさせるようにアドバイスしてあげて下さい。
- ホームページは文字を書けない仕様になってます。
- 滞在時間が平均5以下のページは改善が必要なので、進んで提案してあげて下さい。
- 文字はカード内にしか書けない仕様です。見出しや、トップに書くことはできません。
- お知らせページは文字のみのカード構成です。
- 動画を設定できるのは、ホームページと、商品ページのみです。


では、改善提案を3つ出してください。
`;

    const chat = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    const advice =
      chat.choices[0].message.content?.trim() ?? "提案が見つかりませんでした。";

    return NextResponse.json({ advice });
  } catch (error) {
    console.error("分析APIエラー:", error);
    return NextResponse.json(
      { advice: "エラーが発生しました。" },
      { status: 500 }
    );
  }
}
