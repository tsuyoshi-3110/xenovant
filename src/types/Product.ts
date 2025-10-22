type MediaType = "image" | "video";

export type Product = {
  id: string;
  title: string;
  body: string;
  price: number;
  mediaURL: string;
  mediaType: MediaType;
  originalFileName?: string;
  taxIncluded?: boolean;
  order?: number; // ← 🔧この行を追加
};
