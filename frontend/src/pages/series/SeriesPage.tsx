import { ArrowLeft, Heart, Pencil, Play } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Cover } from "../../components/Cover";
import { Button, EmptyState, ErrorState, Progress, Select, Stars, StatusBadge, TagChip } from "../../components/ui";
import type { ReadStatus } from "../../lib/api";
import { formatSize } from "../../lib/format";
import { useCategoryColor, useContinueSeries, usePatchSeries, useSeries, useSetSeriesRead } from "../../lib/queries";
import { EditDrawer } from "./EditDrawer";
import { VolumeTable } from "./VolumeTable";

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-3 py-1.5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div aria-busy="true" aria-label="載入中" className="flex gap-8">
      <div className="aspect-[2/3] w-52 animate-pulse rounded-[4px] bg-rule/60" />
      <div className="flex-1 space-y-3 pt-2">
        <div className="h-6 w-1/3 animate-pulse rounded bg-rule/60" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-rule/40" />
        <div className="h-4 w-2/5 animate-pulse rounded bg-rule/40" />
      </div>
    </div>
  );
}

export function SeriesPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { data: s, isLoading, error, refetch } = useSeries(id);
  const color = useCategoryColor();
  const patch = usePatchSeries(id);
  const cont = useContinueSeries();
  const markAll = useSetSeriesRead(id);
  const [editing, setEditing] = useState(false);

  const back = (
    <button type="button" onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
      <ArrowLeft size={16} />
      返回
    </button>
  );

  if (isLoading) return <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{back}<HeaderSkeleton /></div>;
  if (error) return <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{back}<ErrorState error={error} onRetry={() => refetch()} /></div>;
  if (!s) return null;

  const tone = color(s.category_id);
  const nextLabel = s.read_count === 0 && s.reading_count === 0 ? "開始閱讀" : s.read_count === s.volume_count ? "從頭重看" : "繼續閱讀";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      {back}

      <section aria-labelledby="series-title" className="grid gap-6 md:grid-cols-[13rem_auto_1fr] md:gap-8">
        <Cover volumeId={s.cover_volume_id} title={s.title} tone={tone} eager className="w-40 md:w-52" />

        {/* The spine: title set vertically, like the back of a tankōbon */}
        <div className="hidden md:block">
          <h1 id="series-title" className="spine-title max-h-[19.5rem] border-l-[3px] pl-3 text-[2rem] text-ink" style={{ borderColor: tone }}>
            {s.title}
          </h1>
        </div>
        <h1 className="font-title -mt-2 text-2xl text-ink md:hidden">{s.title}</h1>

        <div className="min-w-0">
          {s.original_title && <p className="mb-2 text-sm text-muted">{s.original_title}</p>}
          <dl className="divide-y divide-rule border-y border-rule">
            <Meta label="作者">{s.author ?? <span className="text-muted">未知</span>}</Meta>
            <Meta label="出版社">{s.publisher ?? <span className="text-muted">未知</span>}</Meta>
            <Meta label="分類">
              <Link to={`/library?category_id=${s.category_id}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: tone }} />
                {s.category_name}
              </Link>
            </Meta>
            <Meta label="狀態">
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={s.status} />
                <span className="tabular">
                  擁有 {s.volume_count} 本{s.total_volumes ? `，全 ${s.total_volumes} 集` : ""}，{formatSize(s.total_size)}
                </span>
              </span>
            </Meta>
            <Meta label="評分">
              <Stars value={s.rating} size={14} onChange={(v) => patch.mutate({ rating: v })} />
            </Meta>
            {s.tags.length > 0 && (
              <Meta label="標籤">
                <span className="flex flex-wrap gap-1.5">
                  {s.tags.map((t) => (
                    <Link key={t.id} to={`/library?tag_id=${t.id}`}>
                      <TagChip tag={t} />
                    </Link>
                  ))}
                </span>
              </Meta>
            )}
          </dl>

          <div className="mt-4 space-y-1.5">
            <div className="tabular flex justify-between text-[13px] text-ink-2">
              <span>閱讀進度</span>
              <span>
                已讀 {s.read_count} / {s.volume_count}
              </span>
            </div>
            <Progress value={s.read_count} max={s.volume_count} label="閱讀進度" />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={<Play size={16} />} onClick={() => cont.mutate(s.id)} disabled={cont.isPending || s.volume_count === 0}>
              {nextLabel}
            </Button>
            <Button
              aria-pressed={s.is_favorite}
              icon={<Heart size={16} fill={s.is_favorite ? "currentColor" : "none"} className={s.is_favorite ? "text-[var(--cat-hk)]" : undefined} />}
              onClick={() => patch.mutate({ is_favorite: !s.is_favorite })}
            >
              {s.is_favorite ? "已收藏" : "收藏"}
            </Button>
            <Button icon={<Pencil size={15} />} onClick={() => setEditing(true)}>
              編輯資料
            </Button>
            <Select
              aria-label="將全部集數標記為"
              value=""
              onChange={(e) => e.target.value && markAll.mutate(e.target.value as ReadStatus)}
              className="h-9"
            >
              <option value="">全部標記為…</option>
              <option value="read">已讀</option>
              <option value="unread">未讀</option>
            </Select>
          </div>
        </div>
      </section>

      {(s.summary || s.notes) && (
        <section className="mt-8 grid gap-6 md:grid-cols-2">
          {s.summary && (
            <div>
              <h2 className="mb-1.5 text-sm font-medium text-ink">簡介</h2>
              <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line text-ink-2">{s.summary}</p>
            </div>
          )}
          {s.notes && (
            <div>
              <h2 className="mb-1.5 text-sm font-medium text-ink">備註</h2>
              <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line text-ink-2">{s.notes}</p>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="vol-heading" className="mt-10">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 id="vol-heading" className="font-title text-lg text-ink">
            集數
          </h2>
          <p className="truncate text-[12px] text-muted" title={s.rel_path}>
            {s.rel_path.replace(/\/\*.*$/, "")}
          </p>
        </div>
        {s.volumes.length ? (
          <VolumeTable series={s} />
        ) : (
          <EmptyState title="找不到此系列的檔案">檔案可能已被移動或刪除。重新掃描後會自動更新。</EmptyState>
        )}
      </section>

      <EditDrawer series={s} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
