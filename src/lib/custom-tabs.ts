/**
 * Lightweight, dependency-free helpers for caching the two custom navigation
 * tabs (customTab1 / customTab2) so they load instantly on the next visit:
 *
 *  - localStorage   → read by SettingsProvider in a post-hydration, pre-paint
 *                     layout effect (client-side instant render, no flash).
 *  - keep-alive cookie → read by the root layout (server) so the very first
 *                     HTTP response already contains the correct tab names.
 *
 * Both stores are written together (fetch success + UI save), so they stay in
 * sync. All parsing validates against a conservative slug pattern — the
 * authoritative tab validation still happens in Dashboard.getPrimaryNavTabs.
 */

export const CUSTOM_TAB1_STORAGE_KEY = "gig-manager-customTab1";
export const CUSTOM_TAB2_STORAGE_KEY = "gig-manager-customTab2";
export const CUSTOM_TAB_COOKIE_NAME = "gm_custom_tabs";

/**
 * Conservative slug check for a custom tab id (e.g. "setlists", "bands").
 * Rejects junk / tampered cookie values before they reach React state.
 * "gigs" is excluded because it is always the fixed first nav item.
 */
export function isValidTabSlug(value: string | null | undefined): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 40 &&
    /^[a-z0-9-]+$/.test(value) &&
    value !== "gigs"
  );
}

/** Parse the `tab1|tab2` cookie written by buildCustomTabsCookieString. */
export function parseCustomTabsCookie(raw: string | null | undefined): {
  customTab1?: string;
  customTab2?: string;
} {
  if (!raw) return {};
  const [first, second] = raw.split("|");
  const customTab1 = decodeTab(first);
  const customTab2 = decodeTab(second);
  return {
    ...(customTab1 ? { customTab1 } : {}),
    ...(customTab2 ? { customTab2 } : {}),
  };
}

function decodeTab(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    return isValidTabSlug(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Full string for `document.cookie` carrying both tabs (`tab1|tab2`).
 * Only returns a value when BOTH tabs are valid so a half-populated write can
 * never clobber a previously good cookie. `secure` is added only over https
 * so plain-http localhost dev still persists the cookie.
 */
export function buildCustomTabsCookieString(
  tab1: string | null | undefined,
  tab2: string | null | undefined
): string | null {
  if (!isValidTabSlug(tab1) || !isValidTabSlug(tab2)) return null;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; secure"
      : "";
  return `${CUSTOM_TAB_COOKIE_NAME}=${encodeURIComponent(tab1)}|${encodeURIComponent(
    tab2
  )}; path=/; max-age=31536000; samesite=lax${secure}`;
}
