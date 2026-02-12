/**
 * Client-side Supabase auth client.
 * Used in browsers and React components.
 */

"use client";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const supabaseClient = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
