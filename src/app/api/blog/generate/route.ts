// app/api/blog/generate/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { keywords } = (await req.json()) as {
      keywords?: string[];
    };

    // 入力バリデーション（タイトルは使わない）
    const ks = Array.isArray(keywords)
      ? keywords
          .map((k) => (k ?? "").trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];

    if (ks.length === 0) {
      return NextResponse.json(
        { error: "キーワードを1つ以上入力してください。" },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // プロンプト（日本語で、ブログ向け・200〜500語目安）
    const system =
      "あなたは日本語で文章を作るプロのブログ編集者です。読みやすく、自然で、重複の少ない本文を生成します。";

    const user = [
      "以下のキーワードに基づいて、個人のブログ記事の本文のみを書いてください。",
      `キーワード(最大3): ${ks.join(", ")}`,
      "要件:",
      "- タイトルは考慮しない。タイトルに言及もしない。",
      "- 一人称（私／僕）で書く",
      "- 体験談を語る口語的な文体（説明調や見出しは使わない）",
      "- 読者に語りかけるように（例: 〜ならぜひ！）",
      "- 感情表現や日常語を適度に混ぜる（例: ワクワクした、思わず笑った）",
      "- Markdownの見出し記号（# / ### など）は使わない",
      "- 絵文字は使わない",
      "- 全体で200語程度",
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: "gpt-5-chat-latest",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json(
        { error: "本文の生成に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ body: content });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message ?? "エラーが発生しました。" },
      { status: 500 }
    );
  }
}
