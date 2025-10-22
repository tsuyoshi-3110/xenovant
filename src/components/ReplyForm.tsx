"use client";
import { useState, useEffect } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

/* アプリ側で持っている siteKey に差し替えてください */
const SITE_KEY = "xenovant";

export default function ReplyForm({
  postId,
  onDone,
}: {
  postId: string;
  onDone?: () => void;
}) {
  const [text, setText] = useState("");

  /* ----- サイト名 & アイコン URL を取得 ----- */
  const [siteName, setSiteName] = useState("Anonymous");
  const [logoUrl, setLogoUrl] = useState("/noImage.png");

  useEffect(() => {
    const fetchMeta = async () => {
      /* siteName */
      const sSnap = await getDoc(doc(db, "siteSettings", SITE_KEY));
      if (sSnap.exists()) {
        setSiteName((sSnap.data() as any).siteName ?? "Anonymous");
      }

      /* headerLogoUrl */
      const eSnap = await getDoc(doc(db, "siteSettingsEditable", SITE_KEY));
      if (eSnap.exists()) {
        setLogoUrl((eSnap.data() as any).headerLogoUrl ?? "/noImage.png");
      }
    };
    fetchMeta();
  }, []);

  /* ----- 返信送信 ----- */
  const uid = auth.currentUser?.uid;

  const handleSubmit = async () => {
    if (!text.trim() || !uid) return;

    await addDoc(collection(db, "posts", postId, "replies"), {
      content: text.trim(),
      authorUid: uid,
      authorName: siteName,
      authorIconUrl: logoUrl, // ← 追加
      createdAt: serverTimestamp(),
    });

    setText("");
    onDone?.();
  };

  /* ----- JSX ----- */
  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="返信を入力"
        className="w-full border rounded p-2"
      />
      <button
        onClick={handleSubmit}
        disabled={!text.trim()}
        className="rounded bg-blue-600 px-4 py-1 text-white disabled:opacity-40"
      >
        送信する
      </button>
    </div>
  );
}
