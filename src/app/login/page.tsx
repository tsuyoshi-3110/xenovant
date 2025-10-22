"use client";

import { useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { LucideLogIn, LogOut, AlertCircle, Globe, Box } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ForgotPassword from "@/components/ForgotPassword";
import ChangePassword from "@/components/ChangePassword";
import ForgotEmail from "@/components/ForgotEmail";
import PasswordInput from "@/components/PasswordInput";
import FontSwitcher from "@/components/FontSwitcher";
import ThemeSelector from "@/components/ThemeSelector";
import { ThemeKey } from "@/lib/themes";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import ImageLogoControls from "@/components/ImageLogoControls";

// i18n
import { LANGS } from "@/lib/langs";
import type { UILang } from "@/lib/atoms/uiLangAtom";

// Firestore ref
const META_REF = doc(db, "siteSettingsEditable", SITE_KEY);
const SELLER_REF = doc(db, "siteSellers", SITE_KEY);

/* =========================
   Stripe Connect カード（住所設定ボタン込み）
========================= */
function StripeConnectCard() {
  const [loading, setLoading] = useState(false);
  const [connectStatus, setConnectStatus] = useState<
    "unknown" | "notStarted" | "inProgress" | "completed" | "error"
  >("unknown");
  const [connectId, setConnectId] = useState<string | null>(null);

  const sellerId = SITE_KEY; // docID = siteKey

  const fetchStatus = async () => {
    try {
      setConnectStatus("unknown");
      const res = await fetch(
        `/api/sellers/connect-status?siteKey=${encodeURIComponent(sellerId)}`
      );
      const data: any = await res.json();
      if (!res.ok) throw new Error(data?.error || "failed");
      setConnectStatus((data?.status as typeof connectStatus) ?? "notStarted");
      setConnectId(data?.connectAccountId ?? null);
    } catch {
      setConnectStatus("error");
      setConnectId(null);
    }
  };

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startOnboarding = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/stripe/create-onboarding-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId, siteKey: SITE_KEY }),
      });
      const data: any = await res.json();
      if (!res.ok || !data?.url) throw new Error(data?.error || "failed");
      window.location.href = data.url;
    } catch {
      alert("Stripe連携の開始に失敗しました");
      fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-xl bg-white/50">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Stripe 連携（出店者アカウント）
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="text-sm space-y-1">
          <div>
            <span className="font-semibold">状態: </span>
            {connectStatus === "unknown" && "確認中…"}
            {connectStatus === "notStarted" && "未連携"}
            {connectStatus === "inProgress" && "入力途中（未完了）"}
            {connectStatus === "completed" && "連携完了"}
            {connectStatus === "error" && "取得エラー"}
          </div>
          <div className="text-xs text-gray-600">
            ConnectアカウントID:{" "}
            {connectId ? <code className="break-all">{connectId}</code> : "—"}
          </div>
        </div>

        {/* アクション行 */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Button
            onClick={startOnboarding}
            disabled={loading}
            className="w-full sm:flex-1 bg-black text-white"
          >
            {loading
              ? "開始中..."
              : connectStatus === "notStarted"
              ? "Stripe連携を開始"
              : "Stripe連携を続行"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={fetchStatus}
            disabled={loading}
            className="w-full sm:w-auto sm:min-w-[96px]"
            title="状態を再取得"
          >
            再取得
          </Button>
        </div>

        <p className="text-xs text-gray-600">
          ボタンを押すとStripeのオンボーディング画面へ遷移します。完了後は
          <code>/onboarding/return</code> に戻り、完了フラグが更新されます。
        </p>
      </CardContent>
    </Card>
  );
}

/* =========================
   Ship&co への導線カード（アカウント作成リンク）
========================= */
 function ShipAndCoLinkCard() {
  return (
    <Card className="shadow-xl bg-white/70 backdrop-blur-sm border border-gray-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Box size={18} />
          出荷管理のご案内（Ship&co）
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 text-sm leading-relaxed text-gray-700">
        <p>
          商品の発送や集荷依頼、送り状の作成を行う際は、 外部サービス{" "}
          <span className="font-medium">Ship&co（シップアンドコー）</span> を
          ご利用いただくと便利です。
        </p>

        <p>
          主要な運送会社（ヤマト・佐川・日本郵便など）に対応しており、
          宛先情報を入力するだけでラベル発行や追跡管理までワンストップで行えます。
        </p>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <a
            href="https://app.shipandco.com/welcome"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto"
          >
            <Button className="w-full">🚀 Ship&coを開く</Button>
          </a>
          <a
            href="https://support.shipandco.com/hc/ja/articles/360001253013"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto"
          >
            <Button variant="outline" className="w-full">
              使い方ガイドを見る
            </Button>
          </a>
        </div>

        <p className="text-xs text-gray-500 pt-2">
          ※Ship&coは外部サイトです。無料登録でご利用いただけます。
          <br />
          Pageitの「注文一覧」からCSVを出力し、Ship&coに取り込むことで発送作業をスムーズに行えます。
        </p>
      </CardContent>
    </Card>
  );
}

/* =========================
   日本語表記ラベル
========================= */
const JP_LANG_LABELS: Record<UILang, string> = {
  ja: "日本語",
  en: "英語",
  zh: "中国語（簡体字）",
  "zh-TW": "中国語（繁体字）",
  ko: "韓国語",
  fr: "フランス語",
  es: "スペイン語",
  de: "ドイツ語",
  pt: "ポルトガル語",
  it: "イタリア語",
  ru: "ロシア語",
  th: "タイ語",
  vi: "ベトナム語",
  id: "インドネシア語",
  hi: "ヒンディー語",
  ar: "アラビア語",
};

/* メニュー（EC= productsEC + cart あり） */
const MENU_ITEMS: { key: string; label: string }[] = [
  { key: "home", label: "ホーム" },
  { key: "products", label: "商品一覧" },
  { key: "productsEC", label: "ネットショップ" },
  { key: "stores", label: "店舗一覧" },
  { key: "about", label: "私たちの思い" },
  { key: "company", label: "会社概要" },
  { key: "news", label: "お知らせ" },
  { key: "interview", label: "取材はこちら" },
  { key: "cart", label: "カート" },
];

// トップ表示候補
const TOP_DISPLAYABLE_ITEMS = ["products", "staffs", "stores", "about"];

/* 小パーツ */
function SectionTitle({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}

/* 多言語設定カード */
function I18nSettingsCard({
  enabled,
  langs,
  onToggleEnabled,
  onToggleLang,
  onSelectAll,
  onClearAll,
}: {
  enabled: boolean;
  langs: UILang[];
  onToggleEnabled: (v: boolean) => void;
  onToggleLang: (lang: UILang, checked: boolean) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const sorted = [...LANGS].sort((a: any, b: any) =>
    a.key === "ja"
      ? -1
      : b.key === "ja"
      ? 1
      : String(a.key).localeCompare(String(b.key))
  );
  const getJpLabel = (key: string) => {
    const k = key as UILang;
    return JP_LANG_LABELS[k] ?? key;
  };

  return (
    <Card className="shadow-xl bg-white/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Globe size={18} />
          多言語設定（翻訳・UI言語）
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>多言語表示（翻訳）を有効にする</SectionTitle>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggleEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">{enabled ? "ON" : "OFF"}</span>
          </label>
        </div>

        <div>
          <SectionTitle>表示・編集対象の言語</SectionTitle>
          <div className="flex flex-wrap gap-3">
            {sorted.map((l: any) => {
              const key = l.key as UILang;
              const checked = langs.includes(key);
              const disabled = key === "ja"; // 日本語は固定ON
              return (
                <label
                  key={key}
                  className={`inline-flex items-center gap-2 rounded border px-2 py-1 bg-white/80 ${
                    disabled ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked || disabled}
                    disabled={disabled}
                    onChange={(e) => onToggleLang(key, e.target.checked)}
                  />
                  <span className="text-sm">
                    {getJpLabel(key)}{" "}
                    <span className="text-xs text-gray-500">({key})</span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="flex gap-2 mt-3">
            <Button
              type="button"
              variant="outline"
              onClick={onSelectAll}
              className="h-8"
            >
              全選択
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClearAll}
              className="h-8"
            >
              日本語以外を全解除
            </Button>
          </div>

          {!enabled && (
            <p className="mt-2 text-xs text-gray-600">
              ※ OFF
              の間は多言語UIや自動翻訳を抑止する想定です（他コンポーネント側実装に依存）。
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* =========================
   ページ本体
========================= */
export default function LoginPage() {
  const [theme, setTheme] = useState<ThemeKey>("brandA");
  const [visibleKeys, setVisibleKeys] = useState<string[]>(
    MENU_ITEMS.map((m) => m.key)
  );
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [user, setUser] = useState<User | null>(null);

  // i18n
  const [i18nEnabled, setI18nEnabled] = useState<boolean>(true);
  const [uiLangs, setUiLangs] = useState<UILang[]>(["ja" as UILang]);

  // auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // modals
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showForgotEmail, setShowForgotEmail] = useState(false);

  // Connect（Stripe連携）完了状態
  const [hasConnect, setHasConnect] = useState(false);

  /* 初期ロード（サイト設定） */
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(META_REF);
        if (!snap.exists()) return;
        const data = snap.data() as any;

        if (data.themeGradient) setTheme(data.themeGradient as ThemeKey);
        if (Array.isArray(data.visibleMenuKeys))
          setVisibleKeys(data.visibleMenuKeys);
        if (Array.isArray(data.activeMenuKeys))
          setActiveKeys(data.activeMenuKeys);

        const enabled =
          typeof data?.i18n?.enabled === "boolean"
            ? (data.i18n.enabled as boolean)
            : true;
        setI18nEnabled(enabled);

        const langs = Array.isArray(data?.i18n?.langs)
          ? (data.i18n.langs as UILang[])
          : (["ja"] as UILang[]);
        const s = new Set<UILang>(langs.length ? langs : (["ja"] as UILang[]));
        s.add("ja" as UILang);
        setUiLangs(Array.from(s));
      } catch (e) {
        console.error("初期データ取得失敗:", e);
      }
    })();
  }, []);

  /* Connect 状態を取得（未連携なら EC を候補から外す） */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/sellers/connect-status?siteKey=${encodeURIComponent(SITE_KEY)}`
        );
        const data: any = await res.json();
        const completed = data?.status === "completed";
        setHasConnect(!!completed);
        if (!completed) {
          setVisibleKeys((prev) =>
            prev.filter((k) => k !== "productsEC" && k !== "cart")
          );
        }
      } catch {
        setHasConnect(false);
        setVisibleKeys((prev) =>
          prev.filter((k) => k !== "productsEC" && k !== "cart")
        );
      }
    })();
  }, []);

  /* 認証（オーナー判定） */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "siteSettings", SITE_KEY));
        if (!snap.exists()) {
          setError("サイト情報が見つかりません。");
          await signOut(auth);
          return;
        }
        const data = snap.data() as any;
        if (data.ownerId !== firebaseUser.uid) {
          setError("このアカウントには管理権限がありません。");
          await signOut(auth);
          return;
        }
        setUser(firebaseUser);
      } catch (e) {
        console.error(e);
        setError("権限確認中にエラーが発生しました。");
        await signOut(auth);
      }
    });
    return () => unsub();
  }, []);

  /* ログイン/ログアウト */
  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case "auth/invalid-email":
            setError("メールアドレスの形式が正しくありません。");
            break;
          case "auth/user-not-found":
            setError("このメールアドレスは登録されていません。");
            break;
          case "auth/wrong-password":
            setError("パスワードが間違っています。");
            break;
          default:
            setError("ログインに失敗しました。");
        }
      } else {
        setError("不明なエラーが発生しました。");
      }
    } finally {
      setLoading(false);
    }
  };
  const handleLogout = async () => {
    await signOut(auth);
  };

  /* Firestore 更新関数（必要最小限） */
  const handleThemeChange = async (newTheme: ThemeKey) => {
    setTheme(newTheme);
    await setDoc(META_REF, { themeGradient: newTheme }, { merge: true });
  };

  // i18n: 有効/無効
  const handleI18nEnabledChange = async (next: boolean) => {
    setI18nEnabled(next);
    await setDoc(
      META_REF,
      { i18n: { enabled: next, langs: uiLangs } },
      { merge: true }
    );
  };
  // i18n: 言語トグル
  const handleLangToggle = async (lang: UILang, checked: boolean) => {
    setUiLangs((prev) => {
      const set = new Set<UILang>(prev);
      if (lang === "ja") set.add("ja" as UILang);
      else {
        if (checked) set.add(lang);
        else set.delete(lang);
      }
      const next = Array.from(set);
      setDoc(
        META_REF,
        { i18n: { enabled: i18nEnabled, langs: next } },
        { merge: true }
      ).catch(console.error);
      return next;
    });
  };
  const handleSelectAllLangs = async () => {
    const all = Array.from(
      new Set<UILang>(["ja", ...(LANGS.map((l: any) => l.key) as UILang[])])
    );
    const next = all as UILang[];
    setUiLangs(next);
    await setDoc(
      META_REF,
      { i18n: { enabled: i18nEnabled, langs: next } },
      { merge: true }
    );
  };
  const handleClearAllLangsExceptJa = async () => {
    const next = ["ja"] as UILang[];
    setUiLangs(next);
    await setDoc(
      META_REF,
      { i18n: { enabled: i18nEnabled, langs: next } },
      { merge: true }
    );
  };

  // ▼ EC可否トグル時に seller の onboardingCompleted を即時反映
  const setOnboardingCompleted = async (next: boolean) => {
    await setDoc(
      SELLER_REF,
      { stripe: { onboardingCompleted: next } },
      { merge: true }
    );
    await updateDoc(SELLER_REF, { "stripe.onboardingCompleted": next }).catch(
      () => {
        /* setDocで反映済み */
      }
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      {user ? (
        <>
          {showChangePassword ? (
            <div className="w-full max-w-md">
              <ChangePassword onClose={() => setShowChangePassword(false)} />
            </div>
          ) : (
            <div className="w-full max-w-5xl space-y-6">
              {/* 表示設定 */}
              <Card className="shadow-xl bg-white/50">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    表示設定
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ImageLogoControls
                    siteKey={SITE_KEY}
                    onProgress={(p) => console.log(p)}
                    onDone={(type, url) => console.log("done:", type, url)}
                  />

                  <div>
                    <SectionTitle>テーマカラー</SectionTitle>
                    <ThemeSelector
                      currentTheme={theme}
                      onChange={handleThemeChange}
                    />
                  </div>

                  <div>
                    <SectionTitle>フォント</SectionTitle>
                    <FontSwitcher />
                  </div>

                  {/* ▼ メニュー候補（ECはショップ＋カートをまとめる） */}
                  <div>
                    <SectionTitle>メニュー候補の設定</SectionTitle>

                    {/* ECまとめチェック（ここで onboardingCompleted もトグル） */}
                    <div className="mb-3">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          disabled={!hasConnect}
                          checked={
                            visibleKeys.includes("productsEC") &&
                            visibleKeys.includes("cart")
                          }
                          onChange={async (e) => {
                            const checked = e.target.checked;

                            try {
                              await setOnboardingCompleted(checked);
                            } catch (err) {
                              console.error(
                                "Failed to toggle onboardingCompleted:",
                                err
                              );
                              alert(
                                "販売状態の更新に失敗しました。もう一度お試しください。"
                              );
                              return;
                            }

                            setVisibleKeys((prev) => {
                              const base = new Set(prev);
                              base.delete("productsEC");
                              base.delete("cart");
                              if (checked && hasConnect) {
                                base.add("productsEC");
                                base.add("cart");
                              }
                              const next = Array.from(base);
                              setDoc(
                                META_REF,
                                { visibleMenuKeys: next },
                                { merge: true }
                              ).catch(console.error);
                              return next;
                            });
                          }}
                        />
                        <div className={!hasConnect ? "opacity-60" : ""}>
                          <div>ネット販売（ショップ & カート）</div>
                          {!hasConnect && (
                            <div className="text-xs text-gray-500">
                              Stripe連携が完了すると選択できます。
                            </div>
                          )}
                        </div>
                      </label>
                    </div>

                    {/* その他の候補（ECの2項目は除外） */}
                    <div className="space-y-1">
                      {MENU_ITEMS.filter(
                        (item) => !["productsEC", "cart"].includes(item.key)
                      ).map((item) => (
                        <label
                          key={item.key}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            checked={visibleKeys.includes(item.key)}
                            onChange={(e) => {
                              const newKeys = e.target.checked
                                ? [...new Set([...visibleKeys, item.key])]
                                : visibleKeys.filter((k) => k !== item.key);
                              setVisibleKeys(newKeys);
                              setDoc(
                                META_REF,
                                { visibleMenuKeys: newKeys },
                                { merge: true }
                              ).catch(console.error);
                            }}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* トップに表示するもの（限定） */}
                  <div>
                    <SectionTitle>トップに表示するもの</SectionTitle>
                    <div className="space-y-1">
                      {MENU_ITEMS.filter((item) =>
                        TOP_DISPLAYABLE_ITEMS.includes(item.key)
                      ).map((item) => (
                        <label
                          key={item.key}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            disabled={!visibleKeys.includes(item.key)}
                            checked={activeKeys.includes(item.key)}
                            onChange={(e) => {
                              const newKeys = e.target.checked
                                ? [...activeKeys, item.key]
                                : activeKeys.filter((k) => k !== item.key);
                              setActiveKeys(newKeys);
                              setDoc(
                                META_REF,
                                { activeMenuKeys: newKeys },
                                { merge: true }
                              ).catch(console.error);
                            }}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 多言語設定 */}
              <I18nSettingsCard
                enabled={i18nEnabled}
                langs={uiLangs}
                onToggleEnabled={handleI18nEnabledChange}
                onToggleLang={handleLangToggle}
                onSelectAll={handleSelectAllLangs}
                onClearAll={handleClearAllLangsExceptJa}
              />

              {/* Stripe Connect 連携カード */}
              <StripeConnectCard />

              {/* Ship&co への導線（Stripeの近くに設置） */}
              {hasConnect && <ShipAndCoLinkCard />}

              {/* アカウント操作 */}
              <Card className="shadow-xl bg-white/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <LogOut size={20} /> ログアウト
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-center">
                  <p>{user.email} としてログイン中です。</p>
                  <button
                    onClick={() => setShowChangePassword(true)}
                    className="text-blue-500 hover:underline"
                  >
                    パスワードを変更
                  </button>
                  <Button onClick={handleLogout} className="w-full bg-blue-500">
                    ログアウト
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      ) : (
        // 未ログインビュー
        <div className="w-full max-w-md">
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <LucideLogIn size={20} /> 管理者ログイン
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>ログインエラー</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Input
                type="email"
                placeholder="メールアドレス"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={() => {
                    setShowForgotEmail(false);
                    setShowForgotPassword(true);
                  }}
                  className="text-blue-500 hover:underline"
                >
                  パスワードを忘れた方
                </button>
                <button
                  onClick={() => {
                    setShowForgotPassword(false);
                    setShowForgotEmail(true);
                  }}
                  className="text-blue-500 hover:underline"
                >
                  メールアドレスを忘れた方
                </button>
              </div>

              <Button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-blue-500"
              >
                {loading ? "ログイン中..." : "ログイン"}
              </Button>
            </CardContent>
          </Card>

          {/* モーダル */}
          {showForgotPassword && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <ForgotPassword onClose={() => setShowForgotPassword(false)} />
              </div>
            </div>
          )}
          {showForgotEmail && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <ForgotEmail
                  onClose={() => setShowForgotEmail(false)}
                  onEmailFound={(found) => {
                    setEmail(found);
                    setShowForgotEmail(false);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
