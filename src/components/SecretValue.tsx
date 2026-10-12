"use client";

import { useEffect, useRef, useState } from "react";

const CLIPBOARD_CLEAR_MS = 20_000;

/**
 * A secret at rest on screen is a redaction bar, not a row of dots: the length
 * of a dotted string leaks the length of the password.
 */
export function SecretValue({ value, label }: { value: string; label: string }) {
  const [revealed, setRevealed] = useState(false);
  const [clearCountdown, setClearCountdown] = useState<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(value);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);

    let remaining = Math.round(CLIPBOARD_CLEAR_MS / 1000);
    setClearCountdown(remaining);

    intervalRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
        intervalRef.current = null;
        setClearCountdown(null);
        if (document.hasFocus()) void navigator.clipboard.writeText("");
      } else {
        setClearCountdown(remaining);
      }
    }, 1000);
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      <span
        className="redaction font-mono text-[15px] truncate select-all"
        data-revealed={revealed}
        aria-label={revealed ? label : `${label}, hidden`}
      >
        {revealed ? value : value.replace(/./g, "•")}
      </span>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => setRevealed((r) => !r)}
          className="px-2 h-7 text-xs rounded text-muted hover:text-text hover:bg-surface-hi transition-colors"
        >
          {revealed ? "Hide" : "Reveal"}
        </button>
        <button
          onClick={copy}
          className={`px-2 h-7 text-xs rounded transition-colors ${
            clearCountdown !== null
              ? "text-brass bg-surface-hi font-medium"
              : "text-muted hover:text-text hover:bg-surface-hi"
          }`}
          title={
            clearCountdown !== null
              ? `Auto-clears clipboard in ${clearCountdown}s (while tab is focused)`
              : "Copy secret"
          }
        >
          {clearCountdown !== null ? `Copied (${clearCountdown}s)` : "Copy"}
        </button>
      </div>
    </div>
  );
}
