import imageCompression from "browser-image-compression";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { v4 as uuid } from "uuid";
import { extFromMime } from "@/lib/fileTypes";
import type { MediaType } from "@/types/productLocales";


export async function uploadProductMedia(params: {
file: File;
siteKey: string;
docId: string;
previousType?: MediaType;
onProgress?: (pct: number) => void;
}): Promise<{ mediaURL: string; mediaType: MediaType }> {
const { file, siteKey, docId, previousType, onProgress } = params;
const isVideo = file.type.startsWith("video/");
const mediaType: MediaType = isVideo ? "video" : "image";
const ext = isVideo ? extFromMime(file.type) : "jpg";
const uploadFile = isVideo
? file
: await imageCompression(file, {
maxWidthOrHeight: 1200,
maxSizeMB: 0.7,
useWebWorker: true,
fileType: "image/jpeg",
initialQuality: 0.8,
});


const storageRef = ref(getStorage(), `products/public/${siteKey}/${docId}.${ext}`);
const task = uploadBytesResumable(storageRef, uploadFile, { contentType: isVideo ? file.type : "image/jpeg" });
task.on("state_changed", (s) => onProgress?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)));
await task;
const downloadURL = await getDownloadURL(storageRef);


// cleanup if changed type
if (previousType && previousType !== mediaType) {
const oldExt = previousType === "video" ? "mp4" : "jpg";
await deleteObject(ref(getStorage(), `products/public/${siteKey}/${docId}.${oldExt}`)).catch(() => {});
}


return { mediaURL: `${downloadURL}?v=${uuid()}`, mediaType };
}
