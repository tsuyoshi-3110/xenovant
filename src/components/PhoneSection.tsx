"use client";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { ThemeKey, THEMES } from "@/lib/themes";
import clsx from "clsx";
import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js";

const SITE_KEY = "xenovant";

export function PhoneSection() {
  const [phone, setPhone] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  const gradient = useThemeGradient();

  const isDark = useMemo(() => {
    const darkThemes: ThemeKey[] = ["brandG", "brandH", "brandI"];
    if (!gradient) return false;
    return darkThemes.some((key) => gradient === THEMES[key]);
  }, [gradient]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(!!user);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const fetch = async () => {
      try {
        const ref = doc(db, "siteSettingsEditable", SITE_KEY);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setPhone(snap.data().phone ?? null);
        }
      } catch (err) {
        console.error("Firestore 読み込み失敗:", err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = new AsYouType("JP").input(e.target.value);
    setInput(formatted);
  };

  const savePhone = async () => {
    const phoneNumber = parsePhoneNumberFromString(input, "JP");
    if (!phoneNumber || !phoneNumber.isValid()) {
      alert("正しい電話番号を入力してください");
      return;
    }

    const e164 = phoneNumber.number; // +81形式
    const ref = doc(db, "siteSettingsEditable", SITE_KEY);
    await setDoc(ref, { phone: e164 }, { merge: true });
    setPhone(e164);
    setEditing(false);
  };

  const deletePhone = async () => {
    const ref = doc(db, "siteSettingsEditable", SITE_KEY);
    await updateDoc(ref, { phone: null });
    setPhone(null);
    setEditing(false);
  };

  const formatDisplay = (phone: string) => {
    const parsed = parsePhoneNumberFromString(phone, "JP");
    return parsed?.formatNational() ?? phone;
  };

  if (loading || (!phone && !isLoggedIn)) return null;

  return (
    <section className="max-w-4xl mx-auto text-center mb-12">
      {phone && (
        <h2 className="text-3xl font-bold text-white/80 mb-2">
          ご注文はこちら
        </h2>
      )}

      {!editing ? (
        <>
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="text-2xl md:text-3xl font-extrabold text-white bg-gradient-to-br from-[rgba(245,75,202,0.7)] to-[rgba(250,219,159,0.7)] px-6 py-3 rounded-xl inline-block hover:bg-pink-700 transition"
            >
              {formatDisplay(phone)}
            </a>
          ) : (
            <p className="text-white text-lg">※ 電話番号が未登録です</p>
          )}

          {isLoggedIn && (
            <div className="mt-2 space-x-4">
              <button
                onClick={() => {
                  const p = phone
                    ? parsePhoneNumberFromString(phone, "JP")?.formatNational()
                    : "";
                  setInput(p ?? "");
                  setEditing(true);
                }}
                className="px-2 py-1 bg-blue-600 text-white rounded text-sm cursor-pointer"
              >
                {phone ? "編集" : "登録する"}
              </button>
              {phone && (
                <button
                  onClick={deletePhone}
                  className="px-2 py-1 bg-red-600 text-white rounded text-sm cursor-pointer"
                >
                  削除
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <input
            type="tel"
            value={input}
            onChange={handleChange}
            className={clsx(
              "text-lg px-4 py-2 rounded border w-full max-w-xs text-center",
              isDark && "text-white"
            )}
            placeholder="070-1234-5678"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={savePhone}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              保存
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-white underline"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
