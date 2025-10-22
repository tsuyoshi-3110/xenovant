"use client";

import Image from "next/image";
import { useWallpaperUrl } from "@/hooks/useWallpaper";
import { useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { getStorage, ref as storageRef, deleteObject } from "firebase/storage";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { Button } from "@/components/ui/button";

const SITE_KEY = "xenovant";

export default function ThemeWallpaper({
  onFileSelect,
}: {
  onFileSelect: (file: File) => void;
}) {
  const url = useWallpaperUrl();
  const inputRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("本当に背景画像を削除しますか？")) return;

    setDeleting(true);

    try {
      // Firestore の imageUrl フィールド削除
      const ref = doc(db, "siteSettingsEditable", SITE_KEY);
      await updateDoc(ref, {
        imageUrl: deleteField(),
      });

      // Firebase Storage のファイル削除
      const imageRef = storageRef(
        getStorage(),
        `images/public/${SITE_KEY}/wallpaper.jpg`
      );
      await deleteObject(imageRef);

      alert("背景画像を削除しました。");
    } catch (err) {
      console.error("削除失敗:", err);
      alert("削除に失敗しました。");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="relative w-32 h-20 rounded shadow border overflow-hidden">
      {/* 背景画像 */}
      {url && url.trim() !== "" ? (
        <Image
          src={url}
          alt="背景画像"
          fill
          sizes="100vw"
          className="object-cover"
          priority
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200 text-white text-sm font-semibold">
          No Image
        </div>
      )}

      {/* 透明なインプットでスマホ対応 */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            onFileSelect(e.target.files[0]);
          }
        }}
      />

      {/* 削除ボタン（画像がある時のみ表示） */}
      {url && (
        <Button
          onClick={handleDelete}
          disabled={deleting}
          className="absolute top-1 right-1 z-20 bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-white"
        >
          削除
        </Button>
      )}
    </div>
  );
}
