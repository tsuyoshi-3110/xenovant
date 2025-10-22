"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { LANGS } from "@/lib/langs";
import { useUILang, type UILang } from "@/lib/atoms/uiLangAtom";
import { db } from "@/lib/firebase";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import { doc, onSnapshot } from "firebase/firestore";

type LangOption = { key: UILang; label: string; emoji: string };
const ALL_OPTIONS: ReadonlyArray<LangOption> = LANGS as unknown as ReadonlyArray<LangOption>;

const TAP_MOVE_THRESHOLD = 8;
const TAP_TIME_THRESHOLD = 500;

const PICKER_W = 220;
const GUTTER = 8;
const SAFETY = 10;

/** 近いスクロール親（overflow-y: auto/scroll/hidden）を取得 */
function getScrollContainer(el: HTMLElement | null): HTMLElement {
  let p: HTMLElement | null = el?.parentElement ?? null;
  const isScrollable = (node: HTMLElement) => {
    const s = getComputedStyle(node);
    return /(auto|scroll|hidden)/.test(s.overflowY);
  };
  while (p && p !== document.body && p !== document.documentElement) {
    if (isScrollable(p)) return p;
    p = p.parentElement;
  }
  return document.documentElement;
}

type I18nMeta = {
  i18n?: {
    enabled?: boolean;
    langs?: UILang[];
  };
};

export default function UILangFloatingPicker() {
  const { uiLang, setUiLang } = useUILang();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // ---- サイト設定に連動（有効/無効, 許可言語） ----
  const [i18nEnabled, setI18nEnabled] = useState<boolean>(true);
  const [allowedFromServer, setAllowedFromServer] = useState<UILang[] | null>(null); // ← 初期は null（未ロード）
  const [loaded, setLoaded] = useState(false); // ← 初回スナップショット受信フラグ

  // 配置
  const [placement, setPlacement] = useState<"down" | "up">("down");
  const [hAlign, setHAlign] = useState<"left" | "center" | "right">("center");
  const [menuMaxH, setMenuMaxH] = useState<string>("60vh");

  // Firestore 購読
  useEffect(() => {
    const ref = doc(db, "siteSettingsEditable", SITE_KEY);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as I18nMeta | undefined;
      const enabled =
        typeof data?.i18n?.enabled === "boolean" ? data.i18n!.enabled! : true;
      const langs =
        Array.isArray(data?.i18n?.langs) && data!.i18n!.langs!.length > 0
          ? (data!.i18n!.langs as UILang[])
          : (["ja"] as UILang[]);
      const uniq = Array.from(new Set<UILang>([...langs, "ja"]));
      setI18nEnabled(enabled);
      setAllowedFromServer(uniq);
      setLoaded(true); // ← ここで初めて「ロード完了」
    });
    return () => unsub();
  }, []);

  // 表示候補（i18n無効時は日本語のみ）。未ロードの間は「現在の言語」を尊重して候補を出す。
  const visibleOptions = useMemo(() => {
    if (!loaded || allowedFromServer === null) {
      // ロード前は現在の言語 + ja を最小限出しておく（フォールバック抑制）
      const cur = ALL_OPTIONS.find(o => o.key === uiLang) ?? ALL_OPTIONS[0];
      const base = new Map<UILang, LangOption>([
        [cur.key, cur],
        ["ja" as UILang, ALL_OPTIONS.find(o => o.key === "ja")!],
      ]);
      return Array.from(base.values());
    }
    const allowed = i18nEnabled ? allowedFromServer : (["ja"] as UILang[]);
    const allowedSet = new Set<UILang>([...allowed, "ja"]);
    return ALL_OPTIONS.filter((o) => allowedSet.has(o.key));
  }, [loaded, allowedFromServer, i18nEnabled, uiLang]);

  // 現在の言語が許可外ならフォールバック（※ 初回ロード後のみ実行）
  useEffect(() => {
    if (!loaded) return; // ← これが重要。ロード前は絶対に上書きしない。
    const keys = visibleOptions.map((o) => o.key);
    if (!keys.includes(uiLang)) {
      const fallback = (keys.includes("ja") ? "ja" : keys[0]) as UILang;
      if (fallback) setUiLang(fallback);
    }
  }, [loaded, visibleOptions, uiLang, setUiLang]);

  const current = useMemo<LangOption>(() => {
    return (
      visibleOptions.find((o) => o.key === uiLang) ??
      visibleOptions[0] ??
      ALL_OPTIONS[0]
    );
  }, [uiLang, visibleOptions]);

  // 位置計算
  const decidePlacementAndSize = () => {
    if (!btnRef.current) return;
    const btnRect = btnRef.current.getBoundingClientRect();
    const container = getScrollContainer(btnRef.current);
    const cRect =
      container === document.documentElement
        ? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
        : container.getBoundingClientRect();

    const spaceAbove = Math.max(0, btnRect.top - cRect.top - GUTTER);
    const spaceBelow = Math.max(0, cRect.bottom - btnRect.bottom - GUTTER);
    const nextPlacement: "down" | "up" =
      spaceBelow >= spaceAbove ? "down" : "up";
    const capacity = nextPlacement === "down" ? spaceBelow : spaceAbove;
    const logicalMax = Math.floor((cRect.height || window.innerHeight) * 0.6);
    const px = Math.max(Math.min(capacity - SAFETY, logicalMax), 160);
    setPlacement(nextPlacement);
    setMenuMaxH(`${px}px`);

    const half = PICKER_W / 2;
    const centerLeft = btnRect.left + btnRect.width / 2 - half;
    const centerRight = btnRect.left + btnRect.width / 2 + half;
    if (centerRight + GUTTER > cRect.right) setHAlign("right");
    else if (centerLeft - GUTTER < cRect.left) setHAlign("left");
    else setHAlign("center");
  };

  // 外側タップで閉じる
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [open]);

  // Escで閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 開いたとき／リサイズ・スクロール時に再計算
  useEffect(() => {
    if (!open) return;
    decidePlacementAndSize();
    const onRS = () => decidePlacementAndSize();
    window.addEventListener("resize", onRS);
    window.addEventListener("scroll", onRS, { passive: true });
    return () => {
      window.removeEventListener("resize", onRS);
      window.removeEventListener("scroll", onRS);
    };
  }, [open]);

  const toggle = () => setOpen((v) => !v);

  return (
    <div className="pointer-events-auto mx-auto w-auto flex justify-center">
      <div
        className={clsx(
          "relative inline-flex items-center",
          "rounded-xl border bg-transparent backdrop-blur shadow-lg",
          "text-white"
        )}
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        {/* トリガー */}
        <button
          ref={btnRef}
          type="button"
          onClick={toggle}
          className={clsx(
            "flex items-center gap-2",
            "rounded-lg border bg-transparent",
            "px-3 py-2",
            "text-[16px]",
            "min-h-[44px]",
            "cursor-pointer select-none"
          )}
          style={{ width: PICKER_W }}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="表示言語を選択"
        >
          <span className="text-lg leading-none">{current?.emoji}</span>
          <span className="text-sm truncate text-white">
            {current?.label} / {current?.key}
          </span>
          <span className="ml-auto text-white/70">▾</span>
        </button>

        {/* メニュー */}
        {open && visibleOptions.length > 0 && (
          <div
            ref={menuRef}
            role="listbox"
            className={clsx(
              "absolute z-[9999]",
              placement === "down"
                ? "top-[calc(100%+6px)]"
                : "bottom-[calc(100%+6px)]",
              hAlign === "center" && "left-1/2 -translate-x-1/2",
              hAlign === "left" && "left-0",
              hAlign === "right" && "right-0",
              "overflow-auto rounded-xl border bg-white text-gray-900 shadow-xl",
              "py-1"
            )}
            style={{
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
              touchAction: "pan-y",
              maxHeight: menuMaxH,
              width: PICKER_W,
              maxWidth: "92vw",
            }}
          >
            {visibleOptions.map((o) => (
              <LangRow
                key={o.key}
                option={o}
                active={o.key === uiLang}
                onSelect={(val) => {
                  setUiLang(val);   // ← 操作時のみ更新
                  setOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** タップ時のみ onSelect を呼ぶ行 */
function LangRow({
  option,
  active,
  onSelect,
}: {
  option: { key: UILang; label: string; emoji: string };
  active: boolean;
  onSelect: (val: UILang) => void;
}) {
  const touchStart = useRef<{ y: number; x: number; t: number } | null>(null);

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => onSelect(option.key)}
      onTouchStart={(e) => {
        const t = e.changedTouches[0];
        touchStart.current = { y: t.clientY, x: t.clientX, t: Date.now() };
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        if (!start) return;
        const t = e.changedTouches[0];
        const dy = Math.abs(t.clientY - start.y);
        const dx = Math.abs(t.clientX - start.x);
        const dt = Date.now() - start.t;
        const isTap =
          dy < TAP_MOVE_THRESHOLD &&
          dx < TAP_MOVE_THRESHOLD &&
          dt < TAP_TIME_THRESHOLD;
        if (isTap) {
          e.preventDefault();
          onSelect(option.key);
        }
        touchStart.current = null;
      }}
      className={clsx(
        "w-full text-left px-4 py-3 text-[16px]",
        "hover:bg-gray-100 active:bg-gray-200",
        active && "bg-gray-100"
      )}
      style={{ touchAction: "pan-y" }}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0">{option.emoji}</span>
        <span className="truncate">
          {option.label} / {option.key}
        </span>
      </div>
    </button>
  );
}
