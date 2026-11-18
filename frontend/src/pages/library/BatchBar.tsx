import { X } from "lucide-react";
import { useState } from "react";
import { Button, IconButton, Select } from "../../components/ui";
import { useBatchSeries, useTags } from "../../lib/queries";

export function BatchBar({ ids, onClear, onDone }: { ids: number[]; onClear: () => void; onDone: () => void }) {
  const batch = useBatchSeries();
  const { data: tags } = useTags();
  const [tagId, setTagId] = useState("");
  const run = (body: Record<string, unknown>) => batch.mutate({ ids, ...body }, { onSuccess: onDone });
  const disabled = ids.length === 0 || batch.isPending;

  return (
    <div
      role="toolbar"
      aria-label="批次編輯"
      className="sticky bottom-4 z-20 mx-auto mt-6 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg border border-rule-strong bg-surface px-3 py-2 shadow-[0_8px_24px_-12px_rgba(20,30,50,0.35)]"
    >
      <span className="tabular px-1 text-[13px] text-ink">已選 {ids.length} 個系列</span>
      <span className="h-5 w-px bg-rule" aria-hidden />
      <Button size="sm" disabled={disabled} onClick={() => run({ is_favorite: true })}>
        加入收藏
      </Button>
      <Button size="sm" disabled={disabled} onClick={() => run({ is_favorite: false })}>
        取消收藏
      </Button>
      <Select
        aria-label="標記閱讀狀態"
        disabled={disabled}
        value=""
        onChange={(e) => e.target.value && run({ read_status: e.target.value })}
      >
        <option value="">標記為…</option>
        <option value="read">全部已讀</option>
        <option value="unread">全部未讀</option>
      </Select>
      <Select aria-label="設定完結狀態" disabled={disabled} value="" onChange={(e) => e.target.value && run({ status: e.target.value })}>
        <option value="">設定狀態…</option>
        <option value="ongoing">連載中</option>
        <option value="finished">已完結</option>
        <option value="stopped">停刊</option>
      </Select>
      <div className="flex items-center gap-1">
        <Select aria-label="選擇標籤" value={tagId} onChange={(e) => setTagId(e.target.value)} disabled={!tags?.length}>
          <option value="">{tags?.length ? "選擇標籤…" : "尚未建立標籤"}</option>
          {tags?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Button size="sm" disabled={disabled || !tagId} onClick={() => run({ add_tag_ids: [Number(tagId)] })}>
          加標籤
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled || !tagId} onClick={() => run({ remove_tag_ids: [Number(tagId)] })}>
          移除
        </Button>
      </div>
      <IconButton label="結束批次編輯" onClick={onClear}>
        <X size={16} />
      </IconButton>
    </div>
  );
}
