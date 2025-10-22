// src/components/ProductECDetail.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import clsx from "clsx";
import { v4 as uuid } from "uuid";
import imageCompression from "browser-image-compression";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

import { useThemeGradient } from "@/lib/useThemeGradient";
import { ThemeKey, THEMES } from "@/lib/themes";
import { type Product } from "@/types/Product";

import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

import CardSpinner from "../CardSpinner";
import { BusyOverlay } from "../BusyOverlay";

import {
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  extFromMime,
} from "@/lib/fileTypes";

// ▼ カート
import { useCart } from "@/lib/cart/CartContext";

/* 多言語対応：UI言語 & 対応言語一覧 */
import { LANGS, type LangKey } from "@/lib/langs";
import { useUILang, type UILang } from "@/lib/atoms/uiLangAtom";

// ★ 為替
import { useFxRates } from "@/lib/fx/client";

/* ▼ カートボタンの文言：多言語 */
const ADD_TO_CART_T: Record<UILang, string> = {
  ja: "カートに入れる",
  en: "Add to cart",
  zh: "加入购物车",
  "zh-TW": "加入購物車",
  ko: "장바구니에 담기",
  fr: "Ajouter au panier",
  es: "Añadir al carrito",
  de: "In den Warenkorb",
  pt: "Adicionar ao carrinho",
  it: "Aggiungi al carrello",
  ru: "В корзину",
  th: "หยิบใส่ตะกร้า",
  vi: "Thêm vào giỏ",
  id: "Masukkan ke keranjang",
  hi: "कार्ट में जोड़ें",
  ar: "أضِف إلى السلة",
};
export function addToCartLabel(lang: UILang): string {
  return ADD_TO_CART_T[lang] ?? ADD_TO_CART_T.en;
}

/* ▼ 追加トーストの文言：多言語（{name} を商品名に差し込み） */
const ADDED_TO_CART_T: Record<UILang, string> = {
  ja: "{name} をカートに追加しました",
  en: "Added {name} to your cart",
  zh: "已将 {name} 加入购物车",
  "zh-TW": "已將 {name} 加入購物車",
  ko: "{name} 을(를) 장바구니에 담았습니다",
  fr: "{name} ajouté à votre panier",
  es: "Has añadido {name} al carrito",
  de: "{name} wurde dem Warenkorb hinzugefügt",
  pt: "{name} adicionado ao carrinho",
  it: "Hai aggiunto {name} al carrello",
  ru: "{name} добавлен в корзину",
  th: "เพิ่ม {name} ลงในตะกร้าแล้ว",
  vi: "Đã thêm {name} vào giỏ hàng",
  id: "{name} telah ditambahkan ke keranjang",
  hi: "{name} कार्ट में जोड़ा गया",
  ar: "تمت إضافة {name} إلى السلة",
};
function addedToCartText(lang: UILang, name: string): string {
  const template = ADDED_TO_CART_T[lang] ?? ADDED_TO_CART_T.en;
  return template.replace("{name}", name);
}

type MediaType = "image" | "video";

type Section = {
  id: string;
  base: { title: string };
  t: Array<{ lang: LangKey; title?: string }>;
  createdAt?: any;
  order?: number;
};

type ProductDoc = Product & {
  base?: { title: string; body: string };
  t?: Array<{ lang: LangKey; title?: string; body?: string }>;
  sectionId?: string | null;
  mediaURL?: string;
  mediaType?: MediaType;
  originalFileName?: string;
  published?: boolean; // 公開/非公開
  priceIncl?: number; // 税込保存値
  priceExcl?: number; // 税抜保存値
  taxRate?: number; // 保存税率
};

const TOAST_DURATION_MS = 3000;

/* ===== 税計算（日本10%） ===== */
const TAX_RATE = 0.1 as const;
const rint = (n: number) => Math.round(Number(n) || 0);
const toExclYen = (incl: number, rate = TAX_RATE) =>
  rint((Number(incl) || 0) / (1 + rate));
const toInclYen = (excl: number, rate = TAX_RATE) =>
  rint((Number(excl) || 0) * (1 + rate));

/* 表示テキスト（UI言語で解決） */
function pickLocalized(
  p: ProductDoc,
  lang: UILang
): { title: string; body: string } {
  if (lang === "ja") {
    return {
      title: p.base?.title ?? p.title ?? "",
      body: p.base?.body ?? p.body ?? "",
    };
  }
  const hit = p.t?.find((x) => x.lang === lang);
  return {
    title: hit?.title ?? p.base?.title ?? p.title ?? "",
    body: hit?.body ?? p.base?.body ?? p.body ?? "",
  };
}

/* 翻訳 */
type Tr = { lang: LangKey; title: string; body: string };
async function translateAll(titleJa: string, bodyJa: string): Promise<Tr[]> {
  const jobs: Promise<Tr>[] = LANGS.map(async (l) => {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: titleJa, body: bodyJa, target: l.key }),
    });
    if (!res.ok) throw new Error(`translate error: ${l.key}`);
    const data = (await res.json()) as { title?: string; body?: string };
    return {
      lang: l.key,
      title: (data.title ?? "").trim(),
      body: (data.body ?? "").trim(),
    };
  });
  const settled = await Promise.allSettled(jobs);
  return settled
    .filter((r): r is PromiseFulfilledResult<Tr> => r.status === "fulfilled")
    .map((r) => r.value);
}

/* 税ラベル */
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
  ar: { incl: "शامل الضريبة", excl: "غير شامل الضريبة" } as any,
};

/* ====== 通貨表示（UI言語→通貨/ロケール） ====== */
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
  ru: "EUR",
  th: "USD",
  vi: "USD",
  id: "USD",
  hi: "USD",
  ar: "USD",
};
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "TWD"]);

function formatPriceByLang(
  jpyIncl: number,
  lang: UILang,
  rates: Record<string, number> | null
) {
  const locale = UILANG_TO_LOCALE[lang] ?? "en-US";
  const ccy = UILANG_TO_CCY[lang] ?? "JPY";
  const rate = rates?.[ccy];

  // レート無い/未取得 → JPY
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

export default function ProductECDetail({ product }: { product: Product }) {
  // 権限・テーマ
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPercent, setUploadingPercent] = useState<number | null>(null);
  const [navigatingBack, setNavigatingBack] = useState(false);
  const gradient = useThemeGradient();
  const router = useRouter();
  useEffect(() => onAuthStateChanged(auth, (u) => setIsAdmin(!!u)), []);

  const isDark = useMemo<boolean>(() => {
    const darks: ThemeKey[] = ["brandG", "brandH", "brandI"];
    return !!(gradient && darks.some((k) => gradient === THEMES[k]));
  }, [gradient]);

  // UI言語・税ラベル・為替
  const { uiLang } = useUILang();
  const cartBtnLabel = addToCartLabel(uiLang); // 多言語ラベル
  const taxT = TAX_T[uiLang] ?? TAX_T.ja;
  const { rates } = useFxRates();

  // 表示用
  const [displayProduct, setDisplayProduct] = useState<ProductDoc>(
    product as ProductDoc
  );

  // セクション一覧（未使用でも購読維持）
  const [, setSections] = useState<Section[]>([]);

  // 編集モーダル state
  const [showEdit, setShowEdit] = useState(false);
  const [title, setTitle] = useState<string>(product.title ?? "");
  const [body, setBody] = useState<string>(product.body ?? "");

  // 初期税込
  const initialIncl =
    (product as any).priceIncl ??
    (typeof (product as any).priceExcl === "number"
      ? toInclYen((product as any).priceExcl, TAX_RATE)
      : typeof product.price === "number"
      ? product.price
      : 0);

  const [price, setPrice] = useState<number | "">(
    typeof initialIncl === "number" ? initialIncl : ""
  );
  const [taxIncluded] = useState<boolean>(true);
  const [published, setPublished] = useState<boolean>(
    (product as any).published !== false
  );
  const [file] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const uploading = progress !== null;

  // カート
  const [qty, setQty] = useState<number>(1);
  const { add: addToCart } = useCart();
  const [addedToast, setAddedToast] = useState<null | {
    name: string;
    qty: number;
  }>(null);
  const stepQty = (delta: number) =>
    setQty((n) => Math.max(1, Math.min(999, (Number(n) || 1) + delta)));
  const handleQtyInput = (v: string) => {
    if (v === "") return setQty(1);
    const n = Number(String(v).replace(/[^\d]/g, ""));
    if (!Number.isFinite(n)) return;
    setQty(Math.max(1, Math.min(999, n)));
  };

  // セクション選択
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    (product as any).sectionId ?? null
  );

  // 初期化
  useEffect(() => {
    setDisplayProduct(product as ProductDoc);
    setSelectedSectionId((product as any).sectionId ?? null);
    setTitle(product.title ?? "");
    setBody(product.body ?? "");
    setPrice(typeof initialIncl === "number" ? initialIncl : "");
    setPublished((product as any).published !== false);
    setQty(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  // セクション購読
  useEffect(() => {
    const secRef = collection(db, "siteSections", SITE_KEY, "sections");
    const qy = query(secRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(qy, (snap) => {
      const rows: Section[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          base: data.base ?? { title: data.title ?? "" },
          t: Array.isArray(data.t) ? data.t : [],
          createdAt: data.createdAt,
          order: typeof data.order === "number" ? data.order : undefined,
        };
      });
      rows.sort((a, b) => {
        const ao = a.order ?? 999999;
        const bo = b.order ?? 999999;
        if (ao !== bo) return ao - bo;
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return at - bt;
      });
      setSections(rows);
    });
    return () => unsub();
  }, []);

  // 保存
  const handleSave = async () => {
    if (!title.trim()) return alert("タイトル必須");
    if (price === "") return alert("価格を入力してください");

    setSaving(true);
    try {
      let mediaURL: string = displayProduct.mediaURL ?? "";
      let mediaType: MediaType =
        (displayProduct.mediaType as MediaType) || "image";
      let originalFileName: string =
        (displayProduct as any).originalFileName ?? "";

      // 画像/動画アップロード（現状 file は null 運用）
      if (file) {
        const isVideo = file.type.startsWith("video/");
        mediaType = isVideo ? "video" : "image";

        const isValidImage = IMAGE_MIME_TYPES.includes(file.type);
        const isValidVideo = VIDEO_MIME_TYPES.includes(file.type);
        if (!isValidImage && !isValidVideo) {
          alert("対応形式ではありません");
          setSaving(false);
          return;
        }
        if (isVideo && file.size > 50 * 1024 * 1024) {
          alert("動画は 50 MB 未満にしてください");
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
          `products/public/${SITE_KEY}/${product.id}.${ext}`
        );
        const task = uploadBytesResumable(storageRef, uploadFile, {
          contentType: isVideo ? file.type : "image/jpeg",
        });

        setUploadingPercent(0);
        setProgress(0);
        task.on("state_changed", (s) => {
          const pct = Math.round((s.bytesTransferred / s.totalBytes) * 100);
          setProgress(pct);
          setUploadingPercent(pct);
        });
        await task;

        mediaURL = `${await getDownloadURL(storageRef)}?v=${uuid()}`;
        originalFileName = file.name || originalFileName;
        setProgress(null);
        setUploadingPercent(null);
      }

      const base = { title: title.trim(), body: (body ?? "").trim() };
      let t: Tr[] = [];
      try {
        t = await translateAll(base.title, base.body);
      } catch (e) {
        console.warn("translateAll failed, continue without i18n fields", e);
        t = [];
      }

      const typed = typeof price === "number" ? price : Number(price) || 0;
      let priceIncl = 0;
      let priceExcl = 0;

      if (taxIncluded) {
        priceIncl = rint(typed);
        priceExcl = toExclYen(priceIncl, TAX_RATE);
      } else {
        priceExcl = rint(typed);
        priceIncl = toInclYen(priceExcl, TAX_RATE);
      }

      const payload = {
        title: base.title,
        body: base.body,
        price: priceIncl, // 互換：税込
        priceIncl,
        priceExcl,
        taxRate: TAX_RATE,
        taxIncluded: true, // EC は表示/保存とも税込運用
        mediaURL,
        mediaType,
        base,
        t,
        sectionId: selectedSectionId ?? null,
        originalFileName: originalFileName || "",
        updatedAt: serverTimestamp(),
        published: !!published,
      } as const;

      await updateDoc(
        doc(db, "siteProducts", SITE_KEY, "items", product.id),
        payload
      );

      // ローカル反映
      setDisplayProduct((prev) => ({
        ...(prev as ProductDoc),
        ...payload,
      }));

      setShowEdit(false);
    } catch (err) {
      console.error(err);
      alert("保存に失敗しました");
      setProgress(null);
      setUploadingPercent(null);
    } finally {
      setSaving(false);
    }
  };

  // 削除
  const handleDelete = async () => {
    if (!confirm(`「${displayProduct.title}」を削除しますか？`)) return;
    const storage = getStorage();
    try {
      if (displayProduct.mediaURL) {
        const fileRef = ref(storage, displayProduct.mediaURL);
        try {
          await deleteObject(fileRef);
        } catch (err: any) {
          if (err?.code === "storage/object-not-found") {
            console.warn("Storage: 既に削除済みの可能性があります");
          } else {
            console.warn("Storage削除エラー（続行します）:", err);
          }
        }
      }
      await deleteDoc(doc(db, "siteProducts", SITE_KEY, "items", product.id));
      router.back();
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました");
    }
  };

  const handleAddToCart = () => {
    if (navigatingBack) return; // 連打対策

    // 内部値は JPY 税込で扱う（表示は多通貨でも OK）
    const unitIncl =
      (displayProduct as any).priceIncl ??
      (typeof displayProduct.price === "number"
        ? displayProduct.price
        : toInclYen(Number(displayProduct.price || 0), TAX_RATE));

    if (!Number.isFinite(unitIncl) || unitIncl <= 0) {
      alert("価格が設定されていません");
      return;
    }

    const count = Math.max(1, qty);

    // 多言語タイトルを使用してカートへ投入
    const localizedName = pickLocalized(displayProduct, uiLang).title;

    addToCart({
      productId: displayProduct.id,
      name: localizedName, // ← ここを多言語化
      unitAmount: unitIncl,
      qty: count,
      imageUrl: displayProduct.mediaURL,
    });

    // トーストにも多言語名を反映
    setAddedToast({ name: localizedName, qty: count });

    setTimeout(() => setAddedToast(null), TOAST_DURATION_MS);

    setNavigatingBack(true);
    setTimeout(() => {
      router.back();
    }, TOAST_DURATION_MS);
  };

  function CartToast({
    open,
    name,
    qty,
    imageUrl,
    toastText,
    durationMs = 5000,
  }: {
    open: boolean;
    name: string;
    qty: number;
    imageUrl?: string;
    toastText: string;
    durationMs?: number;
  }) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            role="status"
            aria-live="polite"
            initial={{ y: -40, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -30, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 250, damping: 22 }}
            className="fixed top-20 left-1/2 z-50 -translate-x-1/2"
          >
            <div
              className={[
                "flex items-center gap-4 px-5 py-4 rounded-2xl shadow-2xl ring-1 backdrop-blur-md w-[90vw] max-w-md sm:max-w-lg",
                "bg-white text-gray-800 ring-gray-200",
              ].join(" ")}
            >
              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl ring-1 ring-gray-200 shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl || "/images/placeholder.jpg"}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 animate-scaleIn" />
                  <span>{toastText}</span>
                </div>
                <p className="mt-1 text-sm opacity-90 truncate">
                  {name} ×{qty}
                </p>

                <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <motion.div
                    key="progress"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{
                      duration: durationMs / 1000,
                      ease: "easeInOut",
                    }}
                    className="h-full bg-emerald-500"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  if (!displayProduct) {
    return (
      <main className="min-h-screen flex items-center justify-center pt-24">
        <CardSpinner />
      </main>
    );
  }

  const loc = pickLocalized(displayProduct, uiLang);

  // 表示は常に税込：priceIncl があればそれ、なければ price を使い、最終手段で計算
  const displayIncl =
    (displayProduct as any).priceIncl ??
    (typeof displayProduct.price === "number"
      ? displayProduct.price
      : toInclYen(Number(displayProduct.price || 0), TAX_RATE));

  // ★ 通貨変換して表示
  const priceText = formatPriceByLang(displayIncl, uiLang, rates);

  // ★ トーストの多言語文言（商品名を含む）
  const toastText = addedToCartText(uiLang, loc.title);

  return (
    <main className="min-h-screen flex items-start justify-center p-4 pt-24">
      <BusyOverlay uploadingPercent={uploadingPercent} saving={saving} />

      {/* 追加完了トースト */}
      <div
        aria-live="polite"
        className={clsx(
          "fixed left-1/2 -translate-x-1/2 top-16 z-40",
          addedToast ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
          "transition-all duration-300"
        )}
      >
        {addedToast && (
          <CartToast
            open={!!addedToast}
            name={addedToast?.name || ""}
            qty={addedToast?.qty || 1}
            imageUrl={displayProduct.mediaURL}
            toastText={toastText}
            durationMs={TOAST_DURATION_MS}
          />
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.3 }}
        className={clsx(
          "border rounded-lg overflow-hidden shadow relative transition-colors duration-200",
          "w-full max-w-md",
          "bg-gradient-to-b",
          "mt-5",
          gradient,
          isDark ? "bg-black/40 text-white" : "bg-white"
        )}
      >
        {isAdmin && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
            {/* 公開/非公開バッジ */}
            <span
              className={clsx(
                "px-2 py-1 rounded text-xs font-semibold",
                displayProduct.published !== false
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-200 text-gray-700"
              )}
            >
              {displayProduct.published !== false ? "公開" : "非公開"}
            </span>

            <button
              onClick={() => setShowEdit(true)}
              className="px-2 py-1 bg-blue-600 text-white text-md rounded shadow disabled:opacity-50"
              type="button"
            >
              編集
            </button>
            <button
              onClick={handleDelete}
              className="px-2 py-1 bg-red-600 text-white text-md rounded shadow disabled:opacity-50"
              type="button"
            >
              削除
            </button>
          </div>
        )}

        {/* メディア */}
        {displayProduct.mediaType === "video" ? (
          <video
            src={displayProduct.mediaURL}
            muted
            playsInline
            autoPlay
            loop
            preload="auto"
            className="w-full aspect-square object-cover"
          />
        ) : (
          <div className="relative w-full aspect-square">
            <Image
              src={displayProduct.mediaURL || "/images/placeholder.jpg"}
              alt={loc.title || displayProduct.title}
              fill
              className="object-cover"
              sizes="100vw"
              unoptimized
            />
          </div>
        )}

        {/* テキスト */}
        <div className="p-4 space-y-3">
          <h1 className={clsx("text-lg font-bold", isDark && "text-white")}>
            {loc.title}
          </h1>
          <p className={clsx("font-semibold", isDark && "text-white")}>
            {priceText}（{taxT.incl}）
          </p>
          {loc.body && (
            <p
              className={clsx(
                "text-sm whitespace-pre-wrap leading-relaxed",
                isDark && "text-white"
              )}
            >
              {loc.body}
            </p>
          )}

          {/* 数量ステッパー + カート */}
          <div className="flex items-center gap-2 pt-2">
            <label className="text-sm sr-only">数量</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stepQty(-1)}
                aria-label="数量を1減らす"
                className="h-11 w-11 rounded-xl border text-xl font-bold active:scale-[0.98]"
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label="数量を入力"
                className="w-20 h-11 border rounded-xl text-center text-lg"
                value={String(qty)}
                onChange={(e) => handleQtyInput(e.target.value)}
              />
              <button
                type="button"
                onClick={() => stepQty(1)}
                aria-label="数量を1増やす"
                className="h-11 w-11 rounded-xl border text-xl font-bold active:scale-[0.98]"
              >
                ＋
              </button>
            </div>

            <button
              type="button"
              onClick={handleAddToCart}
              disabled={navigatingBack}
              className="ml-auto h-11 px-4 rounded-xl bg-black text-white font-semibold disabled:opacity-50"
              aria-label={cartBtnLabel}
            >
              {cartBtnLabel}
            </button>
          </div>
        </div>
      </motion.div>

      {/* 編集モーダル（編集UIは税区分選べるが保存は税込統一＋両方保存） */}
      {isAdmin && showEdit && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-white rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-bold text-center">商品を編集</h2>

            {/* 公開/非公開 */}
            <div className="flex items-center justify-between border rounded px-3 py-2">
              <span className="text-sm">公開設定</span>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!published}
                  onChange={(e) => setPublished(e.target.checked)}
                />
                <span className="text-sm">
                  {published ? "公開（表示）" : "非公開（非表示）"}
                </span>
              </label>
            </div>

            <div className="flex gap-2 justify-center">
              <button
                onClick={handleSave}
                disabled={uploading}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
                type="button"
              >
                更新
              </button>
              <button
                onClick={() => !uploading && setShowEdit(false)}
                disabled={uploading}
                className="px-4 py-2 bg-gray-500 text-white rounded disabled:opacity-50"
                type="button"
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
