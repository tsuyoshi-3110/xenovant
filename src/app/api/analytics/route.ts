import { NextResponse } from "next/server";
import { google } from "googleapis";


export async function GET(req: Request) {
  const url = new URL(req.url || "");
  const isEvent = url.searchParams.get("type") === "event";

  // OAuth2クライアントを明示的に作成
  const authClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  authClient.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  // Analytics Data API クライアント作成
  const analyticsDataClient = google.analyticsdata({
    version: "v1beta",
    auth: authClient,
  });

  try {
    if (isEvent) {
      // イベント取得モード
      const res = await analyticsDataClient.properties.runReport({
        property: `properties/${process.env.GA4_PROPERTY_ID}`,
        requestBody: {
          dimensions: [{ name: "eventName" }],
          metrics: [{ name: "eventCount" }],
          dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
          dimensionFilter: {
            filter: {
              fieldName: "eventName",
              inListFilter: {
                values: ["DeLi_click", "access_click", "interview_click"],
              },
            },
          },
        },
      });

      return NextResponse.json(res.data);
    } else {
      // ページアクセス数取得モード
      const pathsParam = url.searchParams.getAll("path");
      const pagePaths = pathsParam.length > 0 ? pathsParam : ["/"];

      const res = await analyticsDataClient.properties.runReport({
        property: `properties/${process.env.GA4_PROPERTY_ID}`,
        requestBody: {
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "activeUsers" }],
          dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
          dimensionFilter: {
            filter: {
              fieldName: "pagePath",
              inListFilter: {
                values: pagePaths,
              },
            },
          },
        },
      });

      const result = pagePaths.map((path) => {
        const row = res.data.rows?.find(
          (r) => r.dimensionValues?.[0].value === path
        );
        return {
          path,
          activeUsers: parseInt(row?.metricValues?.[0]?.value ?? "0", 10),
        };
      });

      return NextResponse.json({ data: result });
    }
  } catch (error) {
    console.error("GA4 Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
