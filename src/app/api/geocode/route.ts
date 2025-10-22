// app/api/geocode/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address") || "";
  const debug = searchParams.get("debug") === "1";
  return geocodeHandler(address, debug);
}

export async function POST(req: Request) {
  try {
    const { address, debug } = await req.json();
    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }
    return geocodeHandler(address, !!debug);
  } catch (e) {
    console.error("[/api/geocode] bad payload", e);
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
}

async function geocodeHandler(address: string, debug = false) {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      console.error("[/api/geocode] missing GOOGLE_MAPS_API_KEY");
      return NextResponse.json({ error: "missing GOOGLE_MAPS_API_KEY" }, { status: 500 });
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("language", "ja");
    url.searchParams.set("region", "jp");
    url.searchParams.set("key", key);

    const r = await fetch(url.toString(), { cache: "no-store" });
    const text = await r.text();

    if (!r.ok) {
      console.error("[/api/geocode] upstream http error", r.status, text);
      return NextResponse.json(
        { error: "upstream http error", upStatus: r.status, body: slice(text) },
        { status: 502 }
      );
    }

    const j = JSON.parse(text);
    const status: string | undefined = j?.status;
    const errMsg: string | undefined = j?.error_message;

    if (status !== "OK") {
      console.error("[/api/geocode] google status", status, errMsg);
      const st = status === "ZERO_RESULTS" ? 404 : 502;
      return NextResponse.json(
        { error: "google geocode error", googleStatus: status, googleError: errMsg, debug: debug ? j : undefined },
        { status: st }
      );
    }

    const first = j?.results?.[0];
    const loc = first?.geometry?.location;
    if (!loc) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const res = { lat: loc.lat, lng: loc.lng, placeId: first.place_id as string | undefined };
    return NextResponse.json(debug ? { ...res, raw: slice(text) } : res);
  } catch (e) {
    console.error("[/api/geocode] exception", e);
    return NextResponse.json({ error: "geocode failed" }, { status: 500 });
  }
}

function slice(s: string, n = 1200) {
  return s.length > n ? s.slice(0, n) + "...(truncated)" : s;
}
