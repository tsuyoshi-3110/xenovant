// src/app/owner/orders/page.tsx
import { adminDb } from "@/lib/firebase-admin";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import Pager from "./Pager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderItem = { name: string; qty: number; unitAmount: number };
type Address = {
  city?: string;
  state?: string;
  line1?: string;
  line2?: string;
  postal_code?: string;
  country?: string;
};
type OrderDoc = {
  siteKey: string;
  payment_status: "paid" | "requires_action" | "canceled";
  amount_total?: number; // 最小通貨単位（JPYなら1円）
  currency?: string; // "jpy"
  createdAt?: FirebaseFirestore.Timestamp | number | string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string; // ← 追加：電話番号
    address?: Address;
  };
  /** 互換: 古いドキュメントで address がルートにある場合に備える */
  address?: Address;
  items?: OrderItem[];
};

function jpy(n: number | undefined) {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(v);
}

function tsToDate(x: unknown): Date {
  if (!x) return new Date(0);
  const anyX = x as any;
  if (typeof anyX?.toDate === "function") return anyX.toDate();
  if (typeof x === "number") return new Date(x);
  if (typeof x === "string") return new Date(x);
  return new Date(0);
}

function sum(items: OrderItem[] = []) {
  return items.reduce((a, b) => a + b.qty * b.unitAmount, 0);
}

/** customer.address 優先、なければルート address を使って整形 */
function formatAddressFromOrder(o: OrderDoc) {
  const addr: Address | undefined = o.customer?.address ?? o.address;
  if (!addr) return "—";
  const parts = [
    addr.postal_code ? `〒${addr.postal_code}` : "",
    addr.state ?? "",
    addr.city ?? "",
    addr.line1 ?? "",
    addr.line2 ?? "",
    addr.country && addr.country !== "JP" ? addr.country : "",
  ]
    .map((s) => (s || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

const PAGE_SIZE = 10;

export default async function OrdersPage({
  // ★ Next.js 15+ では searchParams は Promise。await してから使う
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams; // ← エラー修正ポイント
  const page = Math.max(1, Number(sp?.p ?? "1"));
  const startIndex = (page - 1) * PAGE_SIZE;

  const snap = await adminDb
    .collection("siteOrders")
    .where("siteKey", "==", SITE_KEY)
    .orderBy("createdAt", "desc")
    .limit(50) // 直近50件を対象にページング
    .get();

  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as OrderDoc) }));
  const pageRows = rows.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-semibold text-white text-outline">
          販売履歴
        </h1>

        {/* ← → ページング（Jotaiで状態保持&URL同期） */}
        <Pager
          initialPage={page}
          totalCount={rows.length}
          pageSize={PAGE_SIZE}
        />
      </div>

      <div className="overflow-x-auto bg-white rounded-lg shadow-md">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">日時</th>
              <th className="p-3 text-left">顧客</th>
              <th className="p-3 text-left">住所</th>
              <th className="p-3 text-left">商品</th>
              <th className="p-3 text-right">合計</th>
              <th className="p-3 text-left">ステータス</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="p-6 text-center text-gray-500" colSpan={6}>
                  販売履歴はまだありません
                </td>
              </tr>
            )}

            {pageRows.map((o) => {
              const dt = tsToDate(o.createdAt);
              const total =
                typeof o.amount_total === "number"
                  ? o.amount_total
                  : sum(o.items);
              const addressText = formatAddressFromOrder(o);

              return (
                <tr key={o.id} className="border-t align-top">
                  {/* 日時 */}
                  <td className="p-3 whitespace-nowrap text-gray-700">
                    {dt.toLocaleString("ja-JP")}
                  </td>

                  {/* 顧客（名前＋メール＋電話） */}
                  <td className="p-3">
                    <div className="font-medium">{o.customer?.name ?? "—"}</div>

                    {o.customer?.email && (
                      <div>
                        <a
                          href={`mailto:${o.customer.email}`}
                          className="text-blue-600 underline break-all"
                        >
                          {o.customer.email}
                        </a>
                      </div>
                    )}

                    <div className="text-gray-700">
                      {o.customer?.phone ? (
                        <a
                          href={`tel:${o.customer.phone.replace(/\s+/g, "")}`}
                          className="text-gray-700 underline"
                        >
                          {o.customer.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </div>
                  </td>

                  {/* 住所（customer.address 優先） */}
                  <td className="p-3 text-gray-700 break-words">
                    {addressText}
                  </td>

                  {/* 商品（縦並び） */}
                  <td className="p-3">
                    <ul className="space-y-1">
                      {(o.items ?? []).map((it, i) => (
                        <li
                          key={i}
                          className="border-b last:border-none pb-1 text-gray-800"
                        >
                          {it.name} ×{it.qty}（{jpy(it.unitAmount)}）
                        </li>
                      ))}
                    </ul>
                  </td>

                  {/* 合計 */}
                  <td className="p-3 text-right">{jpy(total)}</td>

                  {/* ステータス */}
                  <td className="p-3 text-gray-700">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        o.payment_status === "paid"
                          ? "bg-green-100 text-green-700"
                          : o.payment_status === "requires_action"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {o.payment_status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-gray-400 text-xs mt-2">
        ※ 顧客名・メール・<span className="font-medium">電話番号</span>
        ・住所・商品内容を確認のうえ、発送や連絡にご利用ください。
      </p>
    </main>
  );
}
