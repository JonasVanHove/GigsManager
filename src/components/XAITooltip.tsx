"use client";

import { useState } from "react";

interface XAITooltipProps {
  children: React.ReactNode;
  title: string;
  description: string;
  tips?: string[];
}

/**
 * XAI Tooltip: Explainable AI component for teaching users about concepts
 *
 * Provides context-sensitive explanations on hover/click with:
 * - Title explaining the concept
 * - Detailed description
 * - Optional tips for how to use it
 * - Accessible and mobile-friendly
 */
export function XAITooltip({ children, title, description, tips = [] }: XAITooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="group relative inline-flex items-center">
      <button
        onClick={() => setOpen(!open)}
        title={title}
        className="inline-flex items-center gap-1 text-slate-400 transition hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 rounded"
      >
        {children}
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 0 1 5.304 0l1.06-1.06a5.25 5.25 0 0 0-7.424 0l1.06 1.06zm0-4.95a5.25 5.25 0 0 1 7.424 0l-1.06 1.06a3.75 3.75 0 0 0-5.304 0l-1.06-1.06zm7.424-2.89a7.5 7.5 0 0 0-10.604 0l1.06 1.06a5.25 5.25 0 0 1 7.424 0l1.06-1.06zM17.25 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" />
        </svg>
      </button>

      {/* Tooltip content */}
      {open && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 z-40 md:hidden"
            onClick={() => setOpen(false)}
          />

          {/* Tooltip popup */}
          <div
            className="absolute bottom-full left-1/2 z-50 mb-2 w-80 -translate-x-1/2 rounded-lg bg-slate-900 p-3 text-white shadow-lg md:opacity-0 md:group-hover:opacity-100 md:transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 font-semibold text-sm">{title}</h3>
            <p className="mb-2 text-xs text-slate-300 leading-relaxed">{description}</p>

            {tips.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-slate-700 pt-2">
                <p className="text-xs font-medium text-slate-400">💡 Tips:</p>
                <ul className="space-y-1">
                  {tips.map((tip, i) => (
                    <li key={i} className="text-xs text-slate-300">
                      • {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Close button for mobile */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-2 right-2 text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>
        </>
      )}
    </div>
  );
}
