"use client";

import { useEffect, useRef, useState } from "react";
import { Icons } from "./Icons";
import {
  LANDING_LANGUAGES,
  useLandingLanguage,
  type LandingLanguage,
} from "@/lib/landing-i18n";

/**
 * Compact language pill for the landing-page navigation. Switching updates the
 * whole page instantly through the LandingLanguageProvider (no reload).
 */
export default function LanguageSwitcher() {
  const { language, setLanguage, copy } = useLandingLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const active = LANDING_LANGUAGES.find((item) => item.code === language) ?? LANDING_LANGUAGES[0];

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (code: LandingLanguage) => {
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={copy.nav.selectLanguage}
        title={copy.nav.language}
        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-semibold text-slate-300 backdrop-blur-sm transition hover:bg-white/10 hover:text-white"
      >
        <Icons.Globe className="h-4 w-4 text-brand-400" />
        <span className="uppercase tracking-wide">{active.short}</span>
        <Icons.ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={copy.nav.selectLanguage}
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 p-1 shadow-2xl backdrop-blur-xl animate-fade-in"
        >
          {LANDING_LANGUAGES.map((item) => {
            const isActive = item.code === language;
            return (
              <button
                key={item.code}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => choose(item.code)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
                  isActive
                    ? "bg-brand-500/15 font-semibold text-white"
                    : "text-slate-300 hover:bg-white/10"
                }`}
              >
                <span className="w-6 text-[11px] font-bold uppercase tracking-wider text-brand-400">
                  {item.short}
                </span>
                <span className="flex-1">{item.label}</span>
                {isActive && <Icons.Check className="h-4 w-4 text-brand-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}