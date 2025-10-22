// components/blog/BlogEditor.tsx
"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import type { BlogBlock } from "@/types/blog";
import { useRouter } from "next/navigation";
import {
  ref as sref,
  deleteObject,
  getDownloadURL,
  uploadBytes,
} from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import clsx from "clsx";
import BlockEditor from "./BlockEditor";
import { v4 as uuid } from "uuid";
import { BusyOverlay } from "@/components/BusyOverlay";
import { LANGS, type LangKey } from "@/lib/langs";



/* ==========================
   Firestore 保存用ユーティリティ
========================== */
function pruneUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(pruneUndefined) as unknown as T;
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = pruneUndefined(v);
    }
    return out as T;
  }
  return obj;
}

/* ==========================
   ブロック型ガード
========================== */
function blockHasKey(
  b: BlogBlock,
  key: "text" | "caption" | "title"
): b is BlogBlock & Record<typeof key, string> {
  return typeof (b as Record<string, unknown>)[key] === "string";
}
function isMedia(b: BlogBlock): b is BlogBlock & {
  type: "image" | "video";
  path?: string;
  url?: string;
  title?: string;
  caption?: string;
} {
  return b.type === "image" || b.type === "video";
}

/* ==========================
   temp → posts/{id} に移動（baseのみ）
========================== */
async function moveTempToPost(
  postId: string,
  blocks: BlogBlock[],
  onProgress?: (pct: number, label: string) => void
): Promise<BlogBlock[]> {
  const targets = blocks.filter(
    (b) => isMedia(b) && typeof b.path === "string" && b.path.includes("/posts/temp/")
  );
  let moved = 0;
  const total = targets.length;

  const emit = (label: string) =>
    onProgress?.(total === 0 ? 100 : Math.round((moved / total) * 100), label);

  const result: BlogBlock[] = [];
  for (const b of blocks) {
    if (!isMedia(b) || !b.path || !b.path.includes("/posts/temp/")) {
      result.push(b);
      continue;
    }
    emit(`メディア移動中… ${moved + 1}/${total}`);

    const oldRef = sref(storage, b.path);
    const blob = await fetch(await getDownloadURL(oldRef)).then((r) => r.blob());
    const newPath = b.path.replace("/posts/temp/", `/posts/${postId}/`);
    const newRef = sref(storage, newPath);
    await uploadBytes(newRef, blob, { contentType: blob.type });
    const newUrl = await getDownloadURL(newRef);

    try {
      await deleteObject(oldRef);
    } catch {
      /* noop */
    }

    result.push({
      ...(b as Record<string, unknown>),
      path: newPath,
      url: newUrl,
    } as BlogBlock);

    moved++;
    emit(`メディア移動中… ${moved}/${total}`);
  }
  emit("最終処理中…");
  return result;
}

/* ==========================
   翻訳：原文→指定言語（ブロック構造維持）
========================== */
type TranslatedPost = { lang: LangKey; title: string; blocks: BlogBlock[] };

async function translatePost(
  baseTitle: string,
  baseBlocks: BlogBlock[],
  target: LangKey
): Promise<TranslatedPost> {
  const SEP = "\n---\n";
  const items: Array<
    | { kind: "title" }
    | { kind: "text"; idx: number }
    | { kind: "caption"; idx: number }
    | { kind: "mediaTitle"; idx: number }
  > = [];
  const payload: string[] = [];

  if (baseTitle.trim()) {
    items.push({ kind: "title" });
    payload.push(baseTitle);
  }

  baseBlocks.forEach((b, idx) => {
    if (blockHasKey(b, "text") && b.text.trim()) {
      items.push({ kind: "text", idx });
      payload.push(b.text);
    }
    if (blockHasKey(b, "caption") && b.caption.trim()) {
      items.push({ kind: "caption", idx });
      payload.push(b.caption);
    }
    if (isMedia(b) && blockHasKey(b, "title") && b.title.trim()) {
      items.push({ kind: "mediaTitle", idx });
      payload.push(b.title);
    }
  });

  if (payload.length === 0) {
    return { lang: target, title: baseTitle, blocks: baseBlocks };
  }

  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "", body: payload.join(SEP), target }),
  });
  if (!res.ok) throw new Error("翻訳APIエラー");
  const data = (await res.json()) as { body?: string };
  const parts = String(data.body ?? "").split(SEP);

  let p = 0;
  let tTitle = baseTitle;
  const outBlocks: BlogBlock[] = baseBlocks.map((b) => ({ ...b }));

  if (items[0]?.kind === "title") {
    tTitle = (parts[p++] ?? "").trim() || baseTitle;
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === "title") continue;
    const translated = (parts[p++] ?? "").trim();
    if (!translated) continue;
    const idx = it.idx!;
    const b = outBlocks[idx] as Record<string, unknown>;
    if (it.kind === "text") b.text = translated;
    if (it.kind === "caption") b.caption = translated;
    if (it.kind === "mediaTitle") b.title = translated;
  }

  return { lang: target, title: tTitle, blocks: outBlocks };
}

/* ==========================
   コンポーネント
========================== */
type Props = { postId?: string };

export default function BlogEditor({ postId }: Props) {
  const router = useRouter();

  // 原文（日本語）
  const [title, setTitle] = useState<string>("");
  const [blocks, setBlocks] = useState<BlogBlock[]>([]);

  // BusyOverlay 制御
  const [busy, setBusy] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);




  /* 既存読み込み（互換対応） */
  useEffect(() => {
    if (!postId) return;
    (async () => {
      const refDoc = doc(db, "siteBlogs", SITE_KEY, "posts", postId);
      const snap = await getDoc(refDoc);
      if (!snap.exists()) return;
      const d = snap.data() as any;

      // base
      const baseTitle: string =
        (d.base?.title as string) ?? (d.title as string) ?? "";
      let baseBlocks: BlogBlock[] = Array.isArray(d.base?.blocks)
        ? (d.base.blocks as BlogBlock[])
        : Array.isArray(d.blocks)
        ? (d.blocks as BlogBlock[])
        : [];

      // レガシー body/media → blocks 変換
      if (!baseBlocks || baseBlocks.length === 0) {
        const tmp: BlogBlock[] = [];
        const bodyText = String(d.body || "");
        if (bodyText)
          tmp.push({ id: uuid(), type: "p", text: bodyText } as BlogBlock);
        const medias = Array.isArray(d.media) ? (d.media as BlogBlock[]) : [];
        for (const m of medias)
          tmp.push({ id: uuid(), ...(m as object) } as BlogBlock);
        if (tmp.length === 0)
          tmp.push({ id: uuid(), type: "p", text: "" } as BlogBlock);
        baseBlocks = tmp;
      }

      setTitle(baseTitle);
      setBlocks(baseBlocks);
    })();
  }, [postId]);

  /* ========== 保存（新規/更新） ========== */
  const save = async () => {
    if (!title.trim()) {
      alert("タイトルを入力してください。");
      return;
    }
    setBusy(true);
    setUploadPercent(5); // 準備中
    try {
      if (postId) {
        // メディア移動
        const moved = await moveTempToPost(postId, blocks, (pct) => {
          // 10〜80%のレンジで反映
          const scaled =
            10 + Math.round((Math.max(0, Math.min(100, pct)) / 100) * 70);
          setUploadPercent(scaled);
        });

        // 翻訳（✅ 毎回・全言語で上書き）
        setUploadPercent(85);
        const tAll: TranslatedPost[] = await Promise.all(
          (LANGS.map((l) => l.key) as LangKey[]).map((lang) =>
            translatePost(title, moved, lang)
          )
        );

        // 互換 body（段落テキストを連結）
        const plain = moved
          .filter((b) => blockHasKey(b, "text"))
          .map((b) => (b as { text: string }).text || "")
          .join("\n\n")
          .trim();

        // 保存
        setUploadPercent(95);
        await updateDoc(
          doc(db, "siteBlogs", SITE_KEY, "posts", postId),
          pruneUndefined({
            base: { title, blocks: moved }, // ja は base
            t: tAll, // 全言語上書き
            // 互換フィールド
            title,
            body: plain,
            blocks: moved,
            updatedAt: serverTimestamp(),
          })
        );

        setUploadPercent(100);
      } else {
        // 新規作成
        setUploadPercent(10);
        const created = await addDoc(
          collection(db, "siteBlogs", SITE_KEY, "posts"),
          {
            base: { title: title || "", blocks: [] as BlogBlock[] },
            t: [] as TranslatedPost[],
            title: title || "",
            body: "",
            blocks: [] as BlogBlock[],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        );

        // メディア移動
        const moved = await moveTempToPost(created.id, blocks, (pct) => {
          const scaled =
            15 + Math.round((Math.max(0, Math.min(100, pct)) / 100) * 60);
          setUploadPercent(scaled);
        });

        // 翻訳（✅ 毎回・全言語で上書き）
        setUploadPercent(80);
        const tAll: TranslatedPost[] = await Promise.all(
          (LANGS.map((l) => l.key) as LangKey[]).map((lang) =>
            translatePost(title, moved, lang)
          )
        );

        // 互換 body
        const plain = moved
          .filter((b) => blockHasKey(b, "text"))
          .map((b) => (b as { text: string }).text || "")
          .join("\n\n")
          .trim();

        // 保存
        setUploadPercent(95);
        await updateDoc(
          created,
          pruneUndefined({
            base: { title, blocks: moved },
            t: tAll,
            title,
            body: plain,
            blocks: moved,
            updatedAt: serverTimestamp(),
          })
        );

        setUploadPercent(100);
      }

      // 完了後遷移
      setTimeout(() => {
        setUploadPercent(null);
        setBusy(false);
        router.push("/blog");
      }, 300);
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました。");
      setUploadPercent(null);
      setBusy(false);
    }
  };

  /* ========== 削除（メディアも） ========== */
  const remove = async () => {
    if (!postId) return;
    if (!confirm("この記事を削除しますか？（メディアも削除されます）")) return;
    setBusy(true);
    setUploadPercent(20);
    try {
      for (const b of blocks) {
        if (isMedia(b) && b.path) {
          try {
            await deleteObject(sref(storage, b.path));
          } catch {
            /* noop */
          }
        }
      }
      setUploadPercent(85);
      await deleteDoc(doc(db, "siteBlogs", SITE_KEY, "posts", postId));
      setUploadPercent(100);
      setTimeout(() => {
        setUploadPercent(null);
        setBusy(false);
        router.push("/blog");
      }, 250);
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました。");
      setUploadPercent(null);
      setBusy(false);
    }
  };

  /* ==========================
     UI
  ========================== */
  return (
    <div
      className={clsx(
        "space-y-6 bg-white/20 rounded-2xl shadow",
        "text-white text-outline"
      )}
    >
      {/* ✅ 共通 BusyOverlay */}
      <BusyOverlay uploadingPercent={uploadPercent} saving={busy} />

      <div className="p-5">
        {/* タイトル */}
        <div className="grid gap-2">
          <label className="text-sm font-medium">タイトル</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            className="text-white text-outline"
            disabled={busy}
          />
        </div>

        {/* 操作 */}
        <div className="flex items-center gap-2 mt-5 mb-5">
          <Button onClick={save} disabled={busy}>
            {postId ? "更新" : "公開"}
          </Button>
          {postId && (
            <Button variant="destructive" onClick={remove} disabled={busy}>
              削除
            </Button>
          )}
        </div>

        {/* 本文エディタ */}
        <div className="grid gap-2">
          <label className="text-sm font-medium">本文</label>
          <BlockEditor
            value={blocks}
            onChange={setBlocks}
            postIdForPath={postId ?? null}
          />
        </div>
      </div>
    </div>
  );
}
