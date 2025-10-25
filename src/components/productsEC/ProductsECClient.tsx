// src/components/ProductsECClient.tsx
"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Pin, ShoppingBag, ShoppingCart, Settings } from "lucide-react";
import { v4 as uuid } from "uuid";
import imageCompression from "browser-image-compression";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  CollectionReference,
  DocumentData,
  writeBatch,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
  where,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useThemeGradient } from "@/lib/useThemeGradient";
import clsx from "clsx";
import { ThemeKey, THEMES } from "@/lib/themes";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import SortableItem from "../SortableItem";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ProductMedia from "../ProductMedia";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import Image from "next/image";

// 多言語
import { LANGS, type LangKey } from "@/lib/langs";
import { useUILang, type UILang } from "@/lib/atoms/uiLangAtom";
import { type Product } from "@/types/Product";
import { BusyOverlay } from "../BusyOverlay";
import {
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  extFromMime,
} from "@/lib/fileTypes";

// ★ 為替
import { useFxRates } from "@/lib/fx/client";
import FreeShippingBanner from "../FreeShippingBanner";

/* ======================== 型＆ユーティリティ ======================== */

type MediaType = "image" | "video";

type Base = { title: string; body: string };
type Tr = { lang: LangKey; title?: string; body?: string };

type Section = {
  id: string;
  base: { title: string };
  t: Array<{ lang: LangKey; title?: string }>;
  createdAt?: any;
  order?: number;
};

type ProdDoc = Product & {
  base?: Base;
  t?: Tr[];
  sectionId?: string | null;
  published?: boolean;
  taxIncluded?: boolean;
};

// 税率(日本:10%)
const TAX_RATE = 0.1 as const;
const rint = (n: number) => Math.round(n);
const toExclYen = (incl: number, rate = TAX_RATE) =>
  rint((Number(incl) || 0) / (1 + rate));

const PAGE_SIZE = 20;
const MAX_VIDEO_SEC = 30;

/* ===== ラベル多言語 ===== */
const ALL_CATEGORY_T: Record<UILang, string> = {
  ja: "全カテゴリー",
  en: "All categories",
  zh: "全部分类",
  "zh-TW": "全部分類",
  ko: "모든 카테고리",
  fr: "Toutes les catégories",
  es: "Todas las categorías",
  de: "Alle Kategorien",
  pt: "Todas as categorias",
  it: "Tutte le categorie",
  ru: "Все категории",
  th: "ทุกหมวดหมู่",
  vi: "Tất cả danh mục",
  id: "Semua kategori",
  hi: "सभी श्रेणियाँ",
  ar: "كل الفئات",
};

const TAX_T: Record<UILang, { incl: string; excl: string }> = {
  ja: { incl: "税込", excl: "税抜" },
  en: { incl: "tax included", excl: "tax excluded" },
  zh: { incl: "含税", excl: "不含税" },
  "zh-TW": { incl: "含稅", excl: "未稅" },
  ko: { incl: "부가세 포함", excl: "부가세 별도" },
  fr: { incl: "TTC", excl: "HT" },
  es: { incl: "IVA incluido", excl: "sin IVA" },
  de: { incl: "inkl. MwSt.", excl: "zzgl. MwSt." },
  pt: { incl: "com impostos", excl: "sem impostos" },
  it: { incl: "IVA inclusa", excl: "IVA esclusa" },
  ru: { incl: "с НДС", excl: "без НДС" },
  th: { incl: "รวมภาษี", excl: "ไม่รวมภาษี" },
  vi: { incl: "đã gồm thuế", excl: "chưa gồm thuế" },
  id: { incl: "termasuk pajak", excl: "tidak termasuk pajak" },
  hi: { incl: "कर सहित", excl: "कर के बिना" },
  ar: { incl: "شامل الضريبة", excl: "غير شامل الضريبة" },
};

/* ===== 表示用多言語 resolve ===== */
function displayOf(p: Product & { base?: Base; t?: Tr[] }, lang: UILang): Base {
  const fallback: Base = {
    title: (p as any)?.title ?? "",
    body: (p as any)?.body ?? "",
  };
  if (!p.base && !p.t) return fallback;
  if (lang === "ja") return p.base ?? fallback;
  const hit = p.t?.find((x) => x.lang === lang);
  return {
    title: (hit?.title ?? p.base?.title ?? fallback.title) || "",
    body: (hit?.body ?? p.base?.body ?? fallback.body) || "",
  };
}

function sectionTitleLoc(s: Section, lang: UILang): string {
  if (lang === "ja") return s.base?.title ?? "";
  const hit = s.t?.find((x) => x.lang === lang);
  return hit?.title ?? s.base?.title ?? "";
}

/* ===== 翻訳（日本語→その他言語） ※ja は除外 ===== */
async function translateAll(titleJa: string, bodyJa: string): Promise<Tr[]> {
  const tasks = LANGS.filter((l) => l.key !== "ja").map(async (l) => {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: titleJa, body: bodyJa, target: l.key }),
    });
    if (!res.ok) throw new Error(`translate failed: ${l.key}`);
    const data = (await res.json()) as { title?: string; body?: string };
    return {
      lang: l.key,
      title: (data.title ?? "").trim(),
      body: (data.body ?? "").trim(),
    };
  });
  return Promise.all(tasks);
}

/* ======================== 通貨表示まわり ======================== */
/** UI言語→ロケール */
const UILANG_TO_LOCALE: Partial<Record<UILang, string>> = {
  ja: "ja-JP",
  en: "en-US",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  ko: "ko-KR",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
  pt: "pt-PT",
  it: "it-IT",
  ru: "ru-RU",
  th: "th-TH",
  vi: "vi-VN",
  id: "id-ID",
  hi: "hi-IN",
  ar: "ar-AE",
};

/** UI言語→通貨コード（APIが返す通貨のみ） */
const UILANG_TO_CCY: Partial<Record<UILang, string>> = {
  ja: "JPY",
  en: "USD",
  zh: "CNY",
  "zh-TW": "TWD",
  ko: "KRW",
  fr: "EUR",
  es: "EUR",
  de: "EUR",
  pt: "EUR",
  it: "EUR",
  ru: "EUR", // RUB 未取得のため安全側で EUR
  th: "USD", // THB 未取得のため安全側で USD
  vi: "USD", // VND 未取得のため安全側で USD
  id: "USD", // IDR 未取得のため安全側で USD
  hi: "USD", // INR 未取得のため安全側で USD
  ar: "USD", // AED/SAR 未取得のため安全側で USD
};

/** 小数無し通貨（表示時も 0 桁） */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "TWD"]);

/** JPY 税込→言語に応じた通貨文字列に整形（フェールセーフは JPY） */
function formatPriceByLang(
  jpyIncl: number,
  lang: UILang,
  rates: Record<string, number> | null
) {
  const locale = UILANG_TO_LOCALE[lang] ?? "en-US";
  const ccy = UILANG_TO_CCY[lang] ?? "JPY";

  // レート未取得 or 未対応通貨 → JPY のまま表示
  const rate = rates?.[ccy];
  if (!rate) {
    return new Intl.NumberFormat(UILANG_TO_LOCALE.ja ?? "ja-JP", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 0,
    }).format(jpyIncl);
  }

  const major = jpyIncl * rate;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: ZERO_DECIMAL.has(ccy) ? 0 : 2,
  }).format(major);
}

/** ドキュメントから「税込価格」を安全に取得 */
function ensurePriceInclFromDoc(p: ProdDoc): number {
  const raw = Number(p.price ?? 0);
  return p.taxIncluded === false ? Math.round(raw * (1 + TAX_RATE)) : raw;
}

/* ======================== 本体 ======================== */
export default function ProductsECClient() {
  // ▼ 商品
  const [list, setList] = useState<ProdDoc[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<ProdDoc | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  // ▼ 原文（日本語）入力
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [price, setPrice] = useState<number | "">("");

  // ▼ 新規追加用：セクション選択
  const [formSectionId, setFormSectionId] = useState<string>("");

  // 既存アップロード表示
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadingPercent, setUploadingPercent] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const uploading = progress !== null;

  const [aiLoading, setAiLoading] = useState(false);

  // ページング
  const [lastDoc, setLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const isFetchingMore = useRef(false);

  // ▼ セクション（DnD 順序付き）
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("all");

  const [ecStop, setEcStop] = useState(false);
  // 既存の state 群の近くに追加
  const [freeShipMinJPY, setFreeShipMinJPY] = useState<number>(0);

  // ▼ 一覧表示用フィルタ（価格>0 & 未ログインなら非公開除外）
  const displayList = useMemo(
    () =>
      list.filter(
        (p) =>
          typeof p.price === "number" &&
          p.price > 0 &&
          (isAdmin || p.published !== false)
      ),
    [list, isAdmin]
  );

  const gradient = useThemeGradient();
  const router = useRouter();

  // UI言語 & 税ラベル
  const { uiLang } = useUILang();
  const taxT = TAX_T[uiLang] ?? TAX_T.ja;

  // 為替
  const { rates } = useFxRates();

  // DnD センサー
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    })
  );

  const isDark = useMemo(() => {
    const darkThemes: ThemeKey[] = ["brandG", "brandH", "brandI"];
    if (!gradient) return false;
    return darkThemes.some((key) => gradient === THEMES[key]);
  }, [gradient]);

  const productColRef: CollectionReference<DocumentData> = useMemo(
    () => collection(db, "siteProducts", SITE_KEY, "items"),
    []
  );
  const sectionColRef: CollectionReference<DocumentData> = useMemo(
    () => collection(db, "siteSections", SITE_KEY, "sections"),
    []
  );

  useEffect(() => onAuthStateChanged(auth, (u) => setIsAdmin(!!u)), []);

  // 追加：送料無料しきい値（言語別）を購読
  useEffect(() => {
    const ref = doc(db, "siteShippingPolicy", SITE_KEY);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as any;
      const enabled = !!data?.enabled;
      if (!enabled) {
        setFreeShipMinJPY(0);
        return;
      }
      // thresholdByLang から UI 言語優先で取得。なければ ja、さらに無ければ最小値にフォールバック
      const table = (data?.thresholdByLang ?? {}) as Record<string, unknown>;
      const byLang = Number(table[uiLang]);
      const fallbackJa = Number(table["ja"]);
      const candidates = Object.values(table)
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0) as number[];
      const minAcross = candidates.length ? Math.min(...candidates) : 0;

      const chosen =
        Number.isFinite(byLang) && byLang > 0
          ? byLang
          : Number.isFinite(fallbackJa) && fallbackJa > 0
          ? fallbackJa
          : minAcross;

      setFreeShipMinJPY(chosen ? Math.round(chosen) : 0);
    });
    return () => unsub();
  }, [uiLang]);

  useEffect(() => {
    const ref = doc(db, "siteSellers", SITE_KEY);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as any;
      setEcStop(!!data?.ecStop);
    });
    return () => unsub();
  }, []);

  // 追加：在庫購読（siteKey単位）
  useEffect(() => {
    const qRef = query(
      collection(db, "stock"),
      where("siteKey", "==", SITE_KEY)
    );
    const unsub = onSnapshot(qRef, (snap) => {
      const m: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        if (data?.productId) m[data.productId] = Number(data.stockQty ?? 0);
      });
      setStockMap(m);
    });
    return () => unsub();
  }, []);

  /* ========== セクション購読 ========== */
  useEffect(() => {
    const qSec = query(sectionColRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(qSec, (snap) => {
      const items: Section[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          base: data.base ?? { title: data.title ?? "" },
          t: Array.isArray(data.t) ? data.t : [],
          createdAt: data.createdAt,
          order: typeof data.order === "number" ? data.order : undefined,
        };
      });

      items.sort((a, b) => {
        const ao = a.order ?? 999999;
        const bo = b.order ?? 999999;
        if (ao !== bo) return ao - bo;
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return at - bt;
      });

      setSections(items);

      if (
        selectedSectionId !== "all" &&
        !items.some((s) => s.id === selectedSectionId)
      ) {
        setSelectedSectionId("all");
      }
    });
    return () => unsub();
  }, [sectionColRef, selectedSectionId]);

  /* ========== 税込統一の自動移行（初回のみ） ========== */
  const migratedOnce = useRef(false);
  const migratePricesToTaxIncluded = useCallback(
    async (rows: ProdDoc[]) => {
      if (migratedOnce.current) return;
      const targets = rows.filter((p) => p && p.taxIncluded === false);
      if (targets.length === 0) {
        migratedOnce.current = true;
        return;
      }
      try {
        const CHUNK = 450;
        for (let i = 0; i < targets.length; i += CHUNK) {
          const slice = targets.slice(i, i + CHUNK);
          const batch = writeBatch(db);
          slice.forEach((p) => {
            const excl = Number(p.price) || 0;
            const incl = Math.round(excl * (1 + TAX_RATE));
            batch.update(doc(productColRef, p.id), {
              price: incl,
              priceIncl: incl,
              priceExcl: excl,
              taxRate: TAX_RATE,
              taxIncluded: true,
            });
          });
          await batch.commit();
        }
      } catch (e) {
        console.error("税込移行に失敗:", e);
      } finally {
        migratedOnce.current = true;
      }
    },
    [productColRef]
  );

  /* ========== 初回/フィルタ変更で最初のページ ========== */
  useEffect(() => {
    setList([]);
    setLastDoc(null);
    setHasMore(true);

    if (isFetchingMore.current) return;
    isFetchingMore.current = true;

    const parts: any[] = [productColRef];
    if (selectedSectionId !== "all")
      parts.push(where("sectionId", "==", selectedSectionId));
    parts.push(orderBy("createdAt", "desc"));
    parts.push(limit(PAGE_SIZE));

    const firstQuery = query(...(parts as Parameters<typeof query>));
    const unsub = onSnapshot(firstQuery, (snap) => {
      const rows: ProdDoc[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title ?? "",
          body: data.body ?? "",
          price: data.price ?? 0,
          mediaURL: data.mediaURL ?? data.imageURL ?? "",
          mediaType: (data.mediaType ?? "image") as MediaType,
          originalFileName: data.originalFileName,
          taxIncluded: data.taxIncluded ?? true,
          order: data.order ?? 9999,
          base: data.base,
          t: Array.isArray(data.t) ? data.t : [],
          sectionId: data.sectionId ?? null,
          published: data.published,
        };
      });
      setList(rows);
      setLastDoc(
        (snap.docs.at(-1) as QueryDocumentSnapshot<DocumentData>) || null
      );
      setHasMore(snap.docs.length === PAGE_SIZE);
      isFetchingMore.current = false;

      migratePricesToTaxIncluded(rows);
    });

    return () => unsub();
  }, [productColRef, selectedSectionId, migratePricesToTaxIncluded]);

  /* ========== 次ページ取得 ========== */
  const fetchNextPage = useCallback(async () => {
    if (isFetchingMore.current || !hasMore || !lastDoc) return;
    isFetchingMore.current = true;

    const parts: any[] = [productColRef];
    if (selectedSectionId !== "all")
      parts.push(where("sectionId", "==", selectedSectionId));
    parts.push(orderBy("createdAt", "desc"));
    parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));

    const nextQuery = query(...(parts as Parameters<typeof query>));
    const snap = await getDocs(nextQuery);

    const nextRows: ProdDoc[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        title: data.title ?? "",
        body: data.body ?? "",
        price: data.price ?? 0,
        mediaURL: data.mediaURL ?? data.imageURL ?? "",
        mediaType: (data.mediaType ?? "image") as MediaType,
        originalFileName: data.originalFileName,
        taxIncluded: data.taxIncluded ?? true,
        order: data.order ?? 9999,
        base: data.base,
        t: Array.isArray(data.t) ? data.t : [],
        sectionId: data.sectionId ?? null,
        published: data.published,
      };
    });

    setList((prev) => [...prev, ...nextRows]);
    setLastDoc(
      (snap.docs.at(-1) as QueryDocumentSnapshot<DocumentData>) || null
    );
    setHasMore(snap.docs.length === PAGE_SIZE);
    isFetchingMore.current = false;

    migratePricesToTaxIncluded(nextRows);
  }, [
    productColRef,
    lastDoc,
    hasMore,
    selectedSectionId,
    migratePricesToTaxIncluded,
  ]);

  /* ========== スクロール監視 ========== */
  useEffect(() => {
    const handleScroll = () => {
      if (
        hasMore &&
        !uploading &&
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 150
      ) {
        fetchNextPage();
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [fetchNextPage, hasMore, uploading]);

  /* ========== 並び順リアルタイム（商品） ========== */
  useEffect(() => {
    const parts: any[] = [productColRef];
    if (selectedSectionId !== "all")
      parts.push(where("sectionId", "==", selectedSectionId));
    const unsub = onSnapshot(
      query(...(parts as Parameters<typeof query>)),
      (snap) => {
        const rows: ProdDoc[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title,
            body: data.body,
            price: data.price ?? 0,
            mediaURL: data.mediaURL ?? data.imageURL ?? "",
            mediaType: (data.mediaType ?? "image") as MediaType,
            originalFileName: data.originalFileName,
            taxIncluded: data.taxIncluded ?? true,
            order: data.order ?? 9999,
            base: data.base,
            t: Array.isArray(data.t) ? data.t : [],
            sectionId: data.sectionId ?? null,
            published: data.published,
          };
        });
        rows.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
        setList(rows);
      }
    );
    return () => unsub();
  }, [productColRef, selectedSectionId]);

  /* ========== 保存（新規/編集） ========== */
  const saveProduct = async () => {
    if (uploading) return;
    if (!title.trim()) return alert("タイトル必須");
    if (price === "") return alert("価格を入力してください");
    if (formMode === "add" && !file) return alert("メディアを選択してください");

    setSaving(true);
    try {
      const id = editing?.id ?? uuid();
      let mediaURL = editing?.mediaURL ?? "";
      let mediaType: MediaType = editing?.mediaType ?? "image";

      if (file) {
        const isVideo = file.type.startsWith("video/");
        mediaType = isVideo ? "video" : "image";
        const isValidVideo = VIDEO_MIME_TYPES.includes(file.type);
        const isValidImage = IMAGE_MIME_TYPES.includes(file.type);
        if (!isValidImage && !isValidVideo) {
          alert(
            "対応形式：画像（JPEG, PNG, WEBP, GIF）／動画（MP4, MOV など）"
          );
          setSaving(false);
          return;
        }
        const ext = isVideo ? extFromMime(file.type) : "jpg";
        const uploadFile = isVideo
          ? file
          : await imageCompression(file, {
              maxWidthOrHeight: 1200,
              maxSizeMB: 0.7,
              useWebWorker: true,
              fileType: "image/jpeg",
              initialQuality: 0.8,
            });
        const storageRef = ref(
          getStorage(),
          `products/public/${SITE_KEY}/${id}.${ext}`
        );
        const task = uploadBytesResumable(storageRef, uploadFile, {
          contentType: isVideo ? file.type : "image/jpeg",
        });
        setProgress(0);
        setUploadingPercent(0);
        task.on("state_changed", (s) => {
          const pct = Math.round((s.bytesTransferred / s.totalBytes) * 100);
          setProgress(pct);
          setUploadingPercent(pct);
        });
        await task;
        const downloadURL = await getDownloadURL(storageRef);
        if (!downloadURL) throw new Error("画像URLの取得に失敗しました");
        mediaURL = `${downloadURL}?v=${uuid()}`;
        setProgress(null);
        setUploadingPercent(null);
        if (formMode === "edit" && editing) {
          const oldExt = editing.mediaType === "video" ? "mp4" : "jpg";
          if (oldExt !== ext) {
            await deleteObject(
              ref(getStorage(), `products/public/${SITE_KEY}/${id}.${oldExt}`)
            ).catch(() => {});
          }
        }
      }

      const base: Base = { title: title.trim(), body: body.trim() };
      const t: Tr[] = await translateAll(base.title, base.body);

      const inputIncl = Number(price) || 0;
      const priceIncl = rint(inputIncl);
      const priceExcl = toExclYen(priceIncl);

      const payload: any = {
        title: base.title,
        body: base.body,

        // 互換：税込
        price: priceIncl,

        // 新スキーマ
        priceIncl,
        priceExcl,
        taxRate: TAX_RATE,
        taxIncluded: true,

        mediaURL,
        mediaType,
        base,
        t,
      };
      const originalFileName = file?.name || editing?.originalFileName;
      if (originalFileName) payload.originalFileName = originalFileName;
      if (formMode === "add") payload.sectionId = formSectionId || null;

      if (formMode === "edit" && editing) {
        await updateDoc(doc(productColRef, id), payload);
      } else {
        await addDoc(productColRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      closeForm();
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました。対応形式や容量をご確認ください。");
      setProgress(null);
      setUploadingPercent(null);
    } finally {
      setSaving(false);
    }
  };

  const closeForm = () => {
    if (uploading) return;
    setTimeout(() => {
      resetFields();
      setFormMode(null);
    }, 100);
  };

  const resetFields = () => {
    setEditing(null);
    setTitle("");
    setBody("");
    setPrice("");
    setFile(null);
    setFormSectionId("");
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex((item) => item.id === active.id);
    const newIndex = list.findIndex((item) => item.id === over.id);
    const newList = arrayMove(list, oldIndex, newIndex);
    setList(newList);
    const batch = writeBatch(db);
    newList.forEach((item, index) => {
      batch.update(doc(productColRef, item.id), { order: index });
    });
    await batch.commit();
  };

  // ラベル（メニュー上部の現在表示カテゴリ）
  const currentSectionLabel =
    selectedSectionId === "all"
      ? ALL_CATEGORY_T[uiLang] ?? ALL_CATEGORY_T.ja
      : sections.find((s) => s.id === selectedSectionId)
      ? sectionTitleLoc(
          sections.find((s) => s.id === selectedSectionId)!,
          uiLang
        )
      : "";

  const freeShipPriceText = useMemo(
    () => formatPriceByLang(freeShipMinJPY, uiLang, rates),
    [freeShipMinJPY, uiLang, rates]
  );

  if (!gradient) return null;

  /* ======================== UI ======================== */
  return (
    <main className="max-w-5xl mx-auto p-4 pt-10">
      <BusyOverlay uploadingPercent={uploadingPercent} saving={saving} />

      {/* オンラインショップ 見出し（大） */}
      <header className="mb-6" role="banner" aria-label="オンラインショップ">
        <div
          className={clsx(
            "bg-gradient-to-br rounded-2xl border shadow-lg",
            "px-4 py-4 sm:px-7 sm:py-8",
            gradient
          )}
        >
          {/* 上段：タイトル（常に1行） + 管理 / カートボタン */}
          <div className="flex items-center justify-between gap-3">
            {/* 左：アイコン＋タイトル（1行固定・省略記号） */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <ShoppingBag
                className={clsx(
                  "w-7 h-7 sm:w-8 sm:h-8",
                  isDark ? "text-white" : "text-black"
                )}
                aria-hidden="true"
              />
              <h1
                className={clsx(
                  "font-extrabold tracking-tight leading-none",
                  "text-2xl sm:text-4xl",
                  "whitespace-nowrap truncate",
                  isDark ? "text-white" : "text-gray-900"
                )}
                title="オンラインショップ"
              >
                オンラインショップ
              </h1>
            </div>

            {/* 右：EC管理（ログイン時のみ） + 大きいカート */}
            <div className="flex items-center gap-2 shrink-0">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => router.push("/shipping")}
                  className={clsx(
                    "inline-flex items-center justify-center",
                    "h-10 px-4 rounded-full border shadow",
                    "bg-white/95 hover:bg-white transition",
                    "focus:outline-none focus:ring-2 focus:ring-blue-400"
                  )}
                  aria-label="EC管理"
                  title="EC管理"
                >
                  <Settings
                    className={clsx(
                      "w-5 h-5",
                      isDark ? "text-gray-900" : "text-gray-900"
                    )}
                  />
                  <span className="ml-1 text-sm font-medium hidden sm:inline">
                    EC管理
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => router.push("/cart")}
                className={clsx(
                  "relative inline-flex items-center justify-center",
                  "h-14 w-14 sm:h-14 sm:w-14",
                  "rounded-full border shadow",
                  "bg-white/95 hover:bg-white transition",
                  "focus:outline-none focus:ring-2 focus:ring-blue-400"
                )}
                aria-label="カートへ移動"
                title="カートへ移動"
              >
                <ShoppingCart
                  className={clsx(
                    "w-8 h-8",
                    isDark ? "text-gray-900" : "text-gray-900"
                  )}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          {/* サブタイトル */}
          <p
            className={clsx(
              "mt-2 text-xs sm:text-base",
              isDark ? "text-white/80" : "text-gray-600"
            )}
          >
            公式オンラインストア / Online Store
          </p>
        </div>
      </header>

      {/* ▼ 送料無料バナー（しきい値が設定されている時のみ表示） */}
      <FreeShippingBanner
        show={freeShipMinJPY > 0}
        lang={uiLang}
        priceText={freeShipPriceText}
        sticky
      />

      {ecStop && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-xl p-5 text-center shadow-lg max-w-sm">
            <p className="text-lg font-semibold">現在ご利用いただけません</p>
            <p className="text-sm text-gray-600 mt-1">
              メンテナンス中です。しばらくお待ちください。
            </p>
          </div>
        </div>
      )}

      <div className="mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        {/* セクションピッカー */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-white text-outline opacity-70">
            表示カテゴリ:
          </label>
          <div className="relative inline-block">
            <select
              className={clsx(
                "border rounded px-3 py-2 pr-8",
                "text-transparent caret-transparent selection:bg-transparent",
                "appearance-none"
              )}
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
            >
              <option value="all">
                {ALL_CATEGORY_T[uiLang] ?? ALL_CATEGORY_T.ja}
              </option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {sectionTitleLoc(s, uiLang)}
                </option>
              ))}
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white text-outline"
            >
              {currentSectionLabel}
            </span>
          </div>
        </div>
      </div>

      {/* ▼ 商品一覧（通貨表示は UI 言語に応じて変換） */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToWindowEdges]}
      >
        <SortableContext
          items={displayList.map((p) => p.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {displayList.map((p) => {
              const loc = displayOf(p, uiLang);
              const priceIncl = ensurePriceInclFromDoc(p);
              const priceText = formatPriceByLang(priceIncl, uiLang, rates);

              // ▼ 追加：この商品の在庫数を取得（stock の productId は p.id と同じ前提）
              const pid = (p as any).productId || p.id;
              const qty = stockMap[pid];
              const soldOut = typeof qty === "number" && qty <= 0;

              return (
                <SortableItem key={p.id} product={p}>
                  {({ listeners, attributes, isDragging }) => (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 20 }}
                      transition={{ duration: 0.3 }}
                      onClick={() => {
                        if (isDragging) return;
                        if (soldOut) return; // ← 売切れなら遷移させない
                        router.push(`/productsEC/${p.id}`);
                      }}
                      className={clsx(
                        "flex flex-col h-full border shadow relative transition-colors duration-200",
                        "bg-gradient-to-b",
                        gradient,
                        isDragging
                          ? "bg-yellow-100"
                          : isDark
                          ? "bg-black/40 text-white"
                          : "bg-white",
                        soldOut ? "cursor-not-allowed" : "cursor-pointer", // ← 視覚的にも不可に
                        !isDragging && !soldOut && "hover:shadow-lg",
                        "rounded-b-lg rounded-t-xl"
                      )}
                    >
                      {auth.currentUser !== null && (
                        <div
                          {...attributes}
                          {...listeners}
                          onClick={(e) => e.stopPropagation()}
                          onContextMenu={(e) => e.preventDefault()}
                          draggable={false}
                          className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-30 cursor-grab active:cursor-grabbing select-none p-3"
                          role="button"
                          aria-label="並び替え"
                          style={{ touchAction: "none" }}
                        >
                          <div className="w-10 h-10 rounded-full bg-white/95 flex items-center justify-center shadow pointer-events-none">
                            <Pin className="text-black" />
                          </div>
                        </div>
                      )}

                      {/* 画像エリアを相対配置にして SOLD OUT を前面に重ねる */}
                      <div className="relative">
                        <ProductMedia
                          src={p.mediaURL}
                          type={p.mediaType}
                          className="rounded-t-xl"
                        />
                        {soldOut && (
                          <Image
                            src="/images/soldOutImageSK.png" // public/images/soldOutImage.png
                            fill
                            alt="売切れ"
                            className="absolute inset-0 z-20 h-full w-full object-contain pointer-events-none"
                            unoptimized
                          />
                        )}
                      </div>

                      {/* 管理ラベル（既存） */}
                      {isAdmin && (
                        <div
                          className={clsx(
                            "absolute right-2 top-2 z-20 text-xs font-bold px-2 py-1 rounded",
                            p.published === false
                              ? "bg-red-600 text-white"
                              : "bg-green-600 text-white"
                          )}
                        >
                          {p.published === false ? "非表示" : "表示中"}
                        </div>
                      )}

                      <div className="p-1 space-y-1">
                        <h2
                          className={clsx("text-sm font-bold", {
                            "text-white": isDark,
                          })}
                        >
                          {loc.title || p.title || "（無題）"}
                        </h2>
                        <p
                          className={clsx("font-semibold", {
                            "text-white": isDark,
                          })}
                        >
                          {priceText}（{taxT.incl}）
                        </p>
                      </div>
                    </motion.div>
                  )}
                </SortableItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* 新規/編集モーダル（税込固定入力・既存機能そのまま） */}
      {isAdmin && formMode && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-white rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-bold text-center">
              {formMode === "edit" ? "商品を編集" : "新規商品追加"}
            </h2>

            {formMode === "add" && (
              <div className="flex flex-col gap-1">
                <label className="text-sm">セクション（カテゴリー）</label>
                <select
                  value={formSectionId}
                  onChange={(e) => setFormSectionId(e.target.value)}
                  className="w-full border px-3 h-10 rounded bg-white"
                >
                  <option value="">未設定</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.base?.title ?? ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <input
              type="text"
              placeholder="商品名"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              disabled={uploading}
            />
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="価格 (税込・円)"
              value={price}
              onChange={(e) => {
                const val = e.target.value;
                setPrice(val === "" ? "" : Number(val));
              }}
              className="w-full border px-3 py-2 rounded"
              disabled={uploading}
            />

            <div className="flex items-center text-sm text-gray-600">
              価格は <span className="mx-1 font-semibold">税込</span>（固定）
            </div>

            <textarea
              placeholder="紹介文"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              rows={4}
              disabled={uploading}
            />

            {/* 既存のAI生成（キーワード無し版を維持） */}
            <button
              onClick={async () => {
                if (!title) return alert("タイトルを入力してください");
                setAiLoading(true);
                try {
                  const res = await fetch("/api/generate-description", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title, price }),
                  });
                  const data = await res.json();
                  if (data.body) {
                    setBody(data.body);
                  } else {
                    alert("生成に失敗しました");
                  }
                } catch {
                  alert("エラーが発生しました");
                } finally {
                  setAiLoading(false);
                }
              }}
              disabled={uploading || aiLoading}
              className="w-full mt-2 px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {aiLoading ? "生成中…" : "AIで紹介文を生成"}
            </button>

            <input
              type="file"
              accept={[...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].join(",")}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;

                const isVideo = f.type.startsWith("video/");
                if (!isVideo) {
                  setFile(f);
                  return;
                }

                const blobURL = URL.createObjectURL(f);
                const vid = document.createElement("video");
                vid.preload = "metadata";
                vid.src = blobURL;

                vid.onloadedmetadata = () => {
                  URL.revokeObjectURL(blobURL);
                  if (vid.duration > MAX_VIDEO_SEC) {
                    alert(`動画は ${MAX_VIDEO_SEC} 秒以内にしてください`);
                    (e.target as HTMLInputElement).value = "";
                    return;
                  }
                  setFile(f);
                };
              }}
              className="bg-gray-500 text-white w-full h-10 px-3 py-1 rounded"
              disabled={uploading}
            />

            {formMode === "edit" && editing?.originalFileName && (
              <p className="text-sm text-gray-600">
                現在のファイル: {editing.originalFileName}
              </p>
            )}

            <div className="flex gap-2 justify-center">
              <button
                onClick={saveProduct}
                disabled={uploading}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
              >
                {formMode === "edit" ? "更新" : "追加"}
              </button>
              <button
                onClick={closeForm}
                disabled={uploading}
                className="px-4 py-2 bg-gray-500 text-white rounded disabled:opacity-50"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
