"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  logPageView,
  logStayTime,
  logHourlyAccess,
  logDailyAccess,
  logReferrer,
  logWeekdayAccess,
  logVisitorType,
  logBounce,
  logGeo,
  logLandingView,
  normalizePageId as normalizeId,
} from "@/lib/logAnalytics";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

/** 期間集計対応ロガー（改訂版・JST統一対応）
 * - 直帰率（二重発火ガード付き）
 * - 解析系ページなどは集計から除外（ただし直前ページの滞在時間は記録）
 * - pagehide / beforeunload / visibilitychange の二重発火をフラグで防止
 */

const STAY_MAX_SEC = 60; // 実運用は 300〜600 も検討可
const EXCLUDED = new Set(["login", "analytics", "community", "postList"]);

export default function AnalyticsLogger() {
  const pathname = usePathname() || "/";
  const startTsRef = useRef<number>(Date.now()); // ページ入室時刻
  const prevPathRef = useRef<string>(pathname);  // 直前パス
  const pageCountRef = useRef<number>(0);        // セッション内ページ数

  // 二重発火ガード
  const flushedRef = useRef(false);  // 滞在時間フラッシュ
  const bouncedRef = useRef(false);  // バウンス計上

  /* 1) セッション一度だけ：地域 */
  useEffect(() => {
    const key = `geoLogged:${SITE_KEY}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    const ac = new AbortController();
    fetch("https://ipapi.co/json", { signal: ac.signal })
      .then((res) => res.json())
      .then((data) => {
        const region = data?.region || data?.country_name || "Unknown";
        logGeo(SITE_KEY, region);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") console.error("地域取得失敗:", e);
      });

    return () => ac.abort();
  }, []);

  /* 2) セッション一度だけ：リファラー */
  useEffect(() => {
    const key = `refLogged:${SITE_KEY}`;
    if (sessionStorage.getItem(key)) return;
    logReferrer(SITE_KEY);
    sessionStorage.setItem(key, "1");
  }, []);

  /* 3) ランディング views と バウンス（セッション内） */
  useEffect(() => {
    pageCountRef.current++;

    // 初回ページ＝ランディング → views を +1（除外ページは対象外）
    if (pageCountRef.current === 1) {
      const firstId = normalizeId(pathname);
      if (!EXCLUDED.has(firstId)) {
        logLandingView(SITE_KEY, firstId);
      }
    }

    // バウンス二重防止フラグをリセット
    bouncedRef.current = false;

    const handleBounce = () => {
      if (bouncedRef.current) return;
      bouncedRef.current = true;

      // 1ページのみ閲覧ならバウンス（除外ページは対象外）
      if (pageCountRef.current === 1) {
        const id = normalizeId(pathname);
        if (!EXCLUDED.has(id)) {
          logBounce(SITE_KEY, id);
        }
      }
    };

    // ページ離脱系イベント
    window.addEventListener("beforeunload", handleBounce);
    window.addEventListener("pagehide", handleBounce);
    // タブが非表示 → そのまま閉じられるケースの補足
    const visHandler = () => {
      if (document.visibilityState === "hidden") handleBounce();
    };
    document.addEventListener("visibilitychange", visHandler);

    return () => {
      window.removeEventListener("beforeunload", handleBounce);
      window.removeEventListener("pagehide", handleBounce);
      document.removeEventListener("visibilitychange", visHandler);
    };
  }, [pathname]);

  /* 4) ルート変更：直前滞在時間を反映し、各種ログ */
  useEffect(() => {
    const prev = prevPathRef.current;
    const now = Date.now();

    const prevId = normalizeId(prev);
    const currId = normalizeId(pathname);

    // 直前ページの滞在時間は常に反映（異常値は無視）
    const sec = Math.floor((now - startTsRef.current) / 1000);
    if (sec > 0 && sec <= STAY_MAX_SEC) {
      logStayTime(SITE_KEY, sec, prevId);
    }

    // 現在ページが除外対象なら、集計系の書き込みはスキップ
    if (!EXCLUDED.has(currId)) {
      logPageView(pathname, SITE_KEY);      // pages / pagesDaily（内部でもJST 0:00で記録）
      logHourlyAccess(SITE_KEY, currId);    // hourlyLogs (accessedAt/hour)
      logDailyAccess(SITE_KEY);             // dailyLogs (day)
      logWeekdayAccess(SITE_KEY);           // weekdayDaily
      logVisitorType(SITE_KEY);             // visitorDaily
    }

    // 次のページ準備
    prevPathRef.current = pathname;
    startTsRef.current = now;
    // 次のページに向けて滞在フラグをリセット
    flushedRef.current = false;
  }, [pathname]);

  /* 5) タブクローズ/遷移直前：最終滞在時間フラッシュ（二重防止） */
  useEffect(() => {
    // 新しいページに来たらフラグをリセット
    flushedRef.current = false;

    const handleLeave = () => {
      if (flushedRef.current) return;
      flushedRef.current = true;

      const id = normalizeId(pathname);
      const sec = Math.floor((Date.now() - startTsRef.current) / 1000);
      if (sec > 0 && sec <= STAY_MAX_SEC) {
        logStayTime(SITE_KEY, sec, id);
      }
    };

    window.addEventListener("beforeunload", handleLeave);
    window.addEventListener("pagehide", handleLeave);
    const visHandler = () => {
      if (document.visibilityState === "hidden") handleLeave();
    };
    document.addEventListener("visibilitychange", visHandler);

    return () => {
      window.removeEventListener("beforeunload", handleLeave);
      window.removeEventListener("pagehide", handleLeave);
      document.removeEventListener("visibilitychange", visHandler);
    };
  }, [pathname]);

  return null;
}
