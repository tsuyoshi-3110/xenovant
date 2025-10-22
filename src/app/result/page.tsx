import Link from "next/link";
import ResultClient from "./ResultClient";

type SP = { session_id?: string | string[]; status?: string | string[] };

export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const pick = (v?: string | string[] | null) =>
    Array.isArray(v) ? v[0] : v ?? undefined;

  const sessionId = pick(sp.session_id) ?? null;
  const status = pick(sp.status) ?? "unknown";

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
