import { Suspense } from "react";
import ReturnClient from "./ReturnClient";

export const dynamic = "force-dynamic";

export default function OnboardingReturnPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center">リダイレクト処理中…</div>}>
      <ReturnClient />
    </Suspense>
  );
}
