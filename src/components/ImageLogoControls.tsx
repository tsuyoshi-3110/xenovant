"use client";
import React, { useState } from "react";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import imageCompression from "browser-image-compression";
import ThemeWallpaper from "./ThemeWallpaper";
import HeaderLogoPicker from "./HeaderLogoPicker";

type Props = {
  /** どのサイトの設定か（例: "taxenovant3110"） */
  siteKey: string;
  /** Firestore のコレクション（既定: "siteSettingsEditable"） */
  collectionName?: string;
  /** 位置調整などに使う追加クラス */

  /** 進捗を親でも使いたい場合（任意） */
  onProgress?: (percent: number | null) => void;
  /** 完了後に親へ通知したい場合（任意） */
  onDone?: (type: "wallpaper" | "logo", url: string) => void;
};

export default function ImageLogoControls({
  siteKey,
  collectionName = "siteSettingsEditable",
  onProgress,
  onDone,
}: Props) {
  const [progress, setProgress] = useState<number | null>(null);

  const setP = (val: number | null) => {
    setProgress(val);
    onProgress?.(val);
  };

  const uploadImage = async (imageFile: File) => {
    const imagePath = `images/public/${siteKey}/wallpaper.jpg`;
    const imageRef = ref(getStorage(), imagePath);

    try {
      await deleteObject(imageRef);
    } catch {
      // 既存なしは無視
    }

    const task = uploadBytesResumable(imageRef, imageFile);
    setP(0);

    task.on(
      "state_changed",
      (snapshot) => {
        const percent = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        setP(percent);
      },
      (error) => {
        console.error("画像アップロード失敗:", error);
        setP(null);
        alert("アップロードに失敗しました");
      },
      async () => {
        const imageUrl = await getDownloadURL(imageRef);
        await setDoc(
          doc(db, collectionName, siteKey),
          { imageUrl },
          { merge: true }
        );
        setP(null);
        onDone?.("wallpaper", imageUrl);
        alert("背景画像を更新しました！");
      }
    );
  };

  const uploadHeaderImage = async (file: File) => {
    const logoPath = `images/public/${siteKey}/headerLogo.jpg`;
    const logoRef = ref(getStorage(), logoPath);

    const compressedFile = await imageCompression(file, {
      maxWidthOrHeight: 160,
      maxSizeMB: 0.5,
      initialQuality: 0.9,
      useWebWorker: true,
    });

    try {
      await deleteObject(logoRef);
    } catch {}

    const task = uploadBytesResumable(logoRef, compressedFile);
    setP(0);

    task.on(
      "state_changed",
      (snapshot) => {
        const percent = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        setP(percent);
      },
      (error) => {
        console.error("ロゴアップロード失敗:", error);
        setP(null);
        alert("アップロードに失敗しました");
      },
      async () => {
        const downloadURL = await getDownloadURL(logoRef);
        await setDoc(
          doc(db, collectionName, siteKey),
          { headerLogoUrl: downloadURL },
          { merge: true }
        );
        setP(null);
        onDone?.("logo", downloadURL);
        alert("ヘッダー画像を更新しました！");
      }
    );
  };

  return (
    <div className={`flex gap-8`}>
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm text-white">背景画像</span>
        <ThemeWallpaper onFileSelect={uploadImage} />
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="text-sm text-white">ロゴ画像</span>
        <HeaderLogoPicker onSelectFile={uploadHeaderImage} />
      </div>

      {/* 進捗UI（任意） */}
      {progress !== null && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-56 bg-white/90 rounded-lg shadow p-2">
          <p className="text-xs text-center mb-1">
            アップロード中… {progress}%
          </p>
          <div className="w-full h-2 bg-gray-200 rounded">
            <div
              className="h-full bg-green-500 rounded"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
