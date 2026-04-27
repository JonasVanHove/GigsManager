'use client';

import { useImmersiveMode } from '@/lib/use-immersive-mode';

export function ImmersiveButton() {
  const { isFullscreen, canRequestFullscreen, toggleFullscreen } = useImmersiveMode();

  if (!canRequestFullscreen) {
    return null;
  }

  return (
    <button
      onClick={toggleFullscreen}
      className={`p-1.5 rounded-lg border transition flex-shrink-0 ${
        isFullscreen
          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950/30 dark:text-brand-300'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
      }`}
      title={isFullscreen ? 'Exit immersive mode' : 'Enter immersive mode'}
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {isFullscreen ? (
          // Exit fullscreen icon
          <path d="M8 4v4m0-4h4m-4 0L4 8M20 4v4m0-4h-4m4 0l4-4M8 20v-4m0 4h4m-4 0l-4 4M20 20v-4m0 4h-4m4 0l4 4" />
        ) : (
          // Enter fullscreen icon
          <path d="M4 8v-4h4M4 8l-4 4M20 8v-4h-4m4 0l4-4M4 16v4h4m-4 0l-4-4M20 16v4h-4m4 0l4 4" />
        )}
      </svg>
    </button>
  );
}

// Alternative: Full screen icon (cleaner)
export function ImmersiveButtonAlt() {
  const { isFullscreen, canRequestFullscreen, toggleFullscreen } = useImmersiveMode();

  if (!canRequestFullscreen) {
    return null;
  }

  return (
    <button
      onClick={toggleFullscreen}
      className={`p-1.5 rounded-lg border transition flex-shrink-0 ${
        isFullscreen
          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950/30 dark:text-brand-300'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
      }`}
      title={isFullscreen ? 'Exit immersive mode' : 'Enter immersive mode'}
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {isFullscreen ? (
          // Exit fullscreen - collapse arrows
          <>
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </>
        ) : (
          // Enter fullscreen - expand arrows
          <>
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </>
        )}
      </svg>
    </button>
  );
}
