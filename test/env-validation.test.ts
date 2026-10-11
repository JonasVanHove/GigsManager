import { describe, expect, it } from "vitest";
import {
  assertRequiredEnv,
  missingEnvKeys,
  serverEnv,
} from "@/lib/env";

/**
 * The env helper must fail fast on a production deploy that would silently
 * break features (no service-role key ⇒ auth stub, no app URL ⇒ broken invite
 * links), while staying lenient locally so `next build` and dev never throw.
 */
describe("server environment validation", () => {
  const base = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@host:5432/db",
    NEXT_PUBLIC_SUPABASE_URL: "https://ref.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    NEXT_PUBLIC_APP_URL: "https://gigsmanager.app",
  };

  it("accepts a complete production environment", () => {
    expect(missingEnvKeys(base)).toEqual([]);
    expect(() => assertRequiredEnv(base)).not.toThrow();
  });

  it("reports every missing production variable at once", () => {
    expect(missingEnvKeys({ NODE_ENV: "production" })).toEqual([
      "DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_APP_URL",
    ]);
    expect(() => assertRequiredEnv({ NODE_ENV: "production" })).toThrow(
      /Missing required environment variable/
    );
  });

  it("does not require the service-role key or app URL outside production", () => {
    const dev = {
      NODE_ENV: "development",
      DATABASE_URL: base.DATABASE_URL,
      NEXT_PUBLIC_SUPABASE_URL: base.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: base.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };
    expect(missingEnvKeys(dev)).toEqual([]);
  });

  it("still requires the database and public Supabase keys outside production", () => {
    expect(missingEnvKeys({ NODE_ENV: "development" })).toEqual([
      "DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });

  it("returns a typed, fully-populated env object", () => {
    const parsed = serverEnv({
      ...base,
      DIRECT_URL: "postgresql://user:pass@host:5432/db",
      GROQ_API_KEY: "groq-key",
      RESEND_API_KEY: "resend-key",
      SUPABASE_WEBHOOK_SECRET: "whsec",
    });
    expect(parsed).toMatchObject({
      DATABASE_URL: base.DATABASE_URL,
      DIRECT_URL: "postgresql://user:pass@host:5432/db",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      GROQ_API_KEY: "groq-key",
      RESEND_API_KEY: "resend-key",
      NODE_ENV: "production",
    });
  });

  it("defaults optional values so optional features degrade gracefully", () => {
    const parsed = serverEnv(base);
    expect(parsed.GROQ_API_KEY).toBe("");
    expect(parsed.RESEND_API_KEY).toBe("");
    expect(parsed.NEXT_PUBLIC_DEMO_ENABLED).toBe("true");
    expect(parsed.NEXT_PUBLIC_DEMO_EMAIL).toBe("demo@gigsmanager.app");
  });
});
