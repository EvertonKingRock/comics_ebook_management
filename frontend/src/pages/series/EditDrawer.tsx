import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, IconButton, Input, Select, Stars } from "../../components/ui";
import type { SeriesDetail, SeriesStatus } from "../../lib/api";
import { STATUS_LABEL } from "../../lib/format";
import { usePatchSeries } from "../../lib/queries";
import { TagPicker } from "./TagPicker";

type OverrideKey = "title" | "original_title" | "author" | "publisher" | "status" | "total_volumes" | "summary";

interface FormState {
  title: string;
  original_title: string;
  author: string;
  publisher: string;
  status: string;
  total_volumes: string;
  summary: string;
  notes: string;
  rating: number | null;
  tag_ids: number[];
}

function initial(s: SeriesDetail): FormState {
  const o = s.overrides;
  return {
    title: o.title ?? "",
    original_title: o.original_title ?? "",
    author: o.author ?? "",
    publisher: o.publisher ?? "",
    status: o.status ?? "",
    total_volumes: o.total_volumes != null ? String(o.total_volumes) : "",
    summary: o.summary ?? "",
    notes: s.notes ?? "",
    rating: s.rating,
    tag_ids: s.tags.map((t) => t.id),
  };
}

export function EditDrawer({ series, open, onOpenChange }: { series: SeriesDetail; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [form, setForm] = useState<FormState>(() => initial(series));
  const patch = usePatchSeries(series.id);

  useEffect(() => {
    if (open) setForm(initial(series));
  }, [open, series]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const auto = series.auto;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = form.total_volumes.trim() ? Number(form.total_volumes) : null;
    patch.mutate(
      {
        title: form.title || null,
        original_title: form.original_title || null,
        author: form.author || null,
        publisher: form.publisher || null,
        status: form.status || null,
        total_volumes: Number.isFinite(n) ? n : null,
        summary: form.summary || null,
        notes: form.notes || null,
        rating: form.rating,
        tag_ids: form.tag_ids,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  /** Hint shown beside a label when the user has overridden the auto-parsed value. */
  const RevertHint = ({ k }: { k: OverrideKey }) =>
    form[k] ? (
      <button type="button" className="text-[12px] text-accent hover:underline" onClick={() => set(k, "")}>
        還原為自動值
      </button>
    ) : (
      <span className="text-[12px] text-muted">自動</span>
    );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35 data-[state=open]:animate-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-rule bg-surface shadow-[-12px_0_32px_-16px_rgba(20,30,50,0.35)] focus:outline-none"
        >
          <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
            <Dialog.Title className="font-title text-lg text-ink">編輯資料</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="關閉">
                <X size={18} />
              </IconButton>
            </Dialog.Close>
          </div>

          <form id="edit-series" onSubmit={submit} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <p className="rounded-md bg-surface-2 px-3 py-2 text-[12px] text-muted">
              欄位留空即使用從資料夾名稱自動解析的值。手動修改的內容在重新掃描後會保留。
            </p>
            <Field label="書名" htmlFor="f-title" hint={<RevertHint k="title" />}>
              <Input id="f-title" value={form.title} placeholder={auto.title ?? ""} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="原文書名" htmlFor="f-orig" hint={<RevertHint k="original_title" />}>
              <Input id="f-orig" value={form.original_title} placeholder="例如日文原名" onChange={(e) => set("original_title", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="作者" htmlFor="f-author" hint={<RevertHint k="author" />}>
                <Input id="f-author" value={form.author} placeholder={auto.author ?? "未知"} onChange={(e) => set("author", e.target.value)} />
              </Field>
              <Field label="出版社" htmlFor="f-pub" hint={<RevertHint k="publisher" />}>
                <Input id="f-pub" value={form.publisher} placeholder={auto.publisher ?? "未知"} onChange={(e) => set("publisher", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="完結狀態" htmlFor="f-status" hint={<RevertHint k="status" />}>
                <Select id="f-status" value={form.status} onChange={(e) => set("status", e.target.value)} className="h-9 w-full text-sm">
                  <option value="">自動（{STATUS_LABEL[(auto.status ?? "unknown") as SeriesStatus]}）</option>
                  <option value="ongoing">連載中</option>
                  <option value="finished">已完結</option>
                  <option value="stopped">停刊</option>
                  <option value="unknown">未知</option>
                </Select>
              </Field>
              <Field label="總集數" htmlFor="f-total" hint={<RevertHint k="total_volumes" />}>
                <Input
                  id="f-total"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.total_volumes}
                  placeholder={auto.total_volumes != null ? String(auto.total_volumes) : `目前擁有 ${series.volume_count}`}
                  onChange={(e) => set("total_volumes", e.target.value)}
                />
              </Field>
            </div>
            <Field label="評分" htmlFor="f-rating">
              <div id="f-rating">
                <Stars value={form.rating} onChange={(v) => set("rating", v)} />
              </div>
            </Field>
            <Field label="標籤" htmlFor="f-tags">
              <TagPicker id="f-tags" value={form.tag_ids} onChange={(ids) => set("tag_ids", ids)} />
            </Field>
            <Field label="簡介" htmlFor="f-summary" hint={<RevertHint k="summary" />}>
              <textarea
                id="f-summary"
                rows={4}
                value={form.summary}
                placeholder={auto.summary ?? "故事簡介"}
                onChange={(e) => set("summary", e.target.value)}
                className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/80 focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
              />
            </Field>
            <Field label="備註" htmlFor="f-notes">
              <textarea
                id="f-notes"
                rows={3}
                value={form.notes}
                placeholder="例如：缺第 11 集、想補完全版"
                onChange={(e) => set("notes", e.target.value)}
                className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/80 focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
              />
            </Field>
          </form>

          <div className="flex justify-end gap-2 border-t border-rule px-5 py-3">
            <Dialog.Close asChild>
              <Button variant="ghost">取消</Button>
            </Dialog.Close>
            <Button type="submit" form="edit-series" variant="primary" disabled={patch.isPending}>
              {patch.isPending ? "儲存中…" : "儲存變更"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
