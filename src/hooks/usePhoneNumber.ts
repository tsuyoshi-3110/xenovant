import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const SITE_KEY = "xenovant";

export function usePhoneNumber() {
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    const fetchPhone = async () => {
      const ref = doc(db, "siteSettingsEditable", SITE_KEY);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setPhone(data.phone || null);
      }
    };

    fetchPhone().catch(console.error);
  }, []);

  const updatePhone = async (newPhone: string) => {
    const ref = doc(db, "siteSettingsEditable", SITE_KEY);
    await setDoc(ref, { phone: newPhone }, { merge: true });
    setPhone(newPhone);
  };

  return { phone, updatePhone };
}
