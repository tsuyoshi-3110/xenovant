"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  urls: string[];
  interval?: number;
  onFirstLoad?: () => void;
};

export default function Slideshow({ urls, interval = 5000, onFirstLoad }: Props) {
  const [index, setIndex] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isPortrait, setIsPortrait] = useState<boolean | null>(null);

  const currentUrl = useMemo(() => urls?.[index] ?? "", [urls, index]);

  useEffect(() => setIndex(0), [urls]);

  useEffect(() => {
    if (!urls || urls.length < 2) return;
    const t = setInterval(() => {
      setIndex((p) => (p + 1) % urls.length);
      setIsPortrait(null); // 次の画像で再判定
    }, interval);
    return () => clearInterval(t);
  }, [urls, interval]);

  const handleFirstLoad = () => {
    if (!hasLoaded) {
      setHasLoaded(true);
      onFirstLoad?.();
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const ratio = img.naturalWidth / img.naturalHeight;
    setIsPortrait(ratio < 1); // 縦長なら true
    handleFirstLoad();
  };

  if (!urls || urls.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* ぼかし背景（常に覆う） */}
      <Image
        src={currentUrl}
        alt=""
        fill
        aria-hidden
        className="object-cover blur-xl scale-110 opacity-40"
        priority={!hasLoaded}
        sizes="100vw"
        unoptimized
      />

      {/* 本体：縦は cover（トリミング有で画面ピッタリ）、横は contain（全体表示） */}
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={currentUrl}
          className="absolute inset-0 w-full h-full"
          initial={{ y: -200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 200, opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        >
          <Image
            src={currentUrl}
            alt="スライド画像"
            fill
            sizes="100vw"
            className={isPortrait === null ? "object-contain" : isPortrait ? "object-cover" : "object-contain"}
            onLoad={handleImageLoad}
            priority={!hasLoaded}
            unoptimized
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
