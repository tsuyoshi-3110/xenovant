import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type OrderItem = { name: string; qty: number; unitAmount: number; subtotal?: number };
type OrderDoc = {
  siteKey: string;
  payment_status: "paid" | "requires_action" | "canceled";
  amount?: number;
  amount_total?: number;
  currency?: string;
  createdAt?: FirebaseFirestore.Timestamp | number | string;
  items?: OrderItem[];
};

const TZ = "Asia/Tokyo";
const MS_DAY = 86_400_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;



function isValidDate(d: any): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}
function toDate(x: any): Date {
  if (!x) return new Date(0);
  if (typeof x?.toDate === "function") return x.toDate();
  if (typeof x === "number") return new Date(x);
  if (typeof x === "string") return new Date(x);
  return new Date(0);
}
function dateKeyJST(d: Date): string {
  const y = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, year: "numeric" }).format(d);
  const m = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, month: "2-digit" }).format(d);
  const dd = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, day: "2-digit" }).format(d);
  return `${y}-${m}-${dd}`;
}
function startOfDayJST(d: Date) {
  if (!isValidDate(d)) return new Date(0);
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60_000;
  const jstMs = utcMs + JST_OFFSET_MS;
  const jst0 = Math.floor(jstMs / MS_DAY) * MS_DAY;
  return new Date(jst0 - JST_OFFSET_MS);
}
function endOfDayJST(d: Date) { const s = startOfDayJST(d); return new Date(s.getTime() + MS_DAY - 1); }
function parseISODateJST(s?: string | null): Date | null {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00+09:00`);
  return isValidDate(d) ? d : null;
}
function sum(items: OrderItem[] = []) {
  return items.reduce((a, b) => a + (b.subtotal ?? (b.qty || 0) * (b.unitAmount || 0)), 0);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fromQ = searchParams.get("from");
  const toQ = searchParams.get("to");

  // --- 期間（JST）を厳密に決める（無指定は直近30日）---
  const now = new Date();
  let toD = parseISODateJST(toQ) ?? now;
  let fromD = parseISODateJST(fromQ) ?? new Date(now.getTime() - 29 * MS_DAY);
  if (fromD.getTime() > toD.getTime()) { const t = fromD; fromD = toD; toD = t; }

  const fromJ = startOfDayJST(fromD);
  const toJ = endOfDayJST(toD);

  // ガード：最大 366 日
  const exactDays = Math.floor((toJ.getTime() - fromJ.getTime()) / MS_DAY) + 1;
  const spanDays = Math.min(exactDays, MAX_RANGE_DAYS);

  // --- Firestore（昇順）---
  const snap = await adminDb
    .collection("siteOrders")
    .where("siteKey", "==", SITE_KEY)
    .where("createdAt", ">=", fromJ)
    .where("createdAt", "<=", toJ)
    .orderBy("createdAt", "asc")
    .get();

  const orders = snap.docs
    .map((d) => {
      const o = d.data() as OrderDoc;
      const total =
        typeof o.amount === "number" ? o.amount :
        typeof o.amount_total === "number" ? o.amount_total :
        sum(o.items);
      return { id: d.id, ...o, createdAtDate: toDate(o.createdAt), total: total || 0 };
    })
    .filter((o) => o.payment_status === "paid");

  // --- KPI ---
  const revenue = orders.reduce((a, b) => a + b.total, 0);
  const count = orders.length;
  const aov = count ? Math.round(revenue / count) : 0;

  // --- 日次（← ここで “配列長 = spanDays” を保証）---
  const byDay = new Map<string, number>();
  for (const o of orders) {
    const k = dateKeyJST(o.createdAtDate);
    byDay.set(k, (byDay.get(k) || 0) + o.total);
  }
  const days: { date: string; value: number }[] = [];
  for (let i = 0; i < spanDays; i++) {
    const key = dateKeyJST(new Date(fromJ.getTime() + i * MS_DAY));
    days.push({ date: key, value: byDay.get(key) || 0 });
  }

  return new Response(
    JSON.stringify({
      from: dateKeyJST(new Date(fromJ)),
      to: dateKeyJST(new Date(toJ)),
      dayCount: days.length,             // ← デバッグ用
      first: days[0]?.date ?? null,      // ← デバッグ用
      last: days.at(-1)?.date ?? null,   // ← デバッグ用
      days,
      kpi: { revenue, count, aov },
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
        pragma: "no-cache",
        expires: "0",
      },
    }
  );
}
