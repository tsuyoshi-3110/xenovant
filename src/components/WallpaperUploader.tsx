// components/WallpaperUploader.tsx
"use client";

import { useEffect, useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
import { db, storage, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function WallpaperUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const SITE_KEY = "xenovant";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setIsAdmin(!!user));
    return () => unsub(); // クリーンアップ関数
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    const path = `images/public/${SITE_KEY}/wallpaper.jpg`;
    const imageRef = ref(storage, path);
    await uploadBytes(imageRef, file);
    const url = await getDownloadURL(imageRef);

    await setDoc(
      doc(db, "siteSettingsEditable", SITE_KEY),
      { wallpaperUrl: url },
      { merge: true }
    );

    alert("背景画像を更新しました！");
    setFile(null);
  };

  if (!isAdmin) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="mb-2"
      />
      <button
        onClick={handleUpload}
        disabled={!file}
        className="px-3 py-1 bg-pink-600 text-white rounded"
      >
        アップロード
      </button>
    </div>
  );
}
