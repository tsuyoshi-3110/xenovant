// components/common/Footer.tsx

import clsx from "clsx";
import Image from "next/image";
import Link from "next/link";

const SNS = [
  {
    name: "Instagram",
    href: "https://www.instagram.com/xenovant.crape/",
    image: "/images/instagram-logo.png",
  },
];

export default function Footer() {
  return (
    <footer className="relative z-20 mt-10 border-t bg-white/30 text-sm text-white text-outline backdrop-blur supports-[backdrop-filter]:bg-white/40">
      <div className="mx-auto max-w-6xl px-4 py-10">
        {/* すべて中央寄せ */}
        <div className="flex flex-col items-center gap-6 text-center">
          {/* SNSアイコン */}
          <nav
            className="flex items-center justify-center gap-5"
            aria-label="SNSリンク"
          >
            {SNS.map(({ name, href, image }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={name}
                className="hover:opacity-80 transition"
              >
                <Image
                  src={image}
                  alt={name}
                  width={26}
                  height={26}
                  className="w-10 h-10 object-contain"
                />
              </a>
            ))}

            <Link
              href="https://xenovant.com/"
              className={clsx(
                "text-xl font-bold flex items-center gap-2 py-2 hover:opacity-50"
              )}
            >
              <Image
                src="/images/uber-logo.png"
                alt="Home"
                width={32}
                height={32}
                className="w-10 h-10 object-contain transition-opacity duration-200 mr-2"
                unoptimized
              />
            </Link>

            {/* 外部リンク */}
            <Link
              href="https://taxenovant.com/"
              className={clsx(
                "text-xl font-bold flex items-center gap-2 py-2 hover:opacity-50"
              )}
            >
              <Image
                src="/images/taxenovant_circle_image.png"
                alt="Home"
                width={48}
                height={48}
                className="w-10 h-10 object-contain transition-opacity duration-200 mr-2"
                unoptimized
              />
            </Link>
          </nav>

          {/* エリアリンク（SEO強化） */}
          <div className="space-y-1 text-xs leading-tight">
            <p>
              <a href="/areas/higashiyodogawa" className="hover:underline">
                東淀川区の甘味処・カフェ
              </a>
            </p>
          </div>

          {/* コピーライト */}
          <div className="space-y-1">
            <p className="font-semibold leading-tight">甘味処 よって屋</p>
            <p className="text-xs leading-tight">
              © {new Date().getFullYear()} xenovant. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
