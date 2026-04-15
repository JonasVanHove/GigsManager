"use client";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
  fullScreen?: boolean;
}

export default function LoadingSpinner({ size = "md", message, fullScreen = false }: LoadingSpinnerProps) {
  const sizes = {
    sm: "h-5 w-5",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative" role="status" aria-label="Loading">
        <div className={`${sizes[size]} rounded-full border border-brand-200/70 dark:border-brand-800/70`} />
        <div className={`absolute inset-0 ${sizes[size]} animate-spin rounded-full border-2 border-transparent border-t-brand-600 border-r-brand-500 dark:border-t-brand-300 dark:border-r-brand-400`} />
        <div className="absolute inset-[30%] rounded-full bg-brand-500/15 dark:bg-brand-300/20 animate-pulse" />
      </div>
      {message && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
      )}
      <span className="sr-only">Loading...</span>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        {spinner}
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
