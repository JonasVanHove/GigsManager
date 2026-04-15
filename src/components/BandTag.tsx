"use client";

import type { CSSProperties } from "react";
import { getBandColorStyles } from "@/lib/preferences";

interface BandTagProps {
  name: string;
  variant?: "solid" | "soft" | "line";
  className?: string;
}

export default function BandTag({ name, variant = "soft", className = "" }: BandTagProps) {
  const styles = getBandColorStyles(name)[variant] as CSSProperties;

  if (variant === "line") {
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`.trim()}
        style={styles}
      >
        {name}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`.trim()}
      style={styles}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {name}
    </span>
  );
}
