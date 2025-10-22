// app/blog/page.tsx
"use client";

import {
  collection,
  query,
  orderBy,
  limit as fbLimit,
  getDocs,
  startAfter,
  doc,
  deleteDoc,
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { BlogPost } from "@/types/blog";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import BlogCard from "@/components/blog/BlogCard";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";

import { deleteObject, ref as storageRef } from "firebase/storage";
import clsx from "clsx";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { THEMES, ThemeKey } from "@/lib/themes";

const PAGE_SIZE = 20;

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [cursor, setCursor] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // マウント時にログイン状態を監視
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  // ===== テーマとグラデーション =====
  const gradient = useThemeGradient();
  const isDark = useMemo(() => {
    const darkKeys: ThemeKey[] = ["brandG", "brandH", "brandI"];
    return gradient && darkKeys.some((k) => gradient === THEMES[k]);
  }, [gradient]);

  const fetchPage = useCallback(
    async (firstLoad = false) => {
      if (!SITE_KEY || loading || noMore) return;
      setLoading(true);
      try {
        const col = collection(db, "siteBlogs", SITE_KEY, "posts");
        const base = query(
          col,
          orderBy("createdAt", "desc"),
          fbLimit(PAGE_SIZE)
        );

        const q = cursor
          ? query(
              col,
              orderBy("createdAt", "desc"),
              startAfter(cursor),
              fbLimit(PAGE_SIZE)
            )
          : base;

        const snap = await getDocs(q);
        if (snap.empty) {
          setNoMore(true);
          return;
        }

        const items: BlogPost[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        setPosts((prev) => (firstLoad ? items : [...prev, ...items]));
        setCursor(snap.docs[snap.docs.length - 1] ?? null);

        if (snap.size < PAGE_SIZE) setNoMore(true);
      } finally {
        setLoading(false);
      }
    },
    [cursor, loading, noMore]
  );

  useEffect(() => {
    setPosts([]);
    setCursor(null);
    setNoMore(false);
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SITE_KEY]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e.isIntersecting) fetchPage(false);
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchPage]);

  const handleDelete = async (post: BlogPost) => {
    if (!SITE_KEY || !post?.id) return;
    if (!confirm("この記事を削除しますか？（メディアも削除されます）")) return;

    setDeletingId(post.id);
    try {
      // blocks（新仕様）
      const blocks = Array.isArray((post as any).blocks)
        ? (post as any).blocks
        : [];
      for (const b of blocks) {
        if ((b?.type === "image" || b?.type === "video") && b?.path) {
          try {
            await deleteObject(storageRef(storage, b.path));
          } catch {}
        }
      }
      // media（旧仕様）
      const medias = Array.isArray((post as any).media)
        ? (post as any).media
        : [];
      for (const m of medias) {
        if (m?.path) {
          try {
            await deleteObject(storageRef(storage, m.path));
          } catch {}
        }
      }

      await deleteDoc(doc(db, "siteBlogs", SITE_KEY, "posts", post.id));
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* <div className="flex items-center justify-between">
        <h1
          className={clsx(
            "text-xl font-bold",
            isDark ? "text-white" : "text-black"
          )}
        >
          ブログ
        </h1>
      </div> */}

      {posts.length === 0 && !loading ? (
        <p
          className={clsx(
            "text-sm",
            isDark ? "text-white/70" : "text-muted-foreground"
          )}
        >
          まだ投稿がありません。
        </p>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-1 justify-items-center">
            {posts.map((p) => (
              <BlogCard
                key={p.id}
                post={p}
                onDelete={handleDelete}
                deleting={deletingId === p.id}
                className="w-[90%]"
              />
            ))}
          </div>

          <div
            className={clsx(
              "flex justify-center py-4 text-sm",
              isDark ? "text-white/70" : "text-muted-foreground"
            )}
          >
            {loading && "読み込み中…"}
          </div>

          <div ref={sentinelRef} className="h-6" />
        </>
      )}

      {/* 右下固定の + ボタン（ログイン時のみ） */}
      {user && (
        <Link
          href="/blog/new"
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-lg transition-transform transform hover:scale-110 active:scale-95"
        >
          <span className="text-3xl leading-none">＋</span>
        </Link>
      )}

      {/* 右下固定「取材はこちらへ」— 半透明グレー＋透過＆モーション */}
      <a
        href="mailto:onestopgunma@gmail.com"
        aria-label="メールで問い合わせる"
        className={clsx(
          "group fixed bottom-6 right-6 z-20 pointer-events-auto",
          "inline-flex items-center gap-2 rounded-full px-4 py-3 font-semibold text-white",
          // 半透明グレー & ぼかし（背景が透ける）
          "bg-neutral-800/70 backdrop-blur-md",
          // 立体感
          "border border-white/15 shadow-xl",
          // モーション
          "transition-all duration-200 hover:bg-neutral-800/80 hover:shadow-2xl active:scale-[.98]",
          // アクセシビリティ
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
        )}
      >
        <span className="relative z-10 inline-flex items-center gap-2">
          {/* メールアイコン（ホバーで少し浮く） */}
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 transition-transform duration-200 group-hover:-translate-y-0.5"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 2v.01L12 12 4 6.01V6h16zM4 18V8.236l7.386 5.54a1 1 0 0 0 1.228 0L20 8.236V18H4z" />
          </svg>
          取材はこちらへ
          {/* 右矢印（ホバーで少し右へ） */}
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M13.172 12 8.222 7.05l1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
          </svg>
        </span>
      </a>
    </div>
  );
}
