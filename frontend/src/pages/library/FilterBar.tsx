import { ArrowDownWideNarrow, ArrowUpNarrowWide, CheckSquare, LayoutGrid, List } from "lucide-react";
import { useTags } from "../../lib/queries";
import { cx } from "../../lib/format";
import { Select } from "../../components/ui";

export type View = "grid" | "list";

interface Props {
  params: URLSearchParams;
  set: (key: string, value: string | null) => void;
  view: View;
  onView: (v: View) => void;
  selecting: boolean;
  onSelecting: (v: boolean) => void;
}

const SORTS: [string, string][] = [
  ["title", "書名"],
  ["author", "作者"],
  ["added", "新增日期"],
  ["recent", "最近閱讀"],
  ["volumes", "集數"],
  ["rating", "評分"],
  ["size", "容量"],
];

export function FilterBar({ params, set, view, onView, selecting, onSelecting }: Props) {
  const { data: tags } = useTags();
  const order = params.get("order") ?? (["added", "recent", "rating", "volumes", "size"].includes(params.get("sort") ?? "") ? "desc" : "asc");
  const filterCount = ["status", "read", "format", "tag_id"].filter((k) => params.get(k)).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="完結狀態" value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value || null)}>
        <option value="">全部狀態</option>
        <option value="ongoing">連載中</option>
        <option value="finished">已完結</option>
        <option value="stopped">停刊</option>
        <option value="unknown">未知</option>
      </Select>
      <Select aria-label="閱讀狀態" value={params.get("read") ?? ""} onChange={(e) => set("read", e.target.value || null)}>
        <option value="">全部閱讀狀態</option>
        <option value="unread">未讀</option>
        <option value="reading">閱讀中</option>
        <option value="read">已讀</option>
      </Select>
      <Select aria-label="格式" value={params.get("format") ?? ""} onChange={(e) => set("format", e.target.value || null)}>
        <option value="">全部格式</option>
        {["pdf", "epub", "zip", "rar", "7z", "mobi"].map((f) => (
          <option key={f} value={f}>
            {f.toUpperCase()}
          </option>
        ))}
      </Select>
      <Select aria-label="標籤" value={params.get("tag_id") ?? ""} onChange={(e) => set("tag_id", e.target.value || null)}>
        <option value="">全部標籤</option>
        {tags?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}（{t.series_count}）
          </option>
        ))}
      </Select>
      {filterCount > 0 && (
        <button
          type="button"
          className="h-8 rounded-md px-2 text-[13px] text-accent hover:underline"
          onClick={() => ["status", "read", "format", "tag_id"].forEach((k) => set(k, null))}
        >
          清除篩選
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center">
          <Select aria-label="排序方式" value={params.get("sort") ?? "title"} onChange={(e) => set("sort", e.target.value)} className="rounded-r-none">
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                依{l}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => set("order", order === "asc" ? "desc" : "asc")}
            aria-label={order === "asc" ? "目前遞增，切換為遞減" : "目前遞減，切換為遞增"}
            title={order === "asc" ? "遞增" : "遞減"}
            className="-ml-px flex h-8 w-8 items-center justify-center rounded-r-md border border-rule-strong bg-surface text-ink-2 hover:bg-surface-2"
          >
            {order === "asc" ? <ArrowUpNarrowWide size={15} /> : <ArrowDownWideNarrow size={15} />}
          </button>
        </div>

        <button
          type="button"
          aria-pressed={selecting}
          onClick={() => onSelecting(!selecting)}
          className={cx(
            "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px]",
            selecting ? "border-accent bg-accent-soft text-accent" : "border-rule-strong bg-surface text-ink-2 hover:bg-surface-2",
          )}
        >
          <CheckSquare size={15} />
          批次編輯
        </button>

        <div role="radiogroup" aria-label="顯示方式" className="flex rounded-md border border-rule-strong bg-surface p-0.5">
          {(
            [
              ["grid", "封面牆", <LayoutGrid key="g" size={15} />],
              ["list", "清單", <List key="l" size={15} />],
            ] as const
          ).map(([v, label, icon]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              aria-label={label}
              title={label}
              onClick={() => onView(v)}
              className={cx("flex h-6 w-7 items-center justify-center rounded", view === v ? "bg-accent-soft text-accent" : "text-muted hover:text-ink")}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
