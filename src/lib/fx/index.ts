export type FxSnapshot = {
  base: "JPY";
  // 1 JPY -> X {ccy}（major）
  rates: Record<string, number>;
  asOf: string;
};

export const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND"]);

// JPY → 指定通貨の最小単位（Stripe 用）に変換
export function jpyToUnitMinorWithFx(jpy: number, ccy: string, fx: FxSnapshot): number {
  const C = (ccy || "JPY").toUpperCase();
  const rate = fx.rates[C] ?? (C === "JPY" ? 1 : undefined);
  if (!rate) throw new Error(`FX rate not found for ${C}`);
  const major = jpy * rate;
  const factor = ZERO_DECIMAL.has(C) ? 1 : 100;
  return Math.round(major * factor);
}
