import { Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ReadMark, Stars, StatusBadge } from "../../components/ui";
import { coverUrl, type SeriesCard } from "../../lib/api";
import { formatDate, formatSize } from "../../lib/format";
import { useCategoryColor } from "../../lib/queries";

interface Props {
  items: SeriesCard[];
  selecting: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (all: boolean) => void;
}

export function SeriesTable({ items, selecting, selected, onToggle, onToggleAll }: Props) {
  const navigate = useNavigate();
  const color = useCategoryColor();
  const allSelected = items.length > 0 && items.every((s) => selected.has(s.id));

  return (
    <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
      <table className="w-full min-w-[860px] text-left text-[13px]">
        <thead className="border-b border-rule text-[12px] text-muted">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
            {selecting && (
              <th className="w-8">
                <input type="checkbox" aria-label="全選" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} className="accent-[var(--accent)]" />
              </th>
            )}
            <th>書名</th>
            <th>分類</th>
            <th>狀態</th>
            <th className="text-right">集數</th>
            <th>閱讀</th>
            <th>格式</th>
            <th className="text-right">容量</th>
            <th>評分</th>
            <th>新增日期</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr
              key={s.id}
              tabIndex={0}
              onClick={() => (selecting ? onToggle(s.id) : navigate(`/series/${s.id}`))}
              onKeyDown={(e) => e.key === "Enter" && (selecting ? onToggle(s.id) : navigate(`/series/${s.id}`))}
              aria-selected={selecting ? selected.has(s.id) : undefined}
              className="cursor-pointer border-b border-rule last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2 [&>td]:px-3 [&>td]:py-2"
            >
              {selecting && (
                <td>
                  <input
                    type="checkbox"
                    aria-label={`選取 ${s.title}`}
                    checked={selected.has(s.id)}
                    onChange={() => onToggle(s.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-[var(--accent)]"
                  />
                </td>
              )}
              <td>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-8 shrink-0 overflow-hidden rounded-[3px] border border-rule bg-surface-2">
                    {s.cover_volume_id && <img src={coverUrl(s.cover_volume_id)!} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium text-ink">
                      <span className="truncate">{s.title}</span>
                      {s.is_favorite && <Heart size={12} className="shrink-0 text-[var(--cat-hk)]" fill="currentColor" aria-label="已收藏" />}
                    </div>
                    <div className="truncate text-[12px] text-muted">{[s.author, s.publisher].filter(Boolean).join("／") || "作者不詳"}</div>
                  </div>
                </div>
              </td>
              <td>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color(s.category_id) }} />
                  {s.category_name}
                </span>
              </td>
              <td>
                <StatusBadge status={s.status} />
              </td>
              <td className="tabular text-right whitespace-nowrap">
                {s.volume_count}
                {s.total_volumes ? <span className="text-muted"> / {s.total_volumes}</span> : null}
              </td>
              <td className="whitespace-nowrap">
                <ReadMark status={s.read_state} />
                {s.read_state === "reading" && <span className="tabular ml-1 text-[12px] text-muted">{s.read_count}/{s.volume_count}</span>}
              </td>
              <td className="text-[12px] text-muted uppercase">{s.formats.join(" ")}</td>
              <td className="tabular text-right whitespace-nowrap text-muted">{formatSize(s.total_size)}</td>
              <td>
                <Stars value={s.rating} size={12} />
              </td>
              <td className="tabular whitespace-nowrap text-muted">{formatDate(s.added_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
