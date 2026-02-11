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

  // ── Session management ──────────────────────────────────────────────────

  const updateSession = useCallback((user: any | null) => {
    if (user) {
      setSession({
        user: { ...user, email: user.email || "" },
        isLoading: false,
      });
    } else {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        if (mounted) updateSession(session?.user ?? null);
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
        updateSession(session?.user ?? null);
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
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      return session?.access_token ?? null;
    } catch {
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
