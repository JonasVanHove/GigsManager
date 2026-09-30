"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Icons } from "./Icons";
import { useModalLock } from "@/hooks/useModalLock";

interface XAIExplanationModalProps {
  isOpen: boolean;
  title: string;
  explanation: string;
  details?: {
    label: string;
    value: string;
  }[];
  confidenceScore?: number;
  icon?: string;
  onClose: () => void;
}

/**
 * XAIExplanationModal: Dedicated modal for displaying XAI insights and explanations
 *
 * Features:
 * - Clean, accessible modal design
 * - Human-readable XAI explanation
 * - Optional confidence score display
 * - Additional details/metadata
 * - Keyboard navigation support (ESC to close)
 */
export default function XAIExplanationModal({
  isOpen,
  title,
  explanation,
  details = [],
  confidenceScore,
  icon = "⚡",
  onClose,
}: XAIExplanationModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const { handleBackdropClick, handleTouchStart, handleTouchEnd } = useModalLock({
    isOpen,
    onClose,
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
        className="modal-sheet-mobile w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl border border-purple-200/50 bg-white/95 dark:border-purple-700/50 dark:bg-slate-900/95 backdrop-blur shadow-2xl dark:shadow-xl sm:rounded-2xl modal-content-enter"
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
              {confidenceScore !== undefined && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Confidence:
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-24 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
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
              onClick={onClose}
              className="touch-target inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition"
              aria-label="Close"
            >
              <Icons.X className="h-5 w-5" />
            </button>
          </div>

          {/* Main explanation */}
          <div className="mt-4 p-4 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200/50 dark:border-purple-800/50">
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {explanation}
            </p>
          </div>

          {/* Additional details */}
          {details.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                Details
              </p>
              <div className="space-y-2">
                {details.map((detail, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3"
                  >
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex-shrink-0 min-w-fit">
                      {detail.label}:
                    </span>
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-mono">
                      {detail.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-200/50 dark:border-slate-700/50 bg-gradient-to-r from-slate-50/50 to-slate-100/50 dark:from-slate-800/30 dark:to-slate-800/10 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="touch-target inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300/50 bg-white/70 backdrop-blur px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-600/50 dark:bg-slate-800/50 dark:backdrop-blur dark:text-slate-200 shadow-sm transition-all duration-200 hover:bg-slate-50/80 dark:hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:ring-offset-2 dark:focus:ring-slate-500/50"
          >
            Dismiss
            <span className="ml-2 text-xs text-slate-500">
              ESC
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
