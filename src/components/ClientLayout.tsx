"use client";

import { AuthProvider } from "./AuthProvider";
import { SettingsProvider } from "./SettingsProvider";
import { ThemeProvider } from "./ThemeProvider";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
