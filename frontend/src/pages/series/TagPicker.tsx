import { useState, type KeyboardEvent } from "react";
import { Input, TagChip } from "../../components/ui";
import { useTagMutations, useTags } from "../../lib/queries";

/** Selected tags as chips + a text box that suggests existing tags and creates new ones on Enter. */
export function TagPicker({ id, value, onChange }: { id: string; value: number[]; onChange: (ids: number[]) => void }) {
  const { data: tags = [] } = useTags();
  const { create } = useTagMutations();
  const [text, setText] = useState("");
  const selected = tags.filter((t) => value.includes(t.id));
  const q = text.trim();
  const suggestions = tags.filter((t) => !value.includes(t.id) && (!q || t.name.includes(q))).slice(0, 8);
  const exact = tags.find((t) => t.name === q);

  const add = async () => {
    if (!q) return;
    if (exact) {
      if (!value.includes(exact.id)) onChange([...value, exact.id]);
    } else {
      const t = await create.mutateAsync({ name: q, color: "slate" });
      onChange([...value, t.id]);
    }
    setText("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <TagChip key={t.id} tag={t} onRemove={() => onChange(value.filter((x) => x !== t.id))} />
          ))}
        </div>
      )}
      <Input id={id} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="輸入標籤後按 Enter，例如：少年、運動、武俠" />
      {(suggestions.length > 0 || (q && !exact)) && (
        <div className="flex flex-wrap gap-1.5" aria-label="標籤建議">
          {q && !exact && (
            <button type="button" onClick={add} className="h-6 rounded-full border border-dashed border-accent px-2 text-[12px] text-accent hover:bg-accent-soft">
              ＋ 新增「{q}」
            </button>
          )}
          {suggestions.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onChange([...value, t.id]);
                setText("");
              }}
              className="h-6 rounded-full border border-rule px-2 text-[12px] text-ink-2 hover:border-rule-strong hover:text-ink"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
