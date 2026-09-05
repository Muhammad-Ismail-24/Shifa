// Supabase client singleton — the single source of truth for auth state
// and the database connection across the entire frontend.
//
// Environment variables are read from import.meta.env (Vite convention).
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in the deployment
// environment and in .env.local for local development.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. ' +
    'Copy .env.local.example to .env.local and fill in the values from your Supabase project.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);