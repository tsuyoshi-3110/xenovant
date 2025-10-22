// components/common/UILangMenu.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { LANGS } from "@/lib/langs";
import { useUILang, type UILang } from "@/lib/atoms/uiLangAtom";

const JA = { key: "ja", label: "日本語", emoji: "🇯🇵" } as const;

type Mode = "closed" | "popover" | "fullscreen";

export default function UILangMenu({
  fullWidth = false,
}: {
  fullWidth?: boolean;
}) {
  const { uiLang, setUiLang } = useUILang();
  const [mode, setMode] = useState<Mode>("closed");
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const current = useMemo(
    () => (uiLang === "ja" ? JA : LANGS.find((l) => l.key === uiLang) ?? JA),
    [uiLang]
  );
  const options = useMemo(() => [JA, ...LANGS], []);

  useEffect(() => setMounted(true), []);

  const open = () => {
    // 位置計算（上下自動・画面からはみ出さない）
    if (!triggerRef.current) {
      setMode("fullscreen");
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const margin = 8;
    const minWanted = 260; // これ以下しか空きが無いならフルスクリーンに
    const below = vh - rect.bottom - margin;
    const above = rect.top - margin;

    if (Math.max(below, above) < minWanted) {
      setMode("fullscreen");
      return;
    }

    const width = Math.min(rect.width, vw - margin * 2);
    const left = Math.min(Math.max(rect.left, margin), vw - width - margin);
    const openDown = below >= above;

    const style: React.CSSProperties = {
      position: "fixed",
      zIndex: 1000,
      left,
      width,
      maxHeight: Math.min(0.8 * vh, openDown ? below : above),
      overflowY: "auto",
    };
    if (openDown) {
      style.top = Math.min(rect.bottom + 6, vh - margin);
    } else {
      style.bottom = Math.max(vh - rect.top + 6, margin);
    }
    setMenuStyle(style);
    setMode("popover");
  };

  const close = () => setMode("closed");

  // リサイズやスクロールで再配置
  useEffect(() => {
    if (mode === "popover") {
      const onRecalc = () => open();
      window.addEventListener("resize", onRecalc);
      window.addEventListener("scroll", onRecalc, true);
      return () => {
        window.removeEventListener("resize", onRecalc);
        window.removeEventListener("scroll", onRecalc, true);
      };
    }
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    if (mode !== "closed") {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [mode]);

  const pick = (k: UILang) => {
    setUiLang(k);
    close();
  };

  return (
    <div className={clsx("relative", fullWidth ? "w-full" : "w-[260px]")}>
      {/* トリガー */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (mode === "closed" ? open() : close())}
        onTouchStart={() => (mode === "closed" ? open() : close())}
        aria-haspopup="listbox"
        aria-expanded={mode !== "closed"}
        className={clsx(
          "flex w-full items-center gap-2 rounded-lg border bg-white/90 px-3 py-2",
          "min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
        )}
        style={{
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span className="text-sm font-medium text-gray-700 select-none">
          表示言語
        </span>
        <span className="ml-1 text-lg leading-none">{current.emoji}</span>
        <span className="text-sm text-gray-900 truncate">
          {current.label} / {current.key}
        </span>
        <span className="ml-auto text-gray-500">▾</span>
      </button>

      {/* オーバーレイ（背景クリックで閉じる） */}
      {mounted &&
        mode !== "closed" &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[999] cursor-default"
              aria-hidden
              onClick={close}
            />
            {mode === "popover" ? (
              <div
                ref={menuRef}
                role="listbox"
                className="rounded-xl border bg-white/95 shadow-2xl backdrop-saturate-150"
                style={menuStyle}
              >
                <ul className="py-2 overscroll-contain">
                  {options.map((opt) => (
                    <li key={opt.key}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={uiLang === opt.key}
                        onClick={() => pick(opt.key as UILang)}
                        onTouchStart={() => pick(opt.key as UILang)}
                        className={clsx(
                          "w-full px-3 py-3 text-left flex items-center gap-3",
                          "hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none",
                          uiLang === opt.key && "bg-indigo-50"
                        )}
                        style={{ minHeight: 44 }}
                      >
                        <span className="text-xl">{opt.emoji}</span>
                        <span className="text-sm">
                          {opt.label} / {opt.key}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              // フルスクリーン・フォールバック（小さい画面・見切れ対策）
              <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center">
                <div
                  className="absolute inset-0 bg-black/40"
                  aria-hidden
                  onClick={close}
                />
                <div className="relative w-full sm:w-[520px] max-h-[80vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b flex items-center justify-between">
                    <div className="text-base font-semibold">
                      表示言語を選択
                    </div>
                    <button
                      type="button"
                      className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1"
                      onClick={close}
                    >
                      閉じる
                    </button>
                  </div>
                  <div className="max-h-[calc(80vh-56px)] overflow-auto overscroll-contain">
                    <ul className="p-2">
                      {options.map((opt) => (
                        <li key={opt.key}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={uiLang === opt.key}
                            onClick={() => pick(opt.key as UILang)}
                            className={clsx(
                              "w-full px-3 py-3 text-left flex items-center gap-3",
                              "hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none",
                              uiLang === opt.key && "bg-indigo-50"
                            )}
                            style={{ minHeight: 48 }}
                          >
                            <span className="text-2xl">{opt.emoji}</span>
                            <span className="text-base">
                              {opt.label} / {opt.key}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>,
          document.body
        )}
    </div>
  );
}
