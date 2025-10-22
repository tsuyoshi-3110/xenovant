// components/StoreReviews.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

/* ===== Types ===== */
type Review = {
  author: string;
  rating: number;
  text: string;
  time?: string;
  profilePhotoUrl?: string;
};

type ApiShape = {
  reviews?: Array<{
    author?: string;
    author_name?: string;
    rating?: number;
    text?: string;
    original_text?: string;
    relative_time_description?: string;
    profile_photo_url?: string;
  }>;
  rating?: number | null;
  total?: number | null;
  error?: string;
};

type Props = {
  placeId: string;
  googleEnabled: boolean;
  /** 任意: JSON-LD用の店舗名（未指定なら document.title） */
  businessName?: string;
  /** 任意: JSON-LD用のページURL（未指定なら location.href） */
  pageUrl?: string;
};

/* ===== Utils ===== */
function normalizeReviews(list: ApiShape["reviews"] | undefined): Review[] {
  if (!Array.isArray(list)) return [];
  const fixUrl = (u?: string) => {
    if (!u) return undefined;
    let out = u.trim();
    if (!out) return undefined;
    if (out.startsWith("//")) out = "https:" + out;
    if (out.startsWith("http://")) out = out.replace("http://", "https://");
    try {
      const url = new URL(out);
      if (
        url.hostname.endsWith("googleusercontent.com") &&
        !url.searchParams.has("sz")
      ) {
        url.searchParams.set("sz", "64");
        out = url.toString();
      }
    } catch {}
    return out;
  };

  return list.map((r) => {
    const text =
      (r?.text ?? "").trim() || (r?.original_text ?? "").trim() || "";
    return {
      author: (r?.author ?? r?.author_name ?? "").trim() || "匿名ユーザー",
      rating: typeof r?.rating === "number" ? r!.rating : 0,
      text,
      time: r?.relative_time_description,
      profilePhotoUrl: fixUrl(r?.profile_photo_url),
    };
  });
}

function Avatar({ author, url }: { author: string; url?: string }) {
  const initial = (author || "？").trim().charAt(0);
  return (
    <div className="relative">
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const sib = e.currentTarget
                .nextElementSibling as HTMLElement | null;
              if (sib) sib.style.display = "flex";
            }}
          />
          <div className="hidden h-8 w-8 rounded-full bg-gray-400 text-white text-sm font-semibold items-center justify-center">
            {initial}
          </div>
        </>
      ) : (
        <div className="h-8 w-8 rounded-full bg-gray-400 text-white text-sm font-semibold flex items-center justify-center">
          {initial}
        </div>
      )}
    </div>
  );
}

/* ===== Component ===== */
export default function StoreReviews({
  placeId,
  googleEnabled,
  businessName,
  pageUrl,
}: Props) {
  // State hooks（必ずトップレベル）
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [avg, setAvg] = useState<number | null>(null);
  const [loading, setLoading] = useState(false); // 連携OFF時は発火させない
  const [error, setError] = useState<string | null>(null);

  // Theme hooks（必ずトップレベル）

  // ここもトップレベルでOK（値はいつでも算出可能）
  const mapPlaceUrl = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(
    placeId
  )}`;

  // JSON-LD（構造化データ）— useMemo内で条件を処理
  const jsonLd = useMemo(() => {
    // 口コミ無効・データ不足なら script は出さない
    if (!googleEnabled) return null;

    const hasSomeData =
      (Array.isArray(reviews) && reviews.length > 0) ||
      typeof avg === "number" ||
      typeof total === "number";
    if (!hasSomeData) return null;

    const ratingValue =
      typeof avg === "number"
        ? avg.toFixed(1)
        : reviews && reviews.length > 0
        ? (
            reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length
          ).toFixed(1)
        : undefined;

    const reviewCount =
      typeof total === "number" ? total : reviews ? reviews.length : undefined;

    const reviewList =
      reviews && reviews.length > 0
        ? reviews.slice(0, 10).map((r) => ({
            "@type": "Review",
            author: r.author || "匿名ユーザー",
            reviewBody: r.text || "",
            reviewRating: {
              "@type": "Rating",
              ratingValue: r.rating || 0,
              bestRating: "5",
              worstRating: "1",
            },
          }))
        : undefined;

    const name =
      businessName && businessName.trim()
        ? businessName.trim()
        : typeof document !== "undefined"
        ? document.title.trim()
        : "";
    const url =
      pageUrl && pageUrl.trim()
        ? pageUrl.trim()
        : typeof window !== "undefined"
        ? window.location.href
        : "";

    const data: any = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      ...(name ? { name } : {}),
      ...(url ? { url } : {}),
      sameAs: [mapPlaceUrl],
    };

    if (ratingValue && reviewCount != null) {
      data.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue,
        reviewCount,
      };
    }
    if (reviewList && reviewList.length > 0) {
      data.review = reviewList;
    }

    return JSON.stringify(data);
  }, [googleEnabled, reviews, avg, total, businessName, pageUrl, mapPlaceUrl]);

  // データ取得（hookはトップレベル、内側で条件分岐）
  useEffect(() => {
    if (!googleEnabled) {
      setReviews(null);
      setTotal(null);
      setAvg(null);
      setLoading(false);
      setError(null);
      return;
    }

    let aborted = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(
          `/api/place-reviews?placeId=${encodeURIComponent(placeId)}&lang=ja`,
          { cache: "no-store" }
        );
        const j: ApiShape = await r.json();
        if (!r.ok) throw new Error(j?.error || "places error");
        if (!aborted) {
          setReviews(normalizeReviews(j.reviews));
          setTotal(typeof j.total === "number" ? j.total : null);
          setAvg(typeof j.rating === "number" ? j.rating : null);
        }
      } catch (e: any) {
        if (!aborted) setError(e?.message || "places error");
      } finally {
        if (!aborted) setLoading(false);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [placeId, googleEnabled]);

  /* ===== Render（ここで早期returnしてもOK：hooksはすでに呼ばれている） ===== */
  if (!googleEnabled) return null;

  if (loading) return <p>読み込み中...</p>;
  if (error) return <p className="text-red-500">エラー: {error}</p>;

  if (!reviews || reviews.length === 0)
    return (
      <>
        {jsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd }}
          />
        )}
        <div className="mt-3 rounded-md border bg-transparent p-4 text-sm">
          口コミはまだありません
        </div>
      </>
    );

  return (
    <div className="space-y-4">
      {/* 構造化データ */}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      )}

      {/* ヘッダ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">口コミ</span>
          {typeof avg === "number" && (
            <span className="text-yellow-500" aria-label={`平均評価 ${avg} 点`}>
              {"★".repeat(Math.round(avg))}
            </span>
          )}
          {typeof total === "number" && (
            <span className="text-sm opacity-70">（{total}件）</span>
          )}
        </div>
        <a
          href={mapPlaceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline text-blue-600"
        >
          Googleで口コミを見る
        </a>
      </div>

      {/* リスト */}
      {reviews.map((rv, i) => (
        <div
          key={i}
          className={`rounded-md border p-4 shadow-sm text-white text-outline`}
        >
          <div className="flex items-center gap-3 mb-2">
            <Avatar author={rv.author} url={rv.profilePhotoUrl} />
            <div className="flex-1">
              <div className="font-medium">{rv.author}</div>
              <div className="flex items-center gap-2 text-xs opacity-70">
                <span
                  className="text-yellow-500"
                  aria-label={`評価 ${rv.rating} 点`}
                >
                  {"★".repeat(Math.round(rv.rating)) || "★"}
                </span>
                {rv.time && <span>{rv.time}</span>}
              </div>
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap">
            {rv.text || "（コメントなし）"}
          </p>
        </div>
      ))}
    </div>
  );
}
