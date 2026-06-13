import { supabase } from './supabaseClient';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isTaskForDate(task, dateStr) {
  if (!task.recurring) {
    return task.one_off_date === dateStr;
  }
  if (task.created_at && dateStr < task.created_at.split('T')[0]) return false;
  if (task.end_date && dateStr > task.end_date) return false;

  const rule = (task.recurrence_rule || 'daily').trim().toLowerCase();
  if (rule === 'daily') return true;

  const dayName = DAY_NAMES[new Date(dateStr + 'T12:00:00').getDay()];
  return rule.split(',').map(d => d.trim()).includes(dayName);
}

export function isCompleteForDate(task, dateStr) {
  return !!(task.completion_status?.[dateStr]);
}

export async function fetchTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function toggleComplete(task, dateStr) {
  const current = task.completion_status ?? {};
  const nowComplete = !current[dateStr];
  const updated = { ...current, [dateStr]: nowComplete };
  const { error } = await supabase
    .from('tasks')
    .update({ completion_status: updated })
    .eq('id', task.id);
  if (error) throw error;
  return { ...task, completion_status: updated };
}

export async function addTask(taskData) {
  const { data, error } = await supabase
    .from('tasks')
    .insert([{ ...taskData, completion_status: {} }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}
