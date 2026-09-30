/**
 * Shared configuration for the public demo environment.
 *
 * The demo account is a *public, shared* account: /demo signs visitors into it
 * without any credential entry, so the credentials below are intentionally
 * client-visible (NEXT_PUBLIC_* values are inlined in the browser bundle).
 * Never put real data in this account.
 *
 * The instant login can be switched off entirely by setting
 * NEXT_PUBLIC_DEMO_ENABLED="false" (e.g. for a self-hosted deployment).
 */

export const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL || "demo@gigsmanager.app";
export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "Demo1234!";

export const DEMO_LOGIN_ENABLED =
  (process.env.NEXT_PUBLIC_DEMO_ENABLED ?? "true").toLowerCase() !== "false";

/** Set by /demo right before redirecting, consumed once by the dashboard. */
export const DEMO_LOGIN_FLAG = "gigsmanager:demo-login";

export const DEMO_LOGIN_MESSAGE = "Injelogd op de demo-omgeving";

export function isDemoAccount(email?: string | null): boolean {
  return (email || "").trim().toLowerCase() === DEMO_EMAIL.toLowerCase();
}

export function markDemoLoginPending(): void {
  try {
    sessionStorage.setItem(DEMO_LOGIN_FLAG, "1");
  } catch {
    // Private mode / storage disabled — the banner is simply skipped.
  }
}

/** Reads and clears the flag, so the toast only appears once. */
export function consumeDemoLoginPending(): boolean {
  try {
    const flag = sessionStorage.getItem(DEMO_LOGIN_FLAG);
    if (!flag) return false;
    sessionStorage.removeItem(DEMO_LOGIN_FLAG);
    return true;
  } catch {
    return false;
  }
}