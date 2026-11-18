export type ReadStatus = "unread" | "reading" | "read";
export type SeriesStatus = "ongoing" | "finished" | "stopped" | "unknown";

export interface TagRef {
  id: number;
  name: string;
  color: string;
}

export interface Tag extends TagRef {
  series_count: number;
}

export interface Category {
  id: number;
  folder_name: string;
  display_name: string;
  sort_order: number;
  series_count: number;
  volume_count: number;
}

export interface SeriesCard {
  id: number;
  category_id: number;
  category_name: string;
  folder_name: string;
  group_name: string | null;
  rel_path: string;
  title: string;
  author: string | null;
  publisher: string | null;
  status: SeriesStatus;
  total_volumes: number | null;
  original_title: string | null;
  rating: number | null;
  is_favorite: boolean;
  cover_volume_id: number | null;
  volume_count: number;
  read_count: number;
  reading_count: number;
  total_size: number;
  added_at: string;
  last_opened_at: string | null;
  formats: string[];
  read_state: ReadStatus;
  tags: TagRef[];
}

export interface Volume {
  id: number;
  file_name: string;
  rel_path: string;
  sub_path: string;
  ext: string;
  size_bytes: number;
  volume_label: string;
  volume_no: number | null;
  read_status: ReadStatus;
  last_opened_at: string | null;
  added_at: string;
  cover_state: "pending" | "ok" | "failed";
}

export interface EditableFields {
  title: string | null;
  original_title?: string | null;
  author: string | null;
  publisher: string | null;
  status: SeriesStatus | null;
  total_volumes: number | null;
  summary: string | null;
}

export interface SeriesDetail extends SeriesCard {
  summary: string | null;
  notes: string | null;
  auto: EditableFields;
  overrides: EditableFields;
  volumes: Volume[];
}

export interface SeriesPage {
  items: SeriesCard[];
  total: number;
  page: number;
  page_size: number;
}

export interface Stats {
  totals: { series: number; volumes: number; size: number; read: number; reading: number; unread: number; favorites: number };
  by_category: { id: number; name: string; series: number; volumes: number; size: number; read: number }[];
  formats: { ext: string; count: number; size: number }[];
  status: { status: SeriesStatus; count: number }[];
  recent_added: SeriesCard[];
  recent_read: { id: number; volume_label: string; file_name: string; read_status: ReadStatus; last_opened_at: string; series_id: number; series_title: string }[];
  quality: { missing_author: number; missing_files: number; cover_failed: number; untagged: number };
  last_scan: ScanLog | null;
}

export interface ScanLog {
  id: number;
  mode: string;
  started_at: string;
  finished_at: string | null;
  added: number;
  updated: number;
  missing: number;
  errors: number;
  message: string | null;
}

export interface ScanStatus {
  running: boolean;
  phase: "idle" | "walking" | "syncing" | "done" | "error";
  found: number;
  processed: number;
  total: number;
  message: string;
  errors: string[];
  covers: { running: boolean; done: number; total: number };
}

export interface AppSettings {
  comics_root: string;
  comics_root_ok: boolean;
  sumatra_path: string;
  sumatra_ok: boolean;
  sevenzip_path: string;
  sevenzip_ok: boolean;
  port: number;
  file_types: string[];
  scan_on_startup: boolean;
  categories: { folder_name: string; display_name: string; exists: boolean }[];
  unmapped_folders: string[];
  db_path: string;
  db_size: number;
  cover_count: number;
  series_count: number;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `請求失敗（${res.status}）`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") msg = data.detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  del: <T>(url: string) => request<T>("DELETE", url),
};

export const coverUrl = (volumeId: number | null | undefined) => (volumeId ? `/api/covers/volume/${volumeId}` : null);
