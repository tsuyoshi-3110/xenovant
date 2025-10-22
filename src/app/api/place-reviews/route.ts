// app/api/place-reviews/route.ts の要点
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const placeId = searchParams.get("placeId") || "";
    const lang = searchParams.get("lang") || "ja";
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "missing api key" }, { status: 500 });
    }
    if (!placeId) {
      return NextResponse.json({ error: "placeId required" }, { status: 400 });
    }

    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("fields", "reviews,rating,user_ratings_total");
    url.searchParams.set("reviews_sort", "newest");
    url.searchParams.set("language", lang);
    // 重要：翻訳済み text を優先
    url.searchParams.set("reviews_no_translations", "false");
    url.searchParams.set("key", key);

    const r = await fetch(url.toString(), { cache: "no-store" });
    const j = await r.json();

    if (!r.ok || j.status !== "OK") {
      return NextResponse.json(
        { error: "places error", googleStatus: j.status, googleError: j.error_message },
        { status: 502 }
      );
    }

    const reviews = (j.result?.reviews ?? []).map((rv: any) => {
      const text =
        (typeof rv.text === "string" && rv.text.trim()) ||
        (typeof rv.original_text === "string" && rv.original_text.trim()) ||
        "";
      return {
        author: rv.author_name ?? "",
        profilePhotoUrl: rv.profile_photo_url ?? "",
        rating: rv.rating ?? 0,
        time: rv.relative_time_description ?? "",
        text,
      };
    });

    return NextResponse.json({
      rating: j.result?.rating ?? null,
      total: j.result?.user_ratings_total ?? 0,
      reviews,
    });
  } catch  {
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
