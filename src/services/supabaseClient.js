import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ygwpigynmxhavqucvwbp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlnd3BpZ3lubXhoYXZxdWN2d2JwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNzA5OTEsImV4cCI6MjA5NTk0Njk5MX0.Fms7P_2dqCaVVtY8MtfUp2iDBhlICH5KbazL5WaOKq8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
