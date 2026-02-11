"use client";

import { AuthProvider } from "./AuthProvider";
import { SettingsProvider } from "./SettingsProvider";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>{children}</SettingsProvider>
    </AuthProvider>
  );
}
