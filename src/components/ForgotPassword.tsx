// ForgotPassword.tsx
"use client";
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ForgotPasswordProps = {
  onClose: () => void;
};

export default function ForgotPassword({ onClose }: ForgotPasswordProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleReset = async () => {
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("パスワードリセット用のメールを送信しました。");
    } catch (error) {
      console.error(error);
      setMessage("メールの送信に失敗しました。");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-center">パスワードをリセット</h2>
      <label>・ログインメールアドレスを入力してください。</label>
      <Input
        type="email"
        placeholder="メールアドレス"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button onClick={handleReset} className="w-full bg-blue-600 text-white">
        リセットメール送信
      </Button>
      {message && (
        <p className="text-center text-sm text-gray-700">{message}</p>
      )}
      <Button variant="outline" onClick={onClose} className="w-full">
        閉じる
      </Button>
    </div>
  );
}
