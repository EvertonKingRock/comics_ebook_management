import { Star } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import type { ReadStatus, SeriesStatus, TagRef } from "../lib/api";
import { cx, READ_LABEL, STATUS_LABEL } from "../lib/format";

/* ------------------------------------------------------------------ Button */

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 border border-transparent",
  secondary: "bg-surface text-ink border border-rule-strong hover:bg-surface-2",
  ghost: "text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-danger border border-rule-strong hover:bg-surface-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors",
        "disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink transition-colors",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ form */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(
        "h-9 w-full rounded-md border border-rule-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/80",
        "focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-accent/25",
        className,
      )}
      {...rest}
    />
  );
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "h-8 rounded-md border border-rule-strong bg-surface pl-2.5 pr-7 text-[13px] text-ink",
        "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
        {hint}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ badges */

const STATUS_STYLE: Record<SeriesStatus, string> = {
  finished: "text-ok border-ok/40",
  ongoing: "text-accent border-accent/40",
  stopped: "text-warn border-warn/40",
  unknown: "text-muted border-rule-strong",
};

export function StatusBadge({ status }: { status: SeriesStatus }) {
  if (status === "unknown") return null;
  return (
    <span className={cx("inline-flex h-5 items-center rounded border px-1.5 text-[12px] leading-none", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const READ_DOT: Record<ReadStatus, string> = {
  unread: "border border-rule-strong bg-transparent",
  reading: "bg-[conic-gradient(var(--accent)_0_50%,transparent_50%)] border border-accent",
  read: "bg-ok border border-ok",
};

export function ReadMark({ status, withLabel = true }: { status: ReadStatus; withLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
      <span aria-hidden className={cx("h-2.5 w-2.5 rounded-full", READ_DOT[status])} />
      {withLabel ? READ_LABEL[status] : <span className="sr-only">{READ_LABEL[status]}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ tags */

export const TAG_COLORS: Record<string, { label: string; value: string }> = {
  slate: { label: "石板灰", value: "#64748b" },
  rose: { label: "玫瑰紅", value: "#c8326e" },
  amber: { label: "琥珀黃", value: "#b88a12" },
  emerald: { label: "翡翠綠", value: "#1e7a46" },
  sky: { label: "天空藍", value: "#1f8fc4" },
  violet: { label: "紫羅蘭", value: "#6a55c8" },
};

export function TagChip({ tag, onRemove, className }: { tag: TagRef; onRemove?: () => void; className?: string }) {
  const c = TAG_COLORS[tag.color]?.value ?? TAG_COLORS.slate.value;
  return (
    <span
      className={cx("inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[12px] text-ink-2", className)}
      style={{ borderColor: `color-mix(in oklab, ${c} 45%, transparent)`, background: `color-mix(in oklab, ${c} 10%, transparent)` }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {tag.name}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`移除標籤 ${tag.name}`} className="-mr-1 ml-0.5 rounded-full px-1 text-muted hover:text-ink">
          ×
        </button>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ rating */

export function Stars({ value, onChange, size = 16 }: { value: number | null; onChange?: (v: number | null) => void; size?: number }) {
  const v = value ?? 0;
  if (!onChange) {
    if (!v) return null;
    return (
      <span className="inline-flex items-center gap-0.5 text-warn" aria-label={`評分 ${v} / 5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} size={size} fill={i < v ? "currentColor" : "none"} strokeWidth={1.5} className={i < v ? "" : "text-rule-strong"} />
        ))}
      </span>
    );
  }
  return (
    <div role="radiogroup" aria-label="評分" className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => {
        const n = i + 1;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={v === n}
            aria-label={`${n} 星`}
            onClick={() => onChange(v === n ? null : n)}
            className={cx("rounded p-0.5 transition-colors", n <= v ? "text-warn" : "text-rule-strong hover:text-warn/70")}
          >
            <Star size={size + 4} fill={n <= v ? "currentColor" : "none"} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ states */

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
      {icon && <div className="mb-1 text-muted">{icon}</div>}
      <p className="text-base font-medium text-ink">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <EmptyState title="無法載入資料">
      <p>{error.message}。請確認伺服器仍在執行。</p>
      {onRetry && (
        <Button className="mt-3" onClick={onRetry}>
          重新載入
        </Button>
      )}
    </EmptyState>
  );
}

export function Progress({ value, max, className, label }: { value: number; max: number; className?: string; label?: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cx("h-1 overflow-hidden rounded-full bg-rule", className)}
    >
      <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}
