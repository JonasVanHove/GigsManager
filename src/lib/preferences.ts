export type AppLanguage = "system" | "en" | "nl";

const LANGUAGE_TO_LOCALE: Record<Exclude<AppLanguage, "system">, string> = {
  en: "en-US",
  nl: "nl-NL",
};

function getNavigatorLocale() {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }

  if (typeof document !== "undefined") {
    const lang = document.documentElement.lang?.trim();
    if (lang) return lang;
  }

  return "en-US";
}

export function resolveLocale(language?: AppLanguage) {
  if (!language || language === "system") {
    return getNavigatorLocale();
  }

  return LANGUAGE_TO_LOCALE[language];
}

export function formatDate(value: string | Date, locale?: string) {
  return new Intl.DateTimeFormat(locale || getNavigatorLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value instanceof Date ? value : new Date(value));
}

export function formatDateTime(value: string | Date, locale?: string) {
  return new Intl.DateTimeFormat(locale || getNavigatorLocale(), {
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

export function getBandColorStyles(bandName: string) {
  const hue = getBandHue(bandName);
  return {
    solid: {
      backgroundColor: `hsl(${hue} 68% 42%)`,
      borderColor: `hsl(${hue} 68% 34%)`,
      color: "#ffffff",
    },
    soft: {
      backgroundColor: `hsl(${hue} 85% 94%)`,
      borderColor: `hsl(${hue} 70% 78%)`,
      color: `hsl(${hue} 58% 28%)`,
    },
    line: {
      borderColor: `hsl(${hue} 68% 42%)`,
      color: `hsl(${hue} 58% 28%)`,
    },
  } as const;
}
