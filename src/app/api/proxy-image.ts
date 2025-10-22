// app/api/proxy-image/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("URL required", { status: 400 });

  const res = await fetch(url);
  const blob = await res.blob();
  const buffer = await blob.arrayBuffer();

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "image/png",
      "Content-Disposition": 'inline; filename="flyer.png"',
    },
  });
}
