"use client";

import { Suspense } from "react";
import Dashboard from "@/components/Dashboard";
import { ToastProvider } from "@/components/ToastContainer";
import LoadingSpinner from "@/components/LoadingSpinner";
import { AuthGate } from "@/components/AuthGate";
import DemoLoginNotice from "@/components/DemoLoginNotice";

export default function AppPage() {
  return (
    <ToastProvider>
      {/* Confirms an /demo instant login once the dashboard is mounted. */}
      <DemoLoginNotice />
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <LoadingSpinner size="lg" message="Loading application..." />
          </div>
        }
      >
        <AuthGate>
          <Dashboard />
        </AuthGate>
      </Suspense>
    </ToastProvider>
  );
}
