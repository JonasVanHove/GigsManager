"use client";

import { Icons } from "./Icons";
import { useModalLock } from "@/hooks/useModalLock";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = "Bevestigen",
  cancelText = "Annuleren",
  isDanger = true,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const { handleBackdropClick } = useModalLock({
    isOpen,
    onClose: isLoading ? undefined : onCancel,
  });

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      data-testid="confirm-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              isDanger
                ? "bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400"
                : "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
            }`}
          >
            {isDanger ? (
              <Icons.AlertTriangle className="h-5 w-5" />
            ) : (
              <Icons.InfoCircle className="h-5 w-5" />
            )}
          </div>

          <div className="flex-1">
            <h3
              id="confirm-modal-title"
              data-testid="confirm-modal-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {title}
            </h3>
            <p
              data-testid="confirm-modal-description"
              className="mt-2 text-sm text-slate-600 dark:text-slate-400"
            >
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            data-testid="confirm-modal-cancel-button"
            disabled={isLoading}
            onClick={onCancel}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            data-testid="confirm-modal-confirm-button"
            disabled={isLoading}
            onClick={() => void onConfirm()}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 ${
              isDanger
                ? "bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                : "bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
            }`}
          >
            {isLoading && <Icons.Spinner className="h-4 w-4" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
