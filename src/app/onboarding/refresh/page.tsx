export default function OnboardingRefresh() {
  return (
    <main className="max-w-md mx-auto p-6 text-center">
      <h1 className="text-xl font-bold mb-3">Stripe 連携</h1>
      <p className="mb-6">入力を中断しました。もう一度お試しください。</p>
      <a href="/login" className="px-4 py-2 inline-block rounded bg-black text-white">管理画面へ戻る</a>
    </main>
  );
}
