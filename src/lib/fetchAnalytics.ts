import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function fetchAnalytics(siteKey: string) {
  const pagesRef = collection(db, "analytics", siteKey, "pages");
  const eventsRef = collection(db, "analytics", siteKey, "events");

  const [pagesSnap, eventsSnap] = await Promise.all([
    getDocs(pagesRef),
    getDocs(eventsRef),
  ]);

  const pages: { page: string; count: number }[] = [];
  pagesSnap.forEach((doc) => {
    const { count } = doc.data();
    pages.push({ page: doc.id, count });
  });

  const events: { event: string; count: number; label?: string | null }[] = [];
  eventsSnap.forEach((doc) => {
    const { count, label } = doc.data();
    events.push({ event: doc.id, count, label });
  });

  return { pages, events };
}
