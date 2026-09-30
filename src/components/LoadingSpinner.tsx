"use client";

import { useState, useEffect } from "react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
  fullScreen?: boolean;
}

export default function LoadingSpinner({ size = "md", message, fullScreen = false }: LoadingSpinnerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [showDismissAction, setShowDismissAction] = useState(false);

  useEffect(() => {
    if (!fullScreen) return;
    const timer = setTimeout(() => {
      setShowDismissAction(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [fullScreen]);

  if (fullScreen && dismissed) return null;
  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative flex items-center justify-center" role="status" aria-label="Loading"
        style={{ width: size === "sm" ? 28 : size === "lg" ? 48 : 36, height: size === "sm" ? 28 : size === "lg" ? 48 : 36 }}
      >
        {/* Single clean arc spinner */}
        <svg className="loading-arc" viewBox="0 0 50 50" style={{ width: "100%", height: "100%" }}>
          <circle
            cx="25" cy="25" r="20"
            fill="none"
            stroke="url(#loading-gradient)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="80 126"
          />
          <defs>
            <linearGradient id="loading-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {message && (
        <p className="text-sm font-medium text-slate-500 animate-pulse">{message}</p>
      )}
      <span className="sr-only">Loading...</span>

      <style>{`
        .loading-arc {
          animation: loading-rotate 1s linear infinite;
        }
        @keyframes loading-rotate {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-lg transition-colors pointer-events-auto"
      >
        {/* Subtle ambient background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 rounded-full blur-3xl opacity-20 dark:opacity-15"
            style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)" }}
          />
          <div
            className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 rounded-full blur-3xl opacity-20 dark:opacity-15"
            style={{ background: "radial-gradient(circle, #f97316 0%, transparent 70%)" }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center gap-6 px-6 max-w-md">
          {/* Logo */}
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-500 to-orange-500 blur-xl opacity-40 animate-pulse" />
            <div className="relative h-16 w-16 flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-orange-500 shadow-2xl">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/25 to-transparent" />
              <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>

          {/* Brand */}
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Gigs<span className="text-amber-500">Manager</span></h2>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 tracking-wide">Performance Management</p>
          </div>

          {/* Spinner */}
          <div className="relative flex items-center justify-center" style={{ width: 52, height: 52 }}>
            <svg className="loading-arc" viewBox="0 0 50 50" style={{ width: "100%", height: "100%" }}>
              <circle
                cx="25" cy="25" r="20"
                fill="none"
                stroke="url(#fullscreen-gradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="80 126"
              />
              <defs>
                <linearGradient id="fullscreen-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="50%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Loading text */}
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 animate-pulse">
            {message || "Preparing your gigs..."}
          </p>

          {showDismissAction && (
            <button
              onClick={() => setDismissed(true)}
              className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline px-3 py-1.5 rounded-lg bg-white/80 dark:bg-slate-900/80 shadow-sm border border-slate-200 dark:border-slate-800 transition pointer-events-auto"
            >
              Taking too long? Tap to continue
            </button>
          )}
        </div>
      </div>
    );
  }

  return spinner;
}

export function SkeletonLoader({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700 ${className}`} />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <SkeletonLoader className="h-6 w-3/4" />
          <SkeletonLoader className="h-4 w-1/2" />
        </div>
        <SkeletonLoader className="h-8 w-20" />
      </div>
      <div className="mt-4 space-y-2">
        <SkeletonLoader className="h-4 w-full" />
        <SkeletonLoader className="h-4 w-5/6" />
      </div>
    </div>
  );
}
