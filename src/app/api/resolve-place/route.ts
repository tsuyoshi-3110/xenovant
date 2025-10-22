// app/api/resolve-place/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Source = "geocode" | "findplace" | "textsearch";
type Resolved = {
  placeId?: string;
  lat?: number;
  lng?: number;
  formattedAddress?: string;
  source?: Source;
};

type StepLog = {
  step: Source | "geocode_first";
  requestUrl: string;
  httpStatus?: number;
  ok?: boolean;
  googleStatus?: string;
  googleError?: string;
  note?: string;
  distanceM?: number;
  addressMatch?: boolean;
  sample?: any;
};

const oneLine = (s: string) =>
  (s ?? "").replace(/\s+/g, " ").replace(/[\r\n]+/g, " ").trim();



/* ===== 住所正規化の超ライト版（全角→半角、空白/句読点/「日本」/郵便記号など除去） ===== */
function toHalfWidthDigits(s: string) {
  return s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
          .replace(/[－―ー―‐]/g, "-");
}
function normalizeAddr(s: string) {
  const z = toHalfWidthDigits(s || "");
  return z
    .replace(/日本[,、]?\s*/g, "")
    .replace(/〒?\s*\d{3}-?\d{4}/g, "")
    .replace(/[,\s、。]/g, "")
    .toLowerCase()
    .trim();
}
function addrSimilar(a?: string, b?: string) {
  if (!a || !b) return false;
  const A = normalizeAddr(a);
  const B = normalizeAddr(b);
  if (!A || !B) return false;
  return A.includes(B) || B.includes(A);
}

/* ===== 距離判定（haversine） ===== */
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") || "";
  const address = searchParams.get("address") || "";
  const debug = searchParams.get("debug") === "1";
  return handler(name, address, debug);
}

export async function POST(req: Request) {
  try {
    const { name, address, debug } = await req.json();
    if (!name || !address) {
      return NextResponse.json({ error: "name and address required" }, { status: 400 });
    }
    return handler(String(name), String(address), !!debug);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
}

async function handler(nameRaw: string, addressRaw: string, debug = false) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "missing GOOGLE_MAPS_API_KEY" }, { status: 500 });
  }

  const name = oneLine(nameRaw);
  const address = oneLine(addressRaw);
  const steps: StepLog[] = [];

  const grab = async (u: URL, step: StepLog["step"]) => {
    const reqUrl = u.toString();
    try {
      const r = await fetch(reqUrl, { cache: "no-store" });
      const txt = await r.text();
      let j: any = null;
      try { j = JSON.parse(txt); } catch {}
      const log: StepLog = {
        step,
        requestUrl: reqUrl,
        httpStatus: r.status,
        ok: r.ok,
        googleStatus: j?.status,
        googleError: j?.error_message,
        sample: debug ? pickPreview(j) : undefined,
      };
      steps.push(log);
      return { ok: r.ok, json: j, raw: txt };
    } catch (e: any) {
      steps.push({ step, requestUrl: reqUrl, note: `fetch error: ${String(e?.message || e)}` });
      return { ok: false, json: null, raw: "" };
    }
  };

  /* === 1) 住所→座標（基準点の確定） === */
  let base: { lat: number; lng: number; formatted: string } | null = null;
  {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("language", "ja");
    url.searchParams.set("region", "jp");
    url.searchParams.set("key", key);
    const { ok, json } = await grab(url, "geocode_first");
    if (ok && json?.status === "OK" && Array.isArray(json.results) && json.results[0]) {
      const g = json.results[0];
      base = {
        lat: g.geometry?.location?.lat,
        lng: g.geometry?.location?.lng,
        formatted: g.formatted_address,
      };
    } else {
      // 住所が曖昧なら、元の実装のように「名前+住所」で探す最小限の保険（ただしplaceIdは採用しない）
      return NextResponse.json(
        debug
          ? { lat: undefined, lng: undefined, formattedAddress: undefined, source: "geocode",
              debug: { normalized: { name, address }, steps } }
          : { source: "geocode" }
      );
    }
  }

  /* === 2) 近傍で店名検索（Find Place, locationbias） === */
  const RADIUS = 400; // m（必要に応じて調整）
  let best: { placeId: string; lat: number; lng: number; formatted: string; source: Source; dist: number; match: boolean } | null = null;

  {
    const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
    url.searchParams.set("input", name);
    url.searchParams.set("inputtype", "textquery");
    url.searchParams.set("fields", "place_id,name,geometry/location,formatted_address,business_status,types");
    url.searchParams.set("language", "ja");
    url.searchParams.set("region", "jp");
    url.searchParams.set("locationbias", `circle:${RADIUS}@${base!.lat},${base!.lng}`);
    url.searchParams.set("key", key);

    const { ok, json } = await grab(url, "findplace");
    if (ok && json?.status === "OK" && Array.isArray(json.candidates) && json.candidates.length) {
      const c = json.candidates[0];
      const lat = c.geometry?.location?.lat;
      const lng = c.geometry?.location?.lng;
      const fa = c.formatted_address as string | undefined;
      const dist = (lat && lng) ? distanceMeters({ lat, lng }, { lat: base!.lat, lng: base!.lng }) : Number.POSITIVE_INFINITY;
      const match = addrSimilar(fa, base!.formatted);
      steps[steps.length - 1].distanceM = isFinite(dist) ? Math.round(dist) : undefined;
      steps[steps.length - 1].addressMatch = match;

      if (isFinite(dist) && dist <= RADIUS && match) {
        best = {
          placeId: c.place_id,
          lat, lng,
          formatted: fa || base!.formatted,
          source: "findplace",
          dist, match
        };
      }
    }
  }

  /* === 3) それでも未決なら Text Search（半径内） === */
  if (!best) {
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", name);
    url.searchParams.set("language", "ja");
    url.searchParams.set("region", "jp");
    url.searchParams.set("location", `${base!.lat},${base!.lng}`);
    url.searchParams.set("radius", String(RADIUS));
    // url.searchParams.set("type", "establishment"); // 必要なら絞る
    url.searchParams.set("key", key);

    const { ok, json } = await grab(url, "textsearch");
    if (ok && json?.status === "OK" && Array.isArray(json.results) && json.results.length) {
      const c = json.results[0];
      const lat = c.geometry?.location?.lat;
      const lng = c.geometry?.location?.lng;
      const fa = c.formatted_address as string | undefined;
      const dist = (lat && lng) ? distanceMeters({ lat, lng }, { lat: base!.lat, lng: base!.lng }) : Number.POSITIVE_INFINITY;
      const match = addrSimilar(fa, base!.formatted);
      steps[steps.length - 1].distanceM = isFinite(dist) ? Math.round(dist) : undefined;
      steps[steps.length - 1].addressMatch = match;

      if (isFinite(dist) && dist <= RADIUS && match) {
        best = {
          placeId: c.place_id,
          lat, lng,
          formatted: fa || base!.formatted,
          source: "textsearch",
          dist, match
        };
      }
    }
  }

  /* === 4) 返却：厳格一致時のみ placeId 採用、そうでなければ座標のみ === */
  if (best) {
    const out: Resolved = {
      placeId: best.placeId,
      lat: best.lat,
      lng: best.lng,
      formattedAddress: best.formatted,
      source: best.source,
    };
    return NextResponse.json(debug ? { ...out, debug: { normalized: { name, address }, steps } } : out);
  }

  // placeIdは付けず、座標のみ（レビューは無効、地図リンクは座標でOK）
  const out: Resolved = {
    lat: base.lat,
    lng: base.lng,
    formattedAddress: base.formatted,
    source: "geocode",
  };
  return NextResponse.json(debug ? { ...out, debug: { normalized: { name, address }, steps } } : out);
}

/* でかいJSONを少量サンプル化（個人情報配慮） */
function pickPreview(j: any) {
  if (!j || typeof j !== "object") return j;
  const shallow: any = {};
  for (const k of Object.keys(j)) {
    if (k === "candidates" && Array.isArray(j[k]) && j[k][0]) {
      shallow[k] = [minifyCandidate(j[k][0])];
    } else if (k === "results" && Array.isArray(j[k]) && j[k][0]) {
      shallow[k] = [minifyCandidate(j[k][0])];
    } else if (k === "result" && j[k]) {
      shallow[k] = minifyCandidate(j[k]);
    } else if (["status", "error_message"].includes(k)) {
      shallow[k] = j[k];
    }
  }
  return shallow;
}
function minifyCandidate(c: any) {
  return {
    place_id: c?.place_id,
    formatted_address: c?.formatted_address,
    name: c?.name,
    geometry: { location: c?.geometry?.location },
    business_status: c?.business_status,
    types: c?.types?.slice?.(0, 3),
  };
}
