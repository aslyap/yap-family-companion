import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ygwpigynmxhavqucvwbp.supabase.co';
// Sanitise the key: replace typographic dashes (em/en) that corrupt HTTP headers when
// the EAS secret is pasted from a document that auto-converts punctuation.
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '')
  .replace(/—/g, '-')
  .replace(/–/g, '-')
  .trim();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
