// src/app/owner/orders/Pager.tsx
"use client";

import { atom, useAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

// グローバルに共有できる pageAtom（他のページでも再利用可）
const pageAtom = atom(1);

type Props = {
  initialPage: number;
  totalCount: number;
  pageSize: number;
};

export default function Pager({ initialPage, totalCount, pageSize }: Props) {
  const router = useRouter();
  const [page, setPage] = useAtom(pageAtom);

  // URL クエリの初期値で Jotai を同期
  useEffect(() => {
    setPage(initialPage || 1);
  }, [initialPage, setPage]);

  const hasPrev = page > 1;
  const hasNext = page * pageSize < totalCount;

  const rangeText = useMemo(() => {
    if (totalCount === 0) return "0件";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalCount);
    return `${start}–${end} / ${totalCount} 件`;
  }, [page, pageSize, totalCount]);

  const go = (p: number) => {
    setPage(p);
    router.push(`?p=${p}`, { scroll: false });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={!hasPrev}
        onClick={() => hasPrev && go(page - 1)}
        className={`px-3 py-1.5 rounded border text-sm ${
          hasPrev ? "bg-white hover:bg-gray-100" : "bg-gray-200 text-gray-500"
        }`}
      >
        ← 前へ
      </button>

      <span className="text-sm text-white text-outline">{rangeText}</span>

      <button
        type="button"
        disabled={!hasNext}
        onClick={() => hasNext && go(page + 1)}
        className={`px-3 py-1.5 rounded border text-sm ${
          hasNext ? "bg-white hover:bg-gray-100" : "bg-gray-200 text-gray-500"
        }`}
      >
        次へ →
      </button>
    </div>
  );
}
