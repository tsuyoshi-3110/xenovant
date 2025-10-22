// logAnalytics.ts  — JST 0:00 統一版

import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  query,
  where,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { format } from "date-fns";

/* ───────── 設定・共通 ───────── */

const EXCLUDE_PAGES = ["login", "analytics", "community", "postList"];

/** 当日0:00の Date と "yyyy-MM-dd"（ローカル＝JST想定） */
function todayKeyAndDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return { day: d, dayId: format(d, "yyyy-MM-dd") };
}

/** 期間の end を 23:59:59.999 に丸める（ローカル＝JST） */
export function normalizePeriod(start: Date, end: Date) {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(23, 59, 59, 999);
  return { start: s, end: e };
}

/** JST の 0:00 Timestamp を作成 */
function jstMidnightTs(date = new Date()): Timestamp {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
}

/** 期間境界を Timestamp に変換（JST 0:00〜23:59:59.999） */
function toJstRangeTimestamps(start: Date, end: Date) {
  const { start: s, end: e } = normalizePeriod(start, end);
  return { sTs: Timestamp.fromDate(s), eTs: Timestamp.fromDate(e) };
}

/* ───────── 正規化ユーティリティ ───────── */

function safeDecode(str: string) {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/** ページIDの正規化 */
export function normalizePageId(path: string): string {
  const raw = (path || "").replace(/^\/+/, "").split("?")[0].split("#")[0];
  const decoded = safeDecode(raw);
  if (!decoded) return "home";
  if (decoded.startsWith("products/")) return "products";
  return decoded.replaceAll("/", "_");
}

function isExcluded(pageId: string) {
  return EXCLUDE_PAGES.includes(pageId);
}

/* ───────── ログ（すべて日別増分付き） ───────── */

/** PV：累積（pages）＋ 日別（pagesDaily） */
export const logPageView = async (path: string, siteKey: string) => {
  const pageId = normalizePageId(path);
  if (EXCLUDE_PAGES.includes(pageId)) return;

  const pagesRef = doc(db, "analytics", siteKey, "pages", pageId);
  const { day, dayId } = todayKeyAndDay();
  const dailyRef = doc(
    db,
    "analytics",
    siteKey,
    "pagesDaily",
    `${dayId}_${pageId}`
  );
  const dayTs = jstMidnightTs(day);

  await Promise.all([
    setDoc(
      pagesRef,
      { count: increment(1), updatedAt: serverTimestamp() },
      { merge: true }
    ),
    setDoc(
      dailyRef,
      { day: dayTs, pageId, count: increment(1) },
      { merge: true }
    ),
  ]);
};

/** 任意イベント：累積（events）＋ 日別（eventsDaily） */
export const logEvent = async (
  eventName: string,
  siteKey: string,
  label?: string
) => {
  const aggRef = doc(db, "analytics", siteKey, "events", eventName);
  const { day, dayId } = todayKeyAndDay();
  const dailyRef = doc(
    db,
    "analytics",
    siteKey,
    "eventsDaily",
    `${dayId}_${eventName}`
  );
  const dayTs = jstMidnightTs(day);

  await Promise.all([
    setDoc(
      aggRef,
      {
        count: increment(1),
        updatedAt: serverTimestamp(),
        ...(label !== undefined ? { label } : {}),
      },
      { merge: true }
    ),
    setDoc(
      dailyRef,
      { day: dayTs, eventId: eventName, count: increment(1) },
      { merge: true }
    ),
  ]);
};

/** 滞在時間：累積（events）＋ 日別（eventsDaily） */
export const logStayTime = async (
  siteKey: string,
  seconds: number,
  pageId?: string
) => {
  const cleanId = normalizePageId(pageId || "home");
  if (EXCLUDE_PAGES.includes(cleanId)) return;

  const eventId = `home_stay_seconds_${cleanId}`;
  const aggRef = doc(db, "analytics", siteKey, "events", eventId);
  const { day, dayId } = todayKeyAndDay();
  const dailyRef = doc(
    db,
    "analytics",
    siteKey,
    "eventsDaily",
    `${dayId}_${eventId}`
  );
  const dayTs = jstMidnightTs(day);

  await Promise.all([
    setDoc(
      aggRef,
      {
        totalSeconds: increment(seconds),
        count: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
    setDoc(
      dailyRef,
      {
        day: dayTs,
        eventId,
        totalSeconds: increment(seconds),
        count: increment(1),
      },
      { merge: true }
    ),
  ]);
};

/** 時間帯ログ（範囲クエリ用に accessedAt を保持） */
export async function logHourlyAccess(siteKey: string, pageId: string) {
  try {
    const hour = new Date().getHours();
    await addDoc(collection(db, "analytics", siteKey, "hourlyLogs"), {
      siteKey,
      pageId,
      accessedAt: serverTimestamp(),
      hour,
    });
  } catch (error) {
    console.error("アクセスログ保存失敗:", error);
  }
}

/** 日別総計（期間クエリ用に day を持たせる） */
export async function logDailyAccess(siteKey: string) {
  try {
    const { day, dayId } = todayKeyAndDay();
    const dailyRef = doc(db, "analytics", siteKey, "dailyLogs", dayId);
    const dayTs = jstMidnightTs(day);
    await setDoc(
      dailyRef,
      {
        day: dayTs,
        count: increment(1),
        updatedAt: serverTimestamp(),
        accessedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("日別アクセスログ保存失敗:", error);
  }
}

/** リファラー：累積（referrers）＋ 日別（referrersDaily） */
export const logReferrer = async (siteKey: string) => {
  try {
    let ref = document.referrer || "direct";
    if (ref !== "direct") {
      const url = new URL(ref);
      ref = url.hostname.replace(/^www\./, "");
    }
    const aggRef = doc(db, "analytics", siteKey, "referrers", ref);
    const { day, dayId } = todayKeyAndDay();
    const dailyRef = doc(
      db,
      "analytics",
      siteKey,
      "referrersDaily",
      `${dayId}_${ref}`
    );
    const dayTs = jstMidnightTs(day);

    await Promise.all([
      setDoc(aggRef, { count: increment(1) }, { merge: true }),
      setDoc(
        dailyRef,
        { day: dayTs, host: ref, count: increment(1) },
        { merge: true }
      ),
    ]);
  } catch (e) {
    console.error("リファラー記録エラー:", e);
  }
};

/** 曜日：累積（weekdayLogs）＋ 日別（weekdayDaily） */
export async function logWeekdayAccess(siteKey: string) {
  try {
    const dayOfWeek = new Date().getDay(); // 0..6
    const weekdayLabels = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const weekdayId = weekdayLabels[dayOfWeek];

    const aggRef = doc(db, "analytics", siteKey, "weekdayLogs", weekdayId);
    const { day, dayId } = todayKeyAndDay();
    const dailyRef = doc(
      db,
      "analytics",
      siteKey,
      "weekdayDaily",
      `${dayId}_${weekdayId}`
    );
    const dayTs = jstMidnightTs(day);

    await Promise.all([
      setDoc(
        aggRef,
        { count: increment(1), updatedAt: serverTimestamp() },
        { merge: true }
      ),
      setDoc(
        dailyRef,
        { day: dayTs, weekday: weekdayId, count: increment(1) },
        { merge: true }
      ),
    ]);
  } catch (error) {
    console.error("曜日別アクセスログ保存失敗:", error);
  }
}

/* ───────── 訪問者（新規/リピーター） ───────── */

function generateUUID(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto.getRandomValues === "function") {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    return [...b]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** 新規/リピーター：visitorDaily に日別加算（重複防止）＋互換の visitorStats も更新 */
export async function logVisitorType(siteKey: string) {
  try {
    const key = `visitorId_${siteKey}`;
    let id = localStorage.getItem(key);
    if (!id) {
      id = generateUUID();
      localStorage.setItem(key, id);
    }

    const profRef = doc(db, "analytics", siteKey, "visitorProfiles", id);
    const statsRef = doc(db, "analytics", siteKey, "visitorStats", id); // 互換
    const { day, dayId } = todayKeyAndDay();
    const dayTs = jstMidnightTs(day);
    const dailyRef = doc(db, "analytics", siteKey, "visitorDaily", dayId);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(profRef);
      if (!snap.exists()) {
        tx.set(profRef, {
          firstVisit: serverTimestamp(),
          lastVisit: serverTimestamp(),
          lastCountedDate: dayId,
        });
        tx.set(
          dailyRef,
          { day: dayTs, new: increment(1), returning: increment(0) },
          { merge: true }
        );
        tx.set(
          statsRef,
          {
            new: 1,
            returning: 0,
            lastVisit: serverTimestamp(),
            lastCountedDate: dayId,
          },
          { merge: true }
        );
      } else {
        const data = snap.data() as { lastCountedDate?: string };
        if (data.lastCountedDate !== dayId) {
          tx.update(profRef, {
            lastVisit: serverTimestamp(),
            lastCountedDate: dayId,
          });
          tx.set(
            dailyRef,
            { day: dayTs, returning: increment(1) },
            { merge: true }
          );
          tx.set(
            statsRef,
            {
              returning: increment(1),
              lastVisit: serverTimestamp(),
              lastCountedDate: dayId,
            },
            { merge: true }
          );
        }
      }
    });
  } catch (e) {
    console.error("visitorType 記録エラー:", e);
  }
}

/** 地域：累積（geoStats）＋ 日別（geoDaily） */
export async function logGeo(siteKey: string, region: string) {
  try {
    const aggRef = doc(db, "analytics", siteKey, "geoStats", region);
    const { day, dayId } = todayKeyAndDay();
    const dailyRef = doc(
      db,
      "analytics",
      siteKey,
      "geoDaily",
      `${dayId}_${region}`
    );
    const dayTs = jstMidnightTs(day);

    await Promise.all([
      setDoc(aggRef, { count: increment(1) }, { merge: true }),
      setDoc(
        dailyRef,
        { day: dayTs, region, count: increment(1) },
        { merge: true }
      ),
    ]);
  } catch (e) {
    console.error("地域別アクセスログ失敗:", e);
  }
}

/* ───────── 期間集計 用ユーティリティ ───────── */

export async function fetchPagesByPeriod(
  siteKey: string,
  start: Date,
  end: Date
) {
  const { sTs, eTs } = toJstRangeTimestamps(start, end);
  const qRef = query(
    collection(db, "analytics", siteKey, "pagesDaily"),
    where("day", ">=", sTs),
    where("day", "<=", eTs)
  );
  const snap = await getDocs(qRef);
  const totals: Record<string, number> = {};
  snap.forEach((d) => {
    const { pageId, count = 0 } = d.data() as {
      pageId: string;
      count?: number;
    };
    totals[pageId] = (totals[pageId] || 0) + count;
  });
  return totals;
}

export async function fetchEventsByPeriod(
  siteKey: string,
  start: Date,
  end: Date
) {
  const { sTs, eTs } = toJstRangeTimestamps(start, end);
  const qRef = query(
    collection(db, "analytics", siteKey, "eventsDaily"),
    where("day", ">=", sTs),
    where("day", "<=", eTs)
  );
  const snap = await getDocs(qRef);
  const totals: Record<string, { totalSeconds: number; count: number }> = {};
  snap.forEach((d) => {
    const {
      eventId,
      totalSeconds = 0,
      count = 0,
    } = d.data() as {
      eventId: string;
      totalSeconds?: number;
      count?: number;
    };
    if (!totals[eventId]) totals[eventId] = { totalSeconds: 0, count: 0 };
    totals[eventId].totalSeconds += totalSeconds || 0;
    totals[eventId].count += count || 0;
  });
  // 平均秒数は呼び出し側で totals[eventId].totalSeconds / totals[eventId].count
  return totals;
}

export async function fetchReferrersByPeriod(
  siteKey: string,
  start: Date,
  end: Date
) {
  const { sTs, eTs } = toJstRangeTimestamps(start, end);
  const qRef = query(
    collection(db, "analytics", siteKey, "referrersDaily"),
    where("day", ">=", sTs),
    where("day", "<=", eTs)
  );
  const snap = await getDocs(qRef);
  const hostTotals: Record<string, number> = {};
  snap.forEach((d) => {
    const { host, count = 0 } = d.data() as { host: string; count: number };
    hostTotals[host] = (hostTotals[host] || 0) + count;
  });

  // 分類
  const result = { sns: 0, search: 0, direct: 0 };
  Object.entries(hostTotals).forEach(([host, cnt]) => {
    if (host === "direct") result.direct += cnt;
    else if (
      /google\./.test(host) ||
      /bing\.com/.test(host) ||
      /yahoo\./.test(host)
    )
      result.search += cnt;
    else result.sns += cnt;
  });
  return { byHost: hostTotals, buckets: result };
}

export async function fetchVisitorsByPeriod(
  siteKey: string,
  start: Date,
  end: Date
) {
  const { sTs, eTs } = toJstRangeTimestamps(start, end);
  const qRef = query(
    collection(db, "analytics", siteKey, "visitorDaily"),
    where("day", ">=", sTs),
    where("day", "<=", eTs)
  );
  const snap = await getDocs(qRef);
  let totalNew = 0,
    totalReturning = 0;
  snap.forEach((d) => {
    const data = d.data() as { new?: number; returning?: number };
    totalNew += data.new ?? 0;
    totalReturning += data.returning ?? 0;
  });
  return { new: totalNew, returning: totalReturning };
}

export async function fetchBounceByPeriod(
  siteKey: string,
  start: Date,
  end: Date
) {
  const { sTs, eTs } = toJstRangeTimestamps(start, end);
  const qRef = query(
    collection(db, "analytics", siteKey, "bounceDaily"),
    where("day", ">=", sTs),
    where("day", "<=", eTs)
  );
  const snap = await getDocs(qRef);
  const perPage: Record<
    string,
    { bounces: number; views: number; rate: number }
  > = {};
  snap.forEach((d) => {
    const {
      pageId,
      bounces = 0,
      views = 0,
    } = d.data() as { pageId: string; bounces?: number; views?: number };
    const cur = perPage[pageId] || { bounces: 0, views: 0, rate: 0 };
    cur.bounces += bounces;
    cur.views += views;
    perPage[pageId] = cur;
  });
  Object.keys(perPage).forEach((p) => {
    const { bounces, views } = perPage[p];
    perPage[p].rate = views > 0 ? (bounces / views) * 100 : 0;
  });
  return perPage; // { pageId: { bounces, views, rate } }
}

export async function fetchGeoByPeriod(
  siteKey: string,
  start: Date,
  end: Date
) {
  const { sTs, eTs } = toJstRangeTimestamps(start, end);
  const qRef = query(
    collection(db, "analytics", siteKey, "geoDaily"),
    where("day", ">=", sTs),
    where("day", "<=", eTs)
  );
  const snap = await getDocs(qRef);
  const totals: Record<string, number> = {};
  snap.forEach((d) => {
    const { region, count = 0 } = d.data() as { region: string; count: number };
    totals[region] = (totals[region] || 0) + count;
  });
  return totals; // { region: count }
}

export async function fetchHourlyByPeriod(
  siteKey: string,
  start: Date,
  end: Date
) {
  const { sTs, eTs } = toJstRangeTimestamps(start, end);
  const qRef = query(
    collection(db, "analytics", siteKey, "hourlyLogs"),
    where("accessedAt", ">=", sTs),
    where("accessedAt", "<=", eTs)
  );
  const snap = await getDocs(qRef);
  const counts = Array(24).fill(0);
  snap.forEach((d) => {
    const data = d.data() as { hour?: number };
    const h = typeof data.hour === "number" ? data.hour : 0;
    if (h >= 0 && h < 24) counts[h] += 1;
  });
  return counts; // [24]
}

export async function fetchDailyByPeriod(
  siteKey: string,
  start: Date,
  end: Date
) {
  const { sTs, eTs } = toJstRangeTimestamps(start, end);
  const qRef = query(
    collection(db, "analytics", siteKey, "dailyLogs"),
    where("day", ">=", sTs),
    where("day", "<=", eTs)
  );
  const snap = await getDocs(qRef);
  const rows: { id: string; count: number; day: Date }[] = [];
  snap.forEach((d) => {
    const data = d.data() as { count?: number; day?: any };
    const dayTs = data.day?.toDate ? data.day.toDate() : undefined;
    rows.push({
      id: d.id,
      count: data.count ?? 0,
      day: dayTs ?? new Date(d.id),
    });
  });
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return rows; // ソート済み [{ id: 'YYYY-MM-DD', count, day }]
}

export async function fetchWeekdayByPeriod(
  siteKey: string,
  start: Date,
  end: Date
) {
  const { sTs, eTs } = toJstRangeTimestamps(start, end);
  const qRef = query(
    collection(db, "analytics", siteKey, "weekdayDaily"),
    where("day", ">=", sTs),
    where("day", "<=", eTs)
  );
  const snap = await getDocs(qRef);
  const idx: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const counts = Array(7).fill(0);
  snap.forEach((d) => {
    const { weekday, count = 0 } = d.data() as {
      weekday: keyof typeof idx;
      count: number;
    };
    const i = idx[weekday];
    if (i !== undefined) counts[i] += count;
  });
  return counts; // [日,月,火,水,木,金,土]
}

/* ───────── ランディング/バウンス ───────── */

// 追加：ランディングビュー（セッション開始時に1回だけ呼ぶ）
export async function logLandingView(siteKey: string, rawPageId: string) {
  const pageId = normalizePageId(rawPageId);
  if (isExcluded(pageId)) return;
  const { day, dayId } = todayKeyAndDay();
  const dayTs = jstMidnightTs(day);
  const dailyRef = doc(
    db,
    "analytics",
    siteKey,
    "bounceDaily",
    `${dayId}_${pageId}`
  );
  const aggRef = doc(db, "analytics", siteKey, "bounceStats", pageId);
  await Promise.all([
    setDoc(
      dailyRef,
      { day: dayTs, pageId, views: increment(1) },
      { merge: true }
    ),
    setDoc(aggRef, { totalViews: increment(1) }, { merge: true }),
  ]);
}

// 変更：バウンス時は bounces のみ加算（views は加算しない）
export async function logBounce(siteKey: string, rawPageId: string) {
  const pageId = normalizePageId(rawPageId);
  if (isExcluded(pageId)) return;
  const { day, dayId } = todayKeyAndDay();
  const dayTs = jstMidnightTs(day);
  const dailyRef = doc(
    db,
    "analytics",
    siteKey,
    "bounceDaily",
    `${dayId}_${pageId}`
  );
  const aggRef = doc(db, "analytics", siteKey, "bounceStats", pageId);
  await Promise.all([
    setDoc(
      dailyRef,
      { day: dayTs, pageId, bounces: increment(1) },
      { merge: true }
    ),
    setDoc(aggRef, { count: increment(1) }, { merge: true }),
  ]);
}

/* ───────── 補助（集計済み） ───────── */

export async function fetchGeoAgg(siteKey: string) {
  const snap = await getDocs(collection(db, "analytics", siteKey, "geoStats"));
  const totals: Record<string, number> = {};
  snap.forEach((d) => {
    const { count = 0 } = d.data() as { count?: number };
    totals[d.id] = count;
  });
  return totals;
}
