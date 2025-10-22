// app/analytics/guide/page.tsx
// アクセス解析の見方（説明書ページ）
// - App Router 用のシンプルなサーバーコンポーネント
// - Tailwind ベース（shadcn/ui 不要）
// - 「人数」と「回数」の違いを分かりやすく強調

export default function AnalyticsGuidePage() {
  const SECTIONS = [
    { id: "pv", title: "1. ページ別アクセス数（PV）" },
    { id: "stay", title: "2. 平均滞在時間" },
    { id: "hourly", title: "3. 時間帯別アクセス" },
    { id: "weekday", title: "4. 曜日別アクセス" },
    { id: "daily", title: "5. 日別アクセスの推移" },
    { id: "referrer", title: "6. 流入元（SNS / 検索 / 直接）" },
    { id: "visitor", title: "7. 新規 vs. リピーター" },
    { id: "bounce", title: "8. 直帰率" },
    { id: "geo", title: "9. 地域別アクセス" },
    { id: "summary", title: "まとめ（人数と回数の違い）" },
    { id: "faq", title: "よくある質問（FAQ）" },
  ];

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 text-gray-900 bg-white/70">
      {/* ヘッダー */}
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          アクセス解析の見方（説明書）
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          最終更新：{new Date().toLocaleDateString("ja-JP")}
        </p>
      </header>

      {/* イントロ */}
      <section className="mb-8">
        <p className="leading-relaxed">
          このページは、アクセス解析画面に表示される各グラフや数値を
          「これは人数なのか？回数なのか？」を分かりやすく整理した説明書です。
          スタッフやお客様にも共有できるよう、専門用語をできるだけ避けています。
        </p>
      </section>

      {/* 目次 */}
      <nav className="mb-10 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="font-semibold mb-3">目次</h2>
        <ol className="grid gap-2 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-blue-700 hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* 基本の考え方 */}
      <section className="mb-10">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <h3 className="font-semibold mb-2">
            まず大前提：「人数」と「回数」は違います
          </h3>
          <p className="text-sm leading-relaxed">
            <span className="font-medium">人数</span>は
            「その期間に訪れた人（ブラウザ単位）」。
            <span className="font-medium">回数</span>は
            「ページが開かれた数」や「訪問（セッション）」のことです。
            1人が5ページ見れば → <strong>人数は1</strong>、<strong>PVは5</strong> です。
            グラフによって母数が異なるため、
            「人数なのか？回数なのか？」を意識して見るのがコツです。
          </p>
        </div>
      </section>

      {/* 各指標 */}
      <section id="pv" className="mb-10 scroll-mt-24">
        <h2 className="text-xl font-bold mb-3">1. ページ別アクセス数（PV）</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><span className="font-medium">数えているもの：</span> ページが開かれた<strong>回数</strong></li>
          <li><span className="font-medium">注意：</span> 同じ人が何度見ても、その回数分カウントされます（＝人数ではありません）</li>
        </ul>
      </section>

      <section id="stay" className="mb-10 scroll-mt-24">
        <h2 className="text-xl font-bold mb-3">2. 平均滞在時間</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><span className="font-medium">数えているもの：</span> ページに滞在した<strong>時間（秒）</strong></li>
          <li><span className="font-medium">計算方法：</span> ページを離れた時点で滞在秒数を記録 → 平均 = 合計秒数 ÷ 回数</li>
        </ul>
      </section>

      <section id="hourly" className="mb-10 scroll-mt-24">
        <h2 className="text-xl font-bold mb-3">3. 時間帯別アクセス</h2>
        <p className="text-sm">どの時間にアクセスが多いか。<strong>PV（回数）</strong>を基準にしています。</p>
      </section>

      <section id="weekday" className="mb-10 scroll-mt-24">
        <h2 className="text-xl font-bold mb-3">4. 曜日別アクセス</h2>
        <p className="text-sm">どの曜日にアクセスが多いか。<strong>PV（回数）</strong>を基準にしています。</p>
      </section>

      <section id="daily" className="mb-10 scroll-mt-24">
        <h2 className="text-xl font-bold mb-3">5. 日別アクセスの推移</h2>
        <p className="text-sm">日ごとのアクセス数。これも<strong>PV（回数）</strong>です。<br/>
        「その日に来た人数」ではなく、「その日に記録されたページアクセスの合計」です。</p>
      </section>

      <section id="referrer" className="mb-10 scroll-mt-24">
        <h2 className="text-xl font-bold mb-3">6. 流入元（SNS / 検索 / 直接）</h2>
        <p className="text-sm">訪問のきっかけを<strong>セッション（訪問回数）</strong>単位で集計。</p>
        <ul className="list-disc pl-5 mt-2 text-sm">
          <li>Google / Yahoo / Bing → 検索</li>
          <li>参照元が取れない場合 → 直接</li>
          <li>それ以外の外部サイト → SNSなど</li>
        </ul>
      </section>

      <section id="visitor" className="mb-10 scroll-mt-24">
        <h2 className="text-xl font-bold mb-3">7. 新規 vs. リピーター</h2>
        <p className="text-sm">これは<strong>人数</strong>です。ブラウザごとに匿名IDを付与し、初回なら「新規」、再訪なら「リピーター」として日ごとにカウントします。</p>
      </section>

      <section id="bounce" className="mb-10 scroll-mt-24">
        <h2 className="text-xl font-bold mb-3">8. 直帰率</h2>
        <p className="text-sm">
          最初のページだけ見て離脱した割合。<br />
          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">直帰率 = 直帰数 ÷ ランディングPV × 100</code>
        </p>
      </section>

      <section id="geo" className="mb-10 scroll-mt-24">
        <h2 className="text-xl font-bold mb-3">9. 地域別アクセス</h2>
        <ul className="list-disc pl-5 text-sm space-y-2">
          <li><span className="font-medium">数えているもの：</span> 初回アクセス時のIPから推定した<strong>セッション（訪問回数）</strong></li>
          <li><span className="font-medium">注意：</span> 「人数」ではありません。同じ人でも別タブや別ブラウザを開けば複数カウントされます。</li>
          <li><span className="font-medium">用途：</span> 商圏の把握、広告の地域ターゲティングに役立ちます。</li>
        </ul>
      </section>

      {/* まとめ */}
      <section id="summary" className="mb-10 scroll-mt-24">
        <h2 className="text-xl font-bold mb-3">まとめ：人数と回数の違い</h2>
        <table className="w-full text-sm border">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">指標</th>
              <th className="p-2 border">何を数える？</th>
              <th className="p-2 border">単位</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border">ページ/時間帯/曜日/日別</td>
              <td className="p-2 border">ページが開かれた回数</td>
              <td className="p-2 border">PV（回数）</td>
            </tr>
            <tr>
              <td className="p-2 border">流入元</td>
              <td className="p-2 border">訪問のきっかけ</td>
              <td className="p-2 border">セッション（訪問回数）</td>
            </tr>
            <tr>
              <td className="p-2 border">新規/リピーター</td>
              <td className="p-2 border">訪問した人</td>
              <td className="p-2 border">人数</td>
            </tr>
            <tr>
              <td className="p-2 border">直帰率</td>
              <td className="p-2 border">1ページだけで離脱</td>
              <td className="p-2 border">ランディングPV基準</td>
            </tr>
            <tr>
              <td className="p-2 border">地域</td>
              <td className="p-2 border">初回訪問時の地域</td>
              <td className="p-2 border">セッション（訪問回数）</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* FAQ */}
      <section id="faq" className="mb-20 scroll-mt-24">
        <h2 className="text-xl font-bold mb-3">よくある質問</h2>
        <div className="space-y-4 text-sm">
          <div className="border p-3 rounded">
            <p className="font-medium">Q. 数字が合わないのは不具合？</p>
            <p>A. 不具合ではありません。指標ごとに「人数」「PV」「セッション」で母数が違います。</p>
          </div>
          <div className="border p-3 rounded">
            <p className="font-medium">Q. 1日の来訪人数を知りたい</p>
            <p>A. 「新規/リピーター」の合計が人数です。「日別アクセス数」はPV（回数）なので人数とは異なります。</p>
          </div>
          <div className="border p-3 rounded">
            <p className="font-medium">Q. 地域別は人数？</p>
            <p>A. いいえ。セッション（訪問回数）です。人数ではありません。</p>
          </div>
        </div>
      </section>
    </main>
  );
}
