"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

export function GATracker() {
  const pathname = usePathname();
  const siteKey = "xenovant";

  useEffect(() => {
    if (!pathname || !siteKey) return;

    const pageId = pathname.replace(/^\//, "") || "home";
    const docRef = doc(db, "analytics", siteKey, "pages", pageId); // ✅ 修正済み

    runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (docSnap.exists()) {
        const newCount = (docSnap.data().count || 0) + 1;
        transaction.update(docRef, {
          count: newCount,
          updatedAt: serverTimestamp(),
        });
      } else {
        transaction.set(docRef, {
          count: 1,
          updatedAt: serverTimestamp(),
        });
      }
    });

    // gtag送信（Google Analytics連携があれば）
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("config", "G-3D6Q54FJMV", {
        page_path: pathname,
      });
    }
  }, [pathname, siteKey]);

  return null;
}
