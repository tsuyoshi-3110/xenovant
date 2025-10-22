"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Pin, Plus } from "lucide-react";
import { v4 as uuid } from "uuid";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  CollectionReference,
  DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useThemeGradient } from "@/lib/useThemeGradient";
import clsx from "clsx";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import SortableItem from "../SortableItem";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ProductMedia from "../ProductMedia";
import { uploadProductMedia } from "@/lib/media/uploadProductMedia";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

// 多言語
import { useUILang, type UILang } from "@/lib/atoms/uiLangAtom";
import { BusyOverlay } from "../BusyOverlay";
import { IMAGE_MIME_TYPES, VIDEO_MIME_TYPES } from "@/lib/fileTypes";
import { displayOf, sectionTitleLoc } from "@/lib/i18n/display";
import { translateAll, translateSectionTitleAll } from "@/lib/i18n/translate";
import {
  type ProdDoc,
  type Base,
  type Tr,
  type MediaType,
} from "@/types/productLocales";
import { useProducts } from "@/hooks/useProducts";
import { useSections } from "@/hooks/useSections";
import SectionManagerModal from "./SectionManagerModal";
import { useFxRates } from "@/lib/fx/client";

/* ================= キーワード入力モーダル ================= */
type KeywordModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (keywords: string[]) => void;
};
function KeywordModal({ open, onClose, onSubmit }: KeywordModalProps) {
  const [k1, setK1] = useState("");
  const [k2, setK2] = useState("");
  const [k3, setK3] = useState("");

  if (!open) return null;

  const handleSubmit = () => {
    const kws = [k1, k2, k3].map((s) => s.trim()).filter(Boolean);
    if (kws.length === 0) {
      alert("キーワードを1つ以上入力してください（最大3つまで）");
      return;
    }
    onSubmit(kws);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-white rounded-lg p-5 space-y-4 shadow-xl">
        <h3 className="text-lg font-semibold text-center">AI紹介文のキーワード</h3>
        <p className="text-sm text-gray-600 text-center">
          最大3つまで入力できます。少なくとも1つ入力すると生成します。
        </p>
        <div className="space-y-2">
          <input
            value={k1}
            onChange={(e) => setK1(e.target.value)}
            placeholder="キーワード1（例：濃厚クリーム）"
            className="w-full border rounded px-3 h-10"
          />
          <input
            value={k2}
            onChange={(e) => setK2(e.target.value)}
            placeholder="キーワード2（任意）"
            className="w-full border rounded px-3 h-10"
          />
          <input
            value={k3}
            onChange={(e) => setK3(e.target.value)}
            placeholder="キーワード3（任意）"
            className="w-full border rounded px-3 h-10"
          />
        </div>
        <div className="flex gap-2 justify-center pt-1">
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            生成する
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== 税率・丸め ===== */
const TAX_RATE = 0.1 as const;
type RoundingPolicy = "round" | "floor" | "ceil";
const ROUNDING_POLICY: RoundingPolicy = "round";
const rint = (n: number, policy: RoundingPolicy = ROUNDING_POLICY) =>
  policy === "floor" ? Math.floor(n) : policy === "ceil" ? Math.ceil(n) : Math.round(n);
const toExclYen = (
  incl: number,
  taxRate = TAX_RATE,
  policy: RoundingPolicy = ROUNDING_POLICY
) => rint((Number(incl) || 0) / (1 + taxRate), policy);

/* ===== 表示テキスト ===== */
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

const PAGE_SIZE = 20;
const MAX_VIDEO_SEC = 30;

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
  const { currency, locale } = CURRENCY_BY_LANG[uiLang] ?? { currency: "JPY", locale: "ja-JP" };
  if (!rates || currency === "JPY" || rates[currency] == null) {
    return { text: new Intl.NumberFormat(locale, { style: "currency", currency: "JPY" }).format(amountJPY), approx: false };
  }
  const converted = amountJPY * rates[currency];
  return { text: new Intl.NumberFormat(locale, { style: "currency", currency }).format(converted), approx: true };
}

export default function ProductsClient() {
  /* ===== 状態 ===== */
  const [isAdmin, setIsAdmin] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<ProdDoc | null>(null);
  const [file, setFile] = useState<File | null>(null);

  // 原文（日本語）
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [taxIncluded, setTaxIncluded] = useState(true); // UIは維持・保存は常に税込

  // セクション（フォーム用）
  const [formSectionId, setFormSectionId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("all");
  const [showSecModal, setShowSecModal] = useState(false);
  const [newSecName, setNewSecName] = useState("");

  // 進捗
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadingPercent, setUploadingPercent] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const uploading = progress !== null;

  // AI 生成
  const [aiLoading, setAiLoading] = useState(false);
  const [showKeywordModal, setShowKeywordModal] = useState(false);

  const gradient = useThemeGradient();
  const router = useRouter();
  const { uiLang } = useUILang();
  const taxT = TAX_T[uiLang] ?? TAX_T.ja;

  /* 為替 */
  const { rates } = useFxRates();

  /* ===== Firestore refs ===== */
  const productColRef: CollectionReference<DocumentData> = useMemo(
    () => collection(db, "siteProducts", SITE_KEY, "items"),
    []
  );

  /* ===== Hooks: Products / Sections ===== */
  const { list, handleDragEnd } = useProducts({
    productColRef,
    selectedSectionId,
    pageSize: PAGE_SIZE,
  });

  const {
    sections,
    add: addSection,
    remove: removeSection,
    reorder: reorderSections,
  } = useSections(SITE_KEY);

  /* ===== 権限 ===== */
  useEffect(() => onAuthStateChanged(auth, (u) => setIsAdmin(!!u)), []);

  /* ===== ラベル ===== */
  const currentSectionLabel =
    selectedSectionId === "all"
      ? ALL_CATEGORY_T[uiLang] ?? ALL_CATEGORY_T.ja
      : sections.find((s) => s.id === selectedSectionId)
      ? sectionTitleLoc(sections.find((s) => s.id === selectedSectionId)!, uiLang)
      : "";

  /* ===== DnD センサー（固定） ===== */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  );

  /* ===== UIヘルパ ===== */
  const resetFields = useCallback(() => {
    setEditing(null);
    setTitle("");
    setBody("");
    setPrice("");
    setFile(null);
    setFormSectionId("");
  }, []);

  const openAdd = useCallback(() => {
    if (uploading) return;
    resetFields();
    setFormMode("add");
  }, [resetFields, uploading]);

  const closeForm = useCallback(() => {
    if (uploading) return;
    setTimeout(() => {
      resetFields();
      setFormMode(null);
    }, 100);
  }, [resetFields, uploading]);

  /* ===== AI 紹介文生成（キーワード対応） ===== */
  const handleGenerateBody = useCallback(
    async (keywords: string[]) => {
      if (!title) {
        alert("タイトルを入力してください");
        return;
      }
      const kws = (keywords || []).map((s) => s.trim()).filter(Boolean);
      if (kws.length === 0) {
        alert("キーワードを1つ以上入力してください");
        return;
      }
      try {
        setAiLoading(true);
        const res = await fetch("/api/generate-description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, price, keywords: kws }),
        });
        const data = await res.json();
        if (data?.body) {
          setBody(data.body);
        } else {
          alert("生成に失敗しました");
        }
      } catch {
        alert("エラーが発生しました");
      } finally {
        setAiLoading(false);
      }
    },
    [title, price]
  );

  /* ===== 保存 ===== */
  const saveProduct = useCallback(async () => {
    if (uploading) return;
    if (!title.trim()) return alert("タイトル必須");
    if (price === "") return alert("価格を入力してください");
    if (formMode === "add" && !file) return alert("メディアを選択してください");

    setSaving(true);
    try {
      const id = editing?.id ?? uuid();

      // メディア（アップロード or 既存）
      let mediaURL = editing?.mediaURL ?? "";
      let mediaType: MediaType = (editing?.mediaType ?? "image") as MediaType;

      if (file) {
        const isValidVideo = VIDEO_MIME_TYPES.includes(file.type);
        const isValidImage = IMAGE_MIME_TYPES.includes(file.type);
        if (!isValidImage && !isValidVideo) {
          alert("対応形式：画像（JPEG, PNG, WEBP, GIF）／動画（MP4, MOV など）");
          throw new Error("invalid file type");
        }

        setProgress(0);
        setUploadingPercent(0);

        const up = await uploadProductMedia({
          file,
          siteKey: SITE_KEY,
          docId: id,
          previousType: editing?.mediaType,
          onProgress: (pct) => {
            setProgress(pct);
            setUploadingPercent(pct);
          },
        });
        mediaURL = up.mediaURL;
        mediaType = up.mediaType;

        setProgress(null);
        setUploadingPercent(null);
      }

      // 本文（日本語=base、jaは翻訳しない）
      const base: Base = { title: title.trim(), body: body.trim() };
      const tAll = await translateAll(base.title, base.body);
      const t: Tr[] = tAll.filter((x) => x.lang !== "ja");

      // 価格（保存は税込固定）
      const priceIncl = rint(Number(price) || 0);
      const priceExcl = toExclYen(priceIncl);

      const payload: any = {
        title: base.title,
        body: base.body,
        price: priceIncl,
        priceIncl,
        priceExcl,
        taxRate: TAX_RATE,
        taxIncluded: true,
        priceInputMode: "incl",
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
        await addDoc(productColRef, { ...payload, createdAt: serverTimestamp() });
      }

      setProgress(null);
      setUploadingPercent(null);
      closeForm();
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました。対応形式や容量をご確認ください。");
      setProgress(null);
      setUploadingPercent(null);
    } finally {
      setSaving(false);
    }
  }, [
    uploading,
    title,
    body,
    price,
    formMode,
    file,
    editing,
    formSectionId,
    productColRef,
    closeForm,
  ]);

  if (!gradient) return null;

  return (
    <main className="max-w-5xl mx-auto p-4 pt-10">
      <BusyOverlay uploadingPercent={uploadingPercent} saving={saving} />

      {/* ヘッダー */}
      <div className="mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        {/* セクションピッカー */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-white text-outline opacity-70">表示カテゴリ:</label>
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
              <option value="all">{ALL_CATEGORY_T[uiLang] ?? ALL_CATEGORY_T.ja}</option>
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

        {isAdmin && (
          <button
            onClick={() => setShowSecModal(true)}
            className="px-3 py-2 rounded bg-blue-600 text-white shadow hover:bg-blue-700"
          >
            セクション管理
          </button>
        )}
      </div>

      {/* セクション管理モーダル */}
      {showSecModal && (
        <SectionManagerModal
          open={showSecModal}
          onClose={() => setShowSecModal(false)}
          sections={sections}
          saving={saving}
          newSecName={newSecName}
          setNewSecName={setNewSecName}
          onAddSection={async (titleJa) => {
            const t = await translateSectionTitleAll(titleJa);
            await addSection(titleJa, t);
          }}
          onRemoveSection={removeSection}
          onReorderSection={reorderSections}
        />
      )}

      {/* 商品一覧（DnD） */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToWindowEdges]}
      >
        <SortableContext items={list.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {list.map((p) => {
              const loc = displayOf(p, uiLang);
              const amountJPY = (p.priceIncl ?? p.price ?? 0);
              const { text, approx } = formatPriceFromJPY(amountJPY, uiLang, rates);

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
                        router.push(`/products/${p.id}`);
                      }}
                      className={clsx(
                        "flex flex-col h-full border shadow relative transition-colors duration-200 rounded-2xl",
                        "bg-gradient-to-b",
                        gradient,
                        isDragging ? "bg-yellow-100" : "bg-transparent",
                        "backdrop-blur-sm",
                        "ring-1 ring-white/10"
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

                      <ProductMedia src={p.mediaURL} type={p.mediaType} className="rounded-t-xl" />

                      <div className="p-1 space-y-1">
                        <h2 className="text-white text-outline">
                          {loc.title || p.title || "（無題）"}
                        </h2>
                        <p className="text-white text-outline">
                          {approx ? "≈ " : ""}
                          {text}（{taxT.incl}）
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

      {/* 新規商品追加ボタン */}
      {isAdmin && formMode === null && (
        <button
          onClick={openAdd}
          aria-label="新規追加"
          disabled={uploading}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg hover:bg-pink-700 active:scale-95 transition disabled:opacity-50 cursor-pointer"
        >
          <Plus size={28} />
        </button>
      )}

      {/* 新規/編集モーダル（中央表示） */}
      {isAdmin && formMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
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
              placeholder="価格 (円)"
              value={price}
              onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full border px-3 py-2 rounded"
              disabled={uploading}
            />

            <div className="flex gap-4">
              <label>
                <input type="radio" checked={taxIncluded} onChange={() => setTaxIncluded(true)} />
                税込
              </label>
              <label>
                <input type="radio" checked={!taxIncluded} onChange={() => setTaxIncluded(false)} />
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

            {/* AI 紹介文生成（キーワード入力モーダル起動） */}
            <button
              onClick={() => setShowKeywordModal(true)}
              disabled={uploading || aiLoading}
              className="w-full mt-2 px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {aiLoading ? "生成中…" : "AIで紹介文を生成（キーワード指定）"}
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
              <p className="text-sm text-gray-600">現在のファイル: {editing.originalFileName}</p>
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

      {/* キーワード入力モーダル */}
      <KeywordModal
        open={showKeywordModal}
        onClose={() => setShowKeywordModal(false)}
        onSubmit={(kws) => {
          setShowKeywordModal(false);
          handleGenerateBody(kws);
        }}
      />
    </main>
  );
}
