// components/company/CompanyOverview.tsx
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import CardSpinner from "@/components/CardSpinner";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import {
  Wand2,
  Building2,
  MapPin,
  Link as LinkIcon,
  User as UserIcon,
  Phone,
  Mail,
  Calendar,
  Users,
  Globe,
  Sparkles,
  Upload,
  Trash2,
} from "lucide-react";
import { useUILang } from "@/lib/atoms/uiLangAtom";

/* ========= Firebase App 安全初期化 ========= */
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  getStorage,
  ref as sRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

/* ========= Firebase Config（.env から） ========= */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

/* ========= 言語リスト（ja は base として保持） ========= */
const LANGS = [
  { key: "en", label: "English" },
  { key: "zh", label: "简体中文" },
  { key: "zh-TW", label: "繁體中文" },
  { key: "ko", label: "한국어" },
  { key: "fr", label: "Français" },
  { key: "es", label: "Español" },
  { key: "de", label: "Deutsch" },
  { key: "pt", label: "Português" },
  { key: "it", label: "Italiano" },
  { key: "ru", label: "Русский" },
  { key: "th", label: "ไทย" },
  { key: "vi", label: "Tiếng Việt" },
  { key: "id", label: "Bahasa Indonesia" },
  { key: "hi", label: "हिन्दी" },
  { key: "ar", label: "العربية" },
] as const;
type LangKey = (typeof LANGS)[number]["key"];

/* ========= Types ========= */
type MediaKind = "image" | "video" | null;

type TranslatableFields = {
  name: string;
  tagline?: string | null;
  about?: string | null;
  business?: string[]; // 1項目1行
  address?: string | null;
};

type TranslatedPack = {
  lang: LangKey;
  name?: string;
  tagline?: string | null;
  about?: string | null;
  business?: string[];
  address?: string | null;
};

type CompanyDoc = {
  // 多言語
  base?: TranslatableFields;
  t?: TranslatedPack[];

  // 非翻訳（共通）
  founded?: string | null; // 設立
  ceo?: string | null; // 代表者名
  capital?: string | null; // 資本金
  employees?: string | null; // 従業員数
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  mapEmbedUrl?: string | null;

  // タイトル直下のメディア
  heroMediaUrl?: string | null;
  heroMediaType?: MediaKind;

  // メタ
  updatedAt?: any;
  updatedByUid?: string | null;
  updatedByName?: string | null;

  // 後方互換（従来の平坦フィールド）
  name?: string;
  tagline?: string | null;
  about?: string | null;
  business?: string[];
  address?: string | null;
};

type CompanyProfileView = {
  // 表示用（ローカライズ済み）
  name: string;
  tagline?: string | null;
  about?: string | null;
  business?: string[];
  address?: string | null;

  // 共通
  founded?: string | null;
  ceo?: string | null;
  capital?: string | null;
  employees?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  mapEmbedUrl?: string | null;
  heroMediaUrl?: string | null;
  heroMediaType?: MediaKind;
};

const EMPTY_EDIT_BASE: Required<TranslatableFields> = {
  name: "",
  tagline: "",
  about: "",
  business: [],
  address: "",
};

/* ========= Utils ========= */
// 空行も末尾改行も保持
function linesToArrayPreserve(s: string) {
  return s.split("\n");
}
function arrayToLinesPreserve(a?: string[]) {
  return (a ?? []).join("\n");
}

/**
 * 既に embed URL ならそのまま返し、それ以外は q= に詰めて output=embed へ変換
 * NEXT_PUBLIC_MAPS_EMBED_KEY があれば v1/place を使用
 */
function buildSimpleEmbedSrc(input?: string | null) {
  const s = (input ?? "").trim();
  if (!s) return undefined;

  if (/^https?:\/\/www\.google\.[^/]+\/maps\/embed\/?/i.test(s)) {
    return s;
  }
  const key = process.env.NEXT_PUBLIC_MAPS_EMBED_KEY;
  if (key) {
    return `https://www.google.com/maps/embed/v1/place?key=${key}&q=${encodeURIComponent(
      s
    )}`;
  }
  return `https://www.google.com/maps?q=${encodeURIComponent(s)}&output=embed`;
}

/** CompanyProfile から埋め込みURLを決定（mapEmbedUrl 優先、なければ address → name） */
function computeMapEmbedSrc(data: {
  mapEmbedUrl?: string | null;
  address?: string | null;
  name: string;
}) {
  return (
    buildSimpleEmbedSrc(data.mapEmbedUrl) ||
    buildSimpleEmbedSrc(data.address) ||
    buildSimpleEmbedSrc(data.name)
  );
}

/** Firebase Storage のダウンロードURLを path に変換（同一バケットのみ対応） */
function urlToStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const bucket = firebaseConfig.storageBucket;
    const apiHost = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/`;
    if (url.startsWith(apiHost)) {
      const pathEnc = url.slice(apiHost.length).split("?")[0];
      return decodeURIComponent(pathEnc);
    }
    if (url.startsWith("gs://")) return url;
  } catch {}
  return null;
}

/** 後方互換：ドキュメントから原文(base)を抽出 */
function readBaseFromDoc(
  d: CompanyDoc | null | undefined
): Required<TranslatableFields> {
  // ← 部分型を明示
  const base: Partial<TranslatableFields> = d?.base ?? {};

  return {
    name: String(base.name ?? d?.name ?? ""),
    tagline: (base.tagline ?? d?.tagline ?? "") || "",
    about: (base.about ?? d?.about ?? "") || "",
    business: Array.isArray(base.business)
      ? base.business
      : Array.isArray(d?.business)
      ? (d!.business as string[])
      : [],
    address: (base.address ?? d?.address ?? "") || "",
  };
}

/** ロケールに応じて表示内容を合成（見つからなければ原文(base)） */
function pickLocalizedCompany(
  d: CompanyDoc | null | undefined,
  lang: string
): CompanyProfileView {
  const base = readBaseFromDoc(d);
  const t = Array.isArray(d?.t) ? (d!.t as TranslatedPack[]) : [];
  const hit = lang === "ja" ? null : t.find((x) => x.lang === lang);

  const name = (hit?.name ?? base.name).toString();
  const tagline = (hit?.tagline ?? base.tagline) || "";
  const about = (hit?.about ?? base.about) || "";
  const business =
    Array.isArray(hit?.business) && hit!.business!.length > 0
      ? hit!.business!
      : base.business;
  const address = (hit?.address ?? base.address) || "";

  return {
    name,
    tagline,
    about,
    business,
    address,
    founded: d?.founded ?? "",
    ceo: d?.ceo ?? "",
    capital: d?.capital ?? "",
    employees: d?.employees ?? "",
    phone: d?.phone ?? "",
    email: d?.email ?? "",
    website: d?.website ?? "",
    mapEmbedUrl: d?.mapEmbedUrl ?? "",
    heroMediaUrl: d?.heroMediaUrl ?? "",
    heroMediaType: d?.heroMediaType ?? null,
  };
}

/* ========= 自動伸縮 Textarea ========= */
function AutoResizeTextarea({
  value,
  onValueChange,
  minRows = 3,
  maxRows = 50,
  className,
  ...rest
}: {
  value: string;
  onValueChange: (v: string) => void;
  minRows?: number;
  maxRows?: number;
  className?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = "auto";

    const lhRaw = parseFloat(window.getComputedStyle(el).lineHeight || "0");
    const lineHeight = Number.isFinite(lhRaw) && lhRaw > 0 ? lhRaw : 24;

    const minH = lineHeight * minRows;
    const maxH = lineHeight * maxRows;
    const nextH = Math.min(Math.max(el.scrollHeight, minH), maxH);

    el.style.height = `${nextH}px`;
    el.style.overflowY = el.scrollHeight > nextH ? "auto" : "hidden";
  }, [minRows, maxRows]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  useEffect(() => {
    const handler = () => resize();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [resize]);

  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={["resize-none", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

/* ========= タイトル直下メディア Viewer ========= */
function InlineMediaViewer({
  url,
  type,
}: {
  url?: string | null;
  type?: MediaKind;
}) {
  if (!url) return null;
  return (
    <div className="px-6 md:px-8 pb-2">
      <div
        className="relative w-full overflow-hidden rounded border bg-black/5"
        style={{ aspectRatio: "1 / 1" }}
      >
        {type === "video" ? (
          <video
            src={url ?? undefined}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            playsInline
          />
        ) : (
          <Image
            src={url ?? ""}
            alt="company-hero"
            fill
            className="object-cover"
            sizes="100vw"
            priority
            unoptimized
          />
        )}
      </div>
    </div>
  );
}

/* ========= タイトル直下メディア Uploader ========= */
function InlineMediaEditor({
  data,
  onChange,
  storage,
}: {
  data: CompanyDoc;
  onChange: (v: CompanyDoc) => void;
  storage: ReturnType<typeof getStorage>;
}) {
  const [isOver, setIsOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // 60秒以内チェック
  const getVideoDuration = (file: File) =>
    new Promise<number>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        const d = v.duration || 0;
        URL.revokeObjectURL(url);
        resolve(d);
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("動画のメタデータ読み込みに失敗しました"));
      };
      v.src = url;
    });

  const validateFile = async (file: File) => {
    const isImg = file.type.startsWith("image/");
    const isVid = file.type.startsWith("video/");
    if (!isImg && !isVid) {
      alert("画像または動画ファイルを選択してください。");
      return null;
    }
    const maxBytes = 200 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert("ファイルサイズが大きすぎます（最大200MBまで）。");
      return null;
    }
    if (isVid) {
      try {
        const dur = await getVideoDuration(file);
        if (dur > 60.0) {
          alert("動画は60秒以内にしてください。");
          return null;
        }
      } catch {
        return null;
      }
    }
    return isImg ? ("image" as MediaKind) : ("video" as MediaKind);
  };

  const doUpload = async (file: File, kind: Exclude<MediaKind, null>) => {
    setUploading(true);
    setProgress(0);
    try {
      const ext =
        file.name.split(".").pop() || (kind === "image" ? "jpg" : "mp4");
      const path = `siteMeta/${SITE_KEY}/company/hero/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;
      const storageRef = sRef(storage, path);
      const task = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
        cacheControl: "public,max-age=31536000,immutable",
      });
      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            const pct = Math.round(
              (snap.bytesTransferred / snap.totalBytes) * 100
            );
            setProgress(pct);
          },
          (err) => reject(err),
          () => resolve()
        );
      });
      const url = await getDownloadURL(storageRef);

      // 旧ファイルがあれば削除（同一バケットのみ）
      if (data.heroMediaUrl) {
        const pathOld = urlToStoragePath(data.heroMediaUrl);
        if (pathOld) {
          try {
            const oldRef = sRef(storage, pathOld);
            await deleteObject(oldRef);
          } catch {}
        }
      }

      onChange({ ...data, heroMediaUrl: url, heroMediaType: kind });
    } catch (e) {
      console.error(e);
      alert(
        "アップロードに失敗しました。権限またはネットワークをご確認ください。"
      );
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  // FileList → 配列化（イベント解放後も安全）
  const onFilesArray = async (files: File[]) => {
    if (!files.length) return;
    const file = files[0];
    const kind = await validateFile(file);
    if (!kind) return;
    await doUpload(file, kind);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    const dropped = e.dataTransfer?.files
      ? Array.from(e.dataTransfer.files)
      : [];
    await onFilesArray(dropped);
  };

  const onInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const input = e.currentTarget;
    const picked = input.files ? Array.from(input.files) : [];
    void (async () => {
      await onFilesArray(picked);
      if (typeof input.value !== "undefined") {
        try {
          input.value = "";
        } catch {}
      }
    })();
  };

  const removeMedia = async () => {
    if (!data.heroMediaUrl) return;
    const ok = confirm("現在のメディアを削除しますか？（保存ボタンで確定）");
    if (!ok) return;
    try {
      const pathOld = urlToStoragePath(data.heroMediaUrl);
      if (pathOld) {
        const r = sRef(storage, pathOld);
        await deleteObject(r);
      }
    } catch {
    } finally {
      onChange({ ...data, heroMediaUrl: "", heroMediaType: null });
    }
  };

  return (
    <div className="px-6 md:px-8 pb-2 bg-white/50 backdrop-blur-md rounded">
      <div
        className={[
          "relative w-full overflow-hidden rounded border bg-slate-100",
          isOver ? "ring-2 ring-purple-500" : "ring-1 ring-black/5",
        ].join(" ")}
        style={{ aspectRatio: "1 / 1" }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={onDrop}
      >
        {!data.heroMediaUrl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
            <Upload className="h-8 w-8 mb-2" />
            <div className="text-xs mt-1">
              画像または60秒以内の動画（最大200MB）
            </div>
          </div>
        ) : data.heroMediaType === "video" ? (
          <video
            src={data.heroMediaUrl ?? undefined}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            playsInline
          />
        ) : (
          <Image
            src={data.heroMediaUrl ?? ""}
            alt="company-hero"
            fill
            className="object-cover"
            sizes="100vw"
            unoptimized
          />
        )}

        {/* アクションバー */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-white/90 backdrop-blur border shadow cursor-pointer text-sm">
            <Upload className="h-4 w-4" />
            <span>ファイル選択</span>
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={onInputChange}
            />
          </label>
          {data.heroMediaUrl && (
            <Button
              variant="secondary"
              onClick={removeMedia}
              className="bg-white/90 text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              削除
            </Button>
          )}
        </div>

        {/* 進捗バー */}
        {uploading && (
          <div className="absolute left-0 right-0 bottom-0 h-1 bg-white/50">
            <div
              className="h-1 bg-purple-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-white text-outline">
        ※ タイトル下のメディアは保存後に公開画面へ反映。
      </p>
    </div>
  );
}

/* ========= AI生成モーダル ========= */
type AiTarget = "about" | "business";

type AiContext = {
  companyName?: string;
  tagline?: string | null;
  location?: string | null;
  audience?: string | null;
  industryHint?: string | null;
  existingAbout?: string | null;
  existingBusiness?: string[];
};

function AiGenerateModal({
  open,
  onClose,
  onGenerate,
  target,
  context,
}: {
  open: boolean;
  onClose: () => void;
  onGenerate: (result: { about?: string; business?: string[] }) => void;
  target: AiTarget;
  context?: AiContext;
}) {
  const [k1, setK1] = useState("");
  const [k2, setK2] = useState("");
  const [k3, setK3] = useState("");
  const [loading, setLoading] = useState(false);

  const canStart = [k1, k2, k3].some((v) => v.trim().length > 0);

  useEffect(() => {
    if (!open) {
      setK1("");
      setK2("");
      setK3("");
      setLoading(false);
    }
  }, [open]);

  const start = async () => {
    if (!canStart) return;
    setLoading(true);
    const keywords = [k1, k2, k3].map((v) => v.trim()).filter(Boolean);

    try {
      const res = await fetch("/api/generate-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          target,
          keywords,
          temperature: 0.85,
          seed: Date.now() + Math.random(),
          ...context,
        }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        console.error("AI generate failed:", res.status, msg);
        alert("AI生成に失敗しました。時間をおいて再度お試しください。");
        return;
      }

      const data = await res.json();

      if (target === "about") {
        if (typeof data.about !== "string" || !data.about.trim()) {
          alert(
            "AIから有効な『会社説明』が返りませんでした。キーワードや文脈を見直してください。"
          );
          return;
        }
        onGenerate({ about: data.about.trim() });
      } else {
        if (!Array.isArray(data.business) || data.business.length === 0) {
          alert(
            "AIから有効な『事業内容』が返りませんでした。キーワードや文脈を見直してください。"
          );
          return;
        }
        onGenerate({
          business: data.business
            .map((s: any) => String(s).trim())
            .filter(Boolean),
        });
      }

      onClose();
    } catch (e) {
      console.error(e);
      alert(
        "AI生成リクエストでエラーが発生しました。ネットワークをご確認ください。"
      );
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded bg-white/90 shadow-2xl border border-white/40 ring-1 ring-black/5">
        <div className="p-5 border-b bg-gradient-to-r from-purple-600/10 to-fuchsia-600/10">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-purple-600" />
            {target === "about" ? "会社説明をAIで生成" : "事業内容をAIで生成"}
          </h3>
          <p className="text-xs  text-white text-outline mt-1">
            キーワードを最大3つまで入力（1つ以上で開始可能）
          </p>
        </div>

        <div className="p-5 space-y-3">
          <Input
            value={k1}
            onChange={(e) => setK1(e.target.value)}
            placeholder="キーワード1（例：短納期／CMS構築 など）"
          />
          <Input
            value={k2}
            onChange={(e) => setK2(e.target.value)}
            placeholder="キーワード2（任意）"
          />
          <Input
            value={k3}
            onChange={(e) => setK3(e.target.value)}
            placeholder="キーワード3（任意）"
          />
        </div>

        <div className="p-5 pt-0 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            キャンセル
          </Button>
          <Button
            onClick={start}
            disabled={!canStart || loading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {loading ? "生成中..." : "生成開始"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ========= 多言語翻訳（原文 → target へ一括） ========= */
async function translateCompany(
  base: Required<TranslatableFields>,
  target: LangKey
): Promise<TranslatedPack> {
  // name / tagline / about / business[n]... / address
  const SEP = "\n---\n";
  type Item =
    | { kind: "name" }
    | { kind: "tagline" }
    | { kind: "about" }
    | { kind: "business"; idx: number }
    | { kind: "address" };

  const items: Item[] = [];
  const payload: string[] = [];

  items.push({ kind: "name" });
  payload.push(base.name || "");
  items.push({ kind: "tagline" });
  payload.push(base.tagline || "");
  items.push({ kind: "about" });
  payload.push(base.about || "");
  (base.business || []).forEach((s, i) => {
    items.push({ kind: "business", idx: i });
    payload.push(s || "");
  });
  items.push({ kind: "address" });
  payload.push(base.address || "");

  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "", body: payload.join(SEP), target }),
  });
  if (!res.ok) throw new Error("翻訳APIエラー");
  const data = (await res.json()) as { body?: string };
  const parts = String(data.body ?? "").split(SEP);

  let p = 0;
  const out: TranslatedPack = {
    lang: target,
    name: "",
    tagline: "",
    about: "",
    business: [],
    address: "",
  };

  for (const it of items) {
    const text = (parts[p++] ?? "").trim();
    if (it.kind === "name") out.name = text || base.name;
    if (it.kind === "tagline") out.tagline = text || base.tagline;
    if (it.kind === "about") out.about = text || base.about;
    if (it.kind === "address") out.address = text || base.address;
    if (it.kind === "business") {
      if (!out.business) out.business = [];
      out.business[it.idx] = text || (base.business[it.idx] ?? "");
    }
  }

  // 末尾の空要素除去
  if (Array.isArray(out.business)) {
    out.business = (out.business ?? []).map((s) => String(s ?? ""));
  }

  return out;
}

/* ========= Main ========= */
export default function CompanyOverview() {
  const { uiLang } = useUILang();

  // Firebase App & Services
  const app = useMemo(
    () => (getApps().length ? getApp() : initializeApp(firebaseConfig)),
    []
  );
  const db = useMemo(() => getFirestore(app), [app]);
  const auth = useMemo(() => getAuth(app), [app]);
  const storage = useMemo(() => getStorage(app), [app]);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Firestore ドキュメント生データ（base/t 含む）
  const [docData, setDocData] = useState<CompanyDoc | null>(null);

  // 編集用（原文=ja のみ編集）
  const [editBase, setEditBase] =
    useState<Required<TranslatableFields>>(EMPTY_EDIT_BASE);
  const [editCommon, setEditCommon] = useState<
    Pick<
      CompanyDoc,
      | "founded"
      | "ceo"
      | "capital"
      | "employees"
      | "phone"
      | "email"
      | "website"
      | "mapEmbedUrl"
      | "heroMediaUrl"
      | "heroMediaType"
    >
  >({
    founded: "",
    ceo: "",
    capital: "",
    employees: "",
    phone: "",
    email: "",
    website: "",
    mapEmbedUrl: "",
    heroMediaUrl: "",
    heroMediaType: null,
  });
  const [isEditing, setIsEditing] = useState(false);

  // ログイン監視
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, [auth]);

  // 初期ロード
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const ref = doc(db, "siteMeta", SITE_KEY, "company", "profile");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as CompanyDoc;
          setDocData(data);
          // 編集用に原文(base)と共通を展開
          const base = readBaseFromDoc(data);
          setEditBase({ ...EMPTY_EDIT_BASE, ...base });
          setEditCommon({
            founded: data.founded ?? "",
            ceo: data.ceo ?? "",
            capital: data.capital ?? "",
            employees: data.employees ?? "",
            phone: data.phone ?? "",
            email: data.email ?? "",
            website: data.website ?? "",
            mapEmbedUrl: data.mapEmbedUrl ?? "",
            heroMediaUrl: data.heroMediaUrl ?? "",
            heroMediaType: data.heroMediaType ?? null,
          });
        } else {
          // 新規
          setDocData({
            base: { ...EMPTY_EDIT_BASE },
            t: [],
          });
          setEditBase({ ...EMPTY_EDIT_BASE });
          setEditCommon({
            founded: "",
            ceo: "",
            capital: "",
            employees: "",
            phone: "",
            email: "",
            website: "",
            mapEmbedUrl: "",
            heroMediaUrl: "",
            heroMediaType: null,
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [db]);

  const canEdit = !!user;

  // 表示用（uiLang に応じてローカライズ）
  const displayData: CompanyProfileView | null = useMemo(() => {
    if (!docData) return null;
    return pickLocalizedCompany(docData, uiLang);
  }, [docData, uiLang]);

  const startEdit = () => setIsEditing(true);
  const cancelEdit = () => {
    // ドキュメントの値に戻す
    if (docData) {
      const base = readBaseFromDoc(docData);
      setEditBase({ ...EMPTY_EDIT_BASE, ...base });
      setEditCommon({
        founded: docData.founded ?? "",
        ceo: docData.ceo ?? "",
        capital: docData.capital ?? "",
        employees: docData.employees ?? "",
        phone: docData.phone ?? "",
        email: docData.email ?? "",
        website: docData.website ?? "",
        mapEmbedUrl: docData.mapEmbedUrl ?? "",
        heroMediaUrl: docData.heroMediaUrl ?? "",
        heroMediaType: docData.heroMediaType ?? null,
      });
    }
    setIsEditing(false);
  };

  // 保存（原文を更新し、全言語を上書き再生成）
  const saveEdit = async () => {
    if (!editBase.name.trim()) {
      alert("会社名は必須です。");
      return;
    }
    setSaving(true);
    try {
      // 全言語翻訳（ja は base に保持、その他は t へ）
      const targets: LangKey[] = LANGS.map((l) => l.key) as LangKey[];
      const tAll = await Promise.all(
        targets.map((lang) => translateCompany(editBase, lang))
      );

      const ref = doc(db, "siteMeta", SITE_KEY, "company", "profile");

      const payload: CompanyDoc = {
        // 多言語
        base: {
          name: editBase.name,
          tagline: editBase.tagline ?? "",
          about: editBase.about ?? "",
          business: Array.isArray(editBase.business) ? editBase.business : [],
          address: editBase.address ?? "",
        },
        t: tAll,

        // 非翻訳
        founded: editCommon.founded ?? "",
        ceo: editCommon.ceo ?? "",
        capital: editCommon.capital ?? "",
        employees: editCommon.employees ?? "",
        phone: editCommon.phone ?? "",
        email: editCommon.email ?? "",
        website: editCommon.website ?? "",
        mapEmbedUrl: editCommon.mapEmbedUrl ?? "",
        heroMediaUrl: editCommon.heroMediaUrl ?? "",
        heroMediaType: editCommon.heroMediaType ?? null,

        // メタ
        updatedAt: serverTimestamp(),
        updatedByUid: user?.uid ?? null,
        updatedByName: user?.displayName ?? null,

        // 後方互換（原文を平坦にも保存）
        name: editBase.name,
        tagline: editBase.tagline ?? "",
        about: editBase.about ?? "",
        business: Array.isArray(editBase.business) ? editBase.business : [],
        address: editBase.address ?? "",
      };

      await setDoc(ref, payload, { merge: true });
      setDocData(payload); // ローカルにも反映
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました。権限またはネットワークをご確認ください。");
    } finally {
      setSaving(false);
    }
  };

  // AI結果の反映
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState<AiTarget>("about");
  const applyAiResult = useCallback(
    (result: { about?: string; business?: string[] }) => {
      if (result.about != null) {
        setEditBase((prev) => ({ ...prev, about: result.about ?? "" }));
      }
      if (result.business != null) {
        setEditBase((prev) => ({ ...prev, business: result.business ?? [] }));
      }
    },
    []
  );

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="relative rounded bg-white/10 backdrop-blur-md shadow-xl border border-white/50 ring-1 ring-black/5 p-0 overflow-hidden">
          <CardSpinner />
          <div className="p-8">読み込み中…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* ===== 会社概要カード ===== */}
      <div className="relative rounded bg-white/10 backdrop-blur-md shadow-xl border border-white/50 ring-1 ring-black/5 p-0 overflow-hidden">
        {saving && <CardSpinner />}

        {/* 先頭：編集/保存ボタン */}
        {canEdit && (
          <div className="px-6 md:px-8 pt-4">
            <div className="flex justify-end gap-2">
              {!isEditing ? (
                <Button
                  onClick={startEdit}
                  className="bg-blue-500 hover:bg-blue-400"
                >
                  編集
                </Button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="bg-white/70 text-slate-700 hover:bg-white"
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={saveEdit}
                    disabled={saving}
                    className="bg-blue-500 hover:bg-blue-400"
                  >
                    保存
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ヘッダー帯（タイトル） */}
        <div className="px-6 md:px-8 pb-4 pt-2 text-slate-900">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded bg-white/60 flex items-center justify-center ring-1 ring-black/5">
              <Building2 className="h-6 w-6 text-slate-700" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-white text-outline">
                {(!isEditing ? displayData?.name ?? "" : editBase.name) ||
                  "（会社名未設定）"}
              </h1>
              {(!isEditing
                ? displayData?.tagline ?? ""
                : editBase.tagline ?? "") && (
                <p className="text-white text-outline mt-1 ">
                  {!isEditing ? displayData?.tagline : editBase.tagline}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* タイトル直下のメディア（編集 or 閲覧） */}
        {isEditing ? (
          <InlineMediaEditor
            data={
              {
                heroMediaUrl: editCommon.heroMediaUrl ?? "",
                heroMediaType: editCommon.heroMediaType ?? null,
              } as CompanyDoc
            }
            onChange={(v) =>
              setEditCommon((prev) => ({
                ...prev,
                heroMediaUrl: v.heroMediaUrl ?? "",
                heroMediaType: v.heroMediaType ?? null,
              }))
            }
            storage={storage}
          />
        ) : (
          <InlineMediaViewer
            url={displayData?.heroMediaUrl}
            type={displayData?.heroMediaType ?? null}
          />
        )}

        {/* 本体 */}
        <div className="p-6 md:p-8">
          {!isEditing ? (
            <ReadOnlyView data={displayData!} />
          ) : (
            <EditView
              base={editBase}
              common={editCommon}
              onBaseChange={setEditBase}
              onCommonChange={setEditCommon}
              onOpenAi={(target) => {
                setAiTarget(target);
                setAiOpen(true);
              }}
            />
          )}
        </div>
      </div>

      {/* AIモーダル（文脈を渡す） */}
      <AiGenerateModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onGenerate={applyAiResult}
        target={aiTarget}
        context={{
          companyName: editBase.name,
          tagline: editBase.tagline,
          location: editBase.address,
          existingAbout: editBase.about ?? undefined,
          existingBusiness: editBase.business,
        }}
      />
    </div>
  );
}

/* ===================== ReadOnly ===================== */
function ReadOnlyView({ data }: { data: CompanyProfileView }) {
  const embedSrc = computeMapEmbedSrc({
    name: data.name,
    address: data.address,
    mapEmbedUrl: data.mapEmbedUrl,
  });

  return (
    <div className="space-y-10">
      {data.about && (
        <section className="rounded border border-gray-200 p-4 md:p-5 bg-white/30 mb-5">
          <h3 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
            <UserIcon className="h-4 w-4" />
            会社情報
          </h3>
          <p className="whitespace-pre-wrap text-gray-800">{data.about}</p>
        </section>
      )}

      {/* 会社情報グリッド */}
      <section className="grid md:grid-cols-2 gap-6 mb-5">
        <Field
          icon={<UserIcon className="h-4 w-4" />}
          label="代表者"
          value={data.ceo ?? undefined}
        />
        <Field
          icon={<Calendar className="h-4 w-4" />}
          label="設立"
          value={data.founded ?? undefined}
        />
        <Field
          icon={<Sparkles className="h-4 w-4" />}
          label="資本金"
          value={data.capital ?? undefined}
        />
        <Field
          icon={<Users className="h-4 w-4" />}
          label="従業員数"
          value={data.employees ?? undefined}
        />
        <Field
          icon={<MapPin className="h-4 w-4" />}
          label="所在地"
          value={data.address ?? undefined}
        />
        <Field
          icon={<Phone className="h-4 w-4" />}
          label="電話番号"
          value={data.phone ?? undefined}
        />
        <Field
          icon={<Mail className="h-4 w-4" />}
          label="メール"
          value={data.email ?? undefined}
        />
        <Field
          icon={<Globe className="h-4 w-4" />}
          label="Webサイト"
          value={data.website ?? undefined}
          isLink
        />
      </section>

      {/* 事業内容 */}
      {Array.isArray(data.business) && data.business.length > 0 && (
        <section className="rounded border border-gray-200 p-4 md:p-5 bg-white/30">
          <h3 className="font-medium text-gray-700 mb-3">事業内容</h3>
          <ul className="list-disc pl-5 space-y-1">
            {data.business
              .filter((b) => (b ?? "").trim() !== "")
              .map((b, i) => (
                <li key={i} className="text-gray-800">
                  {b}
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* アクセス（マップ） */}
      {embedSrc && (
        <section className="rounded overflow-hidden border border-gray-200 bg-white/30">
          <h3 className="font-medium text-gray-700 mb-2 p-4 flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-blue-600" />
            アクセス
          </h3>
          <div className="aspect-video w-full">
            <iframe
              src={embedSrc}
              className="w-full h-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  isLink,
  icon,
}: {
  label: string;
  value?: string | null;
  isLink?: boolean;
  icon?: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <div className="rounded border border-gray-200 p-4 bg-white/30">
      <div className="text-xs text-gray-800 mb-1 flex items-center gap-2">
        {icon}
        {label}
      </div>
      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="text-blue-700 underline break-all"
        >
          {value}
        </a>
      ) : (
        <div className="text-gray-900 break-words whitespace-pre-wrap">
          {value}
        </div>
      )}
    </div>
  );
}

/* ===================== Edit ===================== */
function EditView({
  base,
  common,
  onBaseChange,
  onCommonChange,
  onOpenAi,
}: {
  base: Required<TranslatableFields>;
  common: Pick<
    CompanyDoc,
    | "founded"
    | "ceo"
    | "capital"
    | "employees"
    | "phone"
    | "email"
    | "website"
    | "mapEmbedUrl"
    | "heroMediaUrl"
    | "heroMediaType"
  >;
  onBaseChange: (v: Required<TranslatableFields>) => void;
  onCommonChange: (v: typeof common) => void;
  onOpenAi: (target: "about" | "business") => void;
}) {
  const previewSrc = computeMapEmbedSrc({
    name: base.name,
    address: base.address,
    mapEmbedUrl: common.mapEmbedUrl,
  });

  return (
    <div className="space-y-8">
      {/* 必須は会社名のみ（原文=ja） */}
      <div className="grid md:grid-cols-2 gap-4">
        <LabeledInput
          label="会社名 *"
          value={base.name}
          onChange={(v) => onBaseChange({ ...base, name: v })}
        />
        <LabeledInput
          label="キャッチコピー（任意）"
          value={base.tagline ?? ""}
          onChange={(v) => onBaseChange({ ...base, tagline: v })}
        />
      </div>

      {/* 会社情報（代表者・設立・資本金・従業員数） */}
      <div className="grid md:grid-cols-2 gap-4">
        <LabeledInput
          label="代表者（任意）"
          value={common.ceo ?? ""}
          onChange={(v) => onCommonChange({ ...common, ceo: v })}
          placeholder="例）山田 太郎"
        />
        <LabeledInput
          label="設立（任意）"
          value={common.founded ?? ""}
          onChange={(v) => onCommonChange({ ...common, founded: v })}
          placeholder="例）2020年4月"
        />
        <LabeledInput
          label="資本金（任意）"
          value={common.capital ?? ""}
          onChange={(v) => onCommonChange({ ...common, capital: v })}
          placeholder="例）1,000万円"
        />
        <LabeledInput
          label="従業員数（任意）"
          value={common.employees ?? ""}
          onChange={(v) => onCommonChange({ ...common, employees: v })}
          placeholder="例）25名（アルバイト含む）"
        />
      </div>

      {/* 連絡先（住所・電話・メール・Web） */}
      <div className="grid md:grid-cols-2 gap-4">
        <LabeledInput
          label="所在地（任意・翻訳対象）"
          value={base.address ?? ""}
          onChange={(v) => onBaseChange({ ...base, address: v })}
          placeholder="住所または地名"
        />
        <LabeledInput
          label="電話番号（任意）"
          value={common.phone ?? ""}
          onChange={(v) => onCommonChange({ ...common, phone: v })}
          placeholder="例）03-1234-5678"
        />
        <LabeledInput
          label="メール（任意）"
          value={common.email ?? ""}
          onChange={(v) => onCommonChange({ ...common, email: v })}
          placeholder="info@example.com"
        />
        <LabeledInput
          label="Webサイト（任意）"
          value={common.website ?? ""}
          onChange={(v) => onCommonChange({ ...common, website: v })}
          placeholder="https://example.com"
        />
      </div>

      {/* 会社説明 + AI（自動伸縮） */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-white text-outline">
            会社説明（任意・翻訳対象）
          </div>
          <Button
            onClick={() => onOpenAi("about")}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Wand2 className="h-4 w-4 mr-1" />
            AIで生成
          </Button>
        </div>
        <AutoResizeTextarea
          value={base.about ?? ""}
          onValueChange={(v) => onBaseChange({ ...base, about: v })}
          minRows={4}
          maxRows={40}
          placeholder="（任意）会社の特徴・強み・提供価値などを記載"
          className="bg-white/80"
        />
      </div>

      {/* 事業内容（自動伸縮 / 空行・末尾改行を保持） */}
      <div className="space-y-2">
        <div className="text-sm text-white text-outline">
          事業内容（任意・翻訳対象 / 1行につき1項目 / 空行OK）
        </div>
        <AutoResizeTextarea
          value={arrayToLinesPreserve(base.business)}
          onValueChange={(v) =>
            onBaseChange({ ...base, business: linesToArrayPreserve(v) })
          }
          minRows={6}
          maxRows={50}
          placeholder={"例：\n主要サービスA\nCMS構築\n運用サポート\n"}
          className="bg-white/80"
        />
        <p className="text-xs  text-white text-outline">
          ※ Enter
          での空行や、最後の改行も保持されます（閲覧表示では空行は表示されません）。
        </p>
      </div>

      {/* Googleマップ：住所から自動生成 & ライブプレビュー */}
      <div>
        <LabeledInput
          label="Googleマップ埋め込みURL（任意）"
          value={common.mapEmbedUrl ?? ""}
          onChange={(v) => onCommonChange({ ...common, mapEmbedUrl: v })}
          placeholder="https://www.google.com/maps/embed?..."
        />
        <div className="mt-2 text-xs  text-white text-outline">
          ※
          短縮URL（maps.app.goo.gl）や通常URLでもOK。自動で埋め込み形式に変換します。
        </div>

        {previewSrc && (
          <div className="mt-4 aspect-video w-full overflow-hidden rounded border">
            <iframe
              src={previewSrc}
              className="w-full h-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-white text-outline">{label}</div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-white/80"
      />
    </label>
  );
}
