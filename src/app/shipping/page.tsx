import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ShippingManagementPage() {
  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">EC管理</h1>
      <div className="grid gap-4">
        <Link href="/owner/orders">
          <Button variant="outline" className="w-full">
            📦 注文履歴
          </Button>
        </Link>
        <Link href="/owner/inventory">
          <Button variant="outline" className="w-full">
            📊 在庫管理
          </Button>
        </Link>
        <Link href="/owner/reports">
          <Button variant="outline" className="w-full">
            📈 レポート
          </Button>
        </Link>
        <Link href="/shipping/priceSetting">
          <Button variant="outline" className="w-full">
            🚚 配送料設定
          </Button>
        </Link>
      </div>
    </div>
  );
}
