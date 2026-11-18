import { useState } from "react";
import { coverUrl } from "../lib/api";
import { cx } from "../lib/format";

interface CoverProps {
  volumeId: number | null | undefined;
  title: string;
  /** category colour, used for the screentone placeholder and the spine strip */
  tone: string;
  className?: string;
  eager?: boolean;
}

/**
 * A book cover at 2:3. While loading — or when extraction failed (encrypted archive, MOBI…) —
 * shows a screentone placeholder in the category ink with the title set like a spine label.
 */
export function Cover({ volumeId, title, tone, className, eager }: CoverProps) {
  const src = coverUrl(volumeId);
  const [state, setState] = useState<"loading" | "ok" | "failed">(src ? "loading" : "failed");

  return (
    <div
      className={cx("relative aspect-[2/3] overflow-hidden rounded-[4px] border border-rule bg-surface-2", className)}
      style={{ ["--tone" as string]: tone }}
    >
      {state !== "ok" && (
        <div className="screentone absolute inset-0 flex items-end p-2.5" aria-hidden>
          {state === "failed" && (
            <span className="line-clamp-3 rounded-sm bg-surface/90 px-1.5 py-1 font-title text-[13px] leading-snug text-ink">
              {title}
            </span>
          )}
        </div>
      )}
      {src && state !== "failed" && (
        <img
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setState("ok")}
          onError={() => setState("failed")}
          className={cx("absolute inset-0 h-full w-full object-cover transition-opacity duration-300", state === "ok" ? "opacity-100" : "opacity-0")}
        />
      )}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: tone }} />
    </div>
  );
}
