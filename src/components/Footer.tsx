"use client";

import { APP_VERSION_DISPLAY } from "@/lib/version";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200/60 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl py-8 px-4 mt-16 transition-colors">
      <div className="max-w-7xl mx-auto flex flex-col items-center justify-center text-center space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg overflow-hidden bg-slate-900 dark:bg-white/10 ring-1 ring-slate-200 dark:ring-white/20 p-0.5 shadow-sm">
            <img
              src="/favicon.png"
              alt="GigsManager"
              className="h-full w-full object-contain"
            />
          </div>
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            Gigs<span className="bg-gradient-to-r from-brand-600 to-orange-500 bg-clip-text text-transparent dark:from-brand-400 dark:to-orange-400">Manager</span>
          </span>
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Developed with{" "}
          <span className="text-rose-500 dark:text-rose-400 inline-block animate-pulse">♥</span>
          {" "}by Jonas Van Hove
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>{APP_VERSION_DISPLAY}</span>
        </div>
      </div>
    </footer>
  );
}
