import { AlertTriangle, BookOpen, ImageOff, Tag, UserX } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Cover } from "../components/Cover";
import { EmptyState, ErrorState } from "../components/ui";
import type { Stats } from "../lib/api";
import { categoryColor, formatCount, formatDateTime, formatSize, relativeTime } from "../lib/format";
import { useCategoryColor, useStats } from "../lib/queries";

function Panel({ title, children, className, aside }: { title: string; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={`rounded-lg border border-rule bg-surface p-5 ${className ?? ""}`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Figures({ t }: { t: Stats["totals"] }) {
  const pct = t.volumes ? Math.round((t.read / t.volumes) * 100) : 0;
  const items: [string, string, string?][] = [
    ["系列", formatCount(t.series)],
    ["檔案", formatCount(t.volumes)],
    ["總容量", formatSize(t.size)],
    ["已讀", `${pct}%`, `${formatCount(t.read)} / ${formatCount(t.volumes)} 本`],
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-rule bg-surface md:grid-cols-4">
      {items.map(([label, value, sub], i) => (
        <div key={label} className={`px-5 py-4 ${i % 2 ? "border-l" : ""} ${i >= 2 ? "border-t md:border-t-0" : ""} md:border-l md:first:border-l-0 border-rule`}>
          <dt className="text-[13px] text-muted">{label}</dt>
          <dd className="tabular mt-1 text-[28px] leading-none font-semibold tracking-tight text-ink">{value}</dd>
          {sub && <dd className="tabular mt-1.5 text-[12px] text-muted">{sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Horizontal bars on one shared scale; each bar wears its category ink, values are direct-labelled in text ink. */
function CategoryBars({ rows }: { rows: Stats["by_category"] }) {
  const max = Math.max(1, ...rows.map((r) => r.volumes));
  return (
    <ul className="space-y-3.5">
      {rows.map((r, i) => (
        <li key={r.id} className="group">
          <Link to={`/library?category_id=${r.id}`} className="block rounded focus-visible:outline-offset-4">
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-medium text-ink group-hover:text-accent">{r.name}</span>
              <span className="tabular text-muted">
                {formatCount(r.series)} 系列，{formatCount(r.volumes)} 本，{formatSize(r.size)}
              </span>
            </div>
            <div className="h-2.5 rounded-r-[4px] bg-surface-2" title={`${r.name}：${r.volumes} 本，已讀 ${r.read} 本`}>
              <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(r.volumes ? 0.6 : 0, (r.volumes / max) * 100)}%`, background: categoryColor(i) }} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ReadingBar({ t }: { t: Stats["totals"] }) {
  const segs = [
    { key: "read", label: "已讀", n: t.read, color: "var(--ok)" },
    { key: "reading", label: "閱讀中", n: t.reading, color: "var(--accent)" },
    { key: "unread", label: "未讀", n: t.unread, color: "var(--rule-strong)" },
  ];
  const total = Math.max(1, t.volumes);
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={segs.map((s) => `${s.label} ${s.n} 本`).join("，")}>
        {segs.filter((s) => s.n > 0).map((s) => (
          <div key={s.key} title={`${s.label}：${s.n.toLocaleString()} 本`} style={{ width: `${(s.n / total) * 100}%`, background: s.color, minWidth: 3 }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {segs.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-ink-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
            {s.label}
            <span className="tabular text-muted">{formatCount(s.n)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormatList({ rows }: { rows: Stats["formats"] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.ext}>
          <Link to={`/library?format=${r.ext}`} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 text-[13px] hover:text-accent">
            <span className="font-medium uppercase">{r.ext}</span>
            <span className="h-2 rounded-r-[4px] bg-surface-2">
              <span className="block h-full rounded-r-[4px] bg-accent/70" style={{ width: `${Math.max(1, (r.count / max) * 100)}%` }} />
            </span>
            <span className="tabular w-24 text-right text-muted">
              {formatCount(r.count)}，{formatSize(r.size)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Quality({ q }: { q: Stats["quality"] }) {
  const rows = [
    { icon: <UserX size={15} />, label: "缺少作者的系列", n: q.missing_author, to: "/library?sort=author&order=desc" },
    { icon: <Tag size={15} />, label: "尚未加標籤的系列", n: q.untagged },
    { icon: <ImageOff size={15} />, label: "無法擷取封面的檔案", n: q.cover_failed, hint: "多為加密壓縮檔或 MOBI" },
    { icon: <AlertTriangle size={15} />, label: "找不到的檔案", n: q.missing_files, hint: "檔案已移動或刪除" },
  ];
  return (
    <ul className="divide-y divide-rule">
      {rows.map((r) => {
        const body = (
          <>
            <span className="text-muted">{r.icon}</span>
            <span className="flex-1">
              {r.label}
              {r.hint && <span className="block text-[12px] text-muted">{r.hint}</span>}
            </span>
            <span className="tabular font-medium">{formatCount(r.n)}</span>
          </>
        );
        return (
          <li key={r.label}>
            {r.to ? (
              <Link to={r.to} className="flex items-center gap-3 py-2 text-[13px] text-ink-2 hover:text-accent">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 py-2 text-[13px] text-ink-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardPage() {
  const { data, isLoading, error, refetch } = useStats();
  const color = useCategoryColor();

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:px-8" aria-busy="true" aria-label="載入中">
        <div className="h-8 w-32 animate-pulse rounded bg-rule/60" />
        <div className="h-24 animate-pulse rounded-lg bg-rule/40" />
        <div className="h-64 animate-pulse rounded-lg bg-rule/30" />
      </div>
    );
  }

  if (data.totals.volumes === 0) {
    return (
      <EmptyState icon={<BookOpen size={36} strokeWidth={1.5} />} title="書庫還沒有任何漫畫">
        <p>
          第一次使用時系統會自動掃描。若沒有結果，請到 <Link to="/settings" className="text-accent underline">設定與掃描</Link> 檢查漫畫資料夾路徑。
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-title text-2xl text-ink">總覽</h1>
        {data.last_scan && <p className="text-[13px] text-muted">上次掃描：{formatDateTime(data.last_scan.finished_at)}</p>}
      </div>

      <Figures t={data.totals} />

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Panel title="各分類收藏">
            <CategoryBars rows={data.by_category} />
          </Panel>
          <Panel title="閱讀進度">
            <ReadingBar t={data.totals} />
          </Panel>
          <Panel title="最近加入" aside={<Link to="/library?sort=added" className="text-[13px] text-accent hover:underline">查看全部</Link>}>
            <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
              {data.recent_added.slice(0, 12).map((s) => (
                <li key={s.id}>
                  <Link to={`/series/${s.id}`} className="group block">
                    <Cover volumeId={s.cover_volume_id} title={s.title} tone={color(s.category_id)} />
                    <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-ink-2 group-hover:text-accent">{s.title}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="最近閱讀">
            {data.recent_read.length ? (
              <ul className="space-y-2.5">
                {data.recent_read.map((v) => (
                  <li key={v.id}>
                    <Link to={`/series/${v.series_id}`} className="block text-[13px] hover:text-accent">
                      <span className="block truncate font-medium text-ink">{v.series_title}</span>
                      <span className="tabular text-[12px] text-muted">
                        {v.volume_label}，{relativeTime(v.last_opened_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">開啟任何一集後，會記錄在這裡。</p>
            )}
          </Panel>
          <Panel title="檔案格式">
            <FormatList rows={data.formats} />
          </Panel>
          <Panel title="資料整理">
            <Quality q={data.quality} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
