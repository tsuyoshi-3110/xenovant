"use client";
import { motion } from "framer-motion";
import Image from "next/image";

// 台とトンボの画像パス（`/public`以下に保存しておいてください）
const BASE_IMAGE = "/images/crepe-base.png";
const T_BAR_IMAGE = "/images/crepe-tbar.png"; // 背景透過版

export default function CrepeLoader() {
  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center bg-transparent">
      <div className="relative w-[100px] h-[100px]">
        {/* 焼き台（背景） */}
        <Image
          src={BASE_IMAGE}
          alt="Crepe Base"
          layout="fill"
          objectFit="contain"
          unoptimized
        />

        {/* 回転するトンボ */}
        <motion.div
          className="absolute top-0 left-0 w-full h-full flex justify-center items-center"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          style={{ transformOrigin: "50% 50%" }}
        >
          <div style={{ transform: "translate(15px, 15px)" }}>
            <Image
              src={T_BAR_IMAGE}
              alt="Crepe T-Bar"
              width={50}
              height={50}
              unoptimized
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
