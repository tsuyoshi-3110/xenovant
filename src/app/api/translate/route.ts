import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `
You are a professional translator.
- Return concise, natural translations for marketing/product descriptions.
- Preserve meaning and tone; avoid adding new content.
- Output plain text only (no quotes, no markdown).
- If an input field is empty, return an empty string for that field.
- Preserve line breaks.
`;

type Target =
  | "ja" // ★ 追加
  | "en"
  | "zh"
  | "zh-TW"
  | "ko"
  | "fr"
  | "es"
  | "de"
  | "pt"
  | "it"
  | "ru"
  | "th"
  | "vi"
  | "id"
  | "hi"
  | "ar";

type Req = {
  title?: string; // optional
  body?: string; // optional
  target: Target; // required
};

const TARGET_LABELS: Record<Target, string> = {
  ja: "Japanese", // ★ 追加
  en: "English",
  zh: "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  ko: "Korean",
  fr: "French",
  es: "Spanish",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  ru: "Russian",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  hi: "Hindi",
  ar: "Arabic",
};

export async function POST(req: NextRequest) {
  try {
    const json = (await req.json()) as Req;
    const title = (json.title ?? "").toString();
    const body = (json.body ?? "").toString();
    const target = json.target;

    // target は必須、title/body はどちらか必須
    if (!target || (!title && !body)) {
      return NextResponse.json(
        {
          error:
            "Bad Request: require `target` and at least one of `title` or `body`",
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not set" },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey });
    const targetName = TARGET_LABELS[target] ?? target;

    // 1 リクエストで JSON を返させる（title/body 両方まとめて）
    const userPrompt = `
Translate the following JSON object into ${targetName}.
Return a strict JSON object with keys "title" and "body" only.
If an input field is empty, return an empty string for that key.
Preserve line breaks.

Input:
${JSON.stringify({ title, body })}
    `.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-5-chat-latest",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    const outTitle =
      typeof parsed.title === "string" ? parsed.title.trim() : "";
    const outBody = typeof parsed.body === "string" ? parsed.body.trim() : "";

    return NextResponse.json({ title: outTitle, body: outBody });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: `Translation failed: ${e?.message ?? "unknown"}` },
      { status: 500 }
    );
  }
}
