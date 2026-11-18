import { CheckCircle2, Download, ImageIcon, Loader2, RefreshCw, ScanSearch, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Progress } from "../components/ui";
import { formatCount, formatDateTime, formatSize } from "../lib/format";
import { useAppSettings, useRebuildCovers, useScanLogs, useScanStatus, useStartScan } from "../lib/queries";

function Check({ ok, okText = "正常", badText }: { ok: boolean; okText?: string; badText: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-[13px] text-ok">
      <CheckCircle2 size={14} /> {okText}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[13px] text-danger">
      <XCircle size={14} /> {badText}
    </span>
  );
}

function Row({ k, label, children, status }: { k: string; label: string; children: ReactNode; status?: ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr_auto] sm:items-center sm:gap-4">
      <div>
        <div className="text-[13px] text-ink">{label}</div>
        <code className="text-[11px] text-muted">{k}</code>
      </div>
      <div className="min-w-0 truncate text-[13px] text-ink-2">{children}</div>
      <div>{status}</div>
    </div>
  );
}

export function SettingsPage() {
  const { data: cfg } = useAppSettings();
  const { data: scan } = useScanStatus();
  const { data: logs } = useScanLogs();
  const start = useStartScan();
  const rebuild = useRebuildCovers();
  const busy = !!scan?.running;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 lg:px-8">
      <h1 className="font-title text-2xl text-ink">設定與掃描</h1>

      <section aria-labelledby="scan-h" className="rounded-lg border border-rule bg-surface p-5">
        <h2 id="scan-h" className="text-[15px] font-medium text-ink">掃描漫畫資料夾</h2>
        <p className="mt-1 mb-4 text-[13px] text-muted">
          「快速掃描」加入新檔案並標記已移除的檔案；「完整掃描」另外重新解析所有集數名稱。兩者都不會覆蓋你手動修改的資料，也不會改動任何漫畫檔案。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} disabled={busy} onClick={() => start.mutate("incremental")}>
            快速掃描
          </Button>
          <Button icon={<ScanSearch size={16} />} disabled={busy} onClick={() => start.mutate("full")}>
            完整掃描
          </Button>
          <Button icon={<ImageIcon size={16} />} disabled={scan?.covers.running} onClick={() => rebuild.mutate(true)}>
            重試失敗的封面
          </Button>
          <Button
            variant="ghost"
            disabled={scan?.covers.running}
            onClick={() => confirm("刪除所有封面快取並重新產生？需要一些時間。") && rebuild.mutate(false)}
          >
            重建全部封面
          </Button>
          <a href="/api/export.csv" className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-rule-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-2">
            <Download size={16} /> 匯出書目（CSV）
          </a>
        </div>

        {(busy || scan?.covers.running) && (
          <div className="mt-4 space-y-1.5" role="status" aria-live="polite">
            <div className="flex justify-between text-[13px] text-ink-2">
              <span>{busy ? scan?.message : "產生系列封面中"}</span>
              <span className="tabular text-muted">
                {busy ? (scan?.phase === "walking" ? `已找到 ${formatCount(scan.found)} 本` : `${scan?.processed} / ${scan?.total}`) : `${scan?.covers.done} / ${scan?.covers.total}`}
              </span>
            </div>
            <Progress
              value={busy ? (scan?.phase === "walking" ? 0 : scan!.processed) : scan!.covers.done}
              max={busy ? Math.max(1, scan!.total) : Math.max(1, scan!.covers.total)}
              label="進度"
            />
          </div>
        )}
      </section>

      <section aria-labelledby="cfg-h">
        <h2 id="cfg-h" className="mb-1 text-[15px] font-medium text-ink">目前設定</h2>
        <p className="mb-3 text-[13px] text-muted">
          這些值來自專案根目錄的 <code>.env</code> 檔。修改後請重新啟動 <code>start.bat</code>，再執行掃描。更換磁碟機時只需修改 <code>COMICS_ROOT</code>，閱讀紀錄與評分會保留。
        </p>
        {cfg && (
          <div className="divide-y divide-rule rounded-lg border border-rule bg-surface">
            <Row k="COMICS_ROOT" label="漫畫資料夾" status={<Check ok={cfg.comics_root_ok} badText="找不到資料夾" />}>
              {cfg.comics_root}
            </Row>
            <Row k="SUMATRA_PATH" label="SumatraPDF" status={<Check ok={cfg.sumatra_ok} badText="找不到程式" />}>
              {cfg.sumatra_path || "未設定"}
            </Row>
            <Row k="SEVENZIP_PATH" label="7-Zip（RAR／7Z 封面）" status={<Check ok={cfg.sevenzip_ok} badText="未安裝，部分封面無法顯示" />}>
              {cfg.sevenzip_path || "未設定"}
            </Row>
            <Row k="CATEGORY_MAP" label="分類">
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                {cfg.categories.map((c) => (
                  <span key={c.folder_name} className={c.exists ? "" : "text-danger"} title={c.exists ? undefined : "資料夾不存在"}>
                    {c.folder_name} → {c.display_name}
                  </span>
                ))}
              </span>
            </Row>
            {cfg.unmapped_folders.length > 0 && (
              <Row k="—" label="未納入的資料夾">
                <span className="text-muted">{cfg.unmapped_folders.join("、")}（如需管理，請加入 CATEGORY_MAP）</span>
              </Row>
            )}
            <Row k="FILE_TYPES" label="檔案格式">
              {cfg.file_types.map((t) => t.toUpperCase()).join("、")}
            </Row>
            <Row k="PORT" label="網址">
              http://127.0.0.1:{cfg.port}
            </Row>
            <Row k="SCAN_ON_STARTUP" label="啟動時自動掃描">
              {cfg.scan_on_startup ? "是" : "否"}
            </Row>
            <Row k="data/" label="資料庫">
              {formatSize(cfg.db_size)}，封面快取 {formatCount(cfg.cover_count)} 張
            </Row>
          </div>
        )}
      </section>

      <section aria-labelledby="log-h">
        <h2 id="log-h" className="mb-3 text-[15px] font-medium text-ink">掃描紀錄</h2>
        <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="border-b border-rule text-[12px] text-muted">
              <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:font-normal">
                <th>時間</th>
                <th>方式</th>
                <th className="text-right">新增</th>
                <th className="text-right">更新</th>
                <th className="text-right">遺失</th>
                <th>結果</th>
              </tr>
            </thead>
            <tbody>
              {logs?.map((l) => (
                <tr key={l.id} className="border-b border-rule last:border-0 [&>td]:px-4 [&>td]:py-2">
                  <td className="tabular whitespace-nowrap">{formatDateTime(l.started_at)}</td>
                  <td>{l.mode === "full" ? "完整" : "快速"}</td>
                  <td className="tabular text-right">{formatCount(l.added)}</td>
                  <td className="tabular text-right">{formatCount(l.updated)}</td>
                  <td className="tabular text-right">{formatCount(l.missing)}</td>
                  <td className={l.message && l.message !== "完成" ? "text-danger" : "text-muted"}>{l.finished_at ? l.message : "進行中…"}</td>
                </tr>
              ))}
              {!logs?.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    尚無紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
