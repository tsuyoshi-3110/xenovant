// components/HeaderLogoUploader.tsx
"use client";

import { useState, useEffect } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { setDoc, doc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "@/lib/firebase";

const SITE_KEY = "xenovant";

export default function HeaderLogoUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setIsAdmin(!!user));
    return () => unsub();
  }, []);

  const uploadLogo = async () => {
    if (!file) return;
    const path = `images/public/${SITE_KEY}/header-logo.jpg`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    await setDoc(
      doc(db, "siteSettingsEditable", SITE_KEY),
      { headerLogoUrl: url },
      { merge: true }
    );

    alert("ロゴ画像を更新しました！");
    setFile(null);
  };

  if (!isAdmin) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button
        onClick={uploadLogo}
        disabled={!file}
        className="px-3 py-1 bg-blue-600 text-white rounded"
      >
        アップロード
      </button>
    </div>
  );
}
