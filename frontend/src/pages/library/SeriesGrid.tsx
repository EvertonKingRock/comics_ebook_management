import { Check, Heart } from "lucide-react";
import { Link } from "react-router-dom";
import { Cover } from "../../components/Cover";
import { StatusBadge } from "../../components/ui";
import type { SeriesCard } from "../../lib/api";
import { cx } from "../../lib/format";
import { useCategoryColor } from "../../lib/queries";

interface Props {
  items: SeriesCard[];
  selecting: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
}

function VolumeLine({ s }: { s: SeriesCard }) {
  const owned = s.total_volumes && s.total_volumes !== s.volume_count ? `${s.volume_count} / ${s.total_volumes} 本` : `${s.volume_count} 本`;
  return (
    <span className="tabular text-[12px] text-muted">
      {s.read_count > 0 ? (
        <>
          已讀 {s.read_count}/{s.volume_count}
        </>
      ) : (
        owned
      )}
    </span>
  );
}

export function SeriesGrid({ items, selecting, selected, onToggle }: Props) {
  const color = useCategoryColor();
  return (
    <ul role="list" className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))]">
      {items.map((s) => {
        const isSel = selected.has(s.id);
        const body = (
          <>
            <div className="relative">
              <Cover volumeId={s.cover_volume_id} title={s.title} tone={color(s.category_id)} className={cx("transition-[outline]", isSel && "outline-2 outline-offset-2 outline-accent")} />
              {s.is_favorite && (
                <span className="absolute top-1.5 right-1.5 rounded-full bg-surface/90 p-1 text-[var(--cat-hk)]" aria-label="已收藏">
                  <Heart size={12} fill="currentColor" />
                </span>
              )}
              {selecting && (
                <span
                  aria-hidden
                  className={cx(
                    "absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded border",
                    isSel ? "border-accent bg-accent text-accent-ink" : "border-rule-strong bg-surface/90",
                  )}
                >
                  {isSel && <Check size={13} strokeWidth={3} />}
                </span>
              )}
              {s.read_count > 0 && (
                <span aria-hidden className="absolute inset-x-0 bottom-[3px] h-[3px] bg-black/20">
                  <span className="block h-full bg-ok" style={{ width: `${(s.read_count / s.volume_count) * 100}%` }} />
                </span>
              )}
            </div>
            <div className="mt-2 space-y-0.5">
              <h3 className="line-clamp-2 text-[14px] leading-snug font-medium text-ink group-hover:text-accent">{s.title}</h3>
              <p className="truncate text-[12px] text-muted">{s.author ?? "作者不詳"}</p>
              <div className="flex items-center gap-1.5 pt-0.5">
                <StatusBadge status={s.status} />
                <VolumeLine s={s} />
              </div>
            </div>
          </>
        );
        return (
          <li key={s.id}>
            {selecting ? (
              <button type="button" onClick={() => onToggle(s.id)} aria-pressed={isSel} className="group block w-full text-left">
                {body}
              </button>
            ) : (
              <Link to={`/series/${s.id}`} className="group block rounded-[4px]">
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
