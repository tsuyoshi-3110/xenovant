// app/(wherever)/NewsClient.tsx
"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  startAfter,
  limit,
  Timestamp,
  QueryDocumentSnapshot,
  onSnapshot,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { AlertCircle, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import CardSpinner from "./CardSpinner";
import MediaWithSpinner from "./MediaWithSpinner";
import Image from "next/image";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { THEMES, ThemeKey } from "@/lib/themes";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

/* ===== 共通：UI言語・言語一覧・ファイル種別・オーバーレイ ===== */
import { useUILang, type UILang } from "@/lib/atoms/uiLangAtom";
import { LANGS, type LangKey } from "@/lib/langs";
import { IMAGE_MIME_TYPES, VIDEO_MIME_TYPES } from "@/lib/fileTypes";
import { BusyOverlay } from "./BusyOverlay";

/* ---------- 型 ---------- */
interface NewsItem {
  id: string;
  title: string;
  body: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  createdBy: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  // ▼ 新方式（存在しない旧データもあるためオプショナル）
  base?: { title?: string; body?: string };
  t?: Array<{ lang: LangKey; title?: string; body?: string }>;
}

/* ---------- 定数 ---------- */
const MAX_VIDEO_SEC = 30;
const STORAGE_PATH = `siteNews/${SITE_KEY}/items`;

const FIRST_LOAD = 20;
const PAGE_SIZE = 20;

const DARK_KEYS: ThemeKey[] = ["brandG", "brandH", "brandI"];

/* =========================================================
      多言語：表示用解決関数
========================================================= */
function pickLocalized(
  n: NewsItem,
  uiLang: UILang
): { title: string; body: string } {
  const fallback = {
    title: n.title ?? "",
    body: n.body ?? "",
  };
  if (!n.base && !n.t) return fallback; // 旧データ対応

  if (uiLang === "ja") {
    return {
      title: n.base?.title ?? fallback.title,
      body: n.base?.body ?? fallback.body,
    };
  }
  const hit = n.t?.find((x) => x.lang === uiLang);
  return {
    title: hit?.title ?? n.base?.title ?? fallback.title,
    body: hit?.body ?? n.base?.body ?? fallback.body,
  };
}

/* =========================================================
      多言語：保存時に毎回すべての言語で上書き
      ※ 型エラー回避のため title/body を必須 string で扱う
========================================================= */
type TrFull = { lang: LangKey; title: string; body: string };

async function translateAll(
  titleJa: string,
  bodyJa: string
): Promise<TrFull[]> {
  const targets = (LANGS.map((l) => l.key).filter((k) => k !== "ja") ??
    []) as LangKey[];

  const jobs: Array<Promise<TrFull>> = targets.map(async (lang) => {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: titleJa, body: bodyJa, target: lang }),
    });
    if (!res.ok) throw new Error(`translate API failed: ${lang}`);
    const data = (await res.json()) as { title?: string; body?: string };
    return {
      lang,
      title: String(data.title ?? "").trim(),
      body: String(data.body ?? "").trim(),
    };
  });

  const settled = await Promise.allSettled(jobs);
  return settled
    .filter(
      (r): r is PromiseFulfilledResult<TrFull> => r.status === "fulfilled"
    )
    .map((r) => r.value);
}

/* =========================================================
      ここからコンポーネント本体
========================================================= */
export default function NewsClient() {
  const gradient = useThemeGradient();
  const isDark = useMemo(
    () => !!gradient && DARK_KEYS.some((k) => THEMES[k] === gradient),
    [gradient]
  );
  const { uiLang } = useUILang();

  /* ---------- state ---------- */
  const [items, setItems] = useState<NewsItem[]>([]);
  const [user, setUser] = useState<User | null>(null);

  /* モーダル入力 */
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  /* メディア入力 */
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState<string | null>(null);

  /* 進捗・保存 */
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  /* ページネーション */
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const isFetchingMore = useRef(false);
  const loadedMoreRef = useRef(false);

  /* エラー表示 */
  const [alertVisible, setAlertVisible] = useState(false);

  /* AI 本文生成 */
  const [showAIModal, setShowAIModal] = useState(false);
  const [keywords, setKeywords] = useState(["", "", ""]);
  const [aiLoading, setAiLoading] = useState(false);
  const nonEmptyKeywords = keywords.filter((k) => k.trim() !== "");

  /* ---------- Firestore 参照 ---------- */
  const colRef = useMemo(
    () => collection(db, "siteNews", SITE_KEY, "items"),
    []
  );

  /* ---------- 初期フェッチ & 認証 ---------- */
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  // 1ページ目を onSnapshot で購読（Map マージで一意化）
  useEffect(() => {
    if (isFetchingMore.current) return;

    const firstQuery = query(
      colRef,
      orderBy("createdAt", "desc"),
      limit(FIRST_LOAD)
    );

    const unsub = onSnapshot(firstQuery, (snap) => {
      const firstPage: NewsItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any), // base/t を含めて取り込む
      }));

      setItems((prev) => {
        const map = new Map<string, NewsItem>(prev.map((x) => [x.id, x]));
        firstPage.forEach((x) => map.set(x.id, x));
        return [...map.values()].sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
        );
      });

      if (!loadedMoreRef.current) {
        setLastDoc(snap.docs.at(-1) ?? null);
      }
      setHasMore(snap.size === FIRST_LOAD);
    });

    return () => unsub();
  }, [colRef]);

  // 2ページ目以降のフェッチ
  const fetchNextPage = useCallback(async () => {
    if (isFetchingMore.current || !hasMore || !lastDoc) return;
    isFetchingMore.current = true;
    loadedMoreRef.current = true;

    try {
      const nextQuery = query(
        colRef,
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(nextQuery);
      const nextPage: NewsItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      setItems((prev) => {
        const map = new Map<string, NewsItem>(prev.map((x) => [x.id, x]));
        nextPage.forEach((x) => map.set(x.id, x));
        return [...map.values()].sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
        );
      });

      setLastDoc(snap.docs.at(-1) ?? null);
      setHasMore(snap.size === PAGE_SIZE);
    } finally {
      isFetchingMore.current = false;
    }
  }, [colRef, lastDoc, hasMore]);

  /* ---------- 無限スクロール ---------- */
  useEffect(() => {
    const onScroll = () => {
      if (
        hasMore &&
        uploadPct === null &&
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 150
      ) {
        fetchNextPage();
      }
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [fetchNextPage, hasMore, uploadPct]);

  /* =====================================================
      メディア選択 & プレビュー
  ===================================================== */
  const handleSelectFile = (file: File) => {
    const isImage = IMAGE_MIME_TYPES.includes(file.type);
    const isVideo = VIDEO_MIME_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
      alert("対応していない形式です");
      return;
    }

    if (isVideo) {
      const video = document.createElement("video");
      const blobURL = URL.createObjectURL(file);
      video.preload = "metadata";
      video.src = blobURL;
      video.onloadedmetadata = () => {
        if (video.duration > MAX_VIDEO_SEC) {
          alert(`動画は${MAX_VIDEO_SEC}秒以内にしてください`);
          URL.revokeObjectURL(blobURL);
          return;
        }
        setDraftFile(file);
        setPreviewURL(blobURL);
      };
      video.onerror = () => {
        URL.revokeObjectURL(blobURL);
        alert("動画の読み込みに失敗しました");
      };
      return;
    }

    const blobURL = URL.createObjectURL(file);
    setDraftFile(file);
    setPreviewURL(blobURL);
  };

  /* =====================================================
      モーダル制御（useCallback で安定化）
  ===================================================== */
  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
    setTitle("");
    setBody("");
    if (previewURL) URL.revokeObjectURL(previewURL);
    setDraftFile(null);
    setPreviewURL(null);
    setAlertVisible(false);
    setKeywords(["", "", ""]);
  }, [previewURL]);

  const openAdd = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
    setDraftFile(null);
    setPreviewURL(null);
    setModalOpen(true);
    setAlertVisible(false);
  };

  const openEdit = (n: NewsItem) => {
    setEditingId(n.id);
    // 日本語（原文）は base 優先でフォームに反映
    setTitle(n.base?.title ?? n.title ?? "");
    setBody(n.base?.body ?? n.body ?? "");
    setDraftFile(null);
    setPreviewURL(null);
    setModalOpen(true);
    setAlertVisible(false);
  };

  /* =====================================================
      追加 / 更新（保存時：全言語上書き）
  ===================================================== */
  const handleSubmit = useCallback(async () => {
    if (!user || !title.trim() || !body.trim()) {
      setAlertVisible(true);
      return;
    }

    setSaving(true);
    try {
      // ▼ 日本語を原文として保持
      const base = { title: title.trim(), body: body.trim() };

      // ▼ 各言語へ全上書き翻訳（title/body は必ず string）
      const t = await translateAll(base.title, base.body);

      // ▼ 送信ペイロード（互換のため title/body も上書き）
      const payload: Partial<NewsItem> = editingId
        ? {
            title: base.title,
            body: base.body,
            updatedAt: Timestamp.now(),
            base,
            t,
          }
        : {
            title: base.title,
            body: base.body,
            createdAt: Timestamp.now(),
            createdBy: user.uid,
            base,
            t,
          };

      // メディアアップロード
      if (draftFile) {
        const sRef = ref(
          getStorage(),
          `${STORAGE_PATH}/${Date.now()}_${draftFile.name}`
        );
        const task = uploadBytesResumable(sRef, draftFile);
        setUploadPct(0);

        task.on("state_changed", (s) =>
          setUploadPct(Math.round((s.bytesTransferred / s.totalBytes) * 100))
        );

        const url = await new Promise<string>((res, rej) =>
          task.on("state_changed", undefined, rej, async () =>
            res(await getDownloadURL(task.snapshot.ref))
          )
        );

        Object.assign(payload, {
          mediaUrl: url,
          mediaType: VIDEO_MIME_TYPES.includes(draftFile.type)
            ? "video"
            : "image",
        });
      }

      if (editingId) {
        await updateDoc(doc(colRef, editingId), payload);
      } else {
        await addDoc(colRef, payload as Omit<NewsItem, "id">);
      }

      // 成功時：インラインでリセット
      closeModal();
    } catch (err) {
      console.error(err);
      alert("保存に失敗しました");
    } finally {
      setSaving(false);
      setUploadPct(null);
    }
  }, [title, body, draftFile, editingId, user, colRef, closeModal]);

  /* =====================================================
      削除
  ===================================================== */
  const handleDelete = useCallback(
    async (n: NewsItem) => {
      if (!user || !confirm("本当に削除しますか？")) return;

      await deleteDoc(doc(colRef, n.id));
      if (n.mediaUrl) {
        try {
          await deleteObject(ref(getStorage(), n.mediaUrl as any));
        } catch {}
      }
      setItems((prev) => prev.filter((m) => m.id !== n.id));
    },
    [user, colRef]
  );

  /* =====================================================
      レンダリング
  ===================================================== */

  if (!gradient) return <CardSpinner />;

  return (
    <div>
      {/* 進捗・保存オーバーレイ（共通） */}
      <BusyOverlay uploadingPercent={uploadPct} saving={saving} />

      {/* ===== 一覧 ===== */}
      <ul className="space-y-4 p-4">
        {items.length === 0 ? (
          <li
            className={`p-6 rounded-lg shadow border ${
              isDark
                ? "bg-gray-800 text-white border-gray-700"
                : "bg-white text-gray-900 border-gray-200"
            }`}
          >
            現在、お知らせはまだありません。
          </li>
        ) : (
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                user={user}
                openEdit={openEdit}
                handleDelete={handleDelete}
                isDark={isDark}
                uiLang={uiLang}
                gradientClass={`bg-gradient-to-b ${gradient}`}
              />
            ))}
          </AnimatePresence>
        )}
      </ul>

      {/* ===== FAB ===== */}
      {user && (
        <button
          onClick={openAdd}
          aria-label="新規追加"
          disabled={saving || uploadPct !== null}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg hover:bg-pink-700 active:scale-95 transition disabled:opacity-50"
        >
          <Plus size={28} />
        </button>
      )}

      {/* ===== 追加 / 編集モーダル ===== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto">
          <div
            className="bg-white rounded-lg p-6 w-full max-w-md space-y-4 my-8
                max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-xl font-bold text-center">
              {editingId ? "お知らせを編集" : "お知らせを追加"}
            </h3>

            {/* ---------- 入力欄（タイトルは通常 input、本文はスクロール可能 & リサイズ可） ---------- */}
            <input
              className="w-full border px-3 py-2 rounded"
              placeholder="タイトル（日本語）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
            />
            <textarea
              className="w-full border px-3 py-2 rounded h-40 overflow-auto resize-y"
              placeholder="本文（日本語）"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={saving}
            />

            {/* ---------- メディア選択 ---------- */}
            <div className="space-y-1">
              <label className="font-medium">画像 / 動画 (30秒以内)</label>

              {previewURL && (
                <p className="text-xs text-gray-600 truncate">
                  選択中: {draftFile?.name}
                </p>
              )}

              <input
                type="file"
                accept={[...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].join(",")}
                onChange={(e) =>
                  e.target.files?.[0] && handleSelectFile(e.target.files[0])
                }
                disabled={saving}
              />

              {previewURL &&
                (draftFile && VIDEO_MIME_TYPES.includes(draftFile.type) ? (
                  <video
                    src={previewURL}
                    className="w-full mt-2 rounded"
                    controls
                  />
                ) : (
                  <div className="relative w-full mt-2 rounded overflow-hidden h-48">
                    <Image
                      src={previewURL}
                      alt="preview"
                      fill
                      sizes="100vw"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ))}
            </div>

            {/* ---------- AI 生成ボタン（本文日本語を作るだけ） ---------- */}
            <button
              onClick={() => {
                if (!title.trim()) {
                  alert("タイトルを入力してください。");
                  return;
                }
                setShowAIModal(true);
              }}
              className="bg-purple-600 text-white w-full py-2 rounded disabled:opacity-50"
              disabled={saving}
            >
              AIで本文作成
            </button>

            {/* ---------- バリデーションエラー ---------- */}
            {alertVisible && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>入力エラー</AlertTitle>
                <AlertDescription>
                  タイトルと本文を両方入力してください。
                </AlertDescription>
              </Alert>
            )}

            {/* ---------- 送信 / キャンセル ---------- */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
              >
                {editingId ? "更新" : "追加"}
              </button>
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-300 rounded"
                disabled={saving}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== AI モーダル ===== */}
      {showAIModal && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-xl font-bold text-center">AIで本文を生成</h3>

            <p className="text-sm text-gray-600">最低 1 つ以上入力</p>
            <div className="flex flex-col gap-2">
              {nonEmptyKeywords.length < 3 &&
                Array.from({ length: 3 }).map((_, i) => (
                  <input
                    key={i}
                    type="text"
                    className="border rounded px-2 py-1"
                    placeholder={`キーワード${i + 1}`}
                    value={keywords[i] ?? ""}
                    onChange={(e) => {
                      const next = [...keywords];
                      next[i] = e.target.value;
                      setKeywords(next);
                    }}
                  />
                ))}
            </div>

            {nonEmptyKeywords.length > 0 && (
              <p className="text-xs text-gray-500">
                送信キーワード：
                <span className="font-medium">
                  {nonEmptyKeywords.join(" / ")}
                </span>
              </p>
            )}

            <button
              disabled={
                !title.trim() || nonEmptyKeywords.length === 0 || aiLoading
              }
              onClick={async () => {
                setAiLoading(true);
                try {
                  const res = await fetch("/api/generate-news", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title,
                      keywords: nonEmptyKeywords,
                    }),
                  });
                  const data = await res.json();
                  setBody(String(data?.text ?? ""));
                  setShowAIModal(false);
                } catch {
                  alert("AI 生成に失敗しました");
                } finally {
                  setAiLoading(false);
                  setKeywords(["", "", ""]);
                }
              }}
              className="w-full py-2 rounded text-white bg-indigo-600 disabled:opacity-50"
            >
              {aiLoading ? "生成中…" : "本文を作成"}
            </button>

            <button
              onClick={() => {
                setShowAIModal(false);
                setKeywords(["", "", ""]);
              }}
              className="w-full py-2 rounded bg-gray-300"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== カード用サブコンポーネント ===== */
function NewsCard({
  item,
  user,
  openEdit,
  handleDelete,
  uiLang,
  gradientClass,
}: {
  item: NewsItem;
  user: User | null;
  openEdit: (n: NewsItem) => void;
  handleDelete: (n: NewsItem) => void;
  isDark: boolean;
  uiLang: UILang;
  gradientClass: string;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -150px 0px" });

  const loc = pickLocalized(item, uiLang);

  return (
    <motion.li
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      exit={{ opacity: 0, y: 40 }}
      className={[
        "relative overflow-hidden p-6 rounded-lg shadow",
        "ring-1 ring-white/10", // 薄い枠（任意）
        "text-white", // 文字は白
        "text-outline", // お使いなら視認性UP（任意）
        gradientClass, // ★ ここで適用
      ].join(" ")}
    >
      <h2 className="font-bold whitespace-pre-wrap">{loc.title}</h2>

      {/* メディア（画像 / 動画） */}
      {item.mediaUrl && item.mediaType && (
        <MediaWithSpinner
          src={item.mediaUrl}
          type={item.mediaType}
          className={
            item.mediaType === "image"
              ? "w-full max-h-80 object-cover mt-3 rounded"
              : "w-full mt-3 rounded"
          }
          autoPlay={item.mediaType === "video"}
          loop={item.mediaType === "video"}
          muted={item.mediaType === "video"}
        />
      )}

      <p className="mt-2 whitespace-pre-wrap">{loc.body}</p>

      {/* 編集・削除ボタン（ログイン時のみ） */}
      {user && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => openEdit(item)}
            className="px-3 py-1 bg-blue-600 text-white rounded"
          >
            編集
          </button>
          <button
            onClick={() => handleDelete(item)}
            className="px-3 py-1 bg-red-600 text-white rounded"
          >
            削除
          </button>
        </div>
      )}
    </motion.li>
  );
}
