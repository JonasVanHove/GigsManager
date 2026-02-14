"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import Toast from "./Toast";

interface ToastOptions {
  message: string;
  type: "success" | "error" | "info" | "warning";
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
  success: (message: string, action?: ToastOptions["action"]) => void;
  error: (message: string, action?: ToastOptions["action"]) => void;
  info: (message: string, action?: ToastOptions["action"]) => void;
  warning: (message: string, action?: ToastOptions["action"]) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...options, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const success = useCallback((message: string, action?: ToastOptions["action"]) => {
    showToast({ message, type: "success", action });
  }, [showToast]);

  const error = useCallback((message: string, action?: ToastOptions["action"]) => {
    showToast({ message, type: "error", action });
  }, [showToast]);

  const info = useCallback((message: string, action?: ToastOptions["action"]) => {
    showToast({ message, type: "info", action });
  }, [showToast]);

  const warning = useCallback((message: string, action?: ToastOptions["action"]) => {
    showToast({ message, type: "warning", action });
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warning }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 p-4 sm:items-center">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            action={toast.action}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
