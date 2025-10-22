export const sendGAEventWithBeacon = ({
  action,
  category,
  label,
  value,
}: {
  action: string;
  category?: string;
  label?: string;
  value?: number;
}) => {
  if (typeof window === "undefined") return;

  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!measurementId) {
    console.warn("GA Measurement ID is missing");
    return;
  }

  // client_id の取得
  const clientId = localStorage.getItem("ga_client_id") ?? `${Math.random()}`;

  const payload = {
    v: "1",
    tid: measurementId,
    cid: clientId,
    t: "event",
    ec: category ?? "",
    ea: action,
    el: label ?? "",
    ev: value ?? "",
  };

  const params = new URLSearchParams(payload as any).toString();
  navigator.sendBeacon("https://www.google-analytics.com/collect", params);
};
