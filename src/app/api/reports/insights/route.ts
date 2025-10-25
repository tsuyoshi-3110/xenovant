// src/app/api/owner/reports/insights/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ====== Types ======
type DayPoint = { date: string; value: number };
type Pair = [string, number];

type InsightInput = {
  siteKey: string;
  range: { from: string; to: string }; // YYYY-MM-DD (JST)
  kpis: { revenue: number; count: number; aov: number };
  days: DayPoint[]; // JST 日単位
  topByQty: Pair[]; // [name, qty]
  topByRev: Pair[]; // [name, revenue]
  currency?: string; // "jpy" など
};

type InsightHeuristic = {
  origin: "heuristic";
  summary: string;
  tips: string[];
  actions: string[];
};

type InsightAIOrigin = "openai" | "fallback";
type InsightAI = {
  origin: InsightAIOrigin;
  raw: string;
};

// ====== Utils ======
function pct(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return (a - b) / b;
}
function sum(arr: number[]) { return arr.reduce((x, y) => x + y, 0); }
function takeLast<T>(arr: T[], n: number): T[] {
  return n <= 0 ? [] : arr.slice(Math.max(0, arr.length - n));
}
function humanJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(n);
}

// —— “開発者向け”ワードの除去用（必要なら適宜追加）——
const FORBIDDEN: RegExp[] = [
  /\bAPI\b/i, /\bSDK\b/i, /\bCLI\b/i, /\bSQL\b/i, /Webhook/i,
  /\bGTM\b/i, /Google Tag Manager/i, /\bGA4?\b/i, /ピクセル/i,
  /(計測)?タグ.*(埋め込|挿入)/i, /デプロイ/i, /ビルド/i, /リポジトリ/i,
  /スキーマ/i, /環境変数/i, /webpack/i, /Next\.js/i,
  /npm\s+install/i, /yarn\s+add/i, /コード/i, /ソースコード/i,
];

// コードブロックや禁止ワードを含む行を除去
function sanitizeOwnerText(text: string) {
  if (!text) return text;
  let t = text.replace(/```[\s\S]*?```/g, "");
  const lines = t.split(/\r?\n/).filter((line) => !FORBIDDEN.some((rx) => rx.test(line)));
  t = lines.join("\n").trim();
  return t;
}

// 直近7日/その前7日などの軽い分析
function analyzeLocally(input: InsightInput) {
  const values = input.days.map((d) => d.value);
  const last7 = takeLast(values, 7);
  const prev7 = takeLast(values.slice(0, Math.max(0, values.length - 7)), 7);
  const wow = pct(sum(last7), sum(prev7));

  const best = input.days.reduce((acc, d) => (d.value > acc.value ? d : acc), { date: "-", value: -1 });
  const worst = input.days.reduce((acc, d) => (acc.value < 0 || d.value < acc.value ? d : acc), { date: "-", value: -1 });

  const total = sum(values);
  const topRev = input.topByRev[0];
  const topShare = topRev ? topRev[1] / (total || 1) : 0;
  const lowDays = input.days.filter((d) => d.value === 0).length;

  return { wow, best, worst, topRev, topShare, lowDays };
}

// AIが空/禁止語だらけだった時用の“オーナー向け”安全フォールバック
function fallbackOwnerText(input: InsightInput) {
  const a = analyzeLocally(input);
  const tips: string[] = [];

  if (a.wow < -0.05) {
    tips.push([
      "・やること：今週は「昼11時」と「夕方17:30」に各1回、写真付きでおすすめ1品を投稿",
      "　ひとこと例：『本日◯◯、数量限定です。＋100円で大盛りできます』",
      "　目安時間：各5分",
    ].join("\n"));
  } else {
    tips.push([
      "・やること：一番売れている商品の写真を1枚“明るく撮り直し”",
      "　ひとこと例：『一番人気の◯◯、本日もできたてです』",
      "　目安時間：10分",
    ].join("\n"));
  }

  if (a.topRev) {
    const [name] = a.topRev;
    tips.push([
      `・やること：『${name}』と相性の良い商品を“セットで小さく割引”（例：2点で5%オフ）`,
      "　ひとこと例：『一緒に◯◯を付けると少しオトクです』",
      "　目安時間：5分（POP/投稿の文言作成）",
    ].join("\n"));
  }

  if (a.worst.value >= 0 && a.worst.date !== "-") {
    tips.push([
      `・やること：弱い日（${a.worst.date}）は“当日限定の小特典”を案内`,
      "　ひとこと例：『本日限定で◯◯増量中です』",
      "　目安時間：5分（店頭POPとSNS告知）",
    ].join("\n"));
  }

  if (a.lowDays >= 3) {
    tips.push([
      "・やること：営業時間・注文方法を1枚の固定投稿にまとめて上に固定",
      "　ひとこと例：『営業時間とご注文方法はこちらをご覧ください』",
      "　目安時間：10分",
    ].join("\n"));
  }

  return tips.join("\n\n");
}

function buildHeuristicInsights(input: InsightInput): InsightHeuristic {
  const { kpis, range } = input;
  const a = analyzeLocally(input);
  const tips: string[] = [];

  // 1) 直近の勢い
  if (a.wow > 0.05) {
    tips.push("最近1週間はその前週より売上が増えています。勢いのある商品の写真や投稿をもう一度使いましょう。");
  } else if (a.wow < -0.05) {
    tips.push("最近1週間はその前週より売上が落ちています。告知の時間帯を昼・夕方に固定して、小さな割引やセット販売を試しましょう。");
  } else {
    tips.push("ここ1〜2週間は横ばいです。人気商品の写真を明るく撮り直し、平日限定の小特典で動きを作りましょう。");
  }

  // 2) ピーク/ボトム日の示唆
  if (a.best.value >= 0 && a.best.date !== "-") {
    tips.push(`一番売れた日は ${a.best.date}。その日の告知内容や導線を振り返り、同じパターン（時間帯・言い方）を再現しましょう。`);
  }
  if (a.worst.value >= 0 && a.worst.date !== "-" && a.best.date !== a.worst.date) {
    tips.push(`弱い日は ${a.worst.date}。『当日限定の一言』や『時間限定のおまけ』を提案すると反応が出やすいです。`);
  }

  // 3) トップ商品の偏り
  if (a.topRev) {
    const [name] = a.topRev;
    if (a.topShare >= 0.5) {
      tips.push(`売上が「${name}」に偏っています。在庫切れ防止と、相性の良い商品の“セット提案”で客単価を上げましょう。`);
    } else {
      tips.push(`「${name}」が一番売れています。商品名の最初に魅力ワードを入れると選ばれやすくなります（例：「濃厚」「数量限定」）。`);
    }
  }

  // 4) 0円日の対処
  if (a.lowDays >= 3) {
    tips.push("売上0の日が目立ちます。営業時間・注文方法・アクセスを1枚の固定投稿にまとめて上部に固定しましょう。");
  }

  // 5) AOV
  if (kpis.aov < 1500) {
    tips.push("平均客単価はやや低め。『＋200円でサイズアップ』『2点で5%オフ』など、その場で言える一言を追加しましょう。");
  }

  const summary = `期間 ${range.from}〜${range.to} の売上は ${humanJPY(kpis.revenue)}、注文件数は ${kpis.count.toLocaleString("ja-JP")} 件、平均客単価は ${humanJPY(kpis.aov)} でした。`;
  const actions = [
    "① 今週：弱い曜日に“当日限定の小特典”を実施",
    "② 来週：一番人気の写真を明るく撮り直し、商品名の最初に魅力ワードを追加",
    "③ 再来週：相性の良い2品セットを小さく割引してテスト",
  ];

  return { origin: "heuristic", summary, tips, actions };
}

async function buildAIGeneratedInsights(input: InsightInput): Promise<InsightAI | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  // —— “オーナー限定”プロンプト ——
  const sys =
    [
      "あなたは中小店舗オーナー向けのアドバイザーです。",
      "専門用語・開発作業・システム設定の提案は一切禁止です（例：コード、API、SDK、SQL、Webhook、GTM/GA、ピクセル/タグ埋め込み、デプロイ/ビルド、リポジトリ、環境変数等）。",
      "店頭・SNS・LINEで今日からできることだけを提案してください。",
      "各提案は「やること」「お客様への一言（例）」「目安時間（5〜15分など）」を含め、3〜5個にしてください。",
      "出力は日本語。箇条書きのみ。前置き不要。",
    ].join(" ");

  const user =
    "以下は売上レポートの要約データです。オーナーが今日から実行できる販促提案をください。数値はJPY。\n" +
    "JSON:" + JSON.stringify(input);

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    temperature: 0.7,
  });

  let text = res.choices?.[0]?.message?.content?.trim() || "";
  text = sanitizeOwnerText(text);
  if (!text) return null;

  const ai: InsightAI = { origin: "openai", raw: text };
  return ai;
}

export async function POST(req: NextRequest) {
  try {
    const input = (await req.json()) as InsightInput;

    // バリデーション
    if (!input || !input.range?.from || !input.range?.to || !Array.isArray(input.days)) {
      return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
    }

    const heuristic = buildHeuristicInsights(input);

    // AI（サニタイズ込み）
    let ai: InsightAI | null = await buildAIGeneratedInsights(input);

    // AIが空 or 内容が薄い場合は“安全フォールバック”
    if (!ai || !ai.raw || ai.raw.length < 20) {
      ai = { origin: "fallback", raw: fallbackOwnerText(input) };
    }

    return NextResponse.json({ ok: true, ai, heuristic });
  } catch (e: any) {
    console.error("/insights error", e);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
