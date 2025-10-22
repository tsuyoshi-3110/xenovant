// app/areas/higashiyodogawa/page.tsx
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "東淀川区のクレープ・甘味処｜甘味処 よって屋",
  description:
    "大阪市東淀川区のクレープ・甘味は「甘味処 よって屋」へ。ご注文を受けてから焼き上げるモチモチ生地に、季節のフルーツや自家製ソースを合わせた出来たてスイーツをご提供。テイクアウト・イートイン対応。",
  alternates: { canonical: "https://xenovant.com/areas/higashiyodogawa" },
  openGraph: {
    title: "東淀川区のクレープ・甘味処｜甘味処 よって屋",
    description:
      "東淀川区（淡路・上新庄・だいどう豊里 ほか）で人気のクレープ＆甘味。季節限定や週末限定メニューも。",
    url: "https://xenovant.com/areas/higashiyodogawa",
    type: "article",
    images: [
      { url: "https://xenovant.com/ogpLogo.png", width: 1200, height: 630 },
    ],
  },
  twitter: { card: "summary_large_image" },
};

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">東淀川区のクレープ・甘味処</h1>
        <p className="text-sm text-muted-foreground">
          淡路・上新庄・だいどう豊里・井高野・柴島など東淀川区全域からご来店いただいています。
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <article className="rounded-xl border bg-white/70 p-5">
          <h2 className="font-semibold mb-2">人気メニュー</h2>
          <ul className="list-disc pl-5 text-sm space-y-1">
            <li>季節のフルーツクレープ（限定）</li>
            <li>カスタード＆生クリーム（自家製ソース）</li>
            <li>チョコバナナ／いちごみるく ほか定番</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            できたてにこだわり、注文ごとに生地から焼き上げます。
          </p>
        </article>

        <article className="rounded-xl border bg-white/70 p-5">
          <h2 className="font-semibold mb-2">ご利用シーン</h2>
          <ul className="list-disc pl-5 text-sm space-y-1">
            <li>テイクアウト／食べ歩き</li>
            <li>ちょっとした手土産・差し入れ</li>
            <li>お子さま連れ・放課後のおやつに</li>
          </ul>
        </article>
      </section>

      <section className="rounded-xl border bg-white/70 p-5">
        <h2 className="font-semibold mb-2">対応エリア（東淀川区）</h2>
        <p className="text-sm">
          淡路・東淡路・菅原・豊新・上新庄・瑞光・小松・南江口・北江口・井高野・大桐・大隅・豊里・大道南・柴島・下新庄
          ほか
        </p>
      </section>

      <section className="rounded-xl border bg-white/70 p-5">
        <h2 className="font-semibold mb-2">よくある質問</h2>

        <details className="mb-2">
          <summary className="cursor-pointer font-medium">
            テイクアウトはできますか？
          </summary>
          <p className="text-sm mt-2">
            すべてテイクアウト可能です。生クリーム多めなどのカスタムもお気軽にどうぞ。
          </p>
        </details>

        <details className="mb-2">
          <summary className="cursor-pointer font-medium">
            売り切れはありますか？
          </summary>
          <p className="text-sm mt-2">
            仕入れ状況や季節限定メニューは、材料がなくなり次第終了となる場合があります。X（旧Twitter）やInstagramで最新情報をお知らせしています。
          </p>
        </details>

        <details>
          <summary className="cursor-pointer font-medium">
            支払い方法は何がありますか？
          </summary>
          <p className="text-sm mt-2">
            現金のほか、主要キャッシュレス決済に対応しています。詳細は店頭でご確認ください。
          </p>
        </details>
      </section>

      <section className="rounded-xl border bg-white/70 p-5">
        <h2 className="font-semibold mb-2">営業時間・アクセス</h2>
        <p className="text-sm">
          営業時間・定休日はシーズンにより変動する場合があります。ご来店前に最新情報をご確認ください。
        </p>
      </section>

      {/* 内部リンクで「地域→メニュー」回遊を作る */}
      <nav className="text-sm underline">
        <Link href="/">トップ画面へ</Link>
      </nav>

      {/* FAQ構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "テイクアウトはできますか？",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "すべてテイクアウト可能です。生クリーム多めなどのカスタムもご相談ください。",
                },
              },
              {
                "@type": "Question",
                name: "売り切れはありますか？",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "季節限定や一部メニューは、材料がなくなり次第終了となる場合があります。最新情報はSNSでお知らせしています。",
                },
              },
              {
                "@type": "Question",
                name: "支払い方法は何がありますか？",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "現金に加え、主要キャッシュレス決済に対応しています（詳細は店頭でご確認ください）。",
                },
              },
            ],
          }),
        }}
      />
    </main>
  );
}
