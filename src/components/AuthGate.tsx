"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import LoadingSpinner from "./LoadingSpinner";

/**
 * AuthGate — zero-flash auth wrapper.
 *
 * When placed around the Dashboard on the `/app` route:
 * - While auth is loading → shows a branded loading spinner (never flashes the landing page).
 * - If no session → immediately redirects to `/` (landing page).
 * - If authenticated → renders children (the Dashboard).
 *
 * This eliminates the flash where authenticated users briefly see the landing
 * page, and ensures unauthenticated users never see the dashboard.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (!session?.user) {
      // Not authenticated — redirect to the landing page
      router.replace("/");
    } else {
      // Authenticated — render the dashboard
      setReady(true);
    }
  }, [isLoading, session, router]);

  // While auth is resolving or redirect is in flight, show a branded spinner.
  // This prevents the landing page from ever flashing for logged-in users.
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950 transition-colors">
        <LoadingSpinner size="lg" message="Loading application..." />
      </div>
    );
  }

  return <>{children}</>;
}
