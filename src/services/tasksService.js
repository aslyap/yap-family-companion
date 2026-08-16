import { supabase } from './supabaseClient';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/** Would this task be scheduled on dateStr, ignoring rollover/completion entirely. */
function isNaturalOccurrence(task, dateStr) {
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

// Marj's tasks (chores, no reward points) carry over day to day until done —
// see yap-family-home's tasksService.js for the full rationale, kept in sync
// here so the phone app shows the exact same rollover behaviour.
function lastScheduledOnOrBefore(task, dateStr) {
  let d = dateStr;
  for (let i = 0; i < 28; i++) {
    if (isNaturalOccurrence(task, d)) return d;
    const prev = offsetDate(d, -1);
    if (task.created_at && prev < task.created_at.split('T')[0]) return null;
    d = prev;
  }
  return null;
}

export function isTaskForDate(task, dateStr) {
  // Always show on the task's own scheduled day, done or not - preserves
  // normal check/uncheck behavior and history regardless of rollover.
  if (isNaturalOccurrence(task, dateStr)) return true;
  if (task.assigned_to !== 'marj' || dateStr > todayStr()) return false;
  const due = lastScheduledOnOrBefore(task, dateStr);
  return !!due && !isCompleteForDate(task, due);
}

export function dueDateForView(task, viewDate) {
  if (task.assigned_to === 'marj') {
    return lastScheduledOnOrBefore(task, viewDate) || viewDate;
  }
  return viewDate;
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
