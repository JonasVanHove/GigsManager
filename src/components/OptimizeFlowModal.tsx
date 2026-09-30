"use client";

import { useState } from "react";
import { Icons } from "./Icons";
import { type OptimizationCriteria } from "@/lib/setlist-flow";
import { useModalLock } from "@/hooks/useModalLock";

interface OptimizeFlowModalProps {
  isOpen: boolean;
  onConfirm: (criteria: OptimizationCriteria) => void;
  onCancel: () => void;
}

const CRITERIA_OPTIONS: Array<{
  value: OptimizationCriteria;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    value: "bpm-flow",
    label: "BPM Flow (Smooth Energy)",
    description: "Order songs by tempo descending for smooth energy progression",
    icon: "🎵",
  },
  {
    value: "harmonic-keys",
    label: "Harmonic Key Transitions",
    description: "Group songs by musical keys for seamless harmonic mixing",
    icon: "🎹",
  },
  {
    value: "minimize-capo",
    label: "Minimize Capo Changes",
    description: "Group songs by capo position to reduce fret changes",
    icon: "🎸",
  },
  {
    value: "balanced",
    label: "Balanced Mixed",
    description: "Smart mix of BPM, keys, and capo considerations",
    icon: "⚖️",
  },
];

export default function OptimizeFlowModal({ isOpen, onConfirm, onCancel }: OptimizeFlowModalProps) {
  const [selectedCriteria, setSelectedCriteria] = useState<OptimizationCriteria>("bpm-flow");

  const { handleBackdropClick, handleTouchStart, handleTouchEnd } = useModalLock({
    isOpen,
    onClose: onCancel,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-md sm:items-center sm:px-4 sm:py-4 modal-backdrop-enter"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="modal-sheet-mobile w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl border border-slate-200/50 bg-white/95 dark:border-slate-700/50 dark:bg-slate-900/95 backdrop-blur shadow-2xl sm:rounded-2xl modal-content-enter">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Optimize Setlist Flow
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Choose how you want to optimize your setlist order
              </p>
            </div>
            <button
              onClick={onCancel}
              aria-label="Close"
              className="touch-target inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition"
            >
              <Icons.X className="h-5 w-5" />
            </button>
          </div>

          {/* Criteria Options */}
          <div className="space-y-3">
            {CRITERIA_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedCriteria(option.value)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  selectedCriteria === option.value
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30 dark:border-brand-400"
                    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{option.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-slate-900 dark:text-white">
                        {option.label}
                      </h3>
                      {selectedCriteria === option.value && (
                        <div className="h-5 w-5 rounded-full bg-brand-500 flex items-center justify-center">
                          <Icons.Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {option.description}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onCancel}
              className="touch-target inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selectedCriteria)}
              className="touch-target inline-flex min-h-[44px] items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition"
            >
              Optimize Flow
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
