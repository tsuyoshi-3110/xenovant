"use client";

import Image from "next/image";
import { useHeaderLogoUrl } from "../hooks/useHeaderLogoUrl";
import { useRef, useState } from "react";
import { db } from "@/lib/firebase";
import {
  getStorage,
  ref as storageRef,
  deleteObject,
  getMetadata,
} from "firebase/storage";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { FirebaseError } from "firebase/app";

const SITE_KEY = "xenovant";

export default function HeaderLogoPicker({
  onSelectFile,
}: {
  onSelectFile: (file: File) => void;
}) {
  const url = useHeaderLogoUrl();
  const inputRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("本当にロゴ画像を削除しますか？")) return;

    setDeleting(true);

    const logoRef = storageRef(
      getStorage(),
      `images/public/${SITE_KEY}/headerLogo.jpg`
    );

    try {
      // Firestore の headerLogoUrl を削除
      await updateDoc(doc(db, "siteSettingsEditable", SITE_KEY), {
        headerLogoUrl: deleteField(),
      });

      // Storage にファイルが存在する場合のみ削除
      await getMetadata(logoRef);
      await deleteObject(logoRef);

      alert("ロゴ画像を削除しました。");
    } catch (error) {
      if (error instanceof FirebaseError) {
        if (error.code === "storage/object-not-found") {
          console.warn("ロゴ画像は既に存在しません（Storage）");
          alert(
            "FirestoreからのURLは削除しましたが、Storage上には画像が見つかりませんでした。"
          );
        } else {
          console.error("Firebaseエラー:", error);
          alert("ロゴ削除に失敗しました。");
        }
      } else {
        console.error("予期しないエラー:", error);
        alert("ロゴ削除に失敗しました。");
      }
    }
  };

  return (
    <div className="relative w-32 h-20 rounded shadow border overflow-hidden">
      {/* 現在のロゴ画像を表示 */}
      {url && url.trim() !== "" ? (
        <Image
          src={url}
          alt="ロゴ画像"
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200 text-white text-sm font-semibold">
          No Image
        </div>
      )}

      {/* スマホでも対応する透明なインプット */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onSelectFile(file);
          }
        }}
      />

      {/* 削除ボタン（画像がある時のみ） */}
      {url && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="absolute top-1 right-1 z-20 bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-white"
        >
          削除
        </button>
      )}
    </div>
  );
}
