import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  const { title, body } = await req.json();

  const prompt = `
Japanese flyer. Title: ${title}, Body: ${body}.
Strawberry crepe fair design. Colorful. Vertical layout.
`;

  try {
    const result = await openai.images.generate({
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    });

    const imageUrl = result.data?.[0]?.url;

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "No image returned" }), {
        status: 500,
      });
    }

    return new Response(JSON.stringify({ imageUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Flyer generation error:", err);
    return new Response(JSON.stringify({ error: "Failed to generate flyer" }), {
      status: 500,
    });
  }
}
