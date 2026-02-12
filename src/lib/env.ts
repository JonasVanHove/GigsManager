// --- Runtime environment validation ------------------------------------------
// Imported once at app startup to fail fast on missing config.

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `❌ Missing required environment variable: ${key}\n` +
        `   → Copy .env.example to .env and fill in your values.`
    );
  }
  return value;
}

function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  DIRECT_URL: optional("DIRECT_URL"),
  NODE_ENV: optional("NODE_ENV", "development"),
  SUPABASE_URL: optional("NEXT_PUBLIC_SUPABASE_URL"),
  SUPABASE_ANON_KEY: optional("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
} as const;

export const isDev = env.NODE_ENV === "development";
export const isProd = env.NODE_ENV === "production";
