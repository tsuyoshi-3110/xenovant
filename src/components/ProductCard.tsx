"use client";
import Image from "next/image";
import { useCart } from "@/lib/cart/CartContext";


export default function ProductCard({ p }: { p: { id: string; name: string; priceJPY: number; imageUrl?: string } }) {
const { add } = useCart();


return (
<div className="rounded-2xl shadow p-4 grid gap-3">
<div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-100">
{p.imageUrl && (
<Image src={p.imageUrl} alt={p.name} fill className="object-cover" />
)}
</div>
<div className="text-lg font-semibold">{p.name}</div>
<div className="text-sm opacity-80">¥{p.priceJPY.toLocaleString()}</div>
<button
className="h-11 rounded-xl bg-black text-white font-medium"
onClick={() => add({ productId: p.id, name: p.name, unitAmount: p.priceJPY, qty: 1, imageUrl: p.imageUrl })}
>
カートに入れる
</button>
</div>
);
}
