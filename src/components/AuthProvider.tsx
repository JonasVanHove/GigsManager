"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabaseClient } from "@/lib/supabase-client";
import type { AuthSession } from "@/types/index";

export type SignUpResult = "signed-in" | "confirm-email";

interface AuthContextType {
  session: AuthSession | null;
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  user: any | null;
}

export const AuthContext = React.createContext<AuthContextType | undefined>(
  undefined
);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // ── Session management ──────────────────────────────────────────────────

  const updateSession = useCallback((user: any | null, token?: string | null) => {
    if (user) {
      setSession({
        user: { ...user, email: user.email || "" },
        isLoading: false,
      });
      if (token) {
        setAccessToken(token);
      }
    } else {
      setSession(null);
      setAccessToken(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        if (mounted) {
          updateSession(
            session?.user ?? null,
            session?.access_token ?? null
          );
        }
      } catch (err) {
        console.error("Failed to check session:", err);
        if (mounted) updateSession(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    checkSession();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        updateSession(
          session?.user ?? null,
          session?.access_token ?? null
        );
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [updateSession]);

  // ── Auth actions ────────────────────────────────────────────────────────

  const signUp = useCallback(
    async (email: string, password: string): Promise<SignUpResult> => {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
      });

      if (error) {
        // Map common errors to friendly messages
        if (error.message.includes("Password should be at least")) {
          throw new Error("Password must be at least 6 characters long.");
        }
        if (
          error.message.includes("already registered") ||
          error.message.includes("already been registered")
        ) {
          throw new Error(
            "This email is already registered. Try signing in instead."
          );
        }
        if (error.message.includes("valid email")) {
          throw new Error("Please enter a valid email address.");
        }
        throw error;
      }

      // Supabase returns a session only when email verification is disabled.
      // When verification IS enabled, data.session is null.
      if (data.session) {
        return "signed-in";
      }

      // Empty identities array = email was already taken (Supabase doesn't
      // reveal this directly to protect against enumeration).
      if (data.user && data.user.identities?.length === 0) {
        throw new Error(
          "An account with this email already exists. Try signing in instead."
        );
      }

      return "confirm-email";
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      if (error.message === "Invalid login credentials") {
        throw new Error("Invalid email or password. Please try again.");
      }
      if (error.message.includes("Email not confirmed")) {
        throw new Error(
          "Your email is not yet verified. Check your inbox for the confirmation link."
        );
      }
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    setSession(null);
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      // Always try to get fresh session from Supabase first
      // Don't rely on cached token, as it may be expired
      console.log("[getAccessToken] Fetching fresh session from Supabase...");
      let {
        data: { session },
      } = await supabaseClient.auth.getSession();

      if (session?.access_token) {
        console.log("[getAccessToken] Got valid token from session");
        setAccessToken(session.access_token);
        return session.access_token;
      }

      // If no valid session, try to refresh
      console.log("[getAccessToken] No session, attempting refresh...");
      const { data: refreshedData, error: refreshError } =
        await supabaseClient.auth.refreshSession();

      if (refreshError) {
        console.error("[getAccessToken] Refresh failed:", refreshError.message);
        setAccessToken(null); // Clear cache on refresh failure
        return null;
      }

      if (refreshedData.session?.access_token) {
        console.log("[getAccessToken] Got new token from refresh");
        setAccessToken(refreshedData.session.access_token);
        return refreshedData.session.access_token;
      }

      console.warn("[getAccessToken] No token after refresh attempt");
      setAccessToken(null); // Clear cache
      return null;
    } catch (err) {
      console.error(
        "[getAccessToken] Exception:",
        err instanceof Error ? err.message : String(err)
      );
      setAccessToken(null); // Clear cache on error
      return null;
    }
  }, []);

  // ── Provider ────────────────────────────────────────────────────────────

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        signUp,
        signIn,
        signOut,
        getAccessToken,
        user: session?.user || null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
