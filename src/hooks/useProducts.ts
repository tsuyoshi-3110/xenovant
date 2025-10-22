import { useCallback, useEffect, useRef, useState } from "react";
import {
  CollectionReference,
  DocumentData,
  QueryDocumentSnapshot,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  writeBatch,
  doc,
} from "firebase/firestore";
import type { ProdDoc, MediaType } from "@/types/productLocales";
import type { DragEndEvent } from "@dnd-kit/core";

type Params = {
  productColRef: CollectionReference<DocumentData>;
  selectedSectionId: string;
  pageSize?: number;
};

export function useProducts({ productColRef, selectedSectionId, pageSize = 20 }: Params) {
  const [list, setList] = useState<ProdDoc[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const isFetchingMore = useRef(false);

  // 初回/フィルタ変更で最初のページを購読
  useEffect(() => {
    setList([]);
    setLastDoc(null);
    setHasMore(true);

    if (isFetchingMore.current) return;
    isFetchingMore.current = true;

    const parts: any[] = [productColRef];
    if (selectedSectionId !== "all") parts.push(where("sectionId", "==", selectedSectionId));
    parts.push(orderBy("createdAt", "desc"));
    parts.push(limit(pageSize));

    const firstQuery = query(...(parts as Parameters<typeof query>));
    const unsub = onSnapshot(firstQuery, (snap) => {
      const rows: ProdDoc[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title ?? "",
          body: data.body ?? "",
          price: data.price ?? 0,
          priceIncl: data.priceIncl ?? null,
          priceExcl: data.priceExcl ?? null,
          taxRate: typeof data.taxRate === "number" ? data.taxRate : 0.1,
          priceInputMode: data.priceInputMode ?? "incl",
          taxIncluded: typeof data.taxIncluded === "boolean" ? data.taxIncluded : true,
          mediaURL: data.mediaURL ?? data.imageURL ?? "",
          mediaType: (data.mediaType ?? "image") as MediaType,
          originalFileName: data.originalFileName,
          order: data.order ?? 9999,
          base: data.base,
          t: Array.isArray(data.t) ? data.t : [],
          sectionId: data.sectionId ?? null,
        };
      });
      setList(rows);
      setLastDoc((snap.docs.at(-1) as QueryDocumentSnapshot<DocumentData>) || null);
      setHasMore(snap.docs.length === pageSize);
      isFetchingMore.current = false;
    });

    return () => unsub();
  }, [productColRef, selectedSectionId, pageSize]);

  // 並び順リアルタイム（セクションフィルタのみ）
  useEffect(() => {
    const parts: any[] = [productColRef];
    if (selectedSectionId !== "all") parts.push(where("sectionId", "==", selectedSectionId));

    const unsub = onSnapshot(query(...(parts as Parameters<typeof query>)), (snap) => {
      const rows: ProdDoc[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title,
          body: data.body,
          price: data.price ?? 0,
          mediaURL: data.mediaURL ?? data.imageURL ?? "",
          mediaType: (data.mediaType ?? "image") as MediaType,
          originalFileName: data.originalFileName,
          taxIncluded: data.taxIncluded ?? true,
          order: data.order ?? 9999,
          base: data.base,
          t: Array.isArray(data.t) ? data.t : [],
          sectionId: data.sectionId ?? null,
        };
      });
      rows.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
      setList(rows);
    });
    return () => unsub();
  }, [productColRef, selectedSectionId]);

  const fetchNextPage = useCallback(async () => {
    if (isFetchingMore.current || !hasMore || !lastDoc) return;
    isFetchingMore.current = true;

    const parts: any[] = [productColRef];
    if (selectedSectionId !== "all") parts.push(where("sectionId", "==", selectedSectionId));
    parts.push(orderBy("createdAt", "desc"));
    parts.push(startAfter(lastDoc));
    parts.push(limit(pageSize));

    const nextQuery = query(...(parts as Parameters<typeof query>));
    const snap = await getDocs(nextQuery);

    const nextRows: ProdDoc[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        title: data.title ?? "",
        body: data.body ?? "",
        price: data.price ?? 0,
        mediaURL: data.mediaURL ?? data.imageURL ?? "",
        mediaType: (data.mediaType ?? "image") as MediaType,
        originalFileName: data.originalFileName,
        taxIncluded: data.taxIncluded ?? true,
        order: data.order ?? 9999,
        base: data.base,
        t: Array.isArray(data.t) ? data.t : [],
        sectionId: data.sectionId ?? null,
      };
    });

    setList((prev) => [...prev, ...nextRows]);
    setLastDoc((snap.docs.at(-1) as QueryDocumentSnapshot<DocumentData>) || null);
    setHasMore(snap.docs.length === pageSize);
    isFetchingMore.current = false;
  }, [productColRef, lastDoc, hasMore, selectedSectionId, pageSize]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = list.findIndex((item) => item.id === active.id);
      const newIndex = list.findIndex((item) => item.id === over.id);
      const newList = [...list];
      const [moved] = newList.splice(oldIndex, 1);
      newList.splice(newIndex, 0, moved);
      setList(newList);

      const batch = writeBatch(productColRef.firestore);
      newList.forEach((item, index) => {
        batch.update(doc(productColRef, item.id), { order: index });
      });
      await batch.commit();
    },
    [list, productColRef]
  );

  return { list, setList, hasMore, fetchNextPage, handleDragEnd };
}
