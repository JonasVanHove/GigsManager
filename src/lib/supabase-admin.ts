/**
 * Supabase client for server-side operations.
 * Uses the service role key for admin tasks.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Lazy validation: only throw at runtime if actually used, not at build time
let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (!client) {
    if (!supabaseUrl) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
    }
    if (!supabaseServiceKey) {
      throw new Error(
        "Missing SUPABASE_SERVICE_ROLE_KEY. Set this in your .env file or Netlify environment variables."
      );
    }
    client = createClient(supabaseUrl, supabaseServiceKey);
  }
  return client;
}

// For backward compatibility
export const supabaseAdmin = {
  auth: {
    getUser: async (token: string) => getSupabaseAdmin().auth.getUser(token),
  },
} as any;
