// components/blog/MediaUploader.tsx
"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  UploadTask,
} from "firebase/storage";
import { storage } from "@/lib/firebase";
import { v4 as uuid } from "uuid";
import { BlogMedia } from "@/types/blog";
import { Button } from "@/components/ui/button";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import clsx from "clsx";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { THEMES, ThemeKey } from "@/lib/themes";

type Props = {
  postIdForPath?: string;
  value: BlogMedia[]; // ← 外側 state（必ず最大1件に）
  onChange: (next: BlogMedia[]) => void;
};

const DARK_KEYS: ThemeKey[] = ["brandH", "brandG", "brandI"];

export default function MediaUploader({ postIdForPath, value, onChange }: Props) {
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [overallPct, setOverallPct] = useState(0);
  const [currentLabel, setCurrentLabel] = useState<string>("");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const totalBytesRef = useRef(0);
  const uploadedBytesRef = useRef(0);
  const taskRef = useRef<UploadTask | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ==== テーマ判定 ====
  const gradient = useThemeGradient();
  const isDark = useMemo(
    () => !!gradient && DARK_KEYS.some((k) => THEMES[k] === gradient),
    [gradient]
  );
  const textColorClass = isDark ? "text-white" : "text-black";
  const subTextClass = isDark ? "text-white/70" : "text-muted-foreground";

  const resetProgress = () => {
    setIsUploading(false);
    setErrorMsg(null);
    setOverallPct(0);
    setCurrentLabel("");
    totalBytesRef.current = 0;
    uploadedBytesRef.current = 0;
    taskRef.current = null;
  };

  const onFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setSelectedName(file.name);

      // 動画制限
      const isVideo = file.type.startsWith("video/");
      if (isVideo) {
        const duration = await new Promise<number>((resolve, reject) => {
          const el = document.createElement("video");
          el.preload = "metadata";
          el.onloadedmetadata = () => {
            const d = el.duration || 0;
            if (d > 60) reject(new Error("動画は60秒以内にしてください。"));
            resolve(d);
          };
          el.onerror = () => reject(new Error("動画メタデータの取得に失敗しました。"));
          el.src = URL.createObjectURL(file);
        }).catch((e) => {
          setErrorMsg(e?.message ?? "動画の検証に失敗しました。");
          return null;
        });
        if (duration === null) return;
      }

      setIsUploading(true);
      setErrorMsg(null);
      setOverallPct(0);
      setCurrentLabel("アップロードを開始");

      totalBytesRef.current = file.size;
      uploadedBytesRef.current = 0;

      const safePostId = postIdForPath ?? "temp";
      const ext = file.name.split(".").pop() ?? (isVideo ? "mp4" : "jpg");
      const fileId = uuid();
      const path = `siteBlogs/${SITE_KEY}/posts/${safePostId}/${fileId}.${ext}`;
      const storageRef = ref(storage, path);

      const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
      taskRef.current = task;

      try {
        await new Promise<void>((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) => {
              uploadedBytesRef.current = snap.bytesTransferred;
              const pct = Math.round(
                (uploadedBytesRef.current / (totalBytesRef.current || 1)) * 100
              );
              setOverallPct(pct);
              setCurrentLabel("アップロード中…");
            },
            (err) => reject(err),
            () => resolve()
          );
        });

        const url = await getDownloadURL(storageRef);

        onChange([
          {
            type: isVideo ? "video" : "image",
            url,
            path,
          },
        ]);

        setCurrentLabel("アップロード完了");
        setOverallPct(100);
      } catch (e: any) {
        console.error(e);
        setErrorMsg(e?.message ?? "アップロードに失敗しました。");
      } finally {
        setTimeout(() => resetProgress(), 500);
      }
    },
    [onChange, postIdForPath]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0] ?? null;
    onFile(f);
  };

  const cancelUpload = () => {
    try {
      taskRef.current?.cancel();
    } catch {}
    setErrorMsg("アップロードをキャンセルしました。");
    setTimeout(() => resetProgress(), 500);
  };

  const hasExisting = (value?.length ?? 0) > 0;
  const buttonText = hasExisting ? "ファイルを変更" : "ファイルを選択";

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Button asChild>
            <label className="cursor-pointer">
              {buttonText}
              <input
                ref={inputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onClick={(e) => {
                  (e.currentTarget as HTMLInputElement).value = "";
                }}
                onChange={onInputChange}
              />
            </label>
          </Button>

          {hasExisting && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onChange([]);
                setSelectedName(null);
              }}
            >
              クリア
            </Button>
          )}

          <span className={clsx("text-xs", subTextClass)}>
            ※ 画像/動画は1枚のみ（動画は60秒以内）
          </span>
        </div>

        {selectedName && !isUploading && (
          <div
            className={clsx(
              "rounded-md border bg-muted/30 p-2 text-xs",
              textColorClass
            )}
          >
            選択中: <span className="font-medium">{selectedName}</span>
          </div>
        )}
      </div>

      {isUploading && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50">
          <div className={clsx("w-[92%] max-w-md rounded-2xl p-5 shadow-xl", isDark ? "bg-gray-900 text-white" : "bg-white text-black")}>
            <div className="mb-3 text-base font-semibold">アップロード中</div>

            {selectedName && (
              <div
                className={clsx(
                  "mb-3 rounded-md border bg-muted/30 p-2 text-xs",
                  textColorClass
                )}
              >
                ファイル: <span className="font-medium">{selectedName}</span>
              </div>
            )}

            <div className={clsx("mb-3 text-sm", subTextClass)}>
              {currentLabel || "処理中…"}
            </div>

            <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-blue-500 transition-all"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <div className={clsx("mb-4 text-right text-xs tabular-nums", subTextClass)}>
              {overallPct}%
            </div>

            {errorMsg && (
              <div className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={cancelUpload}>
                キャンセル
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
