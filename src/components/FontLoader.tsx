"use client";

import { useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function FontLoader() {
  const siteKey = "xenovant";

  useEffect(() => {
    const fetchFont = async () => {
      if (!siteKey) return;

      const docRef = doc(db, "assets", siteKey);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const font = snap.data().fontFamily;
        if (font) {
          const cssVar = `--font-${font}`;
          const cssValue = `var(${cssVar})`;

          document.documentElement.style.setProperty(
            "--selected-font",
            cssValue
          );

          console.log("[FontLoader] Firestore font:", font);
          console.log("[FontLoader] Applied CSS variable:", cssVar);
        } else {
          console.warn("[FontLoader] fontFamily is not set in Firestore.");
        }
      } else {
        console.warn("[FontLoader] assets document does not exist.");
      }
    };

    fetchFont();
  }, [siteKey]);

  return null;
}
