"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  documentId,
} from "firebase/firestore";

/** FirestoreのpriceInclを保持するカート商品型 */
export type CartItem = {
  productId: string;
  name: string;
  unitAmount: number;
  qty: number;
  imageUrl?: string;
};

/** カート全体の型 */
type CartContextType = {
  items: CartItem[];
  add: (item: CartItem) => void;
  setQty: (productId: string, qty: number) => void;
  inc: (productId: string, delta?: number) => void;
  dec: (productId: string, delta?: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  clearIfCheckoutSuccessHandled?: () => void;
  clearOnceForSession?: (sessionId: string) => void;
  setItemName: (productId: string, name: string) => void;
  totalQty: number;
  totalAmount: number;
  isHydrated: boolean;
  revalidate: () => Promise<void>;
};

const CartContext = createContext<CartContextType | null>(null);

const STORAGE_KEY = `cart:${SITE_KEY}`;
const VERSION = 1;

type Persisted = { v: number; data: { items: CartItem[] } };

/* ---- localStorage 読み込み ---- */
function safeRead(): { items: CartItem[] } {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.v !== VERSION) return { items: [] };
    const items = Array.isArray(parsed.data?.items) ? parsed.data.items : [];
    return {
      items: items.filter(
        (i) =>
          i &&
          typeof i.productId === "string" &&
          i.productId.length > 0 &&
          Number.isFinite(i.unitAmount) &&
          Number.isFinite(i.qty) &&
          i.qty > 0
      ),
    };
  } catch {
    return { items: [] };
  }
}

/* ---- localStorage 書き込み ---- */
function safeWrite(state: { items: CartItem[] }) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { v: VERSION, data: state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/* ---- Provider ---- */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ items: CartItem[] }>({ items: [] });
  const [hydrated, setHydrated] = useState(false);

  /* 初期読み込み */
  useEffect(() => {
    setState(safeRead());
    setHydrated(true);
  }, []);

  /* 他タブ同期 */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setState(safeRead());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /* 自動保存 */
  useEffect(() => {
    if (hydrated) safeWrite(state);
  }, [state, hydrated]);

  /* ✅ Stripe決済完了後、/cart に戻ってもカートを自動クリア */
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;

    const { pathname, search } = window.location;
    const params = new URLSearchParams(search);
    const sessionId =
      params.get("session_id") || params.get("sid") || "";
    const status = params.get("status");

    // ✅ session_id または status=success が存在すればカートをクリア
    if ((sessionId || status === "success") && pathname.includes("/cart")) {
      const flagKey = `cart:cleared:${sessionId || "default"}`;
      if (sessionStorage.getItem(flagKey)) return;

      setState({ items: [] });
      sessionStorage.setItem(flagKey, "1");

      try {
        // URLをクリーンアップ
        params.delete("status");
        params.delete("session_id");
        params.delete("sid");
        const newQuery = params.toString();
        const next = pathname + (newQuery ? `?${newQuery}` : "");
        window.history.replaceState(null, "", next);
      } catch {
        // noop
      }
    }
  }, [hydrated]);

  /* ✅ Firestore上の存在確認 */
  const revalidate = useCallback(async () => {
    const ids = [...new Set(state.items.map((x) => x.productId))];
    if (ids.length === 0) return;

    const colRef = collection(db, "siteProducts", SITE_KEY, "items");
    const existing = new Set<string>();

    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      const snap = await getDocs(query(colRef, where(documentId(), "in", chunk)));
      snap.forEach((d) => existing.add(d.id));
    }

    setState((prev) => ({
      items: prev.items.filter((it) => existing.has(it.productId)),
    }));
  }, [state.items]);

  /* ---- API ---- */
  const api = useMemo<CartContextType>(() => {
    const clampQty = (n: number) => Math.max(1, Math.min(999, Math.floor(n || 1)));

    const add = (item: CartItem) => {
      setState((prev) => {
        const idx = prev.items.findIndex((x) => x.productId === item.productId);
        if (idx >= 0) {
          const next = [...prev.items];
          const merged = { ...next[idx] };
          merged.qty = clampQty(merged.qty + (item.qty || 1));
          merged.unitAmount = item.unitAmount;
          if (item.imageUrl) merged.imageUrl = item.imageUrl;
          next[idx] = merged;
          return { items: next };
        }
        return { items: [...prev.items, { ...item, qty: clampQty(item.qty) }] };
      });
    };

    const setQty = (productId: string, qty: number) => {
      const n = Math.max(0, Math.min(999, Math.floor(qty || 0)));
      setState((prev) => {
        if (n === 0)
          return { items: prev.items.filter((x) => x.productId !== productId) };
        return {
          items: prev.items.map((x) =>
            x.productId === productId ? { ...x, qty: n } : x
          ),
        };
      });
    };

    const inc = (productId: string, delta = 1) => {
      setState((prev) => ({
        items: prev.items.map((x) =>
          x.productId === productId
            ? { ...x, qty: Math.max(1, Math.min(999, x.qty + delta)) }
            : x
        ),
      }));
    };

    const dec = (productId: string, delta = 1) => {
      setState((prev) => ({
        items: prev.items
          .map((x) =>
            x.productId === productId
              ? { ...x, qty: Math.max(0, Math.min(999, x.qty - delta)) }
              : x
          )
          .filter((x) => x.qty > 0),
      }));
    };

    const remove = (productId: string) => {
      setState((prev) => ({
        items: prev.items.filter((x) => x.productId !== productId),
      }));
    };

    const clear = () => setState({ items: [] });

    const clearOnceForSession = (sessionId: string) => {
      if (!sessionId) return;
      const flagKey = `cart:cleared:${sessionId}`;
      if (sessionStorage.getItem(flagKey)) return;
      setState({ items: [] });
      sessionStorage.setItem(flagKey, "1");
    };

    const clearIfCheckoutSuccessHandled = () => {
      if (typeof window === "undefined") return;

      const { pathname, search } = window.location;
      const params = new URLSearchParams(search);
      const sessionId = params.get("session_id") || params.get("sid") || "";
      if ((sessionId || params.get("status") === "success") && pathname.includes("/cart")) {
        clearOnceForSession(sessionId || "default");
      }
    };

    const setItemName = (productId: string, name: string) => {
      if (!productId || !name) return;
      setState((prev) => ({
        items: prev.items.map((x) =>
          x.productId === productId ? { ...x, name } : x
        ),
      }));
    };

    const totalQty = state.items.reduce((a, b) => a + b.qty, 0);
    const totalAmount = state.items.reduce((a, b) => a + b.qty * b.unitAmount, 0);

    return {
      items: state.items,
      add,
      setQty,
      inc,
      dec,
      remove,
      clear,
      clearIfCheckoutSuccessHandled,
      clearOnceForSession,
      setItemName,
      totalQty,
      totalAmount,
      isHydrated: hydrated,
      revalidate,
    };
  }, [state.items, hydrated, revalidate]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

/* ---- useCart ---- */
export function useCart(): CartContextType {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
