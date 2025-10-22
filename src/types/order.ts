export type OrderItem = {
  name: string;
  qty: number;
  unitAmount: number; // 税込1個あたり
};

export type SiteOrder = {
  id: string;
  siteKey: string;
  payment_status: "paid" | "requires_action" | "canceled";
  amount_total: number;           // 合計（単位：最小通貨単位）
  currency: string;               // "jpy"
  createdAt: FirebaseFirestore.Timestamp;
  customer: {
    name?: string;
    email?: string;
    address?: {
      postal_code?: string;
      country?: string;
      city?: string;
      line1?: string;
      line2?: string;
    };
  };
  items: OrderItem[];
};
