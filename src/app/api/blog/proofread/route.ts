// app/api/blog/proofread/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { body } = (await req.json()) as { body?: string };

    const text = (body ?? "").trim();
    if (!text) {
      return NextResponse.json(
        { error: "本文が空です。校正するテキストを入力してください。" },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system =
      "あなたは日本語の校正者です。誤字脱字、文法、送り仮名、表記ゆれを自然な口語寄りに整えます。意味は変えず、文体は原文のカジュアルさを保ちます。Markdownの見出し（#, ##, ###）は使用しません。出力は校正済みの本文だけを返してください。";

    const user = [
      "以下の日本語テキストを校正してください。",
      "要件:",
      "- 誤字脱字・文法ミスの修正",
      "- 冗長表現の軽い簡潔化（意味は変えない）",
      "- 口語的で自然な言い回しに調整（過剰に堅くしない）",
      "- 表記ゆれの統一（例: できる/出来る → できる）",
      "- 絵文字は追加しない",
      "- Markdown見出し記号（# や ###）は使わない",
      "",
      "【原文】",
      text,
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: "gpt-5-chat-latest",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2, // 校正なので控えめ
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json(
        { error: "校正に失敗しました。" },
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
