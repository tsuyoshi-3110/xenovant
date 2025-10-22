// app/api/partner-recommend/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CandidateIn = {
  id: string;
  siteName: string;
  industry: string;
  distanceKm?: number | null;
};
type ReqBody = { myIndustry: string; candidates: CandidateIn[] };

export async function POST(req: Request) {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as ReqBody;
    const { myIndustry, candidates } = body || {};
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return NextResponse.json(
        { error: "candidates required" },
        { status: 400 }
      );
    }

    const TOP = 40;
    const sliced = [...candidates]
      .sort((a, b) => (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9))
      .slice(0, TOP);

    const system =
      "あなたはローカルビジネスの協業プランナーです。与えられた自店舗の業種と候補店舗一覧（業種・距離km）から、協業相性が最も高い店舗を1つだけ選び、その理由と3〜6個のコラボ施策案を出してください。距離は近いほど高評価（0〜3kmを重視、10km超で減点）。業種は補完関係/同ジャンルの相乗効果を重視。出力はJSONのみ。";

    const payload = {
      myIndustry: myIndustry || "未設定",
      candidates: sliced.map((c) => ({
        id: c.id,
        siteName: c.siteName,
        industry: c.industry || "未設定",
        distanceKm: c.distanceKm ?? null,
      })),
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        // JSONを強制（対応モデル）
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content:
              "次のJSONを読み、最適な1店舗を選び、理由と施策案を含むJSONのみを出力してください。" +
              '出力フォーマット: {"selectedId":"...","score":0.0~1.0,"reason":"...","ideas":["...","..."]}',
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });

    if (!r.ok) {
      const bodyText = await r.text();
      return NextResponse.json(
        {
          error: "openai error",
          status: r.status,
          body: bodyText.slice(0, 1200),
        },
        { status: 502 }
      );
    }

    // ← ここが最大の違い：まずOpenAIラッパJSONを読む
    const raw = await r.json();
    const content: unknown = raw?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      return NextResponse.json(
        { error: "no content from openai" },
        { status: 502 }
      );
    }

    // まれに ```json ... ``` が付くモデルもあるので剥がす
    const stripped = content.replace(/```json|```/g, "").trim();

    let ai: any;
    try {
      ai = JSON.parse(stripped);
    } catch {
      // 念のため再トライ（全体がJSONで入ってくることは基本ないが保険）
      return NextResponse.json(
        { error: "bad ai json", contentPreview: stripped.slice(0, 500) },
        { status: 502 }
      );
    }

    if (!ai?.selectedId || !Array.isArray(ai?.ideas)) {
      return NextResponse.json(
        { error: "bad ai fields", aiPreview: JSON.stringify(ai).slice(0, 500) },
        { status: 502 }
      );
    }

    return NextResponse.json({
      selectedId: String(ai.selectedId),
      score: typeof ai.score === "number" ? ai.score : null,
      reason: String(ai.reason ?? ""),
      ideas: ai.ideas.map((s: any) => String(s)).slice(3, 9).length
        ? ai.ideas.map((s: any) => String(s)).slice(0, 8)
        : ai.ideas, // 最大8件に整形
    });
  } catch (e: any) {
    console.error("[/api/partner-recommend] error", e);
    return NextResponse.json(
      { error: "partner-recommend failed", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
