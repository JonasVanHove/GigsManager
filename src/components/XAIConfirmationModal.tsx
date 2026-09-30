"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Icons } from "./Icons";
import { useModalLock } from "@/hooks/useModalLock";

interface PreviewItem {
  label: string;
  before?: string;
  after: string;
  changed?: boolean;
}

interface XAIConfirmationModalProps {
  isOpen: boolean;
  title: string;
  explanation: string;
  previewItems: PreviewItem[];
  confidenceScore?: number;
  icon?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * XAIConfirmationModal: Preview and confirmation modal for AI-generated data modifications
 *
 * Features:
 * - Before/After preview of proposed changes
 * - XAI explanation of why the AI recommends this change
 * - Confidence score display
 * - Explicit confirmation required (prevents accidental changes)
 * - Loading state during application
 * - Keyboard shortcuts: ESC to cancel, Cmd/Ctrl+Enter to confirm
 */
export default function XAIConfirmationModal({
  isOpen,
  title,
  explanation,
  previewItems,
  confidenceScore,
  icon = "⚡",
  confirmLabel = "Confirm & Apply Changes",
  cancelLabel = "Cancel",
  isLoading = false,
  onConfirm,
  onCancel,
}: XAIConfirmationModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || isLoading) return;

      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        onConfirm();
      }
    },
    [isOpen, isLoading, onCancel, onConfirm]
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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-md sm:items-center sm:px-4 sm:py-4 modal-backdrop-enter"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="modal-sheet-mobile w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl border border-purple-200/50 bg-white/95 dark:border-purple-700/50 dark:bg-slate-900/95 backdrop-blur shadow-2xl dark:shadow-xl sm:rounded-2xl modal-content-enter"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="text-2xl">{icon}</div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {title}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Review the proposed changes before confirming
              </p>
              {confidenceScore !== undefined && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    AI Confidence:
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-32 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                        style={{ width: `${Math.min(confidenceScore * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      {Math.round(confidenceScore * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="touch-target inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition disabled:opacity-50"
              aria-label="Close"
            >
              <Icons.X className="h-5 w-5" />
            </button>
          </div>

          {/* Explanation */}
          <div className="mt-4 p-4 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200/50 dark:border-purple-800/50">
            <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">
              Why this change?
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {explanation}
            </p>
          </div>

          {/* Preview Items */}
          <div className="mt-6">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">
              Preview of Changes
            </p>
            <div className="space-y-3">
              {previewItems.map((item, index) => (
                <div
                  key={index}
                  className={`rounded-lg border p-3 transition-colors ${
                    item.changed
                      ? "border-amber-200/50 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/20"
                      : "border-slate-200/50 bg-slate-50/50 dark:border-slate-700/50 dark:bg-slate-800/30"
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                    {item.label}
                  </p>

                  {item.before && (
                    <div className="space-y-1">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex-shrink-0 w-10">
                          Before:
                        </span>
                        <code className="text-xs bg-white dark:bg-slate-950 rounded px-2 py-1 text-slate-700 dark:text-slate-300 font-mono flex-1 break-words line-through opacity-60">
                          {item.before}
                        </code>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-2 mt-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex-shrink-0 w-10">
                      After:
                    </span>
                    <div
                      className={`text-xs rounded px-2 py-1 font-mono flex-1 break-words ${
                        item.changed
                          ? "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-900 dark:from-amber-950 dark:to-orange-950 dark:text-amber-100 font-semibold"
                          : "bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {item.after}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-slate-200/50 dark:border-slate-700/50 bg-gradient-to-r from-slate-50/50 to-slate-100/50 dark:from-slate-800/30 dark:to-slate-800/10 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="touch-target inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300/50 bg-white/70 backdrop-blur px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-600/50 dark:bg-slate-800/50 dark:backdrop-blur dark:text-slate-200 shadow-sm transition-all duration-200 hover:bg-slate-50/80 dark:hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:ring-offset-2 dark:focus:ring-slate-500/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {cancelLabel}
            <span className="text-xs text-slate-500">
              ESC
            </span>
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="touch-target inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 dark:focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="animate-spin">⚡</span>
                <span>Applying...</span>
              </>
            ) : (
              <>
                {confirmLabel}
                <span className="text-xs opacity-75">⌘↵</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
