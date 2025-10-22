/* ---------- FontSwitcher.tsx ---------- */
"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const siteKey = "xenovant";

/* 利用可能フォント一覧（表示名と保存キー） */
const fonts = [
  { name: "Kosugi Maru", key: "kosugi" },
  { name: "Noto Sans JP", key: "noto" },
  { name: "明朝", key: "shippori" },
  { name: "Reggae One", key: "reggae" },
  { name: "Yomogi", key: "yomogi" },
  { name: "Hachi Maru Pop", key: "hachimaru" },
];

export default function FontSwitcher() {
  /* 現在選択中のフォント */
  const [selected, setSelected] = useState<string>("kosugi");
  /* 保存完了のフラグ（✅アイコン表示用） */
  const [saved, setSaved] = useState(false);
  /* 二重クリック防止用 */
  const [saving, setSaving] = useState(false);

  /* ---------- 初回：Firestore からフォント取得 ---------- */
  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "assets", siteKey));
      if (snap.exists()) {
        const font = snap.data().fontFamily as string | undefined;
        if (font) {
          setSelected(font);
          document.documentElement.style.setProperty(
            "--selected-font",
            `var(--font-${font})`
          );
        }
      }
    })();
  }, []);

  /* ---------- クリックで変更 & 保存 ---------- */
  const handleClick = async (fontKey: string) => {
    if (saving || fontKey === selected) return; // 連打防止
    setSaving(true);

    /* 1) 画面に即反映 */
    setSelected(fontKey);
    document.documentElement.style.setProperty(
      "--selected-font",
      `var(--font-${fontKey})`
    );

    /* 2) Firestore へ保存
          - setDoc + {merge:true} で
            まだドキュメントが無い場合は新規作成、あれば更新 */
    await setDoc(
      doc(db, "assets", siteKey),
      { fontFamily: fontKey },
      { merge: true }
    );

    /* 3) ✅Saved アイコンを 2 秒だけ表示 */
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setSaving(false);
  };

  /* ---------- 表示 ---------- */
  return (
    <div className="relative flex flex-wrap gap-2 p-2">
      {fonts.map((f) => (
        <button
          key={f.key}
          onClick={() => handleClick(f.key)}
          disabled={saving && selected !== f.key}
          className={`px-3 py-1 rounded border transition
            ${
              selected === f.key
                ? "bg-gray-200 font-bold ring-2 ring-gray-400"
                : "bg-white hover:bg-gray-50"
            }
          `}
          style={{ fontFamily: `var(--font-${f.key})` }}
        >
          {f.name}
        </button>
      ))}

      {/* ✅ 保存完了シール */}
      {saved && (
        <span
          className="absolute -top-2 right-2 flex items-center gap-1
                         bg-emerald-500 text-white text-xs font-semibold
                         px-2 py-0.5 rounded-full shadow"
        >
          ✅ Saved
        </span>
      )}
    </div>
  );
}
