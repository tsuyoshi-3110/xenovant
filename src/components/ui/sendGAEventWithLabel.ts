// lib/sendGAEventWithLabel.ts
export function sendGAEventWithLabel(action: string, label: string) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", action, {
      event_category: "navigation",
      event_label: label,
    });
  }
}
