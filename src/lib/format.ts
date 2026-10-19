import type { Channel, SlotKey, VariableType } from "../api/types";

export const CHANNELS: readonly Channel[] = ["sms", "email", "inApp"];

export const CHANNEL_META: Record<Channel, { label: string; icon: string; subject?: string }> = {
  sms: { label: "SMS", icon: "sms" },
  email: { label: "Email", icon: "mail", subject: "Subject" },
  inApp: { label: "In-app", icon: "notifications_active", subject: "Title" },
};

export const TYPE_LABEL: Record<VariableType, string> = {
  text: "Text",
  number: "Number",
  money: "Money",
  account: "Account",
  phone: "Phone",
  datetime: "Datetime",
};

/** How each type is shown to customers (for tooltips in the variable palette). */
export const TYPE_HINT: Record<VariableType, string> = {
  text: "Shown as sent",
  number: "Shown as sent",
  money:
    "2 decimals with thousands separators, no currency: 1500 → 1,500.00 (write ETB in the text)",
  account: "Masked: 0123456789012 → 0123******012",
  phone: "+251 and the last 9 digits: 0911223344 → +251911223344",
  datetime: "Ethiopian time: 2026-10-16 11:22:05. Use .date or .time for one part",
};

export const slotLabel = (s: SlotKey): string =>
  `${s.service} / ${s.event} / ${s.audience} / ${s.channel}`;

export const editorPath = (s: SlotKey): string =>
  `/services/${s.service}/events/${s.event}/templates/${s.audience}/${s.channel}`;

export function relativeTime(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const percent = (part: number, total: number): number =>
  total === 0 ? 0 : Math.round((part / total) * 100);

export const plural = (n: number, word: string, many = `${word}s`): string =>
  `${n} ${n === 1 ? word : many}`;

/** "2026-10-16T08:22:05.000Z" → "2026-10-16T11:22" in the browser's time zone, for datetime-local. */
export function toLocalInput(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local has no time zone; the engine would read it as UTC, so convert to ISO first. */
export function fromLocalInput(value: string): string | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const SNIPPET_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

export const LIMITS = {
  templateBody: 5000,
  snippetBody: 2000,
  subject: 200,
  description: 200,
  snippetKey: 50,
  smsSegments: 4,
} as const;
