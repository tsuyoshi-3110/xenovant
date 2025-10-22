// components/common/Header.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import Image from "next/image";
import clsx from "clsx";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { useHeaderLogoUrl } from "../../hooks/useHeaderLogoUrl";
import { auth, db } from "@/lib/firebase";
import UILangFloatingPicker from "../UILangFloatingPicker";
import { useUILang, type UILang as UILangType } from "@/lib/atoms/uiLangAtom";
import { doc, onSnapshot } from "firebase/firestore";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import { ThemeKey, THEMES } from "@/lib/themes";

/* Firestore: メニュー表示制御 & i18n */
const META_REF = doc(db, "siteSettingsEditable", SITE_KEY);

/* i18n 辞書 */
type Keys =
  | "menuTitle"
  | "home"
  | "products"
  | "productsEC"
  | "stores"
  | "about"
  | "company"
  | "news"
  | "interview"
  | "cart"
  | "timeline"
  | "community"
  | "analytics"
  | "orders"
  | "inventory"
  | "reports"
  | "admin";

const T: Record<UILangType, Record<Keys, string>> = {
  ja: {
    menuTitle: "メニュー",
    home: "ホーム",
    products: "商品一覧",
    productsEC: "ネットショップ",
    stores: "店舗一覧",
    about: "私たちの思い",
    company: "会社概要",
    news: "お知らせ",
    interview: "取材はこちら",
    cart: "カート",
    timeline: "タイムライン",
    community: "コミュニティ",
    analytics: "分析",
    orders: "注文履歴",
    inventory: "在庫管理",
    reports: "レポート",
    admin: "管理者ログイン",
  },
  en: {
    menuTitle: "Menu",
    home: "Home",
    products: "Products",
    productsEC: "Online Store",
    stores: "Access",
    about: "Our Story",
    company: "Company",
    news: "News",
    interview: "Press & Inquiries",
    cart: "Cart",
    timeline: "Timeline",
    community: "Community",
    analytics: "Analyses",
    orders: "Order History",
    inventory: "Inventory Management",
    reports: "Reports",
    admin: "Administrator Login",
  },
  zh: {
    menuTitle: "菜单",
    home: "首页",
    products: "商品一览",
    productsEC: "网店",
    stores: "交通/访问",
    about: "我们的理念",
    company: "公司简介",
    news: "通知",
    interview: "媒体采访",
    cart: "购物车",
    timeline: "时间线",
    community: "社区",
    analytics: "分析",
    orders: "销售记录",
    inventory: "库存管理",
    reports: "报告",
    admin: "管理员登录",
  },
  "zh-TW": {
    menuTitle: "選單",
    home: "首頁",
    products: "商品一覽",
    productsEC: "網路商店",
    stores: "交通/位置",
    about: "我們的理念",
    company: "公司簡介",
    news: "最新消息",
    interview: "媒體採訪",
    cart: "購物車",
    timeline: "時間軸",
    community: "社群",
    analytics: "分析",
    orders: "銷售記錄",
    inventory: "庫存管理",
    reports: "報告",
    admin: "管理者登入",
  },
  ko: {
    menuTitle: "메뉴",
    home: "홈",
    products: "상품 목록",
    productsEC: "온라인 스토어",
    stores: "오시는 길",
    about: "가게 이야기",
    company: "회사 소개",
    news: "알림",
    interview: "취재 문의",
    cart: "장바구니",
    timeline: "타임라인",
    community: "커뮤니티",
    analytics: "분석",
    orders: "판매 내역",
    inventory: "재고 관리",
    reports: "보고서",
    admin: "관리자 로그인",
  },
  fr: {
    menuTitle: "Menu",
    home: "Accueil",
    products: "Produits",
    productsEC: "Boutique en ligne",
    stores: "Accès",
    about: "Notre histoire",
    company: "Entreprise",
    news: "Actualités",
    interview: "Presse",
    cart: "Panier",
    timeline: "Timeline",
    community: "Communauté",
    analytics: "Analyses",
    orders: "Historique des commandes",
    inventory: "Gestion des stocks",
    reports: "Rapports",
    admin: "Connexion administrateur",
  },
  es: {
    menuTitle: "Menú",
    home: "Inicio",
    products: "Productos",
    productsEC: "Tienda en línea",
    stores: "Acceso",
    about: "Nuestra historia",
    company: "Empresa",
    news: "Noticias",
    interview: "Prensa",
    cart: "Carrito",
    timeline: "Cronología",
    community: "Comunidad",
    analytics: "Analítica",
    orders: "Historial de pedidos",
    inventory: "Gestión de inventario",
    reports: "Informes",
    admin: "Inicio de sesión administrador",
  },
  de: {
    menuTitle: "Menü",
    home: "Startseite",
    products: "Produkte",
    productsEC: "Online-Shop",
    stores: "Anfahrt",
    about: "Unsere Geschichte",
    company: "Unternehmen",
    news: "Neuigkeiten",
    interview: "Presse",
    cart: "Warenkorb",
    timeline: "Timeline",
    community: "Community",
    analytics: "Analytik",
    orders: "Bestellverlauf",
    inventory: "Bestandsverwaltung",
    reports: "Berichte",
    admin: "Admin-Anmeldung",
  },
  pt: {
    menuTitle: "Menu",
    home: "Início",
    products: "Produtos",
    productsEC: "Loja Online",
    stores: "Acesso",
    about: "Nossa história",
    company: "Empresa",
    news: "Notícias",
    interview: "Imprensa",
    cart: "Carrinho",
    timeline: "Linha do tempo",
    community: "Comunidade",
    analytics: "Análises",
    orders: "Histórico de Pedidos",
    inventory: "Gerenciamento de Inventário",
    reports: "Relatórios",
    admin: "Login do administrador",
  },
  it: {
    menuTitle: "Menu",
    home: "Home",
    products: "Prodotti",
    productsEC: "Negozio online",
    stores: "Accesso",
    about: "La nostra storia",
    company: "Azienda",
    news: "Notizie",
    interview: "Stampa",
    cart: "Carrello",
    timeline: "Timeline",
    community: "Community",
    analytics: "Analitiche",
    orders: "Cronologia ordini",
    inventory: "Gestione inventario",
    reports: "Report",
    admin: "Accesso amministratore",
  },
  ru: {
    menuTitle: "Меню",
    home: "Главная",
    products: "Товары",
    productsEC: "Интернет-магазин",
    stores: "Как добраться",
    about: "О нас",
    company: "О компании",
    news: "Новости",
    interview: "Для прессы",
    cart: "Корзина",
    timeline: "Лента",
    community: "Сообщество",
    analytics: "Аналитика",
    orders: "История заказов",
    inventory: "Управление запасами",
    reports: "Отчеты",
    admin: "Вход администратора",
  },
  th: {
    menuTitle: "เมนู",
    home: "หน้าแรก",
    products: "รายการสินค้า",
    productsEC: "ร้านค้าออนไลน์",
    stores: "การเดินทาง",
    about: "เรื่องราวของเรา",
    company: "ข้อมูลบริษัท",
    news: "ประกาศ",
    interview: "ติดต่อสื่อ",
    cart: "ตะกร้าสินค้า",
    timeline: "ไทม์ไลน์",
    community: "คอมมูนิตี้",
    analytics: "วิเคราะห์",
    orders: "ประวัติการสั่งซื้อ",
    inventory: "การจัดการสินค้าคงคลัง",
    reports: "รายงาน",
    admin: "เข้าสู่ระบบผู้ดูแล",
  },
  vi: {
    menuTitle: "Menu",
    home: "Trang chủ",
    products: "Danh mục",
    productsEC: "Cửa hàng trực tuyến",
    stores: "Đường đi",
    about: "Câu chuyện của chúng tôi",
    company: "Hồ sơ công ty",
    news: "Thông báo",
    interview: "Báo chí",
    cart: "Giỏ hàng",
    timeline: "Dòng thời gian",
    community: "Cộng đồng",
    analytics: "Phân tích",
    orders: "Lịch sử đơn hàng",
    inventory: "Quản lý tồn kho",
    reports: "Báo cáo",
    admin: "Đăng nhập quản trị",
  },
  id: {
    menuTitle: "Menu",
    home: "Beranda",
    products: "Daftar produk",
    productsEC: "Toko daring",
    stores: "Akses",
    about: "Kisah kami",
    company: "Profil perusahaan",
    news: "Pemberitahuan",
    interview: "Untuk media",
    cart: "Keranjang",
    timeline: "Linimasa",
    community: "Komunitas",
    analytics: "Analitik",
    orders: "Riwayat pesanan",
    inventory: "Manajemen inventaris",
    reports: "Laporan",
    admin: "Masuk admin",
  },
  hi: {
    menuTitle: "मेनू",
    home: "होम",
    products: "उत्पाद सूची",
    productsEC: "ऑनलाइन स्टोर",
    stores: "पहुँच",
    about: "हमारी कहानी",
    company: "कंपनी प्रोफ़ाइल",
    news: "सूचनाएँ",
    interview: "प्रेस",
    cart: "कार्ट",
    timeline: "टाइमलाइन",
    community: "समुदाय",
    analytics: "विश्लेषण",
    orders: "ऑर्डर इतिहास",
    inventory: "इन्वेंटरी प्रबंधन",
    reports: "रिपोर्ट",
    admin: "प्रशासक लॉगिन",
  },
  ar: {
    menuTitle: "القائمة",
    home: "الصفحة الرئيسية",
    products: "قائمة المنتجات",
    productsEC: "المتجر الإلكتروني",
    stores: "الوصول",
    about: "قصتنا",
    company: "نبذة عن الشركة",
    news: "الإشعارات",
    interview: "للاعلام",
    cart: "عربة التسوق",
    timeline: "الخط الزمني",
    community: "المجتمع",
    analytics: "التحليلات",
    orders: "تاريخ الطلبات",
    inventory: "إدارة المخزون",
    reports: "التقارير",
    admin: "تسجيل دخول المسؤول",
  },
};

/* メニュー定義 */
type MenuKey =
  | "products"
  | "productsEC"
  | "home"
  | "stores"
  | "about"
  | "company"
  | "news"
  | "interview"
  | "cart"
  | "timeline"
  | "community"
  | "analytics"
  | "orders"
  | "inventory"
  | "reports"
  | "admin";

type MenuItem = { key: MenuKey; href: string; external?: boolean };

const MENU_ITEMS: MenuItem[] = [
  { key: "home", href: "/" },
  { key: "products", href: "/products" },
  { key: "productsEC", href: "/productsEC" },
  { key: "stores", href: "/stores" },
  { key: "about", href: "/about" },
  { key: "company", href: "/company" },
  { key: "news", href: "/news" },
  { key: "interview", href: "/blog" },
  { key: "cart", href: "/cart" },
];

const FOOTER_ITEMS: MenuItem[] = [
  { key: "timeline", href: "/postList" },
  { key: "community", href: "/community" },
  { key: "analytics", href: "/analytics" },
  { key: "orders", href: "/owner/orders" },
  { key: "inventory", href: "/owner/inventory" },
  { key: "reports", href: "/owner/reports" },
  { key: "admin", href: "/login" },
];

/* レイアウト/隠しタップ */
const HEADER_H = "3rem";
const TAP_INTERVAL_MS = 600;
const TAP_REQUIRED = 3;
const MOVE_TOLERANCE_PX = 10;
// 余白タップのみ無視対象。secret用の data-no-secret は使わない
const IGNORE_SELECTOR = "a,button,input,select,textarea,[role='button']";

export default function Header({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const gradient = useThemeGradient();
  const logoUrl = useHeaderLogoUrl();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/sellers/connect-status?siteKey=${encodeURIComponent(SITE_KEY)}`
        );
        const data = await res.json();
        // どちらの形式でもOKにする
        const ok = data?.connected === true || data?.status === "completed";
        setStripeConnected(!!ok);
      } catch {
        setStripeConnected(false);
      }
    })();
  }, []);

  /* ログイン判定：Firebase Client のみ */
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setIsLoggedIn(!!u));
    return () => unsub();
  }, []);
  const loggedIn = isLoggedIn;

  /* UI言語 */
  const { uiLang } = useUILang();

  /* Firestore設定 */
  const [visibleMenuKeys, setVisibleMenuKeys] = useState<MenuKey[]>(
    [...MENU_ITEMS, ...FOOTER_ITEMS].map((m) => m.key)
  );
  const [i18nEnabled, setI18nEnabled] = useState<boolean>(true);
  const [allowedLangs, setAllowedLangs] = useState<UILangType[] | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(META_REF, (snap) => {
      const data = snap.data() as
        | {
            visibleMenuKeys?: MenuKey[];
            i18n?: { enabled?: boolean; langs?: UILangType[] };
          }
        | undefined;

      if (
        Array.isArray(data?.visibleMenuKeys) &&
        data!.visibleMenuKeys!.length
      ) {
        setVisibleMenuKeys(data!.visibleMenuKeys!);
      }

      const enabled =
        typeof data?.i18n?.enabled === "boolean"
          ? (data!.i18n!.enabled as boolean)
          : true;
      setI18nEnabled(enabled);

      const langs = Array.isArray(data?.i18n?.langs)
        ? (data!.i18n!.langs as UILangType[])
        : (["ja"] as UILangType[]);
      const setLangs = new Set<UILangType>(langs);
      setLangs.add("ja" as UILangType);
      setAllowedLangs(Array.from(setLangs));
    });
    return () => unsub();
  }, []);

  /* 見た目 */
  const gradientClass = gradient
    ? gradient.startsWith("bg-[")
      ? gradient
      : `bg-gradient-to-b ${gradient}`
    : "bg-gray-100";

  const isDark = useMemo(() => {
    const darkKeys: ThemeKey[] = ["brandG", "brandH", "brandI"];
    if (!gradient) return false;
    return darkKeys.some((k) => gradient === THEMES[k]);
  }, [gradient]);

  const effectiveLang: UILangType = useMemo(() => {
    const allow = new Set<UILangType>(
      i18nEnabled
        ? allowedLangs ?? (["ja"] as UILangType[])
        : (["ja"] as UILangType[])
    );
    if (allow.has(uiLang)) return uiLang;
    return allow.has("ja" as UILangType)
      ? ("ja" as UILangType)
      : (Array.from(allow)[0] as UILangType);
  }, [i18nEnabled, allowedLangs, uiLang]);

  const t = T[effectiveLang] ?? T.ja;
  const rtl = effectiveLang === "ar";

  /* 管理者リンク（3タップで表示 or クエリ） */
  const [showAdminLink, setShowAdminLink] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      // 本番では URL アンロックは無効
      const allowUrlUnlock = process.env.NODE_ENV !== "production";
      if (allowUrlUnlock) {
        const url = new URL(window.location.href);
        if (url.searchParams.get("admin") === "1" || url.hash === "#admin") {
          return true;
        }
      }
    } catch {}
    return false;
  });

  useEffect(() => {
    if (!open) return;

    let tapCount = 0;
    let firstTapAt = 0;
    let startX = 0;
    let startY = 0;
    let moved = false;

    const markShown = () => {
      setShowAdminLink(true);
      try {
        // ここは従来どおり（ただし初期値では参照しないため、誤表示は起きない）
        sessionStorage.setItem("showAdminLinkSession", "1");
      } catch {}
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(IGNORE_SELECTOR)) return;

      moved = false;
      startX = e.clientX;
      startY = e.clientY;

      const now = Date.now();
      if (tapCount === 0 || now - firstTapAt > TAP_INTERVAL_MS) {
        tapCount = 1;
        firstTapAt = now;
      } else {
        tapCount += 1;
      }
      if (tapCount >= TAP_REQUIRED) {
        markShown();
        tapCount = 0;
        firstTapAt = 0;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (tapCount === 0) return;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
        moved = true;
      }
    };

    const onPointerUpOrCancel = () => {
      if (moved) {
        tapCount = 0;
        firstTapAt = 0;
      }
    };

    const opts: AddEventListenerOptions = { passive: true, capture: true };
    document.addEventListener("pointerdown", onPointerDown, opts);
    document.addEventListener("pointermove", onPointerMove, opts);
    document.addEventListener("pointerup", onPointerUpOrCancel, opts);
    document.addEventListener("pointercancel", onPointerUpOrCancel, opts);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, opts);
      document.removeEventListener("pointermove", onPointerMove, opts);
      document.removeEventListener("pointerup", onPointerUpOrCancel, opts);
      document.removeEventListener("pointercancel", onPointerUpOrCancel, opts);
    };
  }, [open]);

  const handleMenuClose = () => setOpen(false);

  const showLangPicker =
    i18nEnabled &&
    Array.isArray(allowedLangs) &&
    new Set<UILangType>(allowedLangs).size > 1;

  return (
    <header
      className={clsx(
        "sticky top-0 z-30 flex items-center justify-between px-4 h-12",
        gradientClass,
        className
      )}
      style={{ "--header-h": HEADER_H } as React.CSSProperties}
    >
      {/* ロゴ */}
      <Link
        href="/"
        className={clsx(
          "text-md font-bold flex items-center gap-2 py-2 hover:opacity-50",
          "text-white text-outline"
        )}
        onClick={handleMenuClose}
      >
        {logoUrl && logoUrl.trim() !== "" && (
          <Image
            src={logoUrl}
            alt="ロゴ"
            width={48}
            height={48}
            className="w-12 h-12 object-contain transition-opacity duration-200"
            unoptimized
          />
        )}
        Xenovant
      </Link>

      {/* ハンバーガー */}
      <div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={clsx(
                "w-8 h-8 border-2",
                isDark ? "text-white border-white" : "text-black border-black"
              )}
              aria-label={t.menuTitle}
            >
              <Menu size={22} />
            </Button>
          </SheetTrigger>

          {/* === シート === */}
          <SheetContent
            side="right"
            className={clsx(
              "flex h-dvh min-h-0 flex-col p-0",
              gradient && "bg-gradient-to-b",
              gradient || "bg-gray-100",
              isDark
                ? "[&>button]:text-white [&>button>svg]:!text-white [&>button>svg]:stroke-[3] [&>button>svg]:w-7 [&>button>svg]:h-6"
                : "[&>button]:text-black [&>button>svg]:!text-black [&>button>svg]:stroke-[3] [&>button>svg]:w-7 [&>button>svg]:h-6"
            )}
            dir={rtl ? "rtl" : "ltr"}
          >
            {/* 先頭固定ヘッダー */}
            <SheetHeader className="px-6 py-4 border-b border-white/30">
              <SheetTitle className="text-white text-outline text-xl">
                {t.menuTitle}
              </SheetTitle>
            </SheetHeader>

            {/* 中央：上下センター配置のスクロール領域 */}
            <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin] px-6">
              <div className="min-h-full flex items-center justify-center">
                <div className="w-full">
                  <nav className="py-4 flex flex-col items-center text-center space-y-3">
                    {MENU_ITEMS.filter((m) =>
                      visibleMenuKeys.includes(m.key)
                    ).map(({ key, href, external }) =>
                      external ? (
                        <a
                          key={key}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={handleMenuClose}
                          className="text-lg text-white text-outline hover:underline"
                        >
                          {t[key]}
                        </a>
                      ) : (
                        <Link
                          key={key}
                          href={href}
                          onClick={handleMenuClose}
                          className="text-lg text-white text-outline"
                        >
                          {t[key]}
                        </Link>
                      )
                    )}
                  </nav>

                  {/* 言語ピッカー（ON かつ複数言語） */}
                  {showLangPicker && (
                    <div className="flex flex-col items中心 gap-2 pb-6">
                      <UILangFloatingPicker />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 下詰めフッター */}
            <div className="border-t border-white/30 px-6 py-4">
              <div className="flex flex-col items-center gap-2">
                {loggedIn &&
                  FOOTER_ITEMS.filter((m) =>
                    [
                      "timeline",
                      "community",
                      "analytics",
                      "orders",
                      "inventory",
                      "reports",
                    ].includes(m.key)
                  )
                    // ← 注文履歴は Stripe 連携済みのときのみ出す
                    .filter((m) => m.key !== "orders" || stripeConnected)
                    .map(({ key, href }) => (
                      <Link
                        key={key}
                        href={href}
                        onClick={handleMenuClose}
                        className="text-center text-lg text-white text-outline"
                      >
                        {t[key as Keys]}
                      </Link>
                    ))}

                {(showAdminLink || loggedIn) && (
                  <Link
                    href="/login"
                    onClick={handleMenuClose}
                    className="text-center text-lg text-white text-outline"
                  >
                    {t.admin}
                  </Link>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
