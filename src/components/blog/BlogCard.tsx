// components/blog/BlogCard.tsx
"use client";

import type { BlogPost, BlogBlock, BlogMedia } from "@/types/blog";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pencil, Trash } from "lucide-react";
import ProductMedia from "@/components/ProductMedia";
import clsx from "clsx";

import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useUILang } from "@/lib/atoms/uiLangAtom";

/* ===================== 定数 ===================== */

/* ===================== レガシー互換：body/media → blocks ===================== */
function legacyToBlocks(post: BlogPost): BlogBlock[] {
  if (Array.isArray(post.blocks) && post.blocks.length > 0) {
    return post.blocks as BlogBlock[];
  }
  const result: BlogBlock[] = [];
  const body = (post.body ?? "").toString().trim();
  if (body) {
    result.push({ id: "legacy-body", type: "p", text: body } as BlogBlock);
  }
  const medias = Array.isArray(post.media) ? (post.media as BlogMedia[]) : [];
  for (let i = 0; i < medias.length; i++) {
    const m = medias[i];
    if (!m?.url || (m.type !== "image" && m.type !== "video")) continue;
    result.push({
      id: `legacy-media-${i}`,
      type: m.type,
      url: m.url,
      path: (m as any).path,
      title: (m as any).title ?? (m as any).caption ?? (m as any).alt ?? "",
      caption: (m as any).caption,
    } as unknown as BlogBlock);
  }
  return result;
}

/* ===================== 型ガード ===================== */
function isMediaBlock(
  b: BlogBlock
): b is BlogBlock & { type: "image" | "video"; url?: string } {
  return b.type === "image" || b.type === "video";
}
function hasKey<K extends "text" | "caption" | "title">(
  b: BlogBlock,
  k: K
): b is BlogBlock & Record<K, string> {
  return typeof (b as any)?.[k] === "string";
}

/* ===================== ローカライズ抽出 ===================== */
function pickLocalized(
  post: BlogPost,
  uiLang: string
): { title: string; blocks: BlogBlock[] } {
  const baseTitle = ((post as any).base?.title ?? post.title ?? "").toString();
  const baseBlocks: BlogBlock[] = Array.isArray((post as any).base?.blocks)
    ? ((post as any).base.blocks as BlogBlock[])
    : legacyToBlocks(post);

  if (uiLang === "ja") return { title: baseTitle, blocks: baseBlocks };

  const t = Array.isArray((post as any).t)
    ? ((post as any).t as Array<{
        lang: string;
        title?: string;
        blocks?: BlogBlock[];
      }>)
    : [];
  const hit = t.find((x) => x.lang === uiLang);

  if (!hit) return { title: baseTitle, blocks: baseBlocks };

  const tTitle = (hit.title ?? "").trim() || baseTitle;
  const tBlocks =
    Array.isArray(hit.blocks) && hit.blocks.length > 0
      ? (hit.blocks as BlogBlock[])
      : baseBlocks;

  return { title: tTitle, blocks: tBlocks };
}

/* ===================== 本体 ===================== */
type Props = {
  post: BlogPost;
  onDelete?: (post: BlogPost) => Promise<void> | void;
  deleting?: boolean;
  className?: string;
};

export default function BlogCard({
  post,
  onDelete,
  deleting,
  className,
}: Props) {
  // Jotai: UI表示言語
  const { uiLang } = useUILang();

  // ローカライズ済みデータ
  const { title: locTitle, blocks: locBlocks } = useMemo(
    () => pickLocalized(post, uiLang),
    [post, uiLang]
  );

  // ログイン状態（編集/削除の制御）
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setIsLoggedIn(!!u));
    return () => unsub();
  }, []);

  return (
    <article
      className={clsx(
        "overflow-hidden rounded-2xl shadow transition",
        "bg-white/30",
        className
      )}
    >
      <div className={clsx("p-4 space-y-4", "text-white text-outline")}>
        {/* 記事タイトル（ローカライズ済み） */}
        <h3
          className={clsx(
            "font-semibold text-2xl leading-snug",
            "text-white text-outline"
          )}
        >
          {locTitle}
        </h3>

        {/* 本文＆メディア（ローカライズ済みブロック） */}
        <div className="space-y-4">
          {locBlocks.map((b: BlogBlock, idx: number) => {
            if (b.type === "p") {
              return (
                <p
                  key={b.id ?? `p-${idx}`}
                  className={clsx(
                    "text-sm whitespace-pre-wrap leading-relaxed",
                    "text-white text-outline"
                  )}
                >
                  {hasKey(b, "text") ? b.text : ""}
                </p>
              );
            }

            if (isMediaBlock(b)) {
              const title = hasKey(b, "title")
                ? b.title
                : hasKey(b, "caption")
                ? b.caption
                : "";
              return (
                <div key={b.id ?? `m-${idx}`} className="space-y-2">
                  <div className="overflow-hidden rounded-xl border border-black/10">
                    <ProductMedia
                      src={(b as any).url}
                      type={b.type}
                      className="w-full"
                      autoPlay
                      loop
                      muted
                    />
                  </div>
                  {title && (
                    <div
                      className={clsx(
                        "text-xl whitespace-pre-wrap",
                        "text-white text-outline"
                      )}
                    >
                      {title}
                    </div>
                  )}
                </div>
              );
            }

            return null;
          })}
        </div>

        {/* 作成日時（そのまま） */}
        <div className={clsx("text-xs", "text-white text-outline")}>
          {post.createdAt?.toDate
            ? format(post.createdAt.toDate(), "yyyy/MM/dd HH:mm", {
                locale: ja,
              })
            : ""}
        </div>

        {/* 操作行（ログイン時のみ表示） */}
        {isLoggedIn && (
          <div className="pt-2 flex items-center gap-2">
            <Button asChild size="sm">
              <Link href={`/blog/${post.id}/edit`}>
                <Pencil className="mr-1.5 h-4 w-4" />
                編集
              </Link>
            </Button>

            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDelete?.(post)}
              disabled={deleting}
            >
              <Trash className="mr-1.5 h-4 w-4" />
              {deleting ? "削除中…" : "削除"}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
