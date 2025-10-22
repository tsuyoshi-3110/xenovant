// hooks/useHeaderLogoUrl.ts
"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

const SITE_KEY = "xenovant";

export function useHeaderLogoUrl(): string {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "siteSettingsEditable", SITE_KEY),
      (snap) => {
        const data = snap.data();
        if (data?.headerLogoUrl?.startsWith("http")) {
          setUrl(data.headerLogoUrl);
        } else {
          setUrl("");
        }
      }
    );

    return () => unsub();
  }, []);

  return url;
}
