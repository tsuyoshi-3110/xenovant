import { NextResponse } from "next/server";
import {
  getDocs,
  collection,
  doc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const SITE_KEY = "taxenovant3110";

// "YYYY-MM-DD_pageId" → JST 0:00 Timestamp と pageId
function parseDocId(id: string) {
  const m = id.match(/^(\d{4}-\d{2}-\d{2})_(.+)$/);
  if (!m) return null;
  const [ymd, pid] = m;
  const [y, mo, d] = ymd.split("-").map(Number);
  const date = new Date(y, mo - 1, d, 0, 0, 0, 0);
  return { dayTs: Timestamp.fromDate(date), pageId: pid };
}

export async function POST() {
  const col = collection(db, "analytics", SITE_KEY, "pagesDaily");
  const snap = await getDocs(col);

  let batch = writeBatch(db);
  let pendingOps = 0;
  let updated = 0;

  // ★ for...of で同期的に回す（await OK）
  for (const docSnap of snap.docs) {
    const data = docSnap.data() as any;
    const patch: Record<string, any> = {};
    let needsUpdate = false;

    // count 未定義 → 1 を入れる（最低1回は発生しているという前提）
    if (typeof data.count !== "number") {
      patch.count = 1;
      needsUpdate = true;
    }

    // day 欠落/不正 → doc.id から復元
    if (!data.day || typeof data.day.toDate !== "function") {
      const parsed = parseDocId(docSnap.id);
      if (parsed?.dayTs) {
        patch.day = parsed.dayTs;
        needsUpdate = true;
      }
    }

    // pageId 欠落 → doc.id から復元
    if (!data.pageId) {
      const parsed = parseDocId(docSnap.id);
      if (parsed?.pageId) {
        patch.pageId = parsed.pageId;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      batch.update(
        doc(db, "analytics", SITE_KEY, "pagesDaily", docSnap.id),
        patch
      );
      pendingOps++;
      updated++;

      // こまめにコミット（上限500未満の安全圏）
      if (pendingOps >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        pendingOps = 0;
      }
    }
  }

  if (pendingOps > 0) {
    await batch.commit();
  }

  return NextResponse.json({ updatedDocs: updated });
}
