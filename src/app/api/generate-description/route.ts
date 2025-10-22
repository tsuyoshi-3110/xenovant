// app/api/generate-description/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const title: string = json?.title ?? "";
    const price: number | "" | undefined = json?.price;
    const keywordsRaw: unknown = json?.keywords;

    if (!title.trim()) {
      return NextResponse.json({ error: "タイトルが必要です" }, { status: 400 });
    }

    // キーワードは配列の文字列だけを採用、空白除去して最大3件に制限
    const keywords = Array.isArray(keywordsRaw)
      ? (keywordsRaw as unknown[])
          .map((k) => (typeof k === "string" ? k.trim() : ""))
          .filter((k) => k.length > 0)
          .slice(0, 3)
      : [];

    // —— プロンプト（制約をはっきり指示）——
    const system =
      "あなたは商品説明を日本語で親しみやすく簡潔に書くプロのコピーライターです。出力は本文のみ、絵文字や箇条書きは使わず、自然な1段落で。";

    // 価格は“参考情報”として渡すが、本文には一切書かない
    const user = [
      `商品タイトル: ${title}`,
      price !== undefined && price !== "" ? `参考価格: ${price}（本文には書かない）` : null,
      keywords.length
        ? `必ず考慮するキーワード（最低1つは文中に自然に含める）:\n- ${keywords.join("\n- ")}`
        : "キーワード指定: なし",
      "",
      "制約:",
      "- 150文字以内で1段落",
      "- 価格・メーカー名・産地の情報は本文に一切含めない",
      "- 誇大表現や断定は避ける（“世界一”“必ず”などNG）",
      "- 指定キーワードは不自然に連呼しない（最低1つを自然に）",
      "- 読みやすい口調で“です・ます調”",
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4", // 既存と同じ。必要なら環境変数で差し替え可
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.8,
      max_tokens: 300, // 日本語150文字相当の余裕
    });

    const description = completion.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ body: description });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
