import { BookOpen, Heart, LayoutDashboard, Library, Loader2, Menu, Monitor, Moon, RefreshCw, Search, Settings, Sun, Tags, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { categoryColor, cx, formatCount, relativeTime } from "../lib/format";
import { useCategories, useScanStatus, useStartScan, useStats } from "../lib/queries";
import { useTheme, type ThemePref } from "../lib/theme";
import { Input } from "./ui";

function NavItem({ to, icon, children, count, end, active }: { to: string; icon: ReactNode; children: ReactNode; count?: number; end?: boolean; active?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          "group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
          (active ?? isActive) ? "bg-surface font-medium text-ink shadow-[inset_0_0_0_1px_var(--rule)]" : "text-ink-2 hover:bg-surface/60 hover:text-ink",
        )
      }
    >
      <span className="flex w-4 justify-center text-muted group-hover:text-ink">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {count != null && <span className="tabular text-[12px] text-muted">{formatCount(count)}</span>}
    </NavLink>
  );
}

function ScanIndicator() {
  const { data } = useScanStatus();
  const { data: stats } = useStats();
  const scan = useStartScan();
  if (data?.running) {
    const pct = data.total ? Math.round((data.processed / data.total) * 100) : null;
    return (
      <div className="flex items-center gap-2 text-[12px] text-ink-2" role="status">
        <Loader2 size={14} className="animate-spin text-accent" />
        <span className="truncate">{data.phase === "walking" ? `掃描中… 已找到 ${formatCount(data.found)} 本` : `更新資料庫 ${pct ?? 0}%`}</span>
      </div>
    );
  }
  if (data?.covers.running) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-ink-2" role="status">
        <Loader2 size={14} className="animate-spin text-accent" />
        <span className="truncate">
          產生封面 {data.covers.done}/{data.covers.total}
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => scan.mutate("incremental")}
      className="flex w-full items-center gap-2 rounded-md text-left text-[12px] text-muted hover:text-ink"
      title="掃描漫畫資料夾，加入新檔案"
    >
      <RefreshCw size={14} />
      <span className="truncate">{stats?.last_scan ? `上次掃描：${relativeTime(stats.last_scan.finished_at)}` : "立即掃描"}</span>
    </button>
  );
}

const THEME_ICONS: Record<ThemePref, ReactNode> = { light: <Sun size={14} />, dark: <Moon size={14} />, system: <Monitor size={14} /> };
const THEME_LABEL: Record<ThemePref, string> = { light: "淺色", dark: "深色", system: "跟隨系統" };

function ThemeSwitch() {
  const [pref, setPref] = useTheme();
  return (
    <div role="radiogroup" aria-label="外觀" className="flex rounded-md border border-rule p-0.5">
      {(["light", "dark", "system"] as ThemePref[]).map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={pref === p}
          aria-label={THEME_LABEL[p]}
          title={THEME_LABEL[p]}
          onClick={() => setPref(p)}
          className={cx("flex h-6 flex-1 items-center justify-center rounded", pref === p ? "bg-surface text-ink" : "text-muted hover:text-ink")}
        >
          {THEME_ICONS[p]}
        </button>
      ))}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { data: cats } = useCategories();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const inLibrary = pathname === "/library";
  const catParam = params.get("category_id");
  const favParam = params.get("favorite");
  const total = cats?.reduce((a, c) => a + c.series_count, 0);

  return (
    <nav aria-label="主要導覽" className="flex h-full flex-col gap-6 px-3 py-4" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate?.()}>
      <div className="flex items-center gap-2.5 px-2.5">
        <span aria-hidden className="flex h-7 items-end gap-[3px]">
          <span className="h-7 w-2 rounded-[2px]" style={{ background: "var(--cat-hk)" }} />
          <span className="h-6 w-1.5 rounded-[2px]" style={{ background: "var(--cat-jp)" }} />
          <span className="h-5 w-1.5 rotate-[-10deg] rounded-[2px]" style={{ background: "var(--cat-tw)" }} />
        </span>
        <span className="font-title text-lg tracking-wide text-ink">漫畫書庫</span>
      </div>

      <div className="space-y-0.5">
        <NavItem to="/" end icon={<LayoutDashboard size={16} />}>
          總覽
        </NavItem>
        <NavItem to="/library" icon={<Library size={16} />} count={total} active={inLibrary && !catParam && !favParam}>
          全部漫畫
        </NavItem>
        <NavItem to="/library?favorite=true" icon={<Heart size={16} />} active={inLibrary && favParam === "true"}>
          我的收藏
        </NavItem>
      </div>

      <div>
        <h2 className="mb-1.5 px-2.5 text-[12px] text-muted">分類</h2>
        <div className="space-y-0.5">
          {cats?.map((c) => (
            <NavItem
              key={c.id}
              to={`/library?category_id=${c.id}`}
              count={c.series_count}
              active={inLibrary && catParam === String(c.id)}
              icon={<span className="h-2.5 w-2.5 rounded-full" style={{ background: categoryColor(c.sort_order) }} />}
            >
              {c.display_name}
            </NavItem>
          ))}
        </div>
      </div>

      <div className="space-y-0.5">
        <NavItem to="/tags" icon={<Tags size={16} />}>
          標籤
        </NavItem>
        <NavItem to="/settings" icon={<Settings size={16} />}>
          設定與掃描
        </NavItem>
      </div>

      <div className="mt-auto space-y-3 px-2.5">
        <ScanIndicator />
        <ThemeSwitch />
      </div>
    </nav>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const urlQ = pathname === "/library" ? (params.get("q") ?? "") : "";
  const [value, setValue] = useState(urlQ);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setValue(urlQ), [urlQ]);

  // Debounced: update ?q= on the library page.
  useEffect(() => {
    if (value === urlQ) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(pathname === "/library" ? params : undefined);
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      navigate(`/library?${next}`, { replace: pathname === "/library" });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // '/' focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative w-full max-w-xl">
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <Input
        ref={ref}
        type="search"
        aria-label="搜尋漫畫"
        placeholder="搜尋書名、作者、出版社或標籤"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setValue("")}
        className="pl-9 pr-10"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-rule px-1.5 text-[11px] text-muted sm:block">/</kbd>
    </div>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 border-r border-rule bg-paper lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-rule bg-paper">
            <button type="button" onClick={() => setOpen(false)} aria-label="關閉選單" className="absolute top-4 right-3 rounded p-1 text-muted hover:text-ink">
              <X size={18} />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-surface px-4 lg:px-6">
          <button type="button" onClick={() => setOpen(true)} aria-label="開啟選單" className="rounded p-1.5 text-ink-2 hover:bg-surface-2 lg:hidden">
            <Menu size={18} />
          </button>
          <GlobalSearch />
          <div className="ml-auto hidden items-center gap-1.5 text-[12px] text-muted md:flex">
            <BookOpen size={14} />
            雙擊集數即以 SumatraPDF 開啟
          </div>
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
