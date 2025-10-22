import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  const { name, address, keyword, feature } = await req.json();

  if (!name || !address) {
    return NextResponse.json(
      { error: "店舗名と住所は必須です" },
      { status: 400 }
    );
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "あなたは親しみやすく簡潔な日本語の紹介文を作るプロのコピーライターです。",
    },
    {
      role: "user",
      content: `店舗名: ${name}\n住所: ${address}\n業種: ${keyword}\nイチオシ: ${feature}\n→ 価格や産地、メーカー名を含めず、80字以内の紹介文を生成してください。`,
    },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages,
    temperature: 0.7,
    max_tokens: 300,
  });

  const content = completion.choices[0].message.content;
  return NextResponse.json({ description: content });
}
