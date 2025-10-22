// app/owner/inventory/page.tsx
// ------------------------------------------------------------
// Pageit 在庫管理（スマホ最適・自動連携/採番/削除）
// すべてのテキスト＝黒 / カード背景＝ bg-white/70
// ------------------------------------------------------------

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  getDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, AlertTriangle, LogIn, Plus, Minus } from "lucide-react";

// ---------- 型 ----------
type ProductDoc = {
  id: string;
  siteKey: string;
  productId?: string;
  name?: string;
  base?: { title?: string; body?: string };
  [k: string]: any;
};

type StockDoc = {
  id: string; // `${SITE_KEY}__p:${productId}`
  siteKey: string;
  productId: string;
  sku?: string; // 自動採番の「商品コード」
  name?: string;
  stockQty: number;
  lowStockThreshold: number;
  updatedAt?: any;
};

type Row = { product: ProductDoc; stock?: StockDoc | null };

// ---------- ヘルパ ----------
const prodName = (p: ProductDoc) =>
  (p.base?.title ?? p.name ?? "").trim() || "(名称未設定)";
const productIdOf = (p: ProductDoc) => p.productId || p.id;
const fmtTs = (ts?: any) =>
  ts?.toDate ? new Date(ts.toDate()).toLocaleString() : "-";
const pad4 = (n: number) => String(n).padStart(4, "0");

function statusOf(s?: StockDoc | null) {
  if (!s) return { label: "在庫未設定", tone: "neutral" as const };
  if ((s.stockQty ?? 0) <= 0)
    return { label: "在庫なし", tone: "destructive" as const };
  if ((s.stockQty ?? 0) <= (s.lowStockThreshold || 0))
    return { label: "在庫少なめ", tone: "warning" as const };
  return { label: "在庫あり", tone: "success" as const };
}

// ---------- インライン数値入力 ----------
function EditableNumber({
  value,
  disabled,
  onCommit,
  className = "",
  align = "center",
}: {
  value: number;
  disabled?: boolean;
  onCommit: (n: number) => Promise<void> | void;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));
  useEffect(() => {
    if (!editing) setVal(String(value));
  }, [value, editing]);

  async function commit(v: string) {
    const n = Math.max(0, Math.floor(Number(v || 0)));
    if (n !== value) await onCommit(n);
    setEditing(false);
  }

  if (editing && !disabled) {
    return (
      <Input
        autoFocus
        type="number"
        inputMode="numeric"
        min={0}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => commit(val)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(val);
          if (e.key === "Escape") setEditing(false);
        }}
        className={`h-10 w-16 text-lg font-medium ${className}`}
        style={{ textAlign: align }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`h-10 w-16 select-none rounded-lg border border-transparent px-1 font-mono text-lg font-medium tabular-nums hover:border-black/30 ${className}`}
      style={{ textAlign: align }}
      onClick={() => !disabled && setEditing(true)}
      disabled={!!disabled}
      title="タップして数値を入力"
    >
      {value}
    </button>
  );
}

// ---------- − 数値 ＋（サイズ揃え） ----------
function Stepper({
  value,
  disabled,
  onMinus,
  onPlus,
  onCommit,
  ariaMinus = "1減らす",
  ariaPlus = "1増やす",
}: {
  value: number;
  disabled?: boolean;
  onMinus: () => void;
  onPlus: () => void;
  onCommit: (n: number) => Promise<void> | void;
  ariaMinus?: string;
  ariaPlus?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        aria-label={ariaMinus}
        size="icon"
        variant="outline"
        className="h-10 w-10 rounded-lg"
        onClick={onMinus}
        disabled={disabled}
        title={ariaMinus}
      >
        <Minus className="h-5 w-5" />
      </Button>

      <EditableNumber value={value} disabled={disabled} onCommit={onCommit} />

      <Button
        aria-label={ariaPlus}
        size="icon"
        variant="outline"
        className="h-10 w-10 rounded-lg"
        onClick={onPlus}
        disabled={disabled}
        title={ariaPlus}
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}

// ---------- 画面本体 ----------
export default function InventoryPage() {
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [stocks, setStocks] = useState<StockDoc[]>([]);
  const [qText, setQText] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [permError, setPermError] = useState<null | string>(null);
  const [busyAuto, setBusyAuto] = useState(false);
  const [busyClean, setBusyClean] = useState(false);
  const didInit = useRef(false);

  // 認証状態
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setLoggedIn(!!u));
    return () => unsub();
  }, []);

  // 商品購読（公開）
  useEffect(() => {
    const col = collection(db, "siteProducts", SITE_KEY, "items");
    const unsub = onSnapshot(
      col,
      (snap) => {
        const arr: ProductDoc[] = snap.docs.map((d) => ({
          id: d.id,
          siteKey: SITE_KEY,
          ...(d.data() as any),
        }));
        arr.sort((a, b) => prodName(a).localeCompare(prodName(b), "ja"));
        setProducts(arr);
      },
      (err) => console.error("[products]", err.code, err.message)
    );
    return () => unsub();
  }, []);

  // 在庫購読（ログイン後）
  useEffect(() => {
    if (!loggedIn) return;
    const qRef = query(
      collection(db, "stock"),
      where("siteKey", "==", SITE_KEY)
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const arr: StockDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setStocks(arr);
        setPermError(null);
      },
      (err) => {
        console.error("[stock]", err.code, err.message);
        setPermError(
          err.code === "permission-denied"
            ? "在庫の表示・変更にはログインが必要です。"
            : "在庫の取得に失敗しました。"
        );
      }
    );
    return () => unsub();
  }, [loggedIn]);

  // ===== 自動連携（初回だけ）=====
  useEffect(() => {
    if (!loggedIn || didInit.current || !products.length) return;

    (async () => {
      didInit.current = true;
      setBusyAuto(true);
      try {
        // 未連携 → 自動作成
        const existing = new Set(stocks.map((s) => s.productId));
        for (const p of products) {
          if (!existing.has(productIdOf(p))) {
            try {
              await ensureStockWithAutoCode(p);
            } catch (e) {
              console.error("ensureStockWithAutoCode failed", e);
            }
          }
        }
      } finally {
        setBusyAuto(false);
      }

      // 商品から消えた在庫 → 自動削除
      const ids = new Set(products.map((p) => productIdOf(p)));
      const orphans = stocks.filter((s) => !ids.has(s.productId));
      if (orphans.length) {
        setBusyClean(true);
        try {
          for (const s of orphans) await deleteDoc(doc(db, "stock", s.id));
        } catch (e) {
          console.error("auto delete stock failed", e);
        } finally {
          setBusyClean(false);
        }
      }
    })();
  }, [loggedIn, products, stocks]);

  // ===== 在庫：± と直接設定 =====
  async function adjustQty(row: Row, delta: number) {
    const stock = row.stock ?? (await ensureStockWithAutoCode(row.product));
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "stock", stock.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("在庫が見つかりません");
      const cur = snap.data() as any;
      const before = Number(cur.stockQty) || 0;
      const after = Math.max(0, before + Number(delta));
      tx.update(ref, { stockQty: after, updatedAt: serverTimestamp() });

      const logRef = doc(collection(db, "stockAdjustments"));
      tx.set(logRef, {
        siteKey: SITE_KEY,
        stockId: stock.id,
        sku: cur.sku || null,
        delta: after - before,
        type: after - before >= 0 ? "increment" : "decrement",
        beforeQty: before,
        afterQty: after,
        reason: "manual",
        userId: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
      });
    });
  }
  async function setQty(row: Row, newQty: number) {
    const stock = row.stock ?? (await ensureStockWithAutoCode(row.product));
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "stock", stock.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("在庫が見つかりません");
      const cur = snap.data() as any;
      const before = Number(cur.stockQty) || 0;
      const after = Math.max(0, Math.floor(newQty));
      tx.update(ref, { stockQty: after, updatedAt: serverTimestamp() });

      const logRef = doc(collection(db, "stockAdjustments"));
      tx.set(logRef, {
        siteKey: SITE_KEY,
        stockId: stock.id,
        sku: cur.sku || null,
        delta: after - before,
        type: "set",
        beforeQty: before,
        afterQty: after,
        reason: "manual-set",
        userId: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
      });
    });
  }

  // ===== しきい値：± と直接設定 =====
  async function adjustThreshold(row: Row, delta: number) {
    const stock = row.stock ?? (await ensureStockWithAutoCode(row.product));
    const next = Math.max(0, (stock.lowStockThreshold ?? 0) + delta);
    await updateThreshold(stock.id, next);
  }
  async function setThreshold(row: Row, n: number) {
    const stock = row.stock ?? (await ensureStockWithAutoCode(row.product));
    await updateThreshold(stock.id, n);
  }
  async function updateThreshold(stockId: string, n: number) {
    const val = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
    await updateDoc(doc(db, "stock", stockId), {
      lowStockThreshold: val,
      updatedAt: serverTimestamp(),
    });
  }

  // 在庫生成 & 自動採番（読み→書きの順に統一）
  async function ensureStockWithAutoCode(p: ProductDoc): Promise<StockDoc> {
    const productId = productIdOf(p);
    const name = prodName(p);
    const stockId = `${SITE_KEY}__p:${productId}`;
    const stockRef = doc(db, "stock", stockId);
    const counterRef = doc(db, "inventoryCounters", SITE_KEY);

    await runTransaction(db, async (tx) => {
      const sSnap = await tx.get(stockRef);
      const cSnap = await tx.get(counterRef);
      const last =
        (cSnap.exists() ? Number((cSnap.data() as any)?.last) : 0) || 0;

      if (sSnap.exists()) {
        const cur = sSnap.data() as any;
        if (!cur?.sku) {
          const next = last + 1;
          tx.set(
            counterRef,
            { last: next, siteKey: SITE_KEY, updatedAt: serverTimestamp() },
            { merge: true }
          );
          tx.update(stockRef, {
            siteKey: SITE_KEY,
            productId,
            sku: `P${pad4(next)}`,
            name,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.update(stockRef, {
            siteKey: SITE_KEY,
            productId,
            name,
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        const next = last + 1;
        tx.set(
          counterRef,
          { last: next, siteKey: SITE_KEY, updatedAt: serverTimestamp() },
          { merge: true }
        );
        tx.set(stockRef, {
          id: stockId,
          siteKey: SITE_KEY,
          productId,
          sku: `P${pad4(next)}`,
          name,
          stockQty: 0,
          lowStockThreshold: 0,
          updatedAt: serverTimestamp(),
        } as StockDoc);
      }
    });

    const after = await getDoc(stockRef);
    return { id: stockRef.id, ...(after.data() as any) } as StockDoc;
  }

  // ---------- 表示用データ ----------
  const rows: Row[] = useMemo(() => {
    const byPid = new Map<string, StockDoc>();
    for (const s of stocks) byPid.set(s.productId, s);
    return products.map((p) => ({
      product: p,
      stock: byPid.get(productIdOf(p)) || null,
    }));
  }, [products, stocks]);

  const filtered = useMemo(() => {
    const q = qText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ product, stock }) => {
      const name = prodName(product).toLowerCase();
      const code = (stock?.sku || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [qText, rows]);

  const lowStockExists = rows.some(
    (r) => r.stock && r.stock.stockQty <= (r.stock.lowStockThreshold || 0)
  );

  // ---------- UI ----------
  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-4 md:p-6 text-black">
      <Card className="border-gray-300 bg-white/70">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-lg sm:text-xl md:text-2xl text-black">
                在庫管理
              </CardTitle>
              <p className="mt-1 text-xs sm:text-sm">
                操作：<strong>＋/−</strong>で1個増減。
                <strong>数字をタップ</strong>
                すると直接入力できます。商品コードは自動採番です。
              </p>
            </div>
            <div className="relative w-full md:w-auto">
              <Input
                placeholder="商品名 / 商品コード で検索"
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                className="pl-9 w-full md:w-80"
              />
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {!loggedIn && (
            <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-100 p-3">
              <LogIn className="h-4 w-4" />
              <span>在庫の表示・変更にはログインが必要です。</span>
            </div>
          )}
          {(busyAuto || busyClean) && loggedIn && (
            <div className="rounded-md border border-gray-300 bg-gray-100 p-3">
              自動セットアップ中（在庫の自動作成/削除）…
            </div>
          )}
          {permError && (
            <div className="rounded-md border border-red-300 bg-red-100 p-3">
              {permError}
            </div>
          )}
          {lowStockExists && (
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              <span>在庫が少ない商品があります（しきい値以下）。</span>
            </div>
          )}

          {/* モバイル：カード */}
          <div className="grid gap-2 md:hidden">
            {filtered.map(({ product, stock }) => {
              const st = statusOf(stock || undefined);
              const name = prodName(product);
              const code = stock?.sku || "";
              const row: Row = { product, stock: stock || null };

              return (
                <div
                  key={product.id}
                  className="rounded-xl border border-gray-300 bg-white/70 p-3"
                >
                  {/* 上段：状態＋名前 */}
                  <div className="mb-2 flex items-start gap-2">
                    {st.tone === "destructive" ? (
                      <Badge className="shrink-0 bg-red-200 text-black">
                        在庫なし
                      </Badge>
                    ) : st.tone === "warning" ? (
                      <Badge className="shrink-0 bg-amber-200 text-black">
                        在庫少なめ
                      </Badge>
                    ) : st.tone === "success" ? (
                      <Badge className="shrink-0 bg-green-200 text-black">
                        在庫あり
                      </Badge>
                    ) : (
                      <Badge className="shrink-0 bg-gray-200 text-black">
                        在庫未設定
                      </Badge>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold leading-snug break-words">
                        {name}
                      </div>
                    </div>
                  </div>

                  {/* 商品コード */}
                  <div className="text-xs">
                    <span className="inline-block w-20 text-gray-600">
                      商品コード
                    </span>
                    <span className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[11px]">
                      {code || "（自動割当）"}
                    </span>
                  </div>

                  {/* 在庫 */}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm">現在の在庫</div>
                    <Stepper
                      value={stock?.stockQty ?? 0}
                      disabled={!loggedIn}
                      onMinus={() => adjustQty(row, -1)}
                      onPlus={() => adjustQty(row, +1)}
                      onCommit={(n) => setQty(row, n)}
                    />
                  </div>

                  {/* しきい値 */}
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-sm">
                      しきい値（この数以下で「在庫少なめ」）
                    </div>
                    <Stepper
                      value={stock?.lowStockThreshold ?? 0}
                      disabled={!loggedIn || !stock}
                      onMinus={() => adjustThreshold(row, -1)}
                      onPlus={() => adjustThreshold(row, +1)}
                      onCommit={(n) => setThreshold(row, n)}
                    />
                  </div>

                  {/* 最終更新（カード最下段） */}
                  <div className="mt-3 border-t border-gray-200 pt-2 text-[11px] text-gray-700">
                    最終更新：{fmtTs(stock?.updatedAt)}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="py-12 text-center text-gray-700">
                該当する商品がありません
              </div>
            )}
          </div>

          {/* デスクトップ：テーブル */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-black">
                <tr>
                  <th className="px-3 py-2">状態</th>
                  <th className="px-3 py-2">商品名</th>
                  <th className="px-3 py-2">商品コード</th>
                  <th className="px-3 py-2 text-right">現在の在庫</th>
                  <th className="px-3 py-2 text-right">しきい値</th>
                  <th className="px-3 py-2">最終更新</th>
                </tr>
              </thead>
              <tbody className="text-black">
                {filtered.map(({ product, stock }) => {
                  const st = statusOf(stock || undefined);
                  const name = prodName(product);
                  const code = stock?.sku || "";
                  const row: Row = { product, stock: stock || null };

                  return (
                    <tr
                      key={product.id}
                      className="border-t border-gray-200 hover:bg-black/[0.03]"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {st.tone === "destructive" ? (
                          <Badge className="bg-red-200 text-black">
                            在庫なし
                          </Badge>
                        ) : st.tone === "warning" ? (
                          <Badge className="bg-amber-200 text-black">
                            在庫少なめ
                          </Badge>
                        ) : st.tone === "success" ? (
                          <Badge className="bg-green-200 text-black">
                            在庫あり
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-200 text-black">
                            在庫未設定
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 min-w-[16rem] break-words">
                        {name}
                      </td>
                      <td className="px-3 py-2 break-all">
                        {code || (
                          <span className="text-gray-600">（自動割当）</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="ml-auto flex w-fit items-center gap-2">
                          <Stepper
                            value={stock?.stockQty ?? 0}
                            disabled={!loggedIn}
                            onMinus={() => adjustQty(row, -1)}
                            onPlus={() => adjustQty(row, +1)}
                            onCommit={(n) => setQty(row, n)}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="ml-auto flex w-fit items-center gap-2">
                          <Stepper
                            value={stock?.lowStockThreshold ?? 0}
                            disabled={!loggedIn || !stock}
                            onMinus={() => adjustThreshold(row, -1)}
                            onPlus={() => adjustThreshold(row, +1)}
                            onCommit={(n) => setThreshold(row, n)}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {fmtTs(stock?.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-16 text-center text-gray-700"
                    >
                      該当する商品がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* フッターの説明 */}
          <div className="pt-1 text-xs space-y-1">
            <div>
              ・<strong>商品コード</strong>…
              在庫作成の順番で自動採番（例：P0001）。
            </div>
            <div>
              ・<strong>しきい値</strong>…
              在庫がこの数以下で「在庫少なめ」。0で無効です。
            </div>
            <div>
              ・数値は<strong>タップで直接入力</strong>できます（Enterで確定 /
              Escでキャンセル / フォーカス外れでも確定）。
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
