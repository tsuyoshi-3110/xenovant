import { adminDb } from "@/lib/firebase-admin";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import SalesLine from "./SalesLine";
import InsightsPanel from "./InsightsPanel"; // ← これだけでOK（"use client" 側で宣言済み）

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // これはルート設定なのでそのままでOK
export const revalidate = 0;

/* ================== Types ================== */
type OrderItem = {
  name: string;
  qty: number;
  unitAmount: number;
  subtotal?: number;
};
type OrderDoc = {
  siteKey: string;
  payment_status: "paid" | "requires_action" | "canceled";
  amount?: number;
  amount_total?: number;
  currency?: string;
  createdAt?: FirebaseFirestore.Timestamp | number | string;
  items?: OrderItem[];
};

/* ================== Consts ================== */
const MS_DAY = 86_400_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

const JPY = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
});

/* ================== Utils ================== */
function isValidDate(d: any): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}
function toDate(x: unknown): Date {
  if (!x) return new Date(0);
  const anyX = x as any;
  if (typeof anyX?.toDate === "function") return anyX.toDate();
  if (typeof x === "number") return new Date(x);
  if (typeof x === "string") return new Date(x);
  return new Date(0);
}
function firstStr(v?: string | string[]) {
  return Array.isArray(v) ? v[0] : v;
}

/** JSTの当日0:00を表すDate(UTC) */
function startOfDayJST(d: Date) {
  if (!isValidDate(d)) return new Date(0);
  const jstMs = d.getTime() + JST_OFFSET_MS;
  const jstMidnightMs = Math.floor(jstMs / MS_DAY) * MS_DAY;
  return new Date(jstMidnightMs - JST_OFFSET_MS);
}
function endOfDayJST(d: Date) {
  const s = startOfDayJST(d);
  return new Date(s.getTime() + MS_DAY - 1);
}

/** YYYY-MM-DD（固定）を受け取り、JST 0:00 のDateを返す */
function parseISODateJST(s?: string | string[]): Date | null {
  const v = firstStr(s);
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00+09:00`);
  return isValidDate(d) ? d : null;
}

/** JSTのDateから YYYY-MM-DD（固定）を生成 */
function isoKeyJST(d: Date): string {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  const y = j.getUTCFullYear();
  const m = String(j.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(j.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** 期間パース：from/to は JST YYYY-MM-DD。無指定は直近30日。 */
function parseRange(from?: string | string[], to?: string | string[]) {
  const now = new Date();
  let toD = parseISODateJST(to) ?? now;
  let fromD = parseISODateJST(from) ?? new Date(now.getTime() - 29 * MS_DAY);

  if (fromD.getTime() > toD.getTime()) {
    const t = fromD;
    fromD = toD;
    toD = t;
  }
  const spanDays =
    Math.floor(
      (endOfDayJST(toD).getTime() - startOfDayJST(fromD).getTime()) / MS_DAY
    ) + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    fromD = new Date(toD.getTime() - (MAX_RANGE_DAYS - 1) * MS_DAY);
  }
  return { fromJ: startOfDayJST(fromD), toJ: endOfDayJST(toD) };
}

function sum(items: OrderItem[] = []) {
  return items.reduce(
    (a, b) => a + (b.subtotal ?? (b.qty || 0) * (b.unitAmount || 0)),
    0
  );
}

/* ================== Page ================== */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { fromJ, toJ } = parseRange(sp.from, sp.to);

  // Firestore：期間内（昇順）
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

  /* ========= KPI ========= */
  const revenue = orders.reduce((a, b) => a + b.total, 0);
  const count = orders.length;
  const aov = count ? Math.round(revenue / count) : 0;

  /* ========= 日次（JST 0:00 単位） ========= */
  const byDay = new Map<string, number>();
  for (const o of orders) {
    const k = isoKeyJST(o.createdAtDate);
    byDay.set(k, (byDay.get(k) || 0) + o.total);
  }

  // `days`：ISOキー＋JST 0:00 のUNIX ms（数値軸用）
  const days: { date: string; value: number; ts: number }[] = [];
  for (
    let t = startOfDayJST(fromJ).getTime();
    t <= endOfDayJST(toJ).getTime();
    t += MS_DAY
  ) {
    const dJ = new Date(t);
    const key = isoKeyJST(dJ);
    const ts = startOfDayJST(dJ).getTime();
    days.push({ date: key, value: byDay.get(key) || 0, ts });
  }

  /* ========= トップ商品 ========= */
  const productQty = new Map<string, number>();
  const productRev = new Map<string, number>();
  for (const o of orders) {
    for (const it of o.items ?? []) {
      const name = it.name ?? "(no name)";
      productQty.set(name, (productQty.get(name) || 0) + (it.qty || 0));
      const subtotal =
        typeof it.subtotal === "number"
          ? it.subtotal
          : (it.qty || 0) * (it.unitAmount || 0);
      productRev.set(name, (productRev.get(name) || 0) + subtotal);
    }
  }
  const topByQty = [...productQty.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topByRev = [...productRev.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  /* ========= クイック期間リンク（ISO固定で埋める） ========= */
  function q(fromDays: number) {
    const now = new Date();
    const toKey = isoKeyJST(now);
    const fromKey = isoKeyJST(
      new Date(now.getTime() - (fromDays - 1) * MS_DAY)
    );
    return `?from=${fromKey}&to=${toKey}`;
  }

  const fromKeyDisp = firstStr(sp.from) ?? isoKeyJST(fromJ);
  const toKeyDisp = firstStr(sp.to) ?? isoKeyJST(toJ);

  // 期間が変わるたびに確実に再マウント
  const rangeKey = `${startOfDayJST(fromJ).getTime()}-${endOfDayJST(
    toJ
  ).getTime()}-${days.length}`;

  /* ========= 期間セレクタのアクティブ判定とスタイル ========= */
  const todayIso = isoKeyJST(new Date());
  const toIso = isoKeyJST(toJ);
  const fromIso = isoKeyJST(fromJ);

  function isQuickActive(n: number) {
    if (toIso !== todayIso) return false; // 「今日」で終わる区間のみQuick一致とみなす
    const expectedFromIso = isoKeyJST(new Date(Date.now() - (n - 1) * MS_DAY));
    return fromIso === expectedFromIso;
  }
  function btnClass(active: boolean) {
    const base =
      "px-3 py-1.5 rounded-full border text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1";
    return active
      ? `${base} bg-blue-600 text-white border-blue-600 shadow focus:ring-blue-300`
      : `${base} bg-gray-800 text-gray-100 border-gray-700 hover:bg-gray-700 focus:ring-gray-400`;
  }

  /* ========= Render ========= */
  return (
    <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-white text-outline">
        売上レポート
      </h1>

      {/* 期間セレクタ（ISO固定） */}
      <div className="flex flex-wrap gap-2">
        <a
          href={q(7)}
          className={btnClass(isQuickActive(7))}
          aria-pressed={isQuickActive(7)}
        >
          直近7日
        </a>
        <a
          href={q(30)}
          className={btnClass(isQuickActive(30))}
          aria-pressed={isQuickActive(30)}
        >
          直近30日
        </a>
        <a
          href={q(90)}
          className={btnClass(isQuickActive(90))}
          aria-pressed={isQuickActive(90)}
        >
          直近90日
        </a>
        <a
          href={q(365)}
          className={btnClass(isQuickActive(365))}
          aria-pressed={isQuickActive(365)}
        >
          直近1年
        </a>

        <span className="text-gray-300 ml-2 self-center text-sm">
          期間: {fromKeyDisp} 〜 {toKeyDisp}（JST）
        </span>
      </div>

      {/* KPI */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/95 backdrop-blur rounded-2xl p-5 shadow-lg border border-gray-200">
          <div className="text-gray-500 text-sm">売上</div>
          <div className="text-2xl font-semibold">{JPY.format(revenue)}</div>
        </div>
        <div className="bg-white/95 backdrop-blur rounded-2xl p-5 shadow-lg border border-gray-200">
          <div className="text-gray-500 text-sm">注文件数</div>
          <div className="text-2xl font-semibold">
            {count.toLocaleString("ja-JP")}
          </div>
        </div>
        <div className="bg-white/95 backdrop-blur rounded-2xl p-5 shadow-lg border border-gray-200">
          <div className="text-gray-500 text-sm">平均客単価</div>
          <div className="text-2xl font-semibold">{JPY.format(aov)}</div>
        </div>
      </section>

      {/* 日次推移（時間スケールでX軸は期間に完全追従） */}
      <section className="bg-white/95 backdrop-blur rounded-2xl p-5 shadow-lg border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">日次売上推移</h2>
          <div className="text-sm text-gray-500">単位：円</div>
        </div>
        <SalesLine
          key={rangeKey}
          data={days.map((d) => ({ ts: d.ts, value: d.value }))}
          height={420}
        />
      </section>

      {/* AI 改善提案パネル（新規） */}
      <InsightsPanel
        payload={{
          siteKey: String(SITE_KEY),
          range: { from: fromKeyDisp, to: toKeyDisp },
          kpis: { revenue, count, aov },
          days: days.map((d) => ({ date: d.date, value: d.value })),
          topByQty,
          topByRev,
          currency: "jpy",
        }}
      />

      {/* トップ商品 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white/95 backdrop-blur rounded-2xl p-5 shadow-lg border border-gray-200">
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

        <div className="bg-white/95 backdrop-blur rounded-2xl p-5 shadow-lg border border-gray-200">
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
