"use client";

import Image from "next/image";
import { buildHighResImageUrl, getInitials } from "@/lib/image-utils";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CONFIG: Record<
  AvatarSize,
  { container: string; pixels: number; text: string; ring: string }
> = {
  xs: { container: "h-6 w-6", pixels: 48, text: "text-[10px]", ring: "ring-1" },
  sm: { container: "h-8 w-8", pixels: 64, text: "text-xs", ring: "ring-1" },
  md: { container: "h-10 w-10", pixels: 80, text: "text-sm", ring: "ring-2" },
  lg: { container: "h-12 w-12", pixels: 96, text: "text-base", ring: "ring-2" },
  xl: { container: "h-20 w-20", pixels: 160, text: "text-xl", ring: "ring-2" },
};

function isRemoteImageSrc(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://");
}

/**
 * SVGs (e.g. the DiceBear placeholder avatars used for demo band members)
 * must never go through the Next.js Image Optimizer: with the default
 * `dangerouslyAllowSVG: false` it rejects them with a 400, so the avatar
 * silently failed to render. Those sources are drawn with a plain <img>
 * instead; raster photos keep using <Image> and its optimisation.
 */
function isSvgSrc(src: string): boolean {
  try {
    const { pathname } = new URL(src);
    return /\.svg$/i.test(pathname) || /\/svg$/i.test(pathname);
  } catch {
    return /\.svg(\?|#|$)/i.test(src) || /\/svg(\?|#|$)/i.test(src);
  }
}

type AvatarProps = {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  alt?: string;
  size?: AvatarSize;
  className?: string;
  priority?: boolean;
};

export default function Avatar({
  src,
  name,
  email,
  alt,
  size = "md",
  className,
  priority = false,
}: AvatarProps) {
  const config = SIZE_CONFIG[size];
  const initials = getInitials(name, email);
  const label = alt || name || email || "Avatar";
  const remoteSrc = Boolean(src && isRemoteImageSrc(src));
  const svgSrc = Boolean(src && isSvgSrc(src));
  const imageSrc =
    remoteSrc && !svgSrc ? buildHighResImageUrl(src as string, config.pixels) : src;

  return (
    <div
      className={[
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300",
        "font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200/80",
        "dark:from-slate-600 dark:via-slate-700 dark:to-slate-800 dark:text-slate-100 dark:ring-slate-600/60",
        config.container,
        config.text,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
    >
      {imageSrc ? (
        remoteSrc && !svgSrc ? (
          <Image
            src={imageSrc}
            alt={label}
            width={config.pixels}
            height={config.pixels}
            quality={100}
            priority={priority}
            sizes={`${config.pixels}px`}
            className="h-full w-full object-cover object-center [image-rendering:auto]"
            unoptimized={false}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={label}
            className="h-full w-full object-cover object-center"
            loading="lazy"
          />
        )
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  );
}

export { getInitials };
