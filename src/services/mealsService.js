import { supabase } from './supabaseClient';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Same recurring/recurrence_rule/end_date convention as tasksService.js and
// the dashboard's mealsService.js — `date` is null on recurring rows (see the
// dashboard's mealsService.js header comment for the migration SQL, already
// run against production).
export function isMealForDate(meal, dateStr) {
  if (!meal.recurring) return meal.date === dateStr;

  if (meal.created_at && dateStr < meal.created_at.split('T')[0]) return false;
  if (meal.end_date && dateStr > meal.end_date) return false;

  const rule = (meal.recurrence_rule || 'daily').trim().toLowerCase();
  if (rule === 'daily') return true;

  const dayName = DAY_NAMES[new Date(dateStr + 'T12:00:00').getDay()];
  return rule.split(',').map(d => d.trim()).includes(dayName);
}

export function mealFor(meals, dateStr, person, mealType) {
  const candidates = meals.filter(m => m.person === person && m.meal_type === mealType && isMealForDate(m, dateStr));
  return candidates.find(m => !m.recurring) || candidates[0] || null;
}

export async function fetchMealsForDates(dateStrs) {
  const [oneOff, recurring] = await Promise.all([
    supabase.from('meals').select('*').in('date', dateStrs),
    supabase.from('meals').select('*').eq('recurring', true),
  ]);
  if (oneOff.error) throw oneOff.error;
  if (recurring.error) throw recurring.error;
  return [...(oneOff.data ?? []), ...(recurring.data ?? [])];
}

export async function fetchMealsForDate(dateStr) {
  return fetchMealsForDates([dateStr]);
}

export async function upsertMeal({ date, meal_type, person, dish_name }) {
  const { data, error } = await supabase
    .from('meals')
    .upsert(
      { date, meal_type, person, dish_name, recurring: false, recurrence_rule: null, end_date: null, updated_at: new Date().toISOString() },
      { onConflict: 'date,meal_type,person' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addRecurringMeal({ meal_type, person, dish_name, recurrence_rule, end_date }) {
  const { data, error } = await supabase
    .from('meals')
    .insert([{ date: null, meal_type, person, dish_name, recurring: true, recurrence_rule, end_date }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRecurringMeal(id, { dish_name, recurrence_rule, end_date }) {
  const { data, error } = await supabase
    .from('meals')
    .update({ dish_name, recurrence_rule, end_date, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMeal(id) {
  const { error } = await supabase.from('meals').delete().eq('id', id);
  if (error) throw error;
}
