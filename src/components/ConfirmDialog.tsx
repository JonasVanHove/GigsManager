"use client";

import { useEffect, useCallback } from "react";
import { Icons } from "./Icons";
import { useModalLock } from "@/hooks/useModalLock";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "primary" | "success";
  onConfirm: () => void;
  onCancel: () => void;
  icon?: "warning" | "danger" | "info" | "question";
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
  icon = "question",
}: ConfirmDialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        onConfirm();
      }
    },
    [isOpen, onCancel, onConfirm]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const { handleBackdropClick, handleTouchStart, handleTouchEnd } = useModalLock({
    isOpen,
    onClose: onCancel,
    preventEscapeClose: true, // Escape is handled by handleKeyDown above
  });

  if (!isOpen) return null;

  const icons = {
    warning: <Icons.AlertTriangle className="h-6 w-6 text-amber-600" />,
    danger: <Icons.AlertCircle className="h-6 w-6 text-red-600" />,
    info: <Icons.InfoCircle className="h-6 w-6 text-blue-600" />,
    question: <Icons.InfoCircle className="h-6 w-6 text-slate-600" />,
  };

  const confirmStyles = {
    danger: "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500",
    primary: "bg-brand-600 hover:bg-brand-700 text-white focus:ring-brand-500",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-md sm:items-center sm:px-4 sm:py-4 modal-backdrop-enter"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="modal-sheet-mobile w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl border border-slate-200/50 bg-white/95 dark:border-slate-700/50 dark:bg-slate-900/95 backdrop-blur shadow-2xl dark:shadow-xl sm:rounded-2xl modal-content-enter" role="dialog" aria-modal="true">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0">{icons[icon]}</div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {title}
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {message}
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200/50 dark:border-slate-700/50 bg-gradient-to-r from-slate-50/50 to-slate-100/50 dark:from-slate-800/30 dark:to-slate-800/10 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="touch-target inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300/50 bg-white/70 backdrop-blur px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-600/50 dark:bg-slate-800/50 dark:backdrop-blur dark:text-slate-200 shadow-sm transition-all duration-200 hover:bg-slate-50/80 dark:hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:ring-offset-2 dark:focus:ring-slate-500/50 flex items-center gap-2"
          >
            {cancelLabel}
            <span className="text-xs text-slate-500">ESC</span>
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`touch-target inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 flex items-center gap-2 ${confirmStyles[confirmVariant]}`}
          >
            {confirmLabel}
            <span className="text-xs opacity-75">⌘↵</span>
          </button>
        </div>
      </div>
    </div>
  );
}
