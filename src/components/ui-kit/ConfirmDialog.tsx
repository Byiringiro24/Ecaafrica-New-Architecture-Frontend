/**
 * ConfirmDialog — reusable destructive-action confirmation dialog.
 *
 * Shows a modal with:
 *  - Action title + description
 *  - A 5-second countdown before the confirm button becomes clickable
 *    (gives the user time to read and understand what will happen)
 *  - Cancel button (always active)
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   // In JSX: <ConfirmDialog />
 *   // To trigger: await confirm({ title: "...", description: "...", confirmLabel: "Delete" })
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  /** Countdown in seconds before confirm becomes active (default: 5) */
  countdown?: number;
  /** "destructive" (red) or "warning" (amber). Default: "destructive" */
  variant?: "destructive" | "warning";
};

type PendingResolve = (confirmed: boolean) => void;

export function useConfirm() {
  const [open, setOpen]       = useState(false);
  const [opts, setOpts]       = useState<ConfirmOptions | null>(null);
  const [secs, setSecs]       = useState(0);
  const resolveRef            = useRef<PendingResolve | null>(null);
  const timerRef              = useRef<ReturnType<typeof setInterval> | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      const cd = options.countdown ?? 5;
      setOpts(options);
      setSecs(cd);
      setOpen(true);

      // Start countdown
      let remaining = cd;
      timerRef.current = setInterval(() => {
        remaining -= 1;
        setSecs(remaining);
        if (remaining <= 0 && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }, 1000);
    });
  }, []);

  const handleClose = useCallback((confirmed: boolean) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setOpen(false);
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
  }, []);

  // Clean up on unmount
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const variant  = opts?.variant ?? "destructive";
  const btnColor = variant === "destructive"
    ? "bg-red-600 hover:bg-red-700 disabled:bg-red-300"
    : "bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300";
  const iconColor = variant === "destructive" ? "text-red-500" : "text-amber-500";

  const Dialog = !open ? null : (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={opts?.title}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 shrink-0 ${iconColor}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm leading-snug">{opts?.title}</h3>
          </div>
          <button
            onClick={() => handleClose(false)}
            className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed pl-8">
          {opts?.description}
        </p>

        {/* Countdown hint */}
        {secs > 0 && (
          <p className="text-xs text-muted-foreground pl-8">
            Please read carefully — confirm available in <span className="font-semibold tabular-nums">{secs}s</span>
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleClose(false)}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={secs > 0}
            onClick={() => handleClose(true)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors ${btnColor}`}
          >
            {secs > 0 ? `Wait ${secs}s…` : (opts?.confirmLabel ?? "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );

  return { confirm, ConfirmDialog: Dialog };
}
