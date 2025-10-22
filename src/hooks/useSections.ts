// src/hooks/useSections.ts
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  writeBatch,
  doc,
  addDoc,
  serverTimestamp,
  deleteDoc,
  CollectionReference,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Section } from "@/types/productLocales";

/**
 * セクション一覧の購読＋追加/削除/並べ替えを提供するフック
 * - 取得順序: order 昇順 → createdAt 昇順（order 未設定は末尾）
 * - add: 既存の最大 order + 1 を採番
 * - reorder: 渡された id 配列の順に 0,1,2,... を付与（部分配列でもOK）
 */
export function useSections(siteKey: string) {
  const [sections, setSections] = useState<Section[]>([]);

  const sectionColRef: CollectionReference<DocumentData> = useMemo(
    () => collection(db, "siteSections", siteKey, "sections"),
    [siteKey]
  );

  // リアルタイム購読
  useEffect(() => {
    const q = query(sectionColRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const items: Section[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          base: data.base ?? { title: data.title ?? "" },
          t: Array.isArray(data.t) ? data.t : [],
          createdAt: data.createdAt,
          order: typeof data.order === "number" ? data.order : undefined,
        };
      });

      // order昇順（未定義は末尾）→ createdAt昇順
      items.sort((a, b) => {
        const ao = a.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.order ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return at - bt;
      });

      setSections(items);
    });
    return () => unsub();
  }, [sectionColRef]);

  // 並べ替え: idsInOrder の順に 0,1,2,... を付与
  const reorder = useCallback(
    async (idsInOrder: string[]) => {
      if (!idsInOrder?.length) return;
      const batch = writeBatch(db);
      idsInOrder.forEach((id, idx) => {
        batch.update(doc(sectionColRef, id), { order: idx });
      });
      await batch.commit();
    },
    [sectionColRef]
  );

  // 追加: 既存の最大 order + 1 を採番
  const add = useCallback(
    async (titleJa: string, t: Array<{ lang: any; title: string }>) => {
      const nextOrder =
        Math.max(
          -1,
          ...sections.map((s) =>
            typeof s.order === "number" ? s.order : -1
          )
        ) + 1;

      await addDoc(sectionColRef, {
        base: { title: titleJa.trim() },
        t: Array.isArray(t) ? t : [],
        createdAt: serverTimestamp(),
        order: nextOrder,
      });
    },
    [sectionColRef, sections]
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteDoc(doc(sectionColRef, id));
    },
    [sectionColRef]
  );

  return { sections, add, remove, reorder };
}

export default useSections;
