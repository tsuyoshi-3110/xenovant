import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  const { keywords } = await req.json();
  const prompt = `以下のキーワードを含むSNS投稿文を生成してください: ${keywords.join(", ")}`;

  const chat = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
  });

  const text = chat.choices[0].message.content?.trim() ?? "生成に失敗しました";
  return NextResponse.json({ text });
}
