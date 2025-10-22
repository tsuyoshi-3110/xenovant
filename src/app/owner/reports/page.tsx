// src/app/owner/reports/page.tsx
import { adminDb } from "@/lib/firebase-admin";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import ChartSparkline from "./ChartSparkline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderItem = {
  name: string;
  qty: number;
  unitAmount: number;
  subtotal?: number;
};

type OrderDoc = {
  siteKey: string;
  payment_status: "paid" | "requires_action" | "canceled";
  amount?: number; // webhook保存の新フィールド（最小通貨単位）
  amount_total?: number; // 互換
  currency?: string; // "jpy"
  createdAt?: FirebaseFirestore.Timestamp | number | string;
  items?: OrderItem[];
};

const TZ = "Asia/Tokyo";
const JPY = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
});

function toDate(x: unknown): Date {
  if (!x) return new Date(0);
  const anyX = x as any;
  if (typeof anyX?.toDate === "function") return anyX.toDate();
  if (typeof x === "number") return new Date(x);
  if (typeof x === "string") return new Date(x);
  return new Date(0);
}

function dateKeyJST(d: Date): string {
  // YYYY-MM-DD（JST基準）
  const y = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    year: "numeric",
  }).format(d);
  const m = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    month: "2-digit",
  }).format(d);
  const dd = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    day: "2-digit",
  }).format(d);
  return `${y}-${m}-${dd}`;
}

function startOfDayJST(d: Date) {
  const s = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric" }).format(
      d
    ) +
      "-" +
      new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        month: "2-digit",
      }).format(d) +
      "-" +
      new Intl.DateTimeFormat("en-CA", { timeZone: TZ, day: "2-digit" }).format(
        d
      ) +
      "T00:00:00"
  );
  return s;
}
function endOfDayJST(d: Date) {
  const s = startOfDayJST(d);
  return new Date(s.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function parseRange(from?: string, to?: string) {
  // from/to は YYYY-MM-DD（JST）想定。無ければ過去30日。
  const now = new Date();
  const toDate = to ? new Date(`${to}T00:00:00`) : now;
  const fromDate = from
    ? new Date(`${from}T00:00:00`)
    : new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  const fromJ = startOfDayJST(fromDate);
  const toJ = endOfDayJST(toDate);
  return { fromJ, toJ };
}

function sum(items: OrderItem[] = []) {
  return items.reduce((a, b) => a + (b.subtotal ?? b.qty * b.unitAmount), 0);
}

export default async function ReportsPage({
  // Next 15+ では searchParams は Promise を await する
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const { fromJ, toJ } = parseRange(from, to);

  // 期間中のオーダー取得（最新→古い）
  const snap = await adminDb
    .collection("siteOrders")
    .where("siteKey", "==", SITE_KEY)
    .where("createdAt", ">=", fromJ)
    .where("createdAt", "<=", toJ)
    .orderBy("createdAt", "asc")
    .get();

  const orders: (OrderDoc & {
    id: string;
    createdAtDate: Date;
    total: number;
  })[] = snap.docs
    .map((d) => {
      const o = d.data() as OrderDoc;
      const total =
        typeof o.amount === "number"
          ? o.amount
          : typeof o.amount_total === "number"
          ? o.amount_total
          : sum(o.items);
      return {
        id: d.id,
        ...o,
        createdAtDate: toDate(o.createdAt),
        total: total || 0,
      };
    })
    .filter((o) => o.payment_status === "paid");

  // KPI
  const revenue = orders.reduce((a, b) => a + b.total, 0);
  const count = orders.length;
  const aov = count ? Math.round(revenue / count) : 0;

  // 日次集計（JST）
  const byDay = new Map<string, number>();
  for (const o of orders) {
    const k = dateKeyJST(o.createdAtDate);
    byDay.set(k, (byDay.get(k) || 0) + o.total);
  }
  // 期間中の全日を埋める（ゼロ日もグラフに）
  const days: { date: string; value: number }[] = [];
  for (let d = fromJ.getTime(); d <= toJ.getTime(); d += 24 * 60 * 60 * 1000) {
    const key = dateKeyJST(new Date(d));
    days.push({ date: key, value: byDay.get(key) || 0 });
  }

  // トップ商品（数量／売上）
  const productQty = new Map<string, number>();
  const productRev = new Map<string, number>();
  for (const o of orders) {
    for (const it of o.items ?? []) {
      productQty.set(it.name, (productQty.get(it.name) || 0) + (it.qty || 0));
      const subtotal =
        typeof it.subtotal === "number"
          ? it.subtotal
          : (it.qty || 0) * (it.unitAmount || 0);
      productRev.set(it.name, (productRev.get(it.name) || 0) + subtotal);
    }
  }
  const topByQty = [...productQty.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topByRev = [...productRev.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // クイック期間リンク（URLクエリを変えるだけ）
  function q(fromDays: number) {
    const now = new Date();
    const toKey = dateKeyJST(now);
    const fromKey = dateKeyJST(
      new Date(now.getTime() - (fromDays - 1) * 86400000)
    );
    return `?from=${fromKey}&to=${toKey}`;
  }

  return (
    <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-white text-outline">
        売上レポート
      </h1>

      {/* 期間セレクタ */}
      <div className="flex flex-wrap gap-2">
        <a
          href={q(7)}
          className="px-3 py-1 rounded bg-gray-800 text-white hover:bg-gray-700"
        >
          直近7日
        </a>
        <a
          href={q(30)}
          className="px-3 py-1 rounded bg-gray-800 text-white hover:bg-gray-700"
        >
          直近30日
        </a>
        <a
          href={q(90)}
          className="px-3 py-1 rounded bg-gray-800 text-white hover:bg-gray-700"
        >
          直近90日
        </a>
        <a
          href={q(365)}
          className="px-3 py-1 rounded bg-gray-800 text-white hover:bg-gray-700"
        >
          直近1年
        </a>
        <span className="text-gray-300 ml-2 self-center text-sm">
          期間: {from ?? dateKeyJST(fromJ)} 〜 {to ?? dateKeyJST(toJ)}（JST）
        </span>
      </div>

      {/* KPI */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-gray-500 text-sm">売上</div>
          <div className="text-2xl font-semibold">{JPY.format(revenue)}</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-gray-500 text-sm">注文件数</div>
          <div className="text-2xl font-semibold">
            {count.toLocaleString("ja-JP")}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-gray-500 text-sm">平均客単価</div>
          <div className="text-2xl font-semibold">{JPY.format(aov)}</div>
        </div>
      </section>

      {/* 日次推移（SVGスパークライン） */}
      <section className="bg-white rounded-lg p-4 shadow">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">日次売上推移</h2>
          <div className="text-sm text-gray-500">単位：円</div>
        </div>
        <ChartSparkline data={days} height={220} />
      </section>

      {/* トップ商品 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-2">トップ商品（数量）</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1">商品名</th>
                <th className="py-1 w-24 text-right">数量</th>
              </tr>
            </thead>
            <tbody>
              {topByQty.map(([name, qty]) => (
                <tr key={name} className="border-t">
                  <td className="py-1 pr-2">{name}</td>
                  <td className="py-1 text-right">
                    {qty.toLocaleString("ja-JP")}
                  </td>
                </tr>
              ))}
              {topByQty.length === 0 && (
                <tr>
                  <td className="py-3 text-gray-500" colSpan={2}>
                    データなし
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-2">トップ商品（売上）</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1">商品名</th>
                <th className="py-1 w-32 text-right">売上</th>
              </tr>
            </thead>
            <tbody>
              {topByRev.map(([name, rev]) => (
                <tr key={name} className="border-t">
                  <td className="py-1 pr-2">{name}</td>
                  <td className="py-1 text-right">{JPY.format(rev)}</td>
                </tr>
              ))}
              {topByRev.length === 0 && (
                <tr>
                  <td className="py-3 text-gray-500" colSpan={2}>
                    データなし
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-gray-400 text-xs">
        ※ 期間指定は URL の <code>?from=YYYY-MM-DD&amp;to=YYYY-MM-DD</code>{" "}
        で指定可能（JST）。
      </p>
    </main>
  );
}
