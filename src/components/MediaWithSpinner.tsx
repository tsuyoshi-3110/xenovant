"use client";

import Image, { StaticImageData } from "next/image";
import clsx from "clsx";
import { useState } from "react";
import CardSpinner from "./CardSpinner";
import { useOnScreen } from "@/lib/useOnScreen";

type Src = string | StaticImageData | null;

interface Props {
  src: Src;
  type: "image" | "video";
  className?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  alt?: string;
}

export default function MediaWithSpinner({
  src,
  type,
  className = "",
  autoPlay = true,
  loop = true,
  muted = true,
  alt = "",
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [ratio, setRatio] = useState<string | null>(null);

  // 必ず最上位で呼ぶ（Hooksのルール遵守）
  const [targetRef, visible] = useOnScreen<HTMLDivElement>("100px");

  // 無効な src は非表示
  if (!src || (typeof src !== "string" && typeof src !== "object")) {
    return null;
  }

  /* ===================== VIDEO ===================== */
  if (type === "video" && typeof src === "string") {
    return (
      <div ref={targetRef} className={clsx("relative w-full", className)}>
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <CardSpinner />
          </div>
        )}
        <video
          src={visible ? src : undefined}
          className={clsx(
            "w-full h-full object-cover",
            loaded ? "visible" : "invisible"
          )}
          playsInline
          muted={muted}
          autoPlay={visible && autoPlay}
          loop={visible && loop}
          preload="metadata"
          onLoadedData={() => setLoaded(true)}
        />
      </div>
    );
  }

  /* ===================== IMAGE ===================== */
  if (type === "image" && typeof src === "string") {
    return (
      <div
        ref={targetRef}
        className={clsx(
          "relative w-full",
          portrait ? "" : "overflow-hidden",
          className
        )}
        style={ratio ? { aspectRatio: ratio } : undefined}
      >
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <CardSpinner />
          </div>
        )}
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width:768px) 100vw, 768px"
          className={clsx(
            portrait ? "object-contain" : "object-cover",
            "rounded transition-opacity",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={({ currentTarget }) => {
            const { naturalWidth: w, naturalHeight: h } = currentTarget;
            if (w && h) {
              setPortrait(h > w);
              setRatio(`${w} / ${h}`);
            }
            setLoaded(true);
          }}
          priority={false}
          unoptimized
        />
      </div>
    );
  }

  // typeがimageでもvideoでもない場合
  return null;
}
