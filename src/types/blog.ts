export type BlogMedia = {
  type: "image" | "video";
  url: string;
  path?: string;
  title?: string; // 画像/動画共通のタイトル（1つだけ）
};

export type BlogBlock =
  | { id: string; type: "p"; text: string }
  | { id: string; type: "image"; url: string; path?: string; title?: string }
  | { id: string; type: "video"; url: string; path?: string; title?: string };

export interface BlogPost {
  id?: string;
  title: string;         // 記事タイトル
  body?: string;         // 後方互換：テキストのみ連結
  media?: BlogMedia[];   // 後方互換：旧仕様
  blocks?: BlogBlock[];  // 新仕様：自由レイアウト
  createdAt?: any;
  updatedAt?: any;
}
