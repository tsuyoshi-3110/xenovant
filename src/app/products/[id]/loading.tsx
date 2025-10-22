// src/app/products/[id]/loading.tsx
"use client";

import CardSpinner from "@/components/CardSpinner";

export default function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <CardSpinner />
    </main>
  );
}
