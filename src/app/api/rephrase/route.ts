import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const prompt = `
あなたはプロの校正者です。
以下の文章について、以下の制約を守って修正してください。

【制約】
- 内容を推測して補完したり、嘘を書いたりしないでください。
- 表現を大きく変えず、事実ベースで書き直してください。
- 誤字脱字や不自然な日本語があれば丁寧に修正してください。
- 丁寧でフォーマルな文体に整えてください。
- 元の文章に存在しない内容は絶対に追加しないでください。

【文章】
${text}
`;

    const chat = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    const result = chat.choices[0].message.content?.trim();
    return NextResponse.json({ result });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "AI生成に失敗しました" }, { status: 500 });
  }
}
