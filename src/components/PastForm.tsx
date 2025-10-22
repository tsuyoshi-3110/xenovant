"use client";
import { useState, useEffect, ChangeEvent } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import Image from "next/image";
import { auth, db } from "@/lib/firebase";
import { X } from "lucide-react";

const SITE_KEY = "xenovant";

export default function PostForm() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [siteName, setSiteName] = useState("Anonymous");
  const [logoUrl, setLogoUrl] = useState("/noImage.png");

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [keywords, setKeywords] = useState(["", "", ""]);
  const [generating, setGenerating] = useState(false);
  const [isSmartRephrasing, setIsSmartRephrasing] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    (async () => {
      const s1 = await getDoc(doc(db, "siteSettings", SITE_KEY));
      if (s1.exists()) setSiteName((s1.data() as any).siteName ?? "Anonymous");
      const s2 = await getDoc(doc(db, "siteSettingsEditable", SITE_KEY));
      if (s2.exists())
        setLogoUrl((s2.data() as any).headerLogoUrl ?? "/noImage.png");
    })();
  }, []);

  const uid = auth.currentUser?.uid;

  const submit = async () => {
    if (!uid || !text.trim()) return;

    setUploading(true);

    const postRef = await addDoc(collection(db, "posts"), {
      authorUid: uid,
      authorSiteKey: SITE_KEY,
      authorName: siteName,
      authorIconUrl: logoUrl,
      content: text.trim(),
      imageUrl: "",
      likeCount: 0,
      createdAt: serverTimestamp(),
    });

    if (file) {
      const storage = getStorage();
      const storageRef = ref(storage, `posts/${postRef.id}/${file.name}`);
      await uploadBytesResumable(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(postRef, { imageUrl: url });
    }

    setText("");
    setFile(null);
    setUploading(false);
    setIsSubmitted(true); // ✅ 投稿完了で非表示に
  };

  const generateAIText = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      const data = await res.json();
      setText(data.text);
      setAiModalOpen(false);
    } catch {
      alert("生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mb-4 space-y-3">
      {isSubmitted ? (
        <div className="text-green-700 font-bold text-center space-y-2">
          <p>✅ 投稿が完了しました！</p>
        </div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="いまどうしてる？"
            className="w-full h-40 border rounded p-2"
          />

          {file && (
            <div className="w-full">
              <Image
                src={URL.createObjectURL(file)}
                alt="preview"
                width={400}
                height={300}
                className="max-h-60 rounded border mb-2 object-contain"
                unoptimized
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded bg-gray-200 px-3 py-1 text-sm">
              画像を選択
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFile(e.target.files?.[0] ?? null)
                }
              />
            </label>

            <button
              onClick={submit}
              disabled={!text.trim() || uploading}
              className="rounded bg-blue-600 px-4 py-1 text-white disabled:opacity-40"
            >
              {uploading ? "アップロード中..." : "投稿"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setAiModalOpen(true)}
              className="rounded bg-purple-600 px-3 py-1 text-white"
            >
              AIが文章を生成
            </button>

            <button
              onClick={async () => {
                setIsSmartRephrasing(true);
                const res = await fetch("/api/smart-rephrase", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text }),
                });
                const data = await res.json();
                if (data.result) setText(data.result);
                setIsSmartRephrasing(false);
              }}
              className="rounded bg-purple-600 px-3 py-1 text-white disabled:opacity-40"
              disabled={!text.trim() || isSmartRephrasing}
            >
              {isSmartRephrasing ? "スマート化中..." : "スマートに整える"}
            </button>
          </div>

          {aiModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg w-full max-w-md space-y-4 relative">
                <button
                  onClick={() => setAiModalOpen(false)}
                  className="absolute top-2 right-2"
                >
                  <X />
                </button>
                <h2 className="text-lg font-bold mb-2">キーワードを3つ入力</h2>
                {keywords.map((k, i) => (
                  <input
                    key={i}
                    type="text"
                    className="w-full border px-2 py-1 rounded"
                    value={k}
                    onChange={(e) => {
                      const newK = [...keywords];
                      newK[i] = e.target.value;
                      setKeywords(newK);
                    }}
                  />
                ))}
                <button
                  disabled={keywords.some((k) => !k.trim()) || generating}
                  onClick={generateAIText}
                  className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-40"
                >
                  {generating ? "生成中..." : "生成する"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
