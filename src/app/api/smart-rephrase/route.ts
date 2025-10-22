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
あなたはプロの文章リライト編集者です。
以下の文章を、意味や事実は変えずに、よりスマートで洗練された印象に書き直してください。

【制約】
- 敬具や拝啓などの形式的な文は使わないでください。
- 内容や事実を追加・改ざんしないでください
- 誤字脱字は修正してください
- 簡潔で読みやすく、知的でスムーズな文章にしてください

【元の文章】
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
    return NextResponse.json(
      { error: "AI生成に失敗しました" },
      { status: 500 }
    );
  }
}
