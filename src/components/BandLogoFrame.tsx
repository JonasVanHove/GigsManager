"use client";

export type BandLogoSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<BandLogoSize, string> = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

type BandLogoFrameProps = {
  src: string;
  alt: string;
  size?: BandLogoSize;
  className?: string;
};

export default function BandLogoFrame({
  src,
  alt,
  size = "md",
  className = "",
}: BandLogoFrameProps) {
  return (
    <div
      className={[
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl",
        "border border-slate-200/90 bg-white p-1.5 shadow-[0_4px_14px_rgba(15,23,42,0.12)] ring-1 ring-inset ring-slate-200/80",
        "dark:border-slate-700/80 dark:bg-white dark:ring-white/20",
        SIZE_CLASSES[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        aria-hidden
        className="absolute inset-0 rounded-[10px] bg-gradient-to-b from-white via-slate-50 to-slate-100 dark:from-white dark:via-slate-50 dark:to-slate-100"
      />
      <div
        aria-hidden
        className="absolute inset-1 rounded-[8px] bg-white shadow-inner"
      />
      <div className="relative z-10 flex h-full w-full items-center justify-center rounded-[7px] bg-white p-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full object-contain drop-shadow-[0_1px_2px_rgba(15,23,42,0.18)]"
          loading="lazy"
        />
      </div>
    </div>
  );
}
