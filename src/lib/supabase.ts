import { createBrowserClient } from '@supabase/ssr';
import { normalizeSupabaseUrl } from './supabase-url';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseUrl = normalizeSupabaseUrl(rawUrl) || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

// Uses cookie-based storage (instead of localStorage) so the session set by
// client-side auth actions (phone OTP verify, identity linking, etc.) is
// also visible to server-side code (middleware, server components) that
// reads the session from request cookies.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

