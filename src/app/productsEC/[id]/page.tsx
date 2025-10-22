// app/products/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProductECDetail from "@/components/productsEC/ProductECDetail";
import CardSpinner from "@/components/CardSpinner";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

export default function ProductPage() {
  const { id } = useParams() as { id: string };
  const [product, setProduct] = useState<any | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const snap = await getDoc(doc(db, "siteProducts", SITE_KEY, "items", id));
      if (snap.exists()) {
        setProduct({ id, ...snap.data() });
      } else {
        setProduct(null);
      }
    })();
  }, [id]);

  if (!product) return <CardSpinner />;

  return <ProductECDetail product={product} />;
}
