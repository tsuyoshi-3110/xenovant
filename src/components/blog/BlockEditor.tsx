// components/blog/BlockEditor.tsx
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { v4 as uuid } from "uuid";
import { BlogBlock } from "@/types/blog";
import { Button } from "@/components/ui/button";
import clsx from "clsx";
import { storage } from "@/lib/firebase";
import {
  ref as sRef,
  getDownloadURL,
  uploadBytesResumable,
  UploadTask,
  deleteObject,
} from "firebase/storage";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { THEMES, ThemeKey } from "@/lib/themes";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import { Pin } from "lucide-react";
import { BusyOverlay } from "@/components/BusyOverlay";

/* ✅ 共通ファイル形式ユーティリティ */
import {
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  extFromMime,
} from "@/lib/fileTypes";

// dnd-kit
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";

type Props = {
  value: BlogBlock[];
  onChange: Dispatch<SetStateAction<BlogBlock[]>>;
  /** 既存記事は postId、新規は null/undefined（temp 配下へ） */
  postIdForPath?: string | null;
};

const DARK_KEYS: ThemeKey[] = ["brandH", "brandG", "brandI"];
const MAX_VIDEO_SEC = 60;

/* ========== Sortable 子コンポーネント ========== */
function SortableBlockCard({
  id,

  children,
  onMoveUp,
  onMoveDown,
  onAddTextBelow,
  onAddMediaBelow,
  onEditMedia,
  onDelete,
  disableUp,
  disableDown,
  isMedia,
}: {
  id: string;

  children: React.ReactNode;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddTextBelow: () => void;
  onAddMediaBelow: () => void;
  onEditMedia?: () => void;
  onDelete: () => void;
  disableUp: boolean;
  disableDown: boolean;
  isMedia: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "relative overflow-visible rounded-2xl border p-4 pt-10",
        "text-white text-outline",
        isDragging && "shadow-xl ring-2 ring-blue-400/40"
      )}
    >
      {/* ドラッグハンドル（カード上端中央・白丸） */}
      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-20">
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label="ドラッグして並び替え"
          className={clsx(
            "h-10 w-10 rounded-full border shadow flex items-center justify-center",
            "cursor-grab active:cursor-grabbing select-none touch-none",
           "text-white text-outline",
          )}
          {...attributes}
          {...listeners}
          // 右クリックやタップ長押しによる予期せぬ挙動を抑止
          onContextMenu={(e) => e.preventDefault()}
        >
          <Pin className="h-5 w-5 text-gray-700" />
        </button>
      </div>

      {/* 操作列 */}
      <div className="mb-3 mt-1 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onMoveUp}
          disabled={disableUp}
        >
          ↑
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onMoveDown}
          disabled={disableDown}
        >
          ↓
        </Button>

        <Button type="button" size="sm" onClick={onAddTextBelow}>
          ＋テキスト
        </Button>
        <Button type="button" size="sm" onClick={onAddMediaBelow}>
          ＋画像/動画
        </Button>

        {isMedia && onEditMedia && (
          <Button
            type="button"
            size="sm"
            onClick={onEditMedia}
            className="bg-blue-500 hover:bg-blue-700"
          >
            変更
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={onDelete}
        >
          削除
        </Button>
      </div>

      {children}
    </div>
  );
}

/* ========== メイン ========== */
export default function BlockEditor({ value, onChange, postIdForPath }: Props) {
  // ==== テーマ判定 ====
  const gradient = useThemeGradient();
  const isDark = useMemo(
    () => !!gradient && DARK_KEYS.some((k) => THEMES[k] === gradient),
    [gradient]
  );
  const textClass = isDark ? "text-white" : "text-black";
  const subTextClass = isDark ? "text-white/70" : "text-muted-foreground";
  const cardClass = isDark
    ? "border-white/15 bg-black/10"
    : "border-black/10 bg-white";

  // ==== アップロード系（追加／差し替えを共用） ====
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taskRef = useRef<UploadTask | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // __mode: "insert" or "replace"
  // __insertIndex: number（insert時）
  // __replaceIndex: number（replace時）
  const setInsertMode = (index: number) => {
    (fileInputRef.current as any).__mode = "insert";
    (fileInputRef.current as any).__insertIndex = index;
    (fileInputRef.current as any).__replaceIndex = undefined;
  };
  const setReplaceMode = (index: number) => {
    (fileInputRef.current as any).__mode = "replace";
    (fileInputRef.current as any).__replaceIndex = index;
    (fileInputRef.current as any).__insertIndex = undefined;
  };

  // ==== DnD センサー ====
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );

  // ==== テキストエリア参照 ====
  const textRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const setTextRef = (id: string) => (el: HTMLTextAreaElement | null) => {
    textRefs.current[id] = el;
  };

  // ==== 校正モーダル（テキストブロック用） ====
  const [proof, setProof] = useState<{
    blockId: string;
    start: number;
    end: number;
    source: string;
    result: string;
    loading: boolean;
    error: string | null;
  } | null>(null);

  // ==== 生成モーダル（テキストブロック用：このカードに上書き） ====
  const [gen, setGen] = useState<{
    blockId: string;
    kw1: string;
    kw2: string;
    kw3: string;
    loading: boolean;
    error: string | null;
  } | null>(null);

  // ==== ユーティリティ ====
  const insertAt = useCallback(
    (idx: number, block: BlogBlock) => {
      onChange((prev) => {
        const next = prev.slice();
        next.splice(idx, 0, block);
        return next;
      });
    },
    [onChange]
  );

  const updateAt = useCallback(
    (idx: number, patch: Partial<BlogBlock> | BlogBlock) => {
      onChange((prev) => {
        const next = prev.slice();
        next[idx] =
          "id" in patch
            ? (patch as BlogBlock)
            : ({ ...next[idx], ...patch } as BlogBlock);
        return next;
      });
    },
    [onChange]
  );

  const removeAt = useCallback(
    (idx: number) => {
      onChange((prev) => {
        const next = prev.slice();
        next.splice(idx, 1);
        return next;
      });
    },
    [onChange]
  );

  const move = useCallback(
    (idx: number, dir: -1 | 1) => {
      const to = idx + dir;
      if (to < 0 || to >= value.length) return;
      onChange((prev) => {
        const next = prev.slice();
        const [b] = next.splice(idx, 1);
        next.splice(to, 0, b);
        return next;
      });
    },
    [value.length, onChange]
  );

  // ==== DnD: 並び替え確定 ====
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = value.findIndex((b) => b.id === active.id);
    const newIndex = value.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onChange((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  // ==== メディア追加（下に挿入） ====
  const handleAddMediaBelow = (idx: number) => {
    setInsertMode(Math.max(0, idx + 1));
    fileInputRef.current?.click();
  };

  // ==== メディア編集（差し替え） ====
  const handleEditMedia = (idx: number) => {
    setReplaceMode(idx);
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0] || null;
    e.currentTarget.value = "";
    if (!file) return;

    const isImage = IMAGE_MIME_TYPES.includes(file.type);
    const isVideo = VIDEO_MIME_TYPES.includes(file.type);
    if (!isImage && !isVideo) {
      setErrorMsg("対応していない形式です。");
      return;
    }

    // 動画は60秒制限
    if (isVideo) {
      const objectUrl = URL.createObjectURL(file);
      const ok = await new Promise<boolean>((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => {
          const dur = v.duration || 0;
          URL.revokeObjectURL(objectUrl);
          if (dur > MAX_VIDEO_SEC) {
            setErrorMsg(`動画は${MAX_VIDEO_SEC}秒以内にしてください。`);
            resolve(false);
          } else {
            resolve(true);
          }
        };
        v.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          setErrorMsg("動画メタデータの取得に失敗しました。");
          resolve(false);
        };
        v.src = objectUrl;
      });
      if (!ok) return;
    }

    // アップロード開始
    setErrorMsg(null);
    setUploadingName(file.name);
    setUploadPct(0);

    // どのモードか確認
    const mode = (fileInputRef.current as any).__mode as
      | "insert"
      | "replace"
      | undefined;
    const insertIndex =
      (fileInputRef.current as any).__insertIndex ?? value.length;
    const replaceIndex = (fileInputRef.current as any).__replaceIndex ?? -1;

    const safePostId = postIdForPath || "temp";
    const ext = extFromMime(file.type) || (isVideo ? "mp4" : "jpg");
    const fileId = uuid();
    const path = `siteBlogs/${SITE_KEY}/posts/${safePostId}/${fileId}.${ext}`;
    const ref = sRef(storage, path);

    const task = uploadBytesResumable(ref, file, { contentType: file.type });
    taskRef.current = task;

    try {
      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            const pct = Math.round(
              (snap.bytesTransferred / (snap.totalBytes || 1)) * 100
            );
            setUploadPct(pct);
          },
          (err) => reject(err),
          () => resolve()
        );
      });

      const url = await getDownloadURL(ref);

      if (mode === "replace" && replaceIndex >= 0) {
        // 既存カード差し替え：古いオブジェクトは成功後に削除（失敗は無視）
        const old = value[replaceIndex];
        const keepTitle =
          (old as any)?.title !== undefined ? (old as any).title : "";
        const oldPath = (old as any)?.path as string | undefined;

        const newBlock: BlogBlock = isVideo
          ? { id: old.id, type: "video", url, path, title: keepTitle }
          : { id: old.id, type: "image", url, path, title: keepTitle };

        updateAt(replaceIndex, newBlock);

        if (oldPath && oldPath !== path) {
          try {
            await deleteObject(sRef(storage, oldPath));
          } catch {}
        }
      } else {
        // 追加（下に挿入）
        const block: BlogBlock = isVideo
          ? { id: uuid(), type: "video", url, path, title: "" }
          : { id: uuid(), type: "image", url, path, title: "" };

        onChange((prev) => {
          const next = prev.slice();
          next.splice(insertIndex, 0, block);
          return next;
        });
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? "アップロードに失敗しました。");
    } finally {
      setTimeout(() => {
        setUploadPct(null);
        setUploadingName(null);
        taskRef.current = null;
        // モードリセット
        (fileInputRef.current as any).__mode = undefined;
        (fileInputRef.current as any).__insertIndex = undefined;
        (fileInputRef.current as any).__replaceIndex = undefined;
      }, 300);
    }
  };

  const cancelUpload = () => {
    try {
      taskRef.current?.cancel();
    } catch {}
    setErrorMsg("アップロードをキャンセルしました。");
    setTimeout(() => {
      setUploadPct(null);
      setUploadingName(null);
      taskRef.current = null;
      (fileInputRef.current as any).__mode = undefined;
      (fileInputRef.current as any).__insertIndex = undefined;
      (fileInputRef.current as any).__replaceIndex = undefined;
    }, 200);
  };

  // ==== 本文カードごとの AI 校正 ====
  const startProofForBlock = async (blockId: string) => {
    const idx = value.findIndex((b) => b.id === blockId);
    if (idx === -1 || value[idx]?.type !== "p") return;

    const el = textRefs.current[blockId];
    const src = String((value[idx] as any).text || "");
    const hasSel = el && el.selectionStart !== el.selectionEnd;
    const start = hasSel ? el!.selectionStart ?? 0 : 0;
    const end = hasSel ? el!.selectionEnd ?? 0 : src.length;
    const source = src.slice(start, end).trim();

    if (!source) {
      alert(
        "校正するテキストがありません。テキストを入力するか、範囲選択してください。"
      );
      return;
    }

    setProof({
      blockId,
      start,
      end,
      source,
      result: "",
      loading: true,
      error: null,
    });

    try {
      const res = await fetch("/api/blog/proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: source }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProof((p) =>
          p
            ? {
                ...p,
                loading: false,
                error: data?.error ?? "校正に失敗しました。",
              }
            : p
        );
        return;
      }
      setProof((p) =>
        p ? { ...p, loading: false, result: String(data.body || "") } : p
      );
    } catch (e: any) {
      setProof((p) =>
        p
          ? {
              ...p,
              loading: false,
              error: e?.message ?? "校正に失敗しました。",
            }
          : p
      );
    }
  };

  const applyProofToBlock = () => {
    if (!proof) return;
    const { blockId, start, end, result } = proof;

    const idxNow = value.findIndex((b) => b.id === blockId);
    if (idxNow === -1 || value[idxNow]?.type !== "p") {
      setProof(null);
      return;
    }

    const src = String((value[idxNow] as any).text || "");
    theBefore: {
      /* label to avoid shadow complaints – no-op block */
    }
    const before = src.slice(0, start);
    const after = src.slice(end);
    const replaced = before + result + after;

    updateAt(idxNow, { ...(value[idxNow] as any), text: replaced });
    setProof(null);
  };

  const cancelProof = () => setProof(null);

  // ==== 本文カードごとの AI 生成（このカードに上書き） ====
  const openGenerateForBlock = (blockId: string) => {
    setGen({
      blockId,
      kw1: "",
      kw2: "",
      kw3: "",
      loading: false,
      error: null,
    });
  };

  const doGenerateForBlock = async () => {
    if (!gen) return;
    const { blockId, kw1, kw2, kw3 } = gen;
    const ks = [kw1.trim(), kw2.trim(), kw3.trim()].filter(Boolean).slice(0, 3);
    if (ks.length === 0) {
      setGen({ ...gen, error: "キーワードを1つ以上入力してください。" });
      return;
    }
    setGen({ ...gen, loading: true, error: null });

    try {
      const res = await fetch("/api/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: ks }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGen({
          ...gen,
          loading: false,
          error: data?.error ?? "本文の生成に失敗しました。",
        });
        return;
      }
      const text = String(data.body || "").trim();
      if (!text) {
        setGen({ ...gen, loading: false, error: "生成結果が空でした。" });
        return;
      }

      const idx = value.findIndex((b) => b.id === blockId);
      if (idx >= 0 && value[idx].type === "p") {
        updateAt(idx, { ...(value[idx] as any), text });
      }

      setGen(null);
    } catch (e: any) {
      setGen({
        ...gen,
        loading: false,
        error: e?.message ?? "本文の生成に失敗しました。",
      });
    }
  };

  const cancelGenerate = () => setGen(null);

  // ==== レンダリング ====
  return (
    <div className={clsx("space-y-4 relative overflow-visible", textClass)}>
      {/* ✅ BusyOverlay：アップロード中に表示（保存テキストは未使用） */}
      <BusyOverlay
        uploadingPercent={uploadPct ?? undefined}
        saving={uploadPct !== null}
      />

      {/* アップロード中のキャンセル（BusyOverlayはUIだけなので別ボタンで対応） */}
      {uploadPct !== null && (
        <div className="fixed bottom-6 left-0 right-0 z-[10000] flex justify-center">
          <Button variant="secondary" size="sm" onClick={cancelUpload}>
            キャンセル（{uploadingName || "アップロード"}）
          </Button>
        </div>
      )}

      {/* エラーはシンプルにトースト風で表示 */}
      {errorMsg && (
        <div className="fixed top-6 left-0 right-0 z-[10000] mx-auto w-[92%] max-w-md rounded-md bg-red-50 p-3 text-xs text-red-700 shadow">
          {errorMsg}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={value.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-6 relative overflow-visible pt-3">
            {value.length === 0 && (
              <div
                className={clsx(
                  "rounded-2xl border p-4 text-sm",
                  cardClass,
                  subTextClass
                )}
              >
                まだブロックがありません。下の「テキストを追加」または「画像/動画を追加」を押してください。
              </div>
            )}

            {value.map((b, i) => (
              <SortableBlockCard
                key={b.id}
                id={b.id}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, +1)}
                onAddTextBelow={() =>
                  insertAt(i + 1, { id: uuid(), type: "p", text: "" } as any)
                }
                onAddMediaBelow={() => handleAddMediaBelow(i)}
                onEditMedia={
                  b.type !== "p" ? () => handleEditMedia(i) : undefined
                }
                onDelete={() => removeAt(i)}
                disableUp={i === 0}
                disableDown={i === value.length - 1}
                isMedia={b.type !== "p"}
              >
                {/* ブロック本体 */}
                {b.type === "p" ? (
                  <div className="space-y-2">
                    {/* テキストカードのAI */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => openGenerateForBlock(b.id)}
                        className="bg-blue-500 hover:bg-blue-700"
                      >
                        AIで本文作成
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => startProofForBlock(b.id)}
                      >
                        AIで校正
                      </Button>
                      <span className={clsx("text-xs", subTextClass)}>
                        生成はキーワードのみ／校正は選択部分があればその範囲
                      </span>
                    </div>

                    <textarea
                      ref={setTextRef(b.id)}
                      value={(b as any).text || ""}
                      onChange={(e) => {
                        updateAt(i, { ...(b as any), text: e.target.value });
                      }}
                      className={clsx(
                        "w-full resize-y rounded-md border p-2 outline-none",
                        isDark
                          ? "bg-black/20 border-white/15 text-white placeholder:text-white/40"
                          : "bg-white border-black/10 text-black placeholder:text-black/40"
                      )}
                      placeholder="本文（段落）"
                      rows={6}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-lg border border-black/10">
                      {b.type === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={(b as any).url}
                          alt=""
                          className="max-h-[420px] w-full bg-black/5 object-contain"
                        />
                      ) : (
                        <video
                          src={(b as any).url}
                          controls
                          playsInline
                          className="max-h-[420px] w-full bg-black/5"
                        />
                      )}
                    </div>

                    {/* 画像/動画 共通：タイトル（任意） */}
                    <input
                      className={clsx(
                        "w-full rounded-md border p-2 text-sm",
                        isDark
                          ? "bg-black/20 border-white/15 text-white placeholder:text-white/40"
                          : "bg-white border-black/10 text-black placeholder:text-black/40"
                      )}
                      placeholder="タイトル（任意）"
                      value={((b as any).title ?? "") as string}
                      onChange={(e) =>
                        updateAt(i, { ...(b as any), title: e.target.value })
                      }
                    />

                    {(b as any).path && (
                      <div className={clsx("text-xs break-all", subTextClass)}>
                        {(b as any).path}
                      </div>
                    )}
                  </div>
                )}
              </SortableBlockCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* 末尾に追加 */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange((prev) => [
              ...prev,
              { id: uuid(), type: "p", text: "" } as any,
            ])
          }
        >
          テキストを追加
        </Button>
        <Button
          type="button"
          onClick={() => handleAddMediaBelow(value.length - 1)}
        >
          画像/動画を追加
        </Button>
        <span className={clsx("text-xs", subTextClass)}>※ 動画は60秒以内</span>
      </div>

      {/* hidden file input（追加／差し替え共通） */}
      <input
        ref={fileInputRef}
        type="file"
        accept={[...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].join(",")}
        className="hidden"
        onChange={onFileChange}
        onClick={(e) => {
          // 同じファイルを連続選択できるようにリセット
          (e.currentTarget as HTMLInputElement).value = "";
        }}
      />

      {/* 校正プレビューモーダル（テキストカード） */}
      {proof && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !proof.loading) cancelProof();
          }}
        >
          <div
            className={clsx(
              "w-[92%] max-w-2xl rounded-2xl p-6 shadow-xl",
              isDark ? "bg-gray-900 text-white" : "bg-white text-black"
            )}
          >
            <div className="mb-3 text-base font-semibold">
              AIで校正（本文カード）
            </div>
            <div className={clsx("mb-2 text-xs", subTextClass)}>
              対象範囲：{proof.start} 〜 {proof.end} 文字（選択がなければブロック全体）
            </div>

            {proof.loading ? (
              <div className="py-8 text-center text-sm">校正中…</div>
            ) : proof.error ? (
              <div className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
                {proof.error}
              </div>
            ) : (
              <textarea
                value={proof.result}
                onChange={(e) => setProof({ ...proof, result: e.target.value })}
                rows={14}
                className={clsx(
                  "w-full resize-y rounded-md border p-2 overflow-auto",
                  isDark
                    ? "bg-black/20 border-white/15 text-white placeholder:text-white/40"
                    : "bg-white border-black/10 text-black placeholder:text-black/40"
                )}
              />
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={cancelProof}
                disabled={proof.loading}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                onClick={applyProofToBlock}
                disabled={proof.loading || !proof.result.trim()}
              >
                置き換える
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 生成モーダル（テキストカード：このカードに上書き） */}
      {gen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !gen.loading) cancelGenerate();
          }}
        >
          <div
            className={clsx(
              "w-[92%] max-w-lg rounded-2xl p-6 shadow-xl",
              isDark ? "bg-gray-900 text-white" : "bg-white text-black"
            )}
          >
            <div className="mb-4">
              <div className="text-base font-semibold">
                AIで本文作成（本文カード）
              </div>
              <div className={clsx("mt-1 text-xs", subTextClass)}>
                タイトルは使用しません。キーワードを 1〜3 個入力してください。生成結果は
                <strong>このカードに上書き</strong>されます。
              </div>
            </div>

            <div className="grid gap-2 mb-3">
              <label className="text-xs font-medium">キーワード（最大3）</label>
              <input
                className={clsx(
                  "w-full rounded-md border p-2 text-sm",
                  isDark
                    ? "bg-black/20 border-white/15"
                    : "bg-white border-black/10"
                )}
                value={gen.kw1}
                onChange={(e) => setGen({ ...gen, kw1: e.target.value })}
                placeholder="例：散歩"
              />
              <input
                className={clsx(
                  "w-full rounded-md border p-2 text-sm",
                  isDark
                    ? "bg-black/20 border-white/15"
                    : "bg-white border-black/10"
                )}
                value={gen.kw2}
                onChange={(e) => setGen({ ...gen, kw2: e.target.value })}
                placeholder="例：柴犬"
              />
              <input
                className={clsx(
                  "w-full rounded-md border p-2 text-sm",
                  isDark
                    ? "bg-black/20 border-white/15"
                    : "bg-white border-black/10"
                )}
                value={gen.kw3}
                onChange={(e) => setGen({ ...gen, kw3: e.target.value })}
                placeholder="例：夕焼け"
              />
            </div>

            {gen.error && (
              <div className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
                {gen.error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={cancelGenerate}
                disabled={gen.loading}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                onClick={doGenerateForBlock}
                disabled={
                  gen.loading ||
                  ![gen.kw1, gen.kw2, gen.kw3].some((s) => s.trim())
                }
              >
                {gen.loading ? "生成中…" : "生成する"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
