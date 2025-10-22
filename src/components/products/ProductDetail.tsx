// src/components/ProductDetail.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import clsx from "clsx";
import { v4 as uuid } from "uuid";
import imageCompression from "browser-image-compression";
import { motion } from "framer-motion";

import { useThemeGradient } from "@/lib/useThemeGradient";
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

import CardSpinner from "../CardSpinner";
import { BusyOverlay } from "../BusyOverlay";

/* ファイル形式ユーティリティ */
import {
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  extFromMime,
} from "@/lib/fileTypes";

import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

/* ▼ 多言語対応：UI言語 & 対応言語一覧 */
import { LANGS, type LangKey } from "@/lib/langs";
import { useUILang, type UILang } from "@/lib/atoms/uiLangAtom";

/* ▼ 為替レート（カード一覧と同様の通貨表示ロジックを適用） */
import { useFxRates } from "@/lib/fx/client";

/* ===== 言語→通貨/ロケール と表示関数 ===== */
const CURRENCY_BY_LANG: Record<UILang, { currency: string; locale: string }> = {
  ja: { currency: "JPY", locale: "ja-JP" },
  en: { currency: "USD", locale: "en-US" },
  zh: { currency: "CNY", locale: "zh-CN" },
  "zh-TW": { currency: "TWD", locale: "zh-TW" },
  ko: { currency: "KRW", locale: "ko-KR" },
  fr: { currency: "EUR", locale: "fr-FR" },
  es: { currency: "EUR", locale: "es-ES" },
  de: { currency: "EUR", locale: "de-DE" },
  pt: { currency: "BRL", locale: "pt-BR" },
  it: { currency: "EUR", locale: "it-IT" },
  ru: { currency: "RUB", locale: "ru-RU" },
  th: { currency: "THB", locale: "th-TH" },
  vi: { currency: "VND", locale: "vi-VN" },
  id: { currency: "IDR", locale: "id-ID" },
  hi: { currency: "INR", locale: "hi-IN" },
  ar: { currency: "AED", locale: "ar-AE" },
};

function formatPriceFromJPY(
  amountJPY: number,
  uiLang: UILang,
  rates: Record<string, number> | null
) {
  const map = CURRENCY_BY_LANG[uiLang] ?? { currency: "JPY", locale: "ja-JP" };
  const { currency, locale } = map;
  if (!rates || currency === "JPY" || rates[currency] == null) {
    return {
      text: new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "JPY",
      }).format(amountJPY),
      approx: false,
    };
  }
  const converted = amountJPY * rates[currency];
  return {
    text: new Intl.NumberFormat(locale, { style: "currency", currency }).format(
      converted
    ),
    approx: true,
  };
}

// ==== 税率・丸め・相互変換 ====
const TAX_RATE = 0.1 as const; // 10%
type RoundingPolicy = "round" | "floor" | "ceil";
const ROUNDING_POLICY: RoundingPolicy = "round";

function rint(n: number, policy: RoundingPolicy = ROUNDING_POLICY) {
  if (policy === "floor") return Math.floor(n);
  if (policy === "ceil") return Math.ceil(n);
  return Math.round(n);
}
function toInclYen(
  excl: number,
  taxRate = TAX_RATE,
  policy: RoundingPolicy = ROUNDING_POLICY
) {
  return rint((Number(excl) || 0) * (1 + taxRate), policy);
}
function toExclYen(
  incl: number,
  taxRate = TAX_RATE,
  policy: RoundingPolicy = ROUNDING_POLICY
) {
  return rint((Number(incl) || 0) / (1 + taxRate), policy);
}

type MediaType = "image" | "video";

/* ▼ セクション（タイトルのみ、多言語対応・order対応） */
type Section = {
  id: string;
  base: { title: string };
  t: Array<{ lang: LangKey; title?: string }>;
  createdAt?: any;
  order?: number;
};

type ProductDoc = Product & {
  price: number; // 表示用（互換）: 常に税込を入れる
  priceIncl?: number; // 追加：税込（保存用 / 読み取り用）
  priceExcl?: number; // 追加：税抜（保存用 / 読み取り用）
  taxRate?: number; // 追加：税率（任意）
  base?: { title: string; body: string };
  t?: Array<{ lang: LangKey; title?: string; body?: string }>;
  sectionId?: string | null;
};

/* ▼ 価格を常に number に正規化（未定義/NaNは 0） */
const normalizePrice = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

/* ▼ 表示用：UI 言語に応じてタイトル/本文を解決 */
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

/* ▼ 保存時に日本語→各言語へ翻訳（/api/translate を使用） */
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

/* 税込/税抜 表示の多言語辞書（既存） */
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
  ar: { incl: "शامل الضريبة", excl: "غير شامل الضريبة" } as any, //（UIフォント差異回避のため any）
};

export default function ProductDetail({ product }: { product: Product }) {
  /* ---------- 権限・テーマ ---------- */
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPercent, setUploadingPercent] = useState<number | null>(null);
  const gradient = useThemeGradient();
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setIsAdmin(!!u));
    return () => unsub();
  }, []);

  /* ---------- UI言語 ---------- */
  const { uiLang } = useUILang();
  const taxT = TAX_T[uiLang] ?? TAX_T.ja;

  /* ---------- 為替レート ---------- */
  const { rates } = useFxRates();

  /* ---------- 表示用データ ---------- */
  const seedProduct: ProductDoc = {
    ...(product as ProductDoc),
    price: normalizePrice(
      (product as ProductDoc).priceIncl ?? (product as ProductDoc).price
    ),
    priceIncl: (product as ProductDoc).priceIncl,
    priceExcl: (product as ProductDoc).priceExcl,
    taxRate: (product as ProductDoc).taxRate ?? TAX_RATE,
  };

  const [displayProduct, setDisplayProduct] = useState<ProductDoc>(seedProduct);

  /* ---------- セクション一覧（ピッカー用） ---------- */
  const [sections, setSections] = useState<Section[]>([]);

  /* ---------- 編集モーダル用 state ---------- */
  const [showEdit, setShowEdit] = useState(false);
  const [title, setTitle] = useState(product.title);
  const [body, setBody] = useState<string>(product.body ?? "");
  const [price, setPrice] = useState<number | "">(
    normalizePrice((product as ProductDoc).price)
  );
  const [taxIncluded, setTaxIncluded] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const uploading = progress !== null;

  // セクション選択
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    (product as any).sectionId ?? null
  );

  // product 変更時の同期
  useEffect(() => {
    const pNum = normalizePrice(
      (product as ProductDoc).priceIncl ?? (product as ProductDoc).price
    );

    setDisplayProduct({
      ...(product as ProductDoc),
      price: pNum,
      priceIncl: (product as ProductDoc).priceIncl ?? pNum,
      priceExcl: (product as ProductDoc).priceExcl,
      taxRate: (product as ProductDoc).taxRate ?? TAX_RATE,
    });

    setSelectedSectionId((product as any).sectionId ?? null);
    setBody(product.body ?? "");
    setPrice(pNum);
    setTitle(product.title ?? "");
    setTaxIncluded(true);
  }, [product]);

  /* ---------- セクション購読（createdAt → order 昇順） ---------- */
  useEffect(() => {
    const secRef = collection(db, "siteSections", SITE_KEY, "sections");
    const q = query(secRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
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

  const openEditModal = () => {
    const p = normalizePrice(displayProduct.priceIncl ?? displayProduct.price);

    setTitle(displayProduct.base?.title ?? displayProduct.title ?? "");
    setBody(displayProduct.base?.body ?? displayProduct.body ?? "");
    setPrice(p);
    setTaxIncluded(true);
    setSelectedSectionId(displayProduct.sectionId ?? null);
    setFile(null);
    setProgress(null);

    setShowEdit(true);
  };

  // 編集保存
  const handleSave = async () => {
    if (!title.trim()) return alert("タイトル必須");
    if (price === "") return alert("価格を入力してください");

    setSaving(true); // BusyOverlay
    try {
      // --- メディア確定 ---
      const { mediaURL, mediaType, originalFileName } = await (async () => {
        let mediaURL = displayProduct.mediaURL;
        let mediaType: MediaType = displayProduct.mediaType;
        let originalFileName = displayProduct.originalFileName as
          | string
          | undefined;

        if (!file) return { mediaURL, mediaType, originalFileName };

        const isVideo = file.type.startsWith("video/");
        mediaType = isVideo ? "video" : "image";

        const isValidImage = IMAGE_MIME_TYPES.includes(file.type);
        const isValidVideo = VIDEO_MIME_TYPES.includes(file.type);
        if (!isValidImage && !isValidVideo) {
          alert("対応形式ではありません");
          throw new Error("invalid file type");
        }
        if (isVideo && file.size > 50 * 1024 * 1024) {
          alert("動画は 50 MB 未満にしてください");
          throw new Error("video too large");
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

        setProgress(0);
        setUploadingPercent(0);
        task.on("state_changed", (s) => {
          const pct = Math.round((s.bytesTransferred / s.totalBytes) * 100);
          setProgress(pct);
          setUploadingPercent(pct);
        });

        await task;

        mediaURL = `${await getDownloadURL(storageRef)}?v=${uuid()}`;
        originalFileName = file.name;
        setProgress(null);
        setUploadingPercent(null);

        return { mediaURL, mediaType, originalFileName };
      })();

      // --- 多言語フィールド ---
      const base = { title: title.trim(), body: (body ?? "").trim() };
      const t = await translateAll(base.title, base.body);

      // --- 税込/税抜の両方を算出 ---
      const input = Number(price);
      const priceIncl = taxIncluded ? rint(input) : toInclYen(input);
      const priceExcl = taxIncluded ? toExclYen(priceIncl) : rint(input);

      // --- Firestore 更新（price は互換のため税込を保存） ---
      await updateDoc(doc(db, "siteProducts", SITE_KEY, "items", product.id), {
        title: base.title,
        body: base.body,
        price: priceIncl,
        priceIncl,
        priceExcl,
        taxRate: TAX_RATE,
        priceInputMode: taxIncluded ? "incl" : "excl",
        taxIncluded: true,
        mediaURL,
        mediaType,
        base,
        t,
        sectionId: selectedSectionId ?? null,
        originalFileName: originalFileName ?? displayProduct.originalFileName,
        updatedAt: serverTimestamp(),
      });

      // --- ローカル即時反映 ---
      setDisplayProduct((prev) => ({
        ...(prev as ProductDoc),
        title: base.title,
        body: base.body,
        price: priceIncl,
        priceIncl,
        priceExcl,
        taxRate: TAX_RATE,
        mediaURL,
        mediaType,
        base,
        t,
        sectionId: selectedSectionId ?? null,
        originalFileName: originalFileName ?? (prev as any).originalFileName,
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

  if (!displayProduct) {
    return (
      <main className="min-h-screen flex items-center justify-center pt-24">
        <CardSpinner />
      </main>
    );
  }

  /* 表示テキスト（タイトル/本文のみ多言語） */
  const loc = pickLocalized(displayProduct, uiLang);

  /* 表示価格：UI言語の通貨に変換（レートが無ければ JPY のまま） */
  const amountJPY = Number(
    displayProduct.price ?? displayProduct.priceIncl ?? 0
  );
  const { text: priceText, approx } = formatPriceFromJPY(
    amountJPY,
    uiLang,
    rates
  );

  return (
    <main className="min-h-screen flex items-start justify-center p-4 pt-24">
      {/* アップロード/保存中オーバーレイ */}
      <BusyOverlay uploadingPercent={uploadingPercent} saving={saving} />

      {/* カード外枠 */}
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
          "text-white text-outline"
        )}
      >
        {/* 編集・削除 */}
        {isAdmin && (
          <div className="absolute top-2 right-2 z-20 flex gap-1">
            <button
              onClick={openEditModal}
              className="px-2 py-1 bg-blue-600 text-white text-md rounded shadow disabled:opacity-50"
            >
              編集
            </button>
            <button
              onClick={handleDelete}
              className="px-2 py-1 bg-red-600 text-white text-md rounded shadow disabled:opacity-50"
            >
              削除
            </button>
          </div>
        )}

        {/* メディア */}
        {displayProduct.mediaType === "image" ? (
          <div className="relative w-full aspect-square">
            <Image
              src={displayProduct.mediaURL}
              alt={loc.title || displayProduct.title}
              fill
              className="object-cover"
              sizes="100vw"
              unoptimized
            />
          </div>
        ) : (
          <video
            src={displayProduct.mediaURL}
            muted
            playsInline
            autoPlay
            loop
            preload="auto"
            className="w-full aspect-square object-cover"
          />
        )}

        {/* テキスト */}
        <div className="p-4 space-y-2">
          <h1 className={clsx("text-lg font-bold", "text-white text-outline")}>
            {loc.title}
          </h1>
          <p className={clsx("font-semibold", "text-white text-outline")}>
            {approx ? "≈ " : ""}
            {priceText}（{taxT.incl}）
          </p>
          {loc.body && (
            <p
              className={clsx(
                "text-sm whitespace-pre-wrap leading-relaxed",
                "text-white text-outline"
              )}
            >
              {loc.body}
            </p>
          )}
        </div>
      </motion.div>

      {/* ---------- 編集モーダル ---------- */}
      {isAdmin && showEdit && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-white rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-bold text-center">商品を編集</h2>

            {/* セクションピッカー */}
            <div className="space-y-1">
              <label className="text-sm">カテゴリー</label>
              <select
                className="w-full border px-3 h-10 rounded bg-white"
                value={selectedSectionId ?? ""}
                onChange={(e) =>
                  setSelectedSectionId(
                    e.target.value === "" ? null : e.target.value
                  )
                }
                disabled={uploading}
              >
                <option value="">未設定</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.base?.title ?? ""}
                  </option>
                ))}
              </select>
            </div>

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
              placeholder="価格 (円)"
              value={price}
              onChange={(e) =>
                setPrice(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-full border px-3 py-2 rounded"
              disabled={uploading}
            />

            <div className="flex gap-4">
              <label>
                <input
                  type="radio"
                  checked={taxIncluded}
                  onChange={() => setTaxIncluded(true)}
                />
                税込
              </label>
              <label>
                <input
                  type="radio"
                  checked={!taxIncluded}
                  onChange={() => setTaxIncluded(false)}
                />
                税抜
              </label>
            </div>

            <textarea
              placeholder="紹介文"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              rows={4}
              disabled={uploading}
            />

            <input
              type="file"
              accept={[...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="bg-gray-500 text-white w-full h-10 px-3 py-1 rounded"
              disabled={uploading}
            />

            {uploading && (
              <div className="w-full flex flex-col items-center gap-2">
                <p>アップロード中… {progress}%</p>
                <div className="w-full h-2 bg-gray-200 rounded">
                  <div
                    className="h-full bg-green-500 rounded transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-center">
              <button
                onClick={handleSave}
                disabled={uploading}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
              >
                更新
              </button>
              <button
                onClick={() => !uploading && setShowEdit(false)}
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
