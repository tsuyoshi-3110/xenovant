"use client";

import clsx from "clsx";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import { arrayMove } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { useEffect, useState } from "react";
import type { Section } from "@/types/productLocales";
import { BusyOverlay } from "../BusyOverlay"; // ★ 追加：操作中オーバーレイ

/* ========== 並べ替え行 ========== */
function SortableSectionRow({
  section,
  onDelete,
  children,
  disabled,
}: {
  section: Section;
  onDelete: (id: string) => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: transition || undefined,
    opacity: disabled ? 0.6 : undefined,
    pointerEvents: disabled ? "none" : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={clsx(
          "flex items-center justify-between border px-3 py-2 rounded bg-white",
          isDragging && "opacity-80 shadow"
        )}
      >
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.preventDefault()}
          className="flex items-center gap-2 text-gray-500 cursor-grab active:cursor-grabbing p-2 -ml-2"
          aria-label="並べ替え"
          type="button"
          style={{ touchAction: "none" }}
        >
          <GripVertical className="w-5 h-5" />
        </button>

        <div className="flex-1 px-2 truncate">{children}</div>

        <button
          onClick={() => onDelete(section.id)}
          className="text-red-600 hover:underline"
          type="button"
        >
          削除
        </button>
      </div>
    </div>
  );
}

/* ========== モーダル ========== */
type Props = {
  open: boolean;
  onClose: () => void;

  sections: Section[];

  // 親側の「保存中」フラグ（任意）
  saving: boolean;

  newSecName: string;
  setNewSecName: (v: string) => void;

  // Firestore 側の実処理（親から渡す）
  onAddSection: (titleJa: string) => Promise<void>;
  onRemoveSection: (id: string) => Promise<void>;
  onReorderSection: (ids: string[]) => Promise<void>;
};

export default function SectionManagerModal({
  open,
  onClose,
  sections,
  saving,
  newSecName,
  setNewSecName,
  onAddSection,
  onRemoveSection,
  onReorderSection,
}: Props) {
  // DnD センサー（常にトップレベルで定義）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 6 } })
  );

  // モーダル内のローカル一覧（即時反映用）
  const [local, setLocal] = useState<Section[]>(sections);

  // 親からの sections が変わったら同期（サーバ反映が戻ってきたときに整合）
  useEffect(() => {
    setLocal(sections);
  }, [sections]);

  // モーダル自身のビジーフラグ（追加・削除・並べ替えなど）
  const [busy, setBusy] = useState(false);
  const isBusy = busy || saving;

  // 追加（オプティミスティック）
  async function handleAdd() {
    const title = newSecName.trim();
    if (!title || isBusy) return;

    // 楽観的に挿入（暫定ID）
    const tempId = `temp-${Date.now()}`;
    const optimistic: Section = {
      id: tempId,
      base: { title },
      t: [],
      createdAt: undefined as any,
      order: (local.at(-1)?.order ?? -1) + 1,
    };

    setBusy(true);
    setLocal((prev) => [...prev, optimistic]);
    setNewSecName("");

    try {
      await onAddSection(title);
      // 成功：onSnapshotで本物に差し替わるはず。ここでは何もしない
    } catch (e) {
      // 失敗：ロールバック
      setLocal((prev) => prev.filter((s) => s.id !== tempId));
      console.error(e);
      alert("セクションの追加に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  // 削除（オプティミスティック）
  async function handleDelete(id: string) {
    if (isBusy) return;

    const before = local;
    setBusy(true);
    setLocal((prev) => prev.filter((s) => s.id !== id));
    try {
      await onRemoveSection(id);
    } catch (e) {
      // 失敗：戻す
      setLocal(before);
      console.error(e);
      alert("セクションの削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  // 並べ替え（オプティミスティック）
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = local.findIndex((s) => s.id === String(active.id));
    const newIndex = local.findIndex((s) => s.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(local, oldIndex, newIndex).map((s, idx) => ({
      ...s,
      order: idx,
    }));

    setLocal(next);
    setBusy(true);
    try {
      await onReorderSection(next.map((s) => s.id));
    } catch (e) {
      // 失敗：元に戻す
      console.error(e);
      alert("並べ替えの保存に失敗しました");
      setLocal(local); // 直前の state に戻す
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-3 overscroll-contain">
      {/* モーダル本体 */}
      <div
        className={clsx(
          "w-full max-w-sm sm:max-w-md",
          "max-h-[90vh]",
          "bg-white rounded-lg flex flex-col relative"
        )}
        role="dialog"
        aria-modal="true"
      >
        {/* BusyOverlay（モーダル内の操作中も見せたい場合） */}
        <BusyOverlay saving={isBusy} />

        {/* ヘッダー */}
        <div className="px-4 py-3 border-b">
          <h2 className="text-lg font-bold text-center sm:text-left">セクション管理</h2>
        </div>

        {/* コンテンツ */}
        <div className="px-4 py-4 space-y-4 overflow-y-auto min-h-0 overscroll-contain">
          {/* 追加フォーム */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="セクション名（例：クレープ）"
              value={newSecName}
              onChange={(e) => setNewSecName(e.target.value)}
              className="flex-1 border px-3 py-2 rounded"
              disabled={isBusy}
            />
            <button
              onClick={handleAdd}
              disabled={!newSecName.trim() || isBusy}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50 w-full sm:w-auto"
            >
              追加
            </button>
          </div>

          {/* 並べ替えリスト */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
          >
            <SortableContext items={local.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {local.length === 0 && (
                  <p className="text-sm text-gray-500">セクションはまだありません。</p>
                )}

                {local.map((s) => (
                  <SortableSectionRow
                    key={s.id}
                    section={s}
                    onDelete={handleDelete}
                    disabled={isBusy}
                  >
                    {s.base?.title ?? ""}
                  </SortableSectionRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* フッター */}
        <div className="px-4 py-3 border-t">
          <button onClick={onClose} className="w-full px-4 py-2 bg-gray-500 text-white rounded">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
