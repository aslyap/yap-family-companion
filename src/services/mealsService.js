import { supabase } from './supabaseClient';

export async function fetchMealsForDate(dateStr) {
  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .eq('date', dateStr);
  if (error) throw error;
  return data ?? [];
}
