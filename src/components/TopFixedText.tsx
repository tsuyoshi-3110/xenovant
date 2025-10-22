"use client";

import { useEffect, useState, useCallback } from "react";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SITE_KEY = "xenovant";
const docRef = doc(db, "sitePages", SITE_KEY, "pages", "topMessage");

type Msg = { title: string; body: string };
const emptyMsg: Msg = { title: "", body: "" };

export default function TopFixedText() {
  const [msg, setMsg] = useState<Msg>(emptyMsg);
  const [draft, setDraft] = useState<Msg>(emptyMsg);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);

  /* 認証監視 */
  useEffect(() => onAuthStateChanged(auth, (u) => setIsAdmin(!!u)), []);

  /* 初回ロード */
  useEffect(() => {
    getDoc(docRef).then((snap) => {
      if (snap.exists()) {
        const { title = "", body = "" } = snap.data() as Partial<Msg>;
        setMsg({ title, body });
        setDraft({ title, body });
      }
    });
  }, []);

  /* 保存 */
  const handleSave = useCallback(async () => {
    await setDoc(docRef, draft, { merge: true });
    setMsg(draft);
    setEditing(false);
    alert("保存しました！");
  }, [draft]);

  /* 削除 */
  const handleDelete = async () => {
    if (!confirm("トップメッセージを削除しますか？")) return;
    await deleteDoc(docRef);
    setMsg(emptyMsg);
    setDraft(emptyMsg);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(msg); // 入力欄だけ元に戻す
  };

  /* ========== ここから JSX ========== */
  return (
    <div className="fixed inset-x-0 top-10 z-30">
      {/* === 表示エリア === */}
      <div
        className="max-w-4xl mx-auto text-center space-y-4 px-4 mt-20"
        suppressHydrationWarning /* ★ 追加 point ① */
      >
        <p className="text-3xl font-bold text-white whitespace-pre-wrap">
          {msg.title || "\u00A0" /* ★ NBSP point ② */}
        </p>
        <p className="text-2xl text-white whitespace-pre-wrap">
          {msg.body || "\u00A0" /* ★ NBSP point ② */}
        </p>
      </div>

      {/* === 管理者操作ボタン === */}
      {isAdmin && !editing && (
        <div className="absolute right-10 top-5 flex gap-2 z-30">
          <Button
            className="bg-blue-500"
            size="sm"
            onClick={() => setEditing(true)}
          >
            {msg.title || msg.body ? "トップ編集" : "トップ追加"}
          </Button>
          {(msg.title || msg.body) && (
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              削除
            </Button>
          )}
        </div>
      )}

      {/* === 編集モーダル === */}
      {isAdmin && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg space-y-4 shadow-xl">
            <h2 className="text-xl font-bold text-center">
              トップメッセージ編集
            </h2>

            <input
              className="border px-3 py-2 w-full text-black font-bold text-lg rounded"
              placeholder="タイトル"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <Textarea
              rows={6}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="本文を入力…(不要な場合は空文字)"
              className="border px-3 py-2 w-full text-black"
            />
            <div className="flex justify-center gap-2">
              <Button onClick={handleSave} className="bg-blue-500">
                保存
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                className="bg-gray-300"
              >
                キャンセル
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
