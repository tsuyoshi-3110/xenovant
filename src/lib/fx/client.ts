// hooks/useFxRates.ts
"use client";
import { useEffect, useState } from "react";

export function useFxRates() {
  const [rates, setRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/fx?symbols=USD,EUR,KRW,TWD,CNY,HKD,GBP,SGD,AUD,CAD");
        const json = await r.json();
        const got = json?.rates ?? null;
        if (got) {
          // JPY は 1 を保証
          if (got.JPY == null) got.JPY = 1;
          setRates(got);
          return;
        }
        setRates(null);
      } catch {
        // フォールバック（キーは通貨コードのみ）
        setRates({
          JPY: 1,
          USD: 0.0066,
          EUR: 0.0061,
          KRW: 9.1,
          TWD: 0.21,
          CNY: 0.046,
          HKD: 0.053,
          GBP: 1 / 190,
          SGD: 1 / 110,
          AUD: 1 / 95,
          CAD: 1 / 110,
        });
      }
    })();
  }, []);

  return { rates };
}
