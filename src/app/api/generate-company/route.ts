// src/app/api/ai/generate-company/route.ts
import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export async function GET() {
  // 疎通確認用: /api/ai/generate-company
  return NextResponse.json({ ok: true, route: "ai/generate-company" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const target = body?.target as "about" | "business" | undefined;
    const keywords: string[] = Array.isArray(body?.keywords)
      ? body.keywords.map((v: any) => String(v).trim()).filter(Boolean).slice(0, 3)
      : [];

    if (target !== "about" && target !== "business") {
      return NextResponse.json({ error: "target must be 'about' or 'business'." }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const context = {
      companyName: (body?.companyName ?? "").toString(),
      tagline: (body?.tagline ?? "").toString(),
      location: (body?.location ?? "").toString(),
      audience: (body?.audience ?? "").toString(),
      industryHint: (body?.industryHint ?? "").toString(),
      existingAbout: (body?.existingAbout ?? "").toString(),
      existingBusiness: Array.isArray(body?.existingBusiness) ? body.existingBusiness : [],
    };

    const system = [
      "あなたは日本語で書く企業ライティングアシスタントです。",
      "出力は JSON オブジェクトのみ。余計な文字は一切含めないでください。",
      target === "about" ? `出力形式: {"about": string}` : `出力形式: {"business": string[]}`,
    ].join("\n");

    const userPrompt =
      target === "about"
        ? [
            "会社説明（about）を 180〜350 文字で作成してください。",
            "誇大表現は避け、汎用テンプレではなく具体的な価値が伝わる文章にしてください。",
            `キーワード: ${keywords.join(" / ") || "（未指定）"}`,
            context.companyName && `会社名: ${context.companyName}`,
            context.tagline && `タグライン: ${context.tagline}`,
            context.location && `所在地: ${context.location}`,
            context.audience && `対象顧客: ${context.audience}`,
            context.industryHint && `業種ヒント: ${context.industryHint}`,
            context.existingAbout && `既存の説明（参考）: ${context.existingAbout}`,
          ].filter(Boolean).join("\n")
        : [
            "事業内容（business）の箇条書きを 3〜6 項目で作成してください。",
            "各項目は 20〜30 文字程度で簡潔に。重複や一般論を避けてください。",
            `キーワード: ${keywords.join(" / ") || "（未指定）"}`,
            context.companyName && `会社名: ${context.companyName}`,
            context.location && `所在地: ${context.location}`,
            Array.isArray(context.existingBusiness) && context.existingBusiness.length > 0
              ? `既存の事業内容（参考）: ${context.existingBusiness.join(" | ")}`
              : "",
          ].filter(Boolean).join("\n");

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.85,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const json = JSON.parse(raw);

    // フォールバック文は作らず、AIの生成結果のみ返す
    if (target === "about") {
      if (typeof json.about !== "string" || !json.about.trim()) {
        return NextResponse.json({ error: "Invalid about" }, { status: 400 });
      }
      return NextResponse.json({ about: json.about.trim() });
    } else {
      const arr = Array.isArray(json.business) ? json.business.map((s: any) => String(s).trim()).filter(Boolean) : [];
      if (arr.length === 0) {
        return NextResponse.json({ error: "Invalid business" }, { status: 400 });
      }
      return NextResponse.json({ business: arr.slice(0, 8) });
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: "Generation failed", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
