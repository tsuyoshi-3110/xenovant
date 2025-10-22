// components/AboutClient.tsx
"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  DocumentData,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  getDownloadURL,
  uploadBytesResumable,
  deleteObject,
} from "firebase/storage";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import CardSpinner from "./CardSpinner";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import { useUILang } from "@/lib/atoms/uiLangAtom";
import { LANGS as TARGET_LANGS } from "@/lib/langs";

// ✅ 共通ファイル形式ユーティリティ
import {
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  extFromMime,
} from "@/lib/fileTypes";

// ✅ 共通 BusyOverlay
import { BusyOverlay } from "./BusyOverlay";

/* ───────── 定数 ───────── */
const STORAGE_PATH = `sitePages/${SITE_KEY}/about`;
const MAX_VIDEO_SEC = 60;

/* ───────── 型 ───────── */
type MediaType = "image" | "video" | undefined;
type LangKey = (typeof TARGET_LANGS)[number]["key"] | "ja";

type AboutDoc = {
  text?: string; // 互換
  base?: { text?: string };
  t?: Array<{ lang: string; text?: string }>;
  mediaUrl?: string | null;
  mediaType?: MediaType | null;
  fileName?: string | null;
};

/* ───────── ユーティリティ ───────── */
const omitUndefined = <T extends Record<string, any>>(obj: T) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;

function readBase(d: AboutDoc | null | undefined): string {
  return (d?.base?.text ?? d?.text ?? "").toString();
}
function pickLocalized(
  d: AboutDoc | null | undefined,
  uiLang: LangKey
): string {
  const base = readBase(d);
  if (uiLang === "ja" || !d?.t) return base;
  return (d.t.find((x) => x.lang === uiLang)?.text ?? base).toString();
}
async function translateOne(body: string, target: LangKey): Promise<string> {
  if (!body.trim()) return "";
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "", body, target }),
  });
  if (!res.ok) throw new Error("translate API error");
  const data = (await res.json()) as { body?: string };
  return (data.body ?? "").toString();
}
async function buildAllTranslations(baseText: string): Promise<AboutDoc["t"]> {
  const keys = TARGET_LANGS.map((l) => l.key as LangKey);
  const out = await Promise.all(
    keys.map(async (k) => ({ lang: k, text: await translateOne(baseText, k) }))
  );
  return out;
}

/* ───────── 本体 ───────── */
export default function AboutClient() {
  const { uiLang } = useUILang();
  const gradient = useThemeGradient();
  const docRef = useMemo(
    () => doc(db, "sitePages", SITE_KEY, "pages", "about"),
    []
  );

  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docData, setDocData] = useState<AboutDoc | null>(null);

  const displayText = useMemo(
    () => pickLocalized(docData, uiLang),
    [docData, uiLang]
  );

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);

  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* 認証 */
  useEffect(() => onAuthStateChanged(auth, (u) => setIsAdmin(!!u)), []);

  /* 初期取得 */
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const raw = snap.data() as DocumentData;
          const parsed: AboutDoc = {
            text: raw.text,
            base: raw.base,
            t: Array.isArray(raw.t) ? raw.t : undefined,
            mediaUrl: raw.mediaUrl ?? null,
            mediaType: raw.mediaType ?? null,
            fileName: raw.fileName ?? null,
          };
          setDocData(parsed);
          setDraftText(readBase(parsed));
        } else {
          setDocData({ base: { text: "" }, t: [] });
          setDraftText("");
        }
      } finally {
        setLoadingDoc(false);
      }
    })();
  }, [docRef]);

  /* ファイル選択 */
  const handleSelectFile = (file: File) => {
    const okType = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].includes(
      file.type
    );
    if (!okType) {
      alert("対応していない形式です");
      return;
    }

    if (VIDEO_MIME_TYPES.includes(file.type)) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(v.src);
        if ((v.duration || 0) > MAX_VIDEO_SEC) {
          alert(`動画は${MAX_VIDEO_SEC}秒以内にしてください`);
          return;
        }
        setDraftFile(file);
        setPreviewURL(URL.createObjectURL(file));
      };
      v.onerror = () => alert("動画の読み込みに失敗しました");
      v.src = URL.createObjectURL(file);
    } else {
      setDraftFile(file);
      setPreviewURL(URL.createObjectURL(file));
    }
  };

  /* 保存（常に全言語上書き） */
  const handleSave = useCallback(async () => {
    if (!docData) return;
    setSaving(true);
    try {
      // メディア差し替え
      let nextMediaUrl: string | null | undefined = docData.mediaUrl ?? null;
      let nextMediaType: MediaType | null = docData.mediaType ?? null;
      let nextFileName: string | null | undefined = docData.fileName ?? null;

      if (draftFile) {
        // 旧ファイル（URL）を消す試み（失敗しても続行）
        if (docData.mediaUrl) {
          try {
            await deleteObject(ref(getStorage(), docData.mediaUrl));
          } catch {}
        }

        const ext = extFromMime(draftFile.type);
        const storageRef = ref(
          getStorage(),
          `${STORAGE_PATH}/${Date.now()}.${ext}`
        );
        const task = uploadBytesResumable(storageRef, draftFile, {
          contentType: draftFile.type,
        });

        setUploadProgress(0);

        nextMediaUrl = await new Promise<string>((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) =>
              setUploadProgress(
                Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
              ),
            reject,
            async () => resolve(await getDownloadURL(task.snapshot.ref))
          );
        });

        nextMediaType = VIDEO_MIME_TYPES.includes(draftFile.type)
          ? "video"
          : "image";
        nextFileName = draftFile.name;
      }

      // ★ 全言語を必ず再翻訳
      const baseText = draftText;
      const nextT = await buildAllTranslations(baseText);

      // Firestore へ undefined を書かない
      const payload = omitUndefined<AboutDoc>({
        base: { text: baseText },
        t: nextT,
        text: baseText, // 後方互換
        mediaUrl: nextMediaUrl ?? null,
        mediaType: nextMediaType ?? null,
        fileName: nextFileName ?? null,
      });

      await setDoc(docRef, payload, { merge: true });

      setDocData((prev) => ({
        ...(prev ?? {}),
        ...payload,
      }));
      setDraftFile(null);
      setPreviewURL(null);
      setEditing(false);
      alert("保存しました！");
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました");
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  }, [docData, draftText, draftFile, docRef]);

  if (!gradient) return <CardSpinner />;
  if (loadingDoc) return <CardSpinner />;

  return (
    <main className="relative max-w-3xl mx-auto px-4 py-4 ">
      {/* ✅ 共通 BusyOverlay（進捗＆保存中） */}
      <BusyOverlay uploadingPercent={uploadProgress} saving={saving} />

      {/* 表示カード */}
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="rounded-2xl border border-white/30 bg-white/30 backdrop-blur-md shadow-lg overflow-hidden"
      >
        {docData?.mediaUrl && (
          <div className="relative w-full pt-[100%] bg-black/20 overflow-hidden">
            {docData.mediaType === "image" ? (
              <Image
                src={docData.mediaUrl}
                alt="about-media"
                fill
                sizes="(max-width:768px) 100vw, 768px"
                className="object-cover"
                priority
                unoptimized
              />
            ) : (
              <video
                src={docData.mediaUrl}
                className="absolute inset-0 w-full h-full object-cover"
                muted
                autoPlay
                loop
                playsInline
              />
            )}
          </div>
        )}
        <div className="p-5">
          <motion.div
            key={displayText}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="leading-relaxed whitespace-pre-wrap prose prose-neutral max-w-none"
          >
            {displayText || "ただいま準備中です。"}
          </motion.div>

          {isAdmin && !editing && (
            <motion.div
              className="mt-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Button
                onClick={() => {
                  setDraftText(readBase(docData));
                  setEditing(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 transition-colors shadow"
              >
                編集する
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* 編集モーダル */}
      <AnimatePresence>
        {isAdmin && editing && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/50"
              aria-hidden
              onClick={() => setEditing(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-2xl mx-4 rounded-2xl bg-white/30 shadow-2xl backdrop-blur-lg p-6 space-y-6 max-h-[90vh] overflow-y-auto"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
            >
              {/* テキスト（伸びない・スクロール可能） */}
              <div className="space-y-2">
                <div className="text-sm text-gray-700">編集してください。</div>
                <Textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  className="min-h-40 max-h-[60vh] resize-y overflow-auto bg-white/70 border-gray-200 text-black placeholder-gray-400 focus-visible:ring-2 focus-visible:ring-indigo-500"
                  placeholder="ここに文章を入力..."
                />
                <div className="text-right text-xs text-gray-600">
                  文字数：{draftText.length.toLocaleString()}
                </div>
              </div>

              {/* メディア */}
              <section className="space-y-2">
                <label className="font-medium">
                  画像 / 動画（{MAX_VIDEO_SEC}秒以内）
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving}
                  >
                    {draftFile ? "別のファイルを選ぶ" : "画像/動画を選択"}
                  </Button>
                  {(draftFile || previewURL) && (
                    <span className="text-xs text-gray-600 truncate max-w-[12rem]">
                      {draftFile?.name}
                    </span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={[...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].join(",")}
                  onChange={(e) =>
                    e.target.files?.[0] && handleSelectFile(e.target.files[0])
                  }
                  className="hidden"
                />

                {docData?.mediaUrl && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      try {
                        // URL指定の削除は失敗することもあるため、失敗は握りつぶす
                        await deleteObject(
                          ref(getStorage(), docData.mediaUrl!)
                        ).catch(() => {});
                        await updateDoc(docRef, {
                          mediaUrl: null,
                          mediaType: null,
                          fileName: null,
                        });
                        setDocData({
                          ...docData,
                          mediaUrl: null,
                          mediaType: null,
                          fileName: null,
                        });
                        setDraftFile(null);
                        setPreviewURL(null);
                      } catch {
                        alert("削除に失敗しました");
                      }
                    }}
                  >
                    メディアを削除
                  </Button>
                )}
              </section>

              {/* アクション */}
              <div className="flex flex-col gap-2">
                <AIWriter onApply={(text) => setDraftText(text)} />
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "保存中…" : "保存"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setDraftFile(null);
                    setPreviewURL(null);
                  }}
                >
                  キャンセル
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/* ================== AI生成モーダル ================== */
function AIWriter({ onApply }: { onApply: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [k1, setK1] = useState("");
  const [k2, setK2] = useState("");
  const [k3, setK3] = useState("");
  const [loading, setLoading] = useState(false);
  const nonEmpty = [k1, k2, k3].map((s) => s.trim()).filter(Boolean);

  return (
    <>
      <Button
        className="bg-indigo-600 hover:bg-indigo-700"
        onClick={() => setOpen(true)}
      >
        AIで作成
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60"
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-md mx-4 rounded-2xl bg-white p-6 shadow-2xl space-y-4"
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
            >
              <h2 className="text-xl font-bold text-center">AIで文章を生成</h2>
              <p className="text-sm text-gray-500 text-center">
                最低1個以上のキーワードを入力してください
              </p>
              <div className="flex flex-col gap-2">
                <input
                  className="border p-2 rounded"
                  placeholder="キーワード1"
                  value={k1}
                  onChange={(e) => setK1(e.target.value)}
                />
                <input
                  className="border p-2 rounded"
                  placeholder="キーワード2"
                  value={k2}
                  onChange={(e) => setK2(e.target.value)}
                />
                <input
                  className="border p-2 rounded"
                  placeholder="キーワード3"
                  value={k3}
                  onChange={(e) => setK3(e.target.value)}
                />
              </div>
              <div className="text-xs text-gray-500 min-h-5">
                {nonEmpty.length > 0 && (
                  <>
                    送信キーワード：<b>{nonEmpty.join(" ／ ")}</b>
                  </>
                )}
              </div>
              <Button
                className="bg-indigo-600 w-full disabled:opacity-50 hover:bg-indigo-700"
                disabled={nonEmpty.length === 0 || loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const res = await fetch("/api/generate-about", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ keywords: nonEmpty }),
                    });
                    const data = await res.json();
                    const text = String(data?.text ?? "");
                    if (!text.trim()) alert("生成結果が空でした");
                    else {
                      onApply(text);
                      setOpen(false);
                    }
                  } catch {
                    alert("生成に失敗しました");
                  } finally {
                    setLoading(false);
                    setK1("");
                    setK2("");
                    setK3("");
                  }
                }}
              >
                {loading ? "生成中…" : "作成"}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setOpen(false)}
              >
                閉じる
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
