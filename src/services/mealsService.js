import { supabase } from './supabaseClient';

export async function fetchMealsForDates(dateStrs) {
  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .in('date', dateStrs);
  if (error) throw error;
  return data ?? [];
}

export async function fetchMealsForDate(dateStr) {
  return fetchMealsForDates([dateStr]);
}

export async function upsertMeal({ date, meal_type, person, dish_name }) {
  const { data, error } = await supabase
    .from('meals')
    .upsert(
      { date, meal_type, person, dish_name, updated_at: new Date().toISOString() },
      { onConflict: 'date,meal_type,person' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMeal(id) {
  const { error } = await supabase.from('meals').delete().eq('id', id);
  if (error) throw error;
}
