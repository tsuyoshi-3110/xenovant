// app/api/generate-news/route.ts
import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  const { title, keywords } = await req.json();
  const prompt = `タイトル「${title}」と、キーワード「${keywords.join("、")}」をもとに、店舗のお知らせとしてふさわしい文章（100〜200文字、日本語）を丁寧かつ親しみやすく作成してください。`;

  const chat = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "あなたは親しみやすい日本語のお知らせ文を作るAIです。" },
      { role: "user", content: prompt },
    ],
  });

  const text = chat.choices[0].message.content;
  return NextResponse.json({ text });
}
