// app/api/generate-about/route.ts
import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // .env.localに追加しておく
});

export async function POST(req: NextRequest) {
  const { keywords } = await req.json();

  const prompt = `以下のキーワードを元に、親しみやすく丁寧な紹介文を300文字程度で日本語で作成してください：${keywords.join("、")}`;

  const chat = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "あなたは当店の思いの紹介文を作成するAIです。" },
      { role: "user", content: prompt },
    ],
  });

  const text = chat.choices[0].message.content;

  return NextResponse.json({ text });
}
