// app/thanks/page.tsx
import Stripe from "stripe";
import Link from "next/link";
import { redirect } from "next/navigation";

// Stripe SDK は Edge では動かしにくいので Node.js ランタイムを明示
export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// クライアント側でカートを空にするスクリプト（CartProvider が "cart:clear" を購読）
function CartClearOnMount() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cart:clear'));
          }
        `,
      }}
    />
  );
}

// searchParams は Promise として渡ってくる → await が必要
type ThanksSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: ThanksSearchParams;
}) {
  const sp = await searchParams;
  const sid = Array.isArray(sp.sid) ? sp.sid[0] : sp.sid;

  if (!sid) {
    // sid が無ければホームへ
    redirect("/");
  }

  // Checkout Session と Line Items を取得（エラー時はホームへ）
  let session: Stripe.Checkout.Session | null = null;
  let items: Stripe.LineItem[] = [];
  try {
    session = await stripe.checkout.sessions.retrieve(sid);
    const li = await stripe.checkout.sessions.listLineItems(sid, { limit: 100 });
    items = li.data;
  } catch {
    redirect("/");
  }

  const amount = session?.amount_total ?? 0;
  const orderId = session?.id ?? sid;
  const name = session?.customer_details?.name || "";
  const email = session?.customer_details?.email || "";

  return (
    <main className="min-h-[70vh] mx-auto max-w-3xl px-4 py-12">
      {/* 成功表示時にカートを空にする */}
      <CartClearOnMount />

      <h1 className="text-2xl font-bold mb-2">ご注文ありがとうございました</h1>
      <p className="text-gray-600 mb-6">
        ご注文が確定しました。内容を確認のうえ、準備を進めます。
      </p>

      {/* 注文サマリー */}
      <section className="rounded-xl border bg-white p-5 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <div className="text-sm text-gray-500">注文番号</div>
            <div className="font-mono text-lg">{orderId}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">合計金額</div>
            <div className="text-xl font-semibold">
              ¥{Number(amount).toLocaleString("ja-JP")}
            </div>
          </div>
        </div>

        {(name || email) && (
          <div className="mt-4 grid gap-1 text-sm text-gray-700">
            {name && <div>お名前：{name}</div>}
            {email && <div>メール：{email}</div>}
          </div>
        )}
      </section>

      {/* 注文明細 */}
      <section className="rounded-xl border bg-white p-5 shadow-sm mb-8">
        <h2 className="font-semibold mb-3">ご注文内容</h2>
        <div className="divide-y">
          {items.map((it) => {
            const qty = it.quantity || 1;
            const unit = it.price?.unit_amount ?? 0;
            const subtotal = unit * qty;
            return (
              <div key={it.id} className="py-3 flex items-center justify-between">
                <div className="pr-3">
                  <div className="font-medium">{it.description || "商品"}</div>
                  <div className="text-sm text-gray-500">数量：{qty}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">
                    単価：¥{Number(unit).toLocaleString("ja-JP")}
                  </div>
                  <div className="font-semibold">
                    ¥{Number(subtotal).toLocaleString("ja-JP")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 注意事項 */}
      <section className="rounded-xl border bg-white p-5 shadow-sm mb-10">
        <h2 className="font-semibold mb-3">ご案内・注意事項</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
          <li>ご注文内容の控えをメールでお送りしています。届かない場合は迷惑メールをご確認ください。</li>
          <li>お受け取り時間や変更のご希望は、注文番号を添えてお問い合わせください。</li>
          <li>キャンセルは状況により承れない場合があります。あらかじめご了承ください。</li>
        </ul>
      </section>

      <div className="flex gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-5 text-white font-medium"
        >
          ホームへ戻る
        </Link>
        <Link
          href="/products"
          className="inline-flex h-11 items-center justify-center rounded-xl border px-5 font-medium"
        >
          商品一覧を見る
        </Link>
      </div>
    </main>
  );
}
