import type { ReadStatus, SeriesStatus } from "./api";

export const STATUS_LABEL: Record<SeriesStatus, string> = {
  ongoing: "連載中",
  finished: "已完結",
  stopped: "停刊",
  unknown: "未知",
};

export const READ_LABEL: Record<ReadStatus, string> = {
  unread: "未讀",
  reading: "閱讀中",
  read: "已讀",
};

export const READ_CYCLE: Record<ReadStatus, ReadStatus> = { unread: "reading", reading: "read", read: "unread" };

/** Category identity colour, keyed by folder name in CATEGORY_MAP order (falls back by index). */
const CAT_VARS = ["var(--cat-hk)", "var(--cat-jp)", "var(--cat-tw)", "var(--cat-us)"];
export function categoryColor(sortOrderOrIndex: number): string {
  return CAT_VARS[sortOrderOrIndex % CAT_VARS.length];
}

export function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "0 MB";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1000) return `${(gb / 1024).toFixed(2)} TB`;
  if (gb >= 1) return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

export function formatCount(n: number | null | undefined): string {
  if (n == null) return "0";
  if (n >= 100000) return `${Math.round(n / 10000)} 萬`;
  return n.toLocaleString("zh-Hant");
}

/** YYYY/MM/DD */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${formatDate(iso)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "剛剛";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return formatDate(iso);
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
