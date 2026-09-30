"use client";

import type { CSSProperties } from "react";
import { getBandColorStyles } from "@/lib/preferences";

interface BandTagProps {
  name: string;
  color?: string | null;
  variant?: "solid" | "soft" | "line";
  className?: string;
}

export default function BandTag({ name, color, variant = "soft", className = "" }: BandTagProps) {
  const variantStyles = getBandColorStyles(name, color)[variant];
  // `soft` reports a text color per theme (its background is a translucent
  // band tint, so one static color is unreadable in one of the two themes).
  // Handing both to CSS via custom properties lets the tag re-color on theme
  // switch without a re-render, and keeps SSR deterministic.
  const { darkColor, ...styles } = variantStyles as CSSProperties & { darkColor?: string };
  const themeAwareStyle = darkColor
    ? ({ ...styles, "--band-tag-fg": styles.color, "--band-tag-fg-dark": darkColor } as CSSProperties)
    : styles;

  if (variant === "line") {
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`.trim()}
        style={themeAwareStyle}
      >
        {name}
      </span>
    );
  }

  return (
    <span
      className={`band-tag inline-flex min-h-[30px] items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium leading-none ${className}`.trim()}
      style={themeAwareStyle}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {name}
    </span>
  );
}
