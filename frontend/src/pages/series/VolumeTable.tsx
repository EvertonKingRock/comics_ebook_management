import { FolderOpen, ImageIcon, Play } from "lucide-react";
import { IconButton, ReadMark } from "../../components/ui";
import type { SeriesDetail, Volume } from "../../lib/api";
import { cx, formatSize, READ_CYCLE, READ_LABEL, relativeTime } from "../../lib/format";
import { useOpenVolume, usePatchSeries, useRevealVolume, useSetVolumeRead } from "../../lib/queries";

export function VolumeTable({ series }: { series: SeriesDetail }) {
  const open = useOpenVolume();
  const reveal = useRevealVolume();
  const setRead = useSetVolumeRead(series.id);
  const patch = usePatchSeries(series.id);
  const coverId = series.cover_volume_id;
  const showPath = series.volumes.some((v) => v.sub_path !== v.file_name);

  const openVol = (v: Volume) => open.mutate(v.id);

  return (
    <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <caption className="sr-only">集數列表，雙擊或按 Enter 以 SumatraPDF 開啟</caption>
        <thead className="border-b border-rule text-[12px] text-muted">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
            <th className="w-28">集數</th>
            <th>檔案</th>
            <th className="w-16">格式</th>
            <th className="w-20 text-right">大小</th>
            <th className="w-28">狀態</th>
            <th className="w-28">上次開啟</th>
            <th className="w-28 text-right">
              <span className="sr-only">操作</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {series.volumes.map((v) => (
            <tr
              key={v.id}
              tabIndex={0}
              onDoubleClick={() => openVol(v)}
              onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && openVol(v)}
              title="雙擊以 SumatraPDF 開啟"
              className={cx(
                "group border-b border-rule last:border-0 select-none hover:bg-surface-2 focus-visible:bg-surface-2 [&>td]:px-3 [&>td]:py-2",
                v.read_status === "read" && "text-muted",
              )}
            >
              <td className="tabular font-medium whitespace-nowrap text-ink">{v.volume_label || "—"}</td>
              <td className="max-w-0">
                <div className="truncate" title={v.rel_path}>
                  {showPath ? v.sub_path : v.file_name}
                </div>
              </td>
              <td className="text-[12px] text-muted uppercase">{v.ext}</td>
              <td className="tabular text-right whitespace-nowrap text-muted">{formatSize(v.size_bytes)}</td>
              <td>
                <button
                  type="button"
                  onClick={() => setRead.mutate({ volumeId: v.id, status: READ_CYCLE[v.read_status] })}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="rounded px-1 py-0.5 hover:bg-surface"
                  title={`點擊改為「${READ_LABEL[READ_CYCLE[v.read_status]]}」`}
                >
                  <ReadMark status={v.read_status} />
                </button>
              </td>
              <td className="whitespace-nowrap text-[12px] text-muted">{v.last_opened_at ? relativeTime(v.last_opened_at) : "—"}</td>
              <td>
                <div className="flex justify-end gap-0.5 opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
                  <IconButton label="以 SumatraPDF 開啟" onClick={() => openVol(v)} className="text-accent">
                    <Play size={15} />
                  </IconButton>
                  <IconButton label="在檔案總管中顯示" onClick={() => reveal.mutate(v.id)}>
                    <FolderOpen size={15} />
                  </IconButton>
                  <IconButton
                    label={coverId === v.id ? "目前的封面" : "設為系列封面"}
                    onClick={() => patch.mutate({ cover_volume_id: v.id })}
                    disabled={coverId === v.id}
                    className={coverId === v.id ? "text-accent" : undefined}
                  >
                    <ImageIcon size={15} />
                  </IconButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
