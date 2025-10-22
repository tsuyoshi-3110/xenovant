// app/products/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProductDetail from "@/components/products/ProductDetail";
import CardSpinner from "@/components/CardSpinner";

const SITE_KEY = "xenovant";

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

  return <ProductDetail product={product} />;
}
