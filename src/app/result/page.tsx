import Link from "next/link";
import ResultClient from "./ResultClient";

export default function ResultPage({
  searchParams,
}: {
  searchParams: { session_id?: string; status?: string };
}) {
  const sessionId = searchParams.session_id ?? null;
  const status = searchParams.status ?? "unknown";

  return (
    <main className="min-h-[60vh] max-w-lg mx-auto p-6 pt-24 space-y-6">
      <h1 className="text-2xl font-bold">お支払い結果</h1>

      {!sessionId ? (
        <>
          <p>セッションIDが見つかりませんでした。</p>
          <Link href="/" className="text-blue-600 underline">
            ホームへ戻る
          </Link>
        </>
      ) : (
        <ResultClient sessionId={sessionId} statusParam={status} />
      )}
    </main>
  );
}
