import { LANGS } from "@/lib/langs";
import type { LangKey } from "@/types/productLocales";


export async function translateAll(titleJa: string, bodyJa: string) {
const targets = Array.from(new Set(LANGS.map((l) => l.key))).filter((k) => k !== "ja");
const res = await Promise.all(
targets.map(async (k) => {
const r = await fetch("/api/translate", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ title: titleJa, body: bodyJa, target: k }),
});
if (!r.ok) throw new Error(`translate failed: ${k}`);
const data = (await r.json()) as { title?: string; body?: string };
return { lang: k as LangKey, title: (data.title ?? "").trim(), body: (data.body ?? "").trim() };
})
);
return res.filter((x) => x.lang !== "ja");
}


export async function translateSectionTitleAll(titleJa: string) {
const targets = Array.from(new Set(LANGS.map((l) => l.key))).filter((k) => k !== "ja");
const res = await Promise.all(
targets.map(async (k) => {
const r = await fetch("/api/translate", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ title: titleJa, body: "", target: k }),
});
if (!r.ok) throw new Error(`section translate failed: ${k}`);
const data = (await r.json()) as { title?: string };
return { lang: k as LangKey, title: (data.title ?? "").trim() };
})
);
return res.filter((x) => x.lang !== "ja");
}
