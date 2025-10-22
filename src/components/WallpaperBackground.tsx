// components/WallpaperBackground.tsx
"use client";

import { useWallpaperUrl } from "@/hooks/useWallpaper";

export default function WallpaperBackground() {
  const url = useWallpaperUrl();

  if (!url || url.trim() === "") {
    return null; // URLが存在しない場合は表示しない
  }

  return (
    <div
      aria-hidden
      className="
    pointer-events-none fixed top-0 left-0 w-screen h-screen -z-20
    bg-center
    bg-contain       // 📱スマホ：はみ出さないように画像全体を表示
    bg-no-repeat
    sm:bg-cover      // 💻PC以上：画面にぴったりカバー
  "
      style={{ backgroundImage: `url(${url})` }}
    />
  );
}
