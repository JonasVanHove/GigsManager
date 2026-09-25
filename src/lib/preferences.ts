export type AppLanguage = "system" | "en" | "nl";

const LANGUAGE_TO_LOCALE: Record<Exclude<AppLanguage, "system">, string> = {
  en: "en-US",
  nl: "nl-BE",
};

// Default Belgian locale for all formatting
const DEFAULT_LOCALE = "nl-BE";

function getNavigatorLocale() {
  // Deterministic locale for SSR and hydration: use DEFAULT_LOCALE to ensure
  // server-rendered HTML and client initial hydration render match byte-for-byte (#418/#423).
  return DEFAULT_LOCALE;
}

export function resolveLocale(language?: AppLanguage) {
  if (!language || language === "system") {
    return getNavigatorLocale();
  }

  return LANGUAGE_TO_LOCALE[language];
}

export function formatDate(value: string | Date, locale?: string) {
  return new Intl.DateTimeFormat(locale || DEFAULT_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value instanceof Date ? value : new Date(value));
}

export function formatDateTime(value: string | Date, locale?: string) {
  return new Intl.DateTimeFormat(locale || DEFAULT_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value instanceof Date ? value : new Date(value));
}

function hashString(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getBandHue(bandName: string) {
  return hashString(bandName.trim().toLowerCase()) % 360;
}

export function getBandColorStyles(bandName: string, bandColor?: string | null) {
  const resolvedBandColor = bandColor ? normalizeColorToHex(bandColor) : null;

  if (resolvedBandColor) {
    const solidTextColor = getContrastColor(resolvedBandColor);
    const borderColor = adjustColor(resolvedBandColor, -20);
    // Calculate soft background by blending with white (light mode) and slate-900 (dark mode)
    const softBgLight = blendColors(resolvedBandColor, '#ffffff', 0.18);
    const softBgDark = blendColors(resolvedBandColor, '#0f172a', 0.18);
    // Use darker background for contrast calculation (worst case)
    const softTextColor = getContrastColor(softBgDark);
    return {
      solid: {
        backgroundColor: resolvedBandColor,
        borderColor,
        color: solidTextColor,
      },
      soft: {
        backgroundColor: hexToRgba(resolvedBandColor, 0.18),
        borderColor: adjustColor(resolvedBandColor, -15),
        color: softTextColor,
      },
      line: {
        borderColor: resolvedBandColor,
        color: solidTextColor,
      },
    } as const;
  }

  const hue = getBandHue(bandName);
  const solidColor = `hsl(${hue} 68% 42%)`;
  const solidHex = hslToHex(hue, 68, 42);
  const solidTextColor = getContrastColor(solidHex);
  const softColor = hslToRgba(hue, 68, 94, 0.15);
  const borderColor = `hsl(${hue} 70% 78%)`;
  // Calculate soft background for contrast
  const softBgDark = blendColors(solidHex, '#0f172a', 0.15);
  const softTextColor = getContrastColor(softBgDark);

  return {
    solid: {
      backgroundColor: solidColor,
      borderColor: `hsl(${hue} 68% 34%)`,
      color: solidTextColor,
    },
    soft: {
      backgroundColor: softColor,
      borderColor,
      color: softTextColor,
    },
    line: {
      borderColor: solidColor,
      color: solidTextColor,
    },
  } as const;
}

function hslToRgba(h: number, s: number, l: number, a: number): string {
  const rgb = hslToRgb(h, s, l);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

function hslToHex(h: number, s: number, l: number): string {
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const light = l / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c; g = x; b = 0;
  } else if (hue < 120) {
    r = x; g = c; b = 0;
  } else if (hue < 180) {
    r = 0; g = c; b = x;
  } else if (hue < 240) {
    r = 0; g = x; b = c;
  } else if (hue < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function normalizeColorToHex(color: string): string {
  const trimmed = color.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    const hex = trimmed.replace('#', '');
    if (hex.length === 3) {
      return `#${hex.split('').map((char) => char + char).join('')}`.toLowerCase();
    }
    return `#${hex.toLowerCase()}`;
  }

  if (/^rgba?\(/i.test(trimmed)) {
    const matches = trimmed.match(/rgba?\(([^)]+)\)/i)?.[1]?.split(',').map((part) => part.trim());
    if (matches && matches.length >= 3) {
      const r = Number(matches[0]);
      const g = Number(matches[1]);
      const b = Number(matches[2]);
      return rgbToHex(r, g, b);
    }
  }

  if (/^hsla?\(/i.test(trimmed)) {
    const matches = trimmed.match(/hsla?\(([^)]+)\)/i)?.[1]?.split(',');
    if (matches && matches.length >= 3) {
      const h = Number(matches[0]);
      const s = Number(matches[1].replace('%', ''));
      const l = Number(matches[2].replace('%', ''));
      return hslToHex(h, s, l);
    }
  }

  return '#111827';
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => Math.min(255, Math.max(0, value)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const color = normalizeColorToHex(hex).replace('#', '');
  const num = parseInt(color, 16);
  const r = (num >> 16) & 0xFF;
  const g = (num >> 8) & 0xFF;
  const b = num & 0xFF;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getContrastColor(backgroundColor: string): string {
  const { r, g, b } = colorToRgb(backgroundColor);
  // Calculate relative luminance (WCAG 2.0 formula)
  const linearR = r / 255;
  const linearG = g / 255;
  const linearB = b / 255;
  const R = linearR <= 0.03928 ? linearR / 12.92 : Math.pow((linearR + 0.055) / 1.055, 2.4);
  const G = linearG <= 0.03928 ? linearG / 12.92 : Math.pow((linearG + 0.055) / 1.055, 2.4);
  const B = linearB <= 0.03928 ? linearB / 12.92 : Math.pow((linearB + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  // Use a more conservative threshold for better contrast (WCAG AA requires 4.5:1)
  // Luminance > 0.5 indicates a light background, use dark text
  return luminance > 0.5 ? '#0f172a' : '#ffffff';
}

function colorToRgb(color: string): { r: number; g: number; b: number } {
  const hex = normalizeColorToHex(color).replace('#', '');
  const value = parseInt(hex, 16);
  return {
    r: (value >> 16) & 0xFF,
    g: (value >> 8) & 0xFF,
    b: value & 0xFF,
  };
}

function adjustColor(hex: string, amount: number): string {
  const rgb = colorToRgb(hex);
  const r = Math.min(255, Math.max(0, rgb.r + amount));
  const g = Math.min(255, Math.max(0, rgb.g + amount));
  const b = Math.min(255, Math.max(0, rgb.b + amount));
  return rgbToHex(r, g, b);
}

function blendColors(color1: string, color2: string, ratio: number): string {
  const rgb1 = colorToRgb(color1);
  const rgb2 = colorToRgb(color2);
  const r = Math.round(rgb1.r * ratio + rgb2.r * (1 - ratio));
  const g = Math.round(rgb1.g * ratio + rgb2.g * (1 - ratio));
  const b = Math.round(rgb1.b * ratio + rgb2.b * (1 - ratio));
  return rgbToHex(r, g, b);
}
