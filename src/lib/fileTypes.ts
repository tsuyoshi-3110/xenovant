// 許可する MIME type 一覧
export const VIDEO_MIME_TYPES: string[] = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/ogg",
  "video/x-m4v",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/mpeg",
  "video/3gpp",
  "video/3gpp2",
];

export const IMAGE_MIME_TYPES: string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];


export function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    case "image/bmp": return "bmp";
    case "image/tiff": return "tiff";
    case "image/heic": return "heic";
    case "image/heif": return "heif";
    case "image/avif": return "avif";
    case "video/mp4": return "mp4";
    case "video/quicktime": return "mov";
    case "video/webm": return "webm";
    case "video/ogg": return "ogv";
    case "video/x-m4v": return "m4v";
    case "video/x-msvideo": return "avi";
    case "video/x-ms-wmv": return "wmv";
    case "video/mpeg": return "mpeg";
    case "video/3gpp": return "3gp";
    case "video/3gpp2": return "3g2";
    default: return "dat";
  }
}
