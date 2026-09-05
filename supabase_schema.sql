-- ============================================================================
-- Shifa — Supabase Database Initialization
-- ============================================================================
-- Run this script in the Supabase SQL Editor (or via psql) to provision the
-- medical_history table with Row Level Security for the SaaS migration.
-- ============================================================================

-- 1. Create the medical_history table
-- ---------------------------------------------------------------------------
-- user_id references the built-in auth.users table so RLS can enforce
-- per-user isolation with auth.uid().
CREATE TABLE IF NOT EXISTS public.medical_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id  TEXT        NOT NULL DEFAULT '',
    symptoms    TEXT        NOT NULL DEFAULT '',
    diagnosis   TEXT        NOT NULL DEFAULT '',
    soap_note   TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE public.medical_history ENABLE ROW LEVEL SECURITY;

-- 3. SELECT policy — users can only view their own rows
CREATE POLICY "Users can view own medical history"
    ON public.medical_history
    FOR SELECT
    USING (auth.uid() = user_id);

-- 4. INSERT policy — users can only insert rows where user_id matches their UID
CREATE POLICY "Users can insert own medical history"
    ON public.medical_history
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);