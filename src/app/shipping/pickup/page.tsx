// app/(admin)/shipping/pickup/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { onAuthStateChanged, getAuth } from "firebase/auth";
// 既存の siteKey 取得方法に合わせて差し替え可
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

type StripeStatus = {
  connected: boolean;
  accountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  due?: number;
  pastDue?: number;
  reason?: string;
  error?: string;
};

type PickupAddress = {
  name: string;
  phone: string;
  postalCode: string;
  state?: string;
  city: string;
  address1: string;
  address2?: string;
  country: "JP";
};

export default function PickupAddressPage() {
  const siteKey = SITE_KEY || "test04"; // フォールバック可
  const [authed, setAuthed] = useState<boolean>(false);
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState<PickupAddress>({
    name: "",
    phone: "",
    postalCode: "",
    state: "",
    city: "",
    address1: "",
    address2: "",
    country: "JP",
  });

  // 認証チェック（ログイン済みのみ操作可）
  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (user) => {
      setAuthed(!!user);
    });
  }, []);

  // Stripe 接続状態の取得
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/owners/stripe-status?siteKey=${encodeURIComponent(siteKey)}`
        );
        const json = (await res.json()) as StripeStatus;
        setStatus(json);
      } catch (e: any) {
        setStatus({ connected: false, error: e.message });
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [siteKey]);

  // 既存住所の読み込み（認証済み・StripeOKのとき）
  useEffect(() => {
    const load = async () => {
      if (!authed) return;
      if (!status?.connected) return;
      try {
        const ref = doc(
          db,
          "sites",
          siteKey,
          "shippingSettings",
          "pickupAddress"
        );
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as PickupAddress & { updatedAt?: string };
          setForm({
            name: data.name ?? "",
            phone: data.phone ?? "",
            postalCode: data.postalCode ?? "",
            state: data.state ?? "",
            city: data.city ?? "",
            address1: data.address1 ?? "",
            address2: data.address2 ?? "",
            country: (data.country as "JP") ?? "JP",
          });
        }
      } catch {
        // 読み込み失敗は無視（初回未作成想定）
      }
    };
    load();
  }, [authed, status?.connected, siteKey]);

  const connectedOk = useMemo(() => !!status?.connected, [status]);

  const onChange =
    (key: keyof PickupAddress) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    };

  const validate = (): string | null => {
    if (!authed) return "ログインしてください。";
    if (!connectedOk) return "Stripe連携を完了してください。";
    if (!form.name.trim()) return "担当者/店舗名を入力してください。";
    if (!form.phone.trim()) return "電話番号を入力してください。";
    if (!form.postalCode.trim()) return "郵便番号を入力してください。";
    if (!form.city.trim()) return "市区町村を入力してください。";
    if (!form.address1.trim()) return "住所1（番地まで）を入力してください。";
    if (form.country !== "JP") return "現在は日本国内（JP）のみ対応です。";
    return null;
  };

  const save = async () => {
    setMsg(null);
    setErr(null);
    const v = validate();
    if (v) return setErr(v);

    setSaving(true);
    try {
      const ref = doc(
        db,
        "sites",
        siteKey,
        "shippingSettings",
        "pickupAddress"
      );
      await setDoc(
        ref,
        { ...form, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      setMsg("受け渡し住所を保存しました。");
    } catch (e: any) {
      setErr(e.message || "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setMsg(null);
    setErr(null);
    if (!authed) return setErr("ログインしてください。");
    setSaving(true);
    try {
      const ref = doc(
        db,
        "sites",
        siteKey,
        "shippingSettings",
        "pickupAddress"
      );
      await deleteDoc(ref);
      setForm({
        name: "",
        phone: "",
        postalCode: "",
        state: "",
        city: "",
        address1: "",
        address2: "",
        country: "JP",
      });
      setMsg("受け渡し住所を削除しました。");
    } catch (e: any) {
      setErr(e.message || "削除に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6">読み込み中…</div>;
  }

  if (!authed) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-bold">受け渡し住所の登録</h1>
        <p className="text-sm text-gray-700">
          このページを利用するにはログインが必要です。
        </p>
      </div>
    );
  }

  if (!connectedOk) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">受け渡し住所の登録</h1>
        <div className="rounded-xl border p-4 bg-yellow-50">
          <p className="font-medium">Stripe連携が未完了です。</p>
          <p className="text-sm text-gray-700 mt-1">
            先にオーナーのStripe Connectオンボーディングを完了してください。
          </p>
          {/* 必要ならオンボーディング導線を設置 */}
          {/* <Link href="/admin/stripe/onboarding" className="underline text-blue-600 mt-2 inline-block">オンボーディングへ</Link> */}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6 bg-white/50 mt-5 rounded-2xl">
      <h1 className="text-2xl font-bold">受け渡し住所の登録</h1>
      <p className="text-sm text-gray-600">
        運送会社が商品を取りに来る住所です。集荷依頼時の「From（集荷先）」として使用します。
      </p>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium">担当者 / 店舗名</label>
          <input
            className="mt-1 w-full border rounded-xl p-2"
            value={form.name}
            onChange={onChange("name")}
            placeholder="例）Pageit 本店"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">電話番号</label>
          <input
            className="mt-1 w-full border rounded-xl p-2"
            value={form.phone}
            onChange={onChange("phone")}
            placeholder="例）070-1234-5678"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">郵便番号</label>
          <input
            className="mt-1 w-full border rounded-xl p-2"
            value={form.postalCode}
            onChange={onChange("postalCode")}
            placeholder="例）123-4567"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">都道府県</label>
          <input
            className="mt-1 w-full border rounded-xl p-2"
            value={form.state}
            onChange={onChange("state")}
            placeholder="例）大阪府"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">市区町村</label>
          <input
            className="mt-1 w-full border rounded-xl p-2"
            value={form.city}
            onChange={onChange("city")}
            placeholder="例）東淀川区淡路"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">住所1（番地まで）</label>
          <input
            className="mt-1 w-full border rounded-xl p-2"
            value={form.address1}
            onChange={onChange("address1")}
            placeholder="例）1-2-3 梅田ビル 101"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">住所2（任意）</label>
          <input
            className="mt-1 w-full border rounded-xl p-2"
            value={form.address2}
            onChange={onChange("address2")}
            placeholder="例）〇〇マンション 202号"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存する"}
        </button>

        <button
          onClick={remove}
          disabled={saving}
          className="px-4 py-2 rounded-xl border border-red-500 text-red-600 disabled:opacity-50"
          title="現在の受け渡し住所ドキュメントを削除します"
        >
          削除する
        </button>

        {msg && <span className="text-green-600 text-sm">{msg}</span>}
        {err && <span className="text-red-600 text-sm">{err}</span>}
      </div>
    </div>
  );
}
