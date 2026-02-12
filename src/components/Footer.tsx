"use client";

import { APP_VERSION } from "@/lib/version";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 py-6 px-4 mt-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center text-center space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Developed with{" "}
            <span className="text-red-500 dark:text-red-400 inline-block">♥</span>
            {" "}by Jonas Van Hove
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500">
            v{APP_VERSION}
          </p>
        </div>
      </div>
    </footer>
  );
}
