export function BusyOverlay({
  uploadingPercent,
  saving,
}: {
  uploadingPercent?: number | null; // ← オプショナルに変更
  saving: boolean;
}) {
  if (uploadingPercent == null && !saving) return null; // null or undefined のとき判定
  const isUploading = uploadingPercent != null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/60 gap-4">
      <p className="text-white">
        {isUploading ? `アップロード中… ${uploadingPercent}%` : "保存中…"}
      </p>
      {isUploading && (
        <div className="w-64 h-2 bg-gray-700 rounded">
          <div
            className="h-full bg-green-500 rounded transition-all"
            style={{ width: `${uploadingPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
