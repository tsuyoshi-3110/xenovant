"use client";

import { useState } from "react";
import {
  EmailAuthProvider,
  updatePassword,
  reauthenticateWithCredential,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { FirebaseError } from "firebase/app";

type Props = {
  onClose: () => void;
};

export default function ChangePassword({ onClose }: Props) {
  const user = auth.currentUser;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false); // ← パスワード表示制御

  // ✅ パスワードバリデーション関数
  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return "パスワードは8文字以上にしてください。";
    if (!/[a-z]/.test(pw)) return "小文字を1文字以上含めてください。";
    if (!/[A-Z]/.test(pw)) return "大文字を1文字以上含めてください。";
    if (!/[0-9]/.test(pw)) return "数字を1文字以上含めてください。";
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw))
      return "記号（!@#$%^&*など）を1文字以上含めてください。";
    return null;
  };

  const handleChangePassword = async () => {
    if (!user || !user.email) {
      setMessage(
        "ログイン情報が確認できません。再度ログインし直してください。"
      );
      setIsSuccess(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("新しいパスワードと確認用パスワードが一致しません。");
      setIsSuccess(false);
      return;
    }

    const error = validatePassword(newPassword);
    if (error) {
      setMessage(error);
      setIsSuccess(false);
      return;
    }

    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      await signOut(auth);

      setMessage("✅ パスワードを変更しました。再度ログインしてください。");
      setIsSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error(err);
      setIsSuccess(false);

      if (err instanceof FirebaseError) {
        switch (err.code) {
          case "auth/invalid-credential":
          case "auth/wrong-password":
            setMessage("現在のパスワードが正しくありません。");
            break;
          case "auth/network-request-failed":
            setMessage(
              "ネットワークエラーが発生しました。接続をご確認ください。"
            );
            break;
          default:
            setMessage("エラーが発生しました: " + err.message);
        }
      } else {
        setMessage("予期しないエラーが発生しました。もう一度お試しください。");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto bg-white p-6 rounded shadow space-y-4">
      <h2 className="text-xl font-bold text-center">パスワード変更</h2>
      <p className="text-sm text-gray-600 text-center">
        現在のパスワードを入力し、新しいパスワードに変更できます。
        <br />
        以下の条件をすべて満たす必要があります：
        <br />
        <span className="text-xs">
          ・8文字以上・大文字・小文字・数字・記号（!@#$% など）
        </span>
        <br />※ パスワードは英大文字・小文字・数字・記号を含めてください
        <br />
        例:{" "}
        <code className="bg-gray-100 px-1 py-0.5 rounded">
          xenovant123!
        </code>{" "}
        や <code className="bg-gray-100 px-1 py-0.5 rounded">Sakura2024$</code>
      </p>

      <input
        type={showPassword ? "text" : "password"}
        placeholder="現在のパスワード"
        className="w-full border px-3 py-2 rounded"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
      />
      <input
        type={showPassword ? "text" : "password"}
        placeholder="新しいパスワード"
        className="w-full border px-3 py-2 rounded"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      <input
        type={showPassword ? "text" : "password"}
        placeholder="新しいパスワード（確認）"
        className="w-full border px-3 py-2 rounded"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />

      {/* 表示切替ボタン */}
      <div className="text-right text-sm">
        <button
          onClick={() => setShowPassword((prev) => !prev)}
          className="text-blue-600 underline"
        >
          パスワードを{showPassword ? "非表示" : "表示"}にする
        </button>
      </div>

      <button
        onClick={handleChangePassword}
        disabled={loading}
        className="bg-blue-600 text-white w-full py-2 rounded disabled:opacity-50"
      >
        {loading ? "変更中…" : "変更する"}
      </button>

      <button
        onClick={onClose}
        className="text-center underline text-sm text-gray-600 w-full mt-2"
      >
        閉じる
      </button>

      {message && (
        <p
          className={`mt-2 text-sm text-center ${
            isSuccess ? "text-green-600" : "text-red-600"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
