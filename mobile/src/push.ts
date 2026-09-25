// Web Push for the installed app. The backend sends BUY/SELL flips and the risk gauge reaching 경계
// (after each market's close, triggered by the Cloudflare cron in tools/worker).
// iPhone: only works for the app added to the home screen (iOS 16.4+), not in a Safari tab.
import { Platform } from "react-native";
import { api } from "./api";

const g = globalThis as any;

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

function b64ToBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = g.atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c: string) => c.charCodeAt(0));
}

async function registration() {
  return g.navigator.serviceWorker.getRegistration();
}

export async function pushState(): Promise<PushState> {
  if (Platform.OS !== "web" || !g.navigator?.serviceWorker) return "unsupported";
  const ios = /iPhone|iPad/.test(g.navigator.userAgent);
  const standalone = g.navigator.standalone === true || g.matchMedia?.("(display-mode: standalone)").matches;
  if (!("PushManager" in g) || !("Notification" in g)) return ios && !standalone ? "needs-install" : "unsupported";
  if (g.Notification.permission === "denied") return "denied";
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? "on" : "off";
}

export async function enablePush(): Promise<PushState> {
  const perm = await g.Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = (await registration()) ?? (await g.navigator.serviceWorker.register("/sw.js"));
  await g.navigator.serviceWorker.ready;
  const key = await api.vapidKey();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await api.pushSubscribe(sub.toJSON());
  await api.pushTest(sub.endpoint);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}
