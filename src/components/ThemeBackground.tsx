"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { THEMES, ThemeKey } from "@/lib/themes";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";


const META_REF = doc(db, "siteSettingsEditable", SITE_KEY);

function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === "string" && Object.keys(THEMES).includes(value);
}

export default function ThemeBackground() {
  const [theme, setTheme] = useState<ThemeKey | null>(null); // 初期は null

  useEffect(() => {
    const unsub = onSnapshot(META_REF, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (isThemeKey(data.themeGradient)) {
          setTheme(data.themeGradient);
        }
      }
    });

    return () => unsub();
  }, []);

  if (theme === null) return null; // ← Firestoreが未取得なら描画しない

  return (
    <div
      aria-hidden
      className={`
        pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b transition-all duration-700
        ${THEMES[theme]}
      `}
    />
  );
}
