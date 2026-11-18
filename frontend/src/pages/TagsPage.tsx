import { Merge, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, EmptyState, IconButton, Input, Select, TAG_COLORS, TagChip } from "../components/ui";
import type { Tag } from "../lib/api";
import { useTagMutations, useTags } from "../lib/queries";

function ColorSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <Select id={id} aria-label="顏色" value={value} onChange={(e) => onChange(e.target.value)} className="h-9">
      {Object.entries(TAG_COLORS).map(([k, c]) => (
        <option key={k} value={k}>
          {c.label}
        </option>
      ))}
    </Select>
  );
}

function TagRow({ tag, all }: { tag: Tag; all: Tag[] }) {
  const { update, remove, merge } = useTagMutations();
  const [mode, setMode] = useState<"view" | "edit" | "merge">("view");
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [into, setInto] = useState("");

  const save = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({ id: tag.id, name, color }, { onSuccess: () => setMode("view") });
  };

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      {mode === "edit" ? (
        <form onSubmit={save} className="flex flex-1 flex-wrap items-center gap-2">
          <Input aria-label="標籤名稱" value={name} onChange={(e) => setName(e.target.value)} className="max-w-56" autoFocus />
          <ColorSelect value={color} onChange={setColor} />
          <Button size="sm" type="submit" variant="primary">
            儲存
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("view")}>
            取消
          </Button>
        </form>
      ) : mode === "merge" ? (
        <div className="flex flex-1 flex-wrap items-center gap-2 text-[13px]">
          把「{tag.name}」合併到
          <Select aria-label="合併到" value={into} onChange={(e) => setInto(e.target.value)} className="h-9">
            <option value="">選擇標籤…</option>
            {all.filter((t) => t.id !== tag.id).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="primary" disabled={!into} onClick={() => merge.mutate({ id: tag.id, into: Number(into) })}>
            合併
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("view")}>
            取消
          </Button>
        </div>
      ) : (
        <>
          <Link to={`/library?tag_id=${tag.id}`} className="flex-1">
            <TagChip tag={tag} />
          </Link>
          <span className="tabular text-[13px] text-muted">{tag.series_count} 個系列</span>
          <div className="flex gap-0.5">
            <IconButton label="重新命名" onClick={() => setMode("edit")}>
              <Pencil size={15} />
            </IconButton>
            <IconButton label="合併到其他標籤" onClick={() => setMode("merge")} disabled={all.length < 2}>
              <Merge size={15} />
            </IconButton>
            <IconButton
              label="刪除標籤"
              className="hover:text-danger"
              onClick={() => {
                if (confirm(`確定刪除標籤「${tag.name}」？系列本身不會被刪除。`)) remove.mutate(tag.id);
              }}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        </>
      )}
    </li>
  );
}

export function TagsPage() {
  const { data: tags = [], isLoading } = useTags();
  const { create } = useTagMutations();
  const [name, setName] = useState("");
  const [color, setColor] = useState("slate");

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), color }, { onSuccess: () => setName("") });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8">
      <h1 className="font-title mb-1 text-2xl text-ink">標籤</h1>
      <p className="mb-6 text-sm text-muted">用標籤整理題材或版本，例如：少年、武俠、運動、愛藏版。</p>

      <form onSubmit={add} className="mb-6 flex flex-wrap items-center gap-2">
        <Input aria-label="新標籤名稱" placeholder="新標籤名稱" value={name} onChange={(e) => setName(e.target.value)} className="max-w-64" />
        <ColorSelect value={color} onChange={setColor} />
        <Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={!name.trim() || create.isPending}>
          新增標籤
        </Button>
      </form>

      {isLoading ? null : tags.length === 0 ? (
        <EmptyState icon={<Tags size={36} strokeWidth={1.5} />} title="還沒有標籤">
          在上方新增，或在系列的「編輯資料」中直接輸入。
        </EmptyState>
      ) : (
        <ul className="divide-y divide-rule rounded-lg border border-rule bg-surface">
          {tags.map((t) => (
            <TagRow key={t.id} tag={t} all={tags} />
          ))}
        </ul>
      )}
    </div>
  );
}
