import { BookX, FolderSearch } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, ErrorState } from "../../components/ui";
import { formatCount } from "../../lib/format";
import { useCategories, useSeriesList, useTags, type SeriesFilters } from "../../lib/queries";
import { BatchBar } from "./BatchBar";
import { FilterBar, type View } from "./FilterBar";
import { SeriesGrid } from "./SeriesGrid";
import { SeriesTable } from "./SeriesTable";

const VIEW_KEY = "comics-view";
const FILTER_KEYS = ["category_id", "q", "status", "read", "favorite", "tag_id", "format", "sort", "order"] as const;

function GridSkeleton() {
  return (
    <div aria-busy="true" aria-label="載入中" className="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-x-5 gap-y-7">
      {Array.from({ length: 18 }, (_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] animate-pulse rounded-[4px] bg-rule/60" />
          <div className="mt-2 h-3.5 w-3/4 animate-pulse rounded bg-rule/60" />
          <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-rule/40" />
        </div>
      ))}
    </div>
  );
}

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { data: cats } = useCategories();
  const { data: tags } = useTags();

  const filters = useMemo(() => {
    const f: SeriesFilters = {};
    FILTER_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) f[k] = v;
    });
    if (f.sort && !f.order) f.order = ["added", "recent", "rating", "volumes", "size"].includes(f.sort) ? "desc" : "asc";
    return f;
  }, [params]);

  const query = useSeriesList(filters);
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  // Clear the selection whenever filters change or selection mode ends.
  useEffect(() => setSelected(new Set()), [params, selecting]);

  // Infinite scroll
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
    }, { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const cat = cats?.find((c) => String(c.id) === filters.category_id);
  const tag = tags?.find((t) => String(t.id) === filters.tag_id);
  const heading = filters.favorite === "true" ? "我的收藏" : cat ? cat.display_name : "全部漫畫";
  const hasFilters = ["q", "status", "read", "format", "tag_id"].some((k) => params.get(k));

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-title text-2xl text-ink">{heading}</h1>
        <p className="tabular text-sm text-muted" aria-live="polite">
          {query.isLoading ? "載入中…" : `${formatCount(total)} 個系列`}
          {filters.q && `，符合「${filters.q}」`}
          {tag && `，標籤「${tag.name}」`}
        </p>
      </div>

      <div className="mb-6">
        <FilterBar params={params} set={set} view={view} onView={changeView} selecting={selecting} onSelecting={setSelecting} />
      </div>

      {query.isLoading ? (
        <GridSkeleton />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        hasFilters || filters.favorite ? (
          <EmptyState icon={<BookX size={36} strokeWidth={1.5} />} title={filters.favorite ? "還沒有收藏任何漫畫" : "沒有符合條件的漫畫"}>
            {filters.favorite ? "在系列頁面按「收藏」，就會出現在這裡。" : "試試其他關鍵字，或清除篩選條件。"}
          </EmptyState>
        ) : (
          <EmptyState icon={<FolderSearch size={36} strokeWidth={1.5} />} title="書庫是空的">
            <p>
              請到 <Link to="/settings" className="text-accent underline">設定與掃描</Link> 確認漫畫資料夾路徑，然後執行掃描。
            </p>
          </EmptyState>
        )
      ) : view === "grid" ? (
        <SeriesGrid items={items} selecting={selecting} selected={selected} onToggle={toggle} />
      ) : (
        <SeriesTable
          items={items}
          selecting={selecting}
          selected={selected}
          onToggle={toggle}
          onToggleAll={(all) => setSelected(all ? new Set(items.map((i) => i.id)) : new Set())}
        />
      )}

      <div ref={sentinel} className="h-px" />
      {query.isFetchingNextPage && <p className="py-6 text-center text-sm text-muted">載入更多…</p>}

      {selecting && <BatchBar ids={[...selected]} onClear={() => setSelecting(false)} onDone={() => setSelected(new Set())} />}
    </div>
  );
}
