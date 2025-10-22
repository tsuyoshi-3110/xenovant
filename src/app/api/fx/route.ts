// app/api/fx/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FxSnapshot = {
  base: "JPY";
  rates: Record<string, number>; // 1 JPY -> X <ccy> (major)
  asOf: string;
};

const DEFAULT_WANT = ["USD","EUR","KRW","TWD","CNY","HKD","GBP","SGD","AUD","CAD"];

const FALLBACK: FxSnapshot = {
  base: "JPY",
  rates: {
    JPY: 1, USD: 0.0066, EUR: 0.0061, KRW: 9.1, TWD: 0.21, CNY: 0.046, HKD: 0.053,
    GBP: 1/190, SGD: 1/110, AUD: 1/95, CAD: 1/110,
  },
  asOf: new Date(0).toISOString(),
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get("symbols");
    const WANT = symbolsParam
      ? symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
      : DEFAULT_WANT;

    const r = await fetch("https://open.er-api.com/v6/latest/JPY", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      if (j?.rates && typeof j.rates === "object") {
        const rates: Record<string, number> = { JPY: 1 };
        for (const k of WANT) if (j.rates[k] != null) rates[k] = j.rates[k];

        const asOf =
          typeof j.time_last_update_unix === "number"
            ? new Date(j.time_last_update_unix * 1000).toISOString()
            : new Date().toISOString();

        const out: FxSnapshot = { base: "JPY", rates, asOf };
        return NextResponse.json(out, {
          headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=30" },
        });
      }
    }

    // 失敗時はフォールバック
    return NextResponse.json(FALLBACK, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=30" },
    });
  } catch {
    return NextResponse.json(FALLBACK, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=30" },
    });
  }
}
